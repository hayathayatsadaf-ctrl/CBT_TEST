const fs = require("fs");
const PDFParser = require("pdf2json");
const Question = require("../models/Question");
const Test = require("../models/Test");

// ── PDF TEXT EXTRACTOR ───────────────────────────────────────────
function pdfParse(filePath) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      let text = "";
      pdfData.Pages.forEach((page) => {
        page.Texts.forEach((t) => {
          text += t.R.map((r) => {
            try { return decodeURIComponent(r.T); }
            catch (e) { return r.T; }
          }).join("") + "\n";
        });
      });
      resolve({ text });
    });
    pdfParser.on("pdfParser_dataError", (err) => reject(err));
    pdfParser.loadPDF(filePath);
  });
}

// ── ANSWER KEY PARSER ────────────────────────────────────────────
// Handles: "1. B"  "1) B"  "Q1. B"  "1. Ans: B"  "1. (2 Marks) B"
//          "3. 9"  "7. 236"  (NAT numerical answers)
function parseAnswerMap(ansLines) {
  const answerMap = {};

  for (let line of ansLines) {
    let marks = 1;
    const marksMatch = line.match(/\b([12])\s*(?:marks?|M)\b/i)
                    || line.match(/[(\[]\s*([12])\s*[)\]]/);
    if (marksMatch) marks = parseInt(marksMatch[1]);

    // MCQ answer — letter A/B/C/D
    const mcqMatch = line.match(/^Q?(\d+)[.)]\s*(?:Ans(?:wer)?[:\s]*)?\(?([A-D])\)?/i)
                  || line.match(/^Q?(\d+)\s+([A-D])$/i);
    if (mcqMatch) {
      answerMap[mcqMatch[1]] = {
        answer: mcqMatch[2].toUpperCase(),
        marks,
        type: "MCQ",
        negativeMarks: marks === 2 ? 0.66 : 0.33,
      };
      continue;
    }

    // NAT answer — numerical (integer or decimal)
    const natMatch = line.match(/^Q?(\d+)[.)]\s*(?:Ans(?:wer)?[:\s]*)?(-?\d+(?:\.\d+)?)$/i);
    if (natMatch) {
      answerMap[natMatch[1]] = {
        answer: natMatch[2],
        marks,
        type: "NAT",
        negativeMarks: 0,
      };
    }
  }

  return answerMap;
}

// ── MAIN UPLOAD HANDLER ──────────────────────────────────────────
exports.uploadPDFs = async (req, res) => {
  try {
    if (!req.files || !req.files["pyq"] || !req.files["answerKey"]) {
      return res.status(400).json({ message: "Both PYQ and Answer Key PDFs required" });
    }

    const pyqPath    = req.files["pyq"][0].path;
    const answerPath = req.files["answerKey"][0].path;
    const testName   = req.body.testName || `Test ${new Date().toLocaleDateString()}`;
    const testYear   = parseInt(req.body.year) || new Date().getFullYear();

    const pyqText    = (await pdfParse(pyqPath)).text;
    const answerText = (await pdfParse(answerPath)).text;

    const pyqLines = pyqText.split("\n").map(l => l.trim()).filter(l => l);
    const ansLines = answerText.split("\n").map(l => l.trim()).filter(l => l);

    const answerMap = parseAnswerMap(ansLines);

    // Create Test record
    const test = new Test({ name: testName, year: testYear, uploadedBy: "admin" });
    await test.save();

    const questionsArray = [];
    let currentQuestion  = null;
    let currentSection   = "General";

    // Lines to skip (headers, footers, instructions)
    const skipPatterns = [
      /^GATE CBT/i,
      /^Total Questions/i,
      /^Total Marks/i,
      /^Time:/i,
      /^INSTRUCTIONS/i,
      /^\d+\.\s+(This paper|MCQ|NAT|Unanswered|For MCQ)/i,
      /^1-Mark MCQ/i,
      /^—\s*END/i,
      /^All the best/i,
      /^Answer:\s*_+/i,
    ];

    for (let line of pyqLines) {
      if (skipPatterns.some(p => p.test(line))) continue;

      // ── Question line: "Q1. [MCQ | 1 Mark | Negative: -0.33]" ──
      // OR "Q1. some question text directly"
      const qMatch = line.match(/^Q(\d+)\.\s*(.*)/i);
      if (qMatch) {
        if (currentQuestion) questionsArray.push(currentQuestion);

        const questionNumber = parseInt(qMatch[1]);
        const answerInfo     = answerMap[String(questionNumber)] || {};
        const restOfLine     = qMatch[2].trim();

        // Check if meta tag is inline with Q number
        const metaInline = restOfLine.match(/^\[(MCQ|NAT)\s*\|\s*(\d+)\s*Marks?/i);

        let type          = answerInfo.type          || "MCQ";
        let marks         = answerInfo.marks         || 1;
        let negativeMarks = answerInfo.negativeMarks ?? (marks === 2 ? 0.66 : 0.33);

        if (metaInline) {
          type          = metaInline[1].toUpperCase();
          marks         = parseInt(metaInline[2]);
          negativeMarks = /No Negative/i.test(restOfLine) ? 0 : marks === 2 ? 0.66 : 0.33;
        }

        currentQuestion = {
          testId: test._id,
          questionNumber,
          question: "",
          options: [],
          correctAnswer: "",
          section: currentSection,
          subject: currentSection,
          topic: "General",
          type,
          marks,
          negativeMarks,
          year: testYear,
        };
        continue;
      }

      if (currentQuestion) {
        // ── Meta line: "[MCQ | 1 Mark | Negative: -0.33]" ──
        const metaMatch = line.match(/^\[(MCQ|NAT)\s*\|\s*(\d+)\s*Marks?/i);
        if (metaMatch) {
          currentQuestion.type          = metaMatch[1].toUpperCase();
          currentQuestion.marks         = parseInt(metaMatch[2]);
          currentQuestion.negativeMarks = /No Negative/i.test(line) ? 0
                                        : currentQuestion.marks === 2 ? 0.66 : 0.33;
          continue;
        }

        // ── MCQ Option: "(A) text" ──
        const optMatch = line.match(/^\(([A-D])\)\s*(.+)/i);
        if (optMatch) {
          currentQuestion.options.push(optMatch[2].trim());
          continue;
        }

        // ── Question text (single or multi-line) ──
        if (!skipPatterns.some(p => p.test(line)) && line.length > 3) {
          if (currentQuestion.question === "") {
            currentQuestion.question = line;
          } else if (currentQuestion.options.length === 0) {
            // Multi-line question — append
            currentQuestion.question += " " + line;
          }
        }
      } else {
        // ── Section/Subject heading between questions ──
        if (
          line.length > 2 && line.length < 80 &&
          !line.match(/^\d/) &&
          !line.match(/^\(/) &&
          !line.match(/^\[/)
        ) {
          currentSection = line.trim();
        }
      }
    }

    // Push last question
    if (currentQuestion) questionsArray.push(currentQuestion);

    // ── Assign correct answers ────────────────────────────────────
    questionsArray.forEach((q) => {
      const ansInfo = answerMap[String(q.questionNumber)];
      if (!ansInfo) return;

      if (q.type === "NAT") {
        q.correctAnswer = String(ansInfo.answer);
      } else {
        const idx = ansInfo.answer.charCodeAt(0) - 65; // A=0,B=1,C=2,D=3
        if (q.options[idx] !== undefined) {
          q.correctAnswer = q.options[idx];
        }
      }
    });

    // ── Filter valid questions ────────────────────────────────────
    const finalQuestions = questionsArray.filter(q => {
      if (!q.question || q.question.trim() === "") return false;
      if (q.type === "NAT") return q.correctAnswer !== "";
      return q.options.length >= 2 && q.correctAnswer !== "";
    });

    if (finalQuestions.length === 0) {
      await Test.findByIdAndDelete(test._id);
      fs.unlinkSync(pyqPath);
      fs.unlinkSync(answerPath);
      return res.status(422).json({
        message: "No questions parsed. Check PDF format.",
        hint: "Questions must start with 'Q1.' and options with '(A)' '(B)' '(C)' '(D)'.",
        debug: {
          totalLinesInPDF: pyqLines.length,
          answerMapKeys: Object.keys(answerMap),
          sampleLines: pyqLines.slice(0, 20),
        },
      });
    }

    await Question.insertMany(finalQuestions);
    await Test.findByIdAndUpdate(test._id, { totalQuestions: finalQuestions.length });

    fs.unlinkSync(pyqPath);
    fs.unlinkSync(answerPath);

    const mcqCount           = finalQuestions.filter(q => q.type === "MCQ").length;
    const natCount           = finalQuestions.filter(q => q.type === "NAT").length;
    const totalPossibleMarks = finalQuestions.reduce((s, q) => s + q.marks, 0);

    res.status(200).json({
      message: "PDF uploaded and parsed successfully",
      testId: test._id,
      testName: test.name,
      totalQuestions: finalQuestions.length,
      mcqQuestions: mcqCount,
      natQuestions: natCount,
      totalPossibleMarks,
      sections: [...new Set(finalQuestions.map(q => q.section))],
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "PDF parsing failed", error: error.message });
  }
};