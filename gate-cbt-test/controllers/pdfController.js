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
function parseAnswerMap(ansLines) {
  const answerMap = {};

  for (let line of ansLines) {
    // FORMAT 1: "Q1. Answer: B [MCQ | 1 Mark ...]"
    const fmt1 = line.match(
      /^Q(\d+)\.\s+Answer:\s+([A-D]|-?\d+(?:\.\d+)?)\s+\[(MCQ|NAT)\s*\|\s*(\d+)\s*Marks?/i
    );
    if (fmt1) {
      const qno   = fmt1[1];
      const ans   = fmt1[2];
      const type  = fmt1[3].toUpperCase();
      const marks = parseInt(fmt1[4]);
      answerMap[qno] = {
        answer: type === "MCQ" ? ans.toUpperCase() : ans,
        type,
        marks,
        negativeMarks: type === "NAT" ? 0 : marks === 2 ? 0.66 : 0.33,
      };
      continue;
    }

    // FORMAT 2: marks hint
    let marks = 1;
    const marksHint = line.match(/\b([12])\s*(?:marks?|M)\b/i)
                   || line.match(/[(\[]\s*([12])\s*[)\]]/);
    if (marksHint) marks = parseInt(marksHint[1]);

    // FORMAT 2 MCQ: "1. B" "Q1. B"
    const mcqMatch = line.match(/^Q?(\d+)[.)]\s*(?:Ans(?:wer)?[:\s]*)?\(?([A-D])\)?/i)
                  || line.match(/^Q?(\d+)\s+([A-D])$/i);
    if (mcqMatch) {
      answerMap[mcqMatch[1]] = {
        answer: mcqMatch[2].toUpperCase(),
        type: "MCQ",
        marks,
        negativeMarks: marks === 2 ? 0.66 : 0.33,
      };
      continue;
    }

    // FORMAT 2 NAT: "3. 9" "7. 236"
    const natMatch = line.match(/^Q?(\d+)[.)]\s*(?:Ans(?:wer)?[:\s]*)?(-?\d+(?:\.\d+)?)$/i);
    if (natMatch) {
      answerMap[natMatch[1]] = {
        answer: natMatch[2],
        type: "NAT",
        marks,
        negativeMarks: 0,
      };
    }
  }

  return answerMap;
}

// ── KNOWN SECTION NAMES ──────────────────────────────────────────
// ✅ Detect section headings anywhere in the PDF
const SECTION_PATTERNS = [
  { pattern: /aptitude/i,          name: "Aptitude" },
  { pattern: /reasoning/i,         name: "Reasoning" },
  { pattern: /english/i,           name: "English" },
  { pattern: /technical/i,         name: "Technical" },
  { pattern: /general\s*ability/i, name: "Aptitude" },
  { pattern: /verbal/i,            name: "English" },
  { pattern: /quantitative/i,      name: "Aptitude" },
  { pattern: /computer\s*science/i,name: "Technical" },
  { pattern: /mathematics/i,       name: "Technical" },
  { pattern: /engineering/i,       name: "Technical" },
];

function detectSection(line) {
  for (const { pattern, name } of SECTION_PATTERNS) {
    if (pattern.test(line)) return name;
  }
  return null;
}

// ── LINES TO SKIP ────────────────────────────────────────────────
const skipPatterns = [
  /^GATE CBT/i,
  /^Total Questions/i,
  /^Total Marks/i,
  /^Time:/i,
  /^INSTRUCTIONS/i,
  /^\d+\.\s+(This paper|MCQ 1|NAT |Unanswered|For MCQ)/i,
  /^1-Mark MCQ/i,
  /^2-Mark MCQ/i,
  /^NAT \(any\)/i,
  /^Not Attempted/i,
  /^—\s*END/i,
  /^All the best/i,
  /^Answer:\s*_+/i,
  /^\(Enter integer\)/i,
];

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

    for (let line of pyqLines) {
      if (skipPatterns.some(p => p.test(line))) continue;

      // ✅ Detect section ANYWHERE — even mid-question-block
      const detectedSection = detectSection(line);
      if (detectedSection && !line.match(/^Q\d+\./i) && !line.match(/^\([A-D]\)/i)) {
        currentSection = detectedSection;
        if (currentQuestion) currentQuestion.section = currentSection;
        continue;
      }

      // ── Question line: "Q1. ..." ──
      const qMatch = line.match(/^Q(\d+)\.\s*(.*)/i);
      if (qMatch) {
        if (currentQuestion) questionsArray.push(currentQuestion);

        const questionNumber = parseInt(qMatch[1]);
        const answerInfo     = answerMap[String(questionNumber)] || {};
        const restOfLine     = qMatch[2].trim();

        const metaInline = restOfLine.match(/^\[(MCQ|NAT)\s*\|\s*(\d+)\s*Marks?/i);

        let type          = answerInfo.type          || "MCQ";
        let marks         = answerInfo.marks         || 1;
        let negativeMarks = answerInfo.negativeMarks ?? (marks === 2 ? 0.66 : 0.33);

        if (metaInline) {
          type          = metaInline[1].toUpperCase();
          marks         = parseInt(metaInline[2]);
          negativeMarks = /No Negative/i.test(restOfLine) ? 0 : marks === 2 ? 0.66 : 0.33;
        }

        // ✅ If answer key says NAT, override
        if (answerInfo.type === "NAT") {
          type          = "NAT";
          negativeMarks = 0;
        }

        currentQuestion = {
          testId: test._id,
          questionNumber,
          question: metaInline ? "" : restOfLine, // if meta inline, question text comes next
          options: [],
          correctAnswer: "",
          section: currentSection,  // ✅ uses latest detected section
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
        // ── Meta line: "[MCQ | 1 Mark ...]" on its own ──
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

        // ── Question text ──
        if (!skipPatterns.some(p => p.test(line)) && line.length > 3) {
          if (currentQuestion.question === "") {
            currentQuestion.question = line;
          } else if (currentQuestion.options.length === 0) {
            currentQuestion.question += " " + line;
          }
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
        const idx = ansInfo.answer.charCodeAt(0) - 65;
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