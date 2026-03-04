const fs = require("fs");
const PDFParser = require("pdf2json");
const Question = require("../models/Question");
const Test = require("../models/Test");

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

// ─────────────────────────────────────────────────────────────
// ✅ FIX BUG 4: Parse answer key — handles ALL formats:
//   "1. B"  "1) B"  "Q1. B"  "1. Ans: B"  "1. (2 Marks) B"
//   "1. 9"  "1) 3.14"  (NAT numerical answers)
// ─────────────────────────────────────────────────────────────
function parseAnswerMap(ansLines) {
  const answerMap = {}; // { "1": { answer: "B", marks: 2, type: "MCQ" }, ... }

  for (let line of ansLines) {
    // Detect marks from line: "2 marks", "(2)", "[2]"
    let marks = 1;
    const marksMatch = line.match(/\b([12])\s*(?:marks?|M)\b/i)
                    || line.match(/[(\[]\s*([12])\s*[)\]]/);
    if (marksMatch) marks = parseInt(marksMatch[1]);

    // Try MCQ answer: letter A/B/C/D
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

    // ✅ FIX BUG 4 (NAT): numerical answer — integer or decimal
    // e.g. "3. 9"  "5) 3.14"  "Q7. 236"
    const natMatch = line.match(/^Q?(\d+)[.)]\s*(?:Ans(?:wer)?[:\s]*)?(-?\d+(?:\.\d+)?)$/i);
    if (natMatch) {
      answerMap[natMatch[1]] = {
        answer: natMatch[2],
        marks,
        type: "NAT",
        negativeMarks: 0, // NAT never has negative marking
      };
    }
  }

  return answerMap;
}

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

    // ✅ FIX BUG 4: Use improved answer parser
    const answerMap = parseAnswerMap(ansLines);

    // Create Test record
    const test = new Test({ name: testName, year: testYear, uploadedBy: "admin" });
    await test.save();

    const questionsArray = [];
    let currentQuestion  = null;
    let currentSection   = "Aptitude";
    let questionNumber   = 0;

    for (let line of pyqLines) {
      // Section detection
      if      (/Section[:\s-]*Aptitude/i.test(line))  currentSection = "Aptitude";
      else if (/Section[:\s-]*Reasoning/i.test(line)) currentSection = "Reasoning";
      else if (/Section[:\s-]*English/i.test(line))   currentSection = "English";
      else if (/Section[:\s-]*Technical/i.test(line)) currentSection = "Technical";

      // Question start: "Q1." or "1." or "1)"
      const qMatch = line.match(/^Q?(\d+)[.)]\s+(.+)/i);
      if (qMatch) {
        // Save previous question
        if (currentQuestion) {
          questionsArray.push(currentQuestion);
        }

        questionNumber   = parseInt(qMatch[1]);
        const answerInfo = answerMap[String(questionNumber)] || {};

        // ✅ FIX BUG 1 & 3: Set marks, negativeMarks, type from answer map
        const marks         = answerInfo.marks         || 1;
        const negativeMarks = answerInfo.negativeMarks ?? (marks === 2 ? 0.66 : 0.33);

        // ✅ FIX BUG 3: Detect type — NAT if answer is numeric, MCQ if letter
        const isNAT = answerInfo.type === "NAT";

        currentQuestion = {
          testId: test._id,
          questionNumber,
          question: qMatch[2],
          options: [],
          correctAnswer: "",
          section: currentSection,
          subject: currentSection,
          topic: "General",
          // ✅ FIX BUG 1: marks from answer key, not hardcoded 1
          marks,
          // ✅ FIX BUG 1: negativeMarks from answer key, not hardcoded 0
          negativeMarks,
          // ✅ FIX BUG 3: type field set correctly for resultController NAT check
          type: isNAT ? "NAT" : "MCQ",
          year: testYear,
        };
      } else if (currentQuestion) {
        // Detect MCQ options: "(A) text" or "A. text" or "A) text"
        const optMatch = line.match(/^\(?([A-D])\)?[.)]\s*(.+)/i);
        if (optMatch) {
          currentQuestion.options.push(optMatch[2].trim());
        }
      }
    }

    // Push last question
    if (currentQuestion) {
      questionsArray.push(currentQuestion);
    }

    // ✅ FIX BUG 2 & 5: Assign correct answers — MCQ & NAT both handled
    questionsArray.forEach((q) => {
      const ansInfo = answerMap[String(q.questionNumber)];
      if (!ansInfo) return;

      if (q.type === "NAT") {
        // ✅ FIX BUG 2: NAT questions — store numerical string as correctAnswer
        // NAT questions have no options array — that's fine
        q.correctAnswer = String(ansInfo.answer);
      } else {
        // MCQ — convert letter to option text
        const optionIndex = ansInfo.answer.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
        if (q.options[optionIndex] !== undefined) {
          q.correctAnswer = q.options[optionIndex];
        }
      }
    });

    // ✅ FIX BUG 2: Accept NAT questions even if options.length !== 4
    // Old code: only pushed questions with exactly 4 options → NAT dropped
    const finalQuestions = questionsArray.filter(q => {
      if (q.type === "NAT") return q.correctAnswer !== ""; // NAT: just needs an answer
      return q.options.length === 4 && q.correctAnswer !== ""; // MCQ: needs 4 options
    });

    if (finalQuestions.length === 0) {
      // Cleanup test if no questions parsed
      await Test.findByIdAndDelete(test._id);
      fs.unlinkSync(pyqPath);
      fs.unlinkSync(answerPath);
      return res.status(422).json({
        message: "No questions could be parsed from the PDFs. Check the PDF format.",
        hint: "Questions must start with '1.' or 'Q1.' and options with '(A)' '(B)' '(C)' '(D)'.",
      });
    }

    await Question.insertMany(finalQuestions);
    await Test.findByIdAndUpdate(test._id, { totalQuestions: finalQuestions.length });

    fs.unlinkSync(pyqPath);
    fs.unlinkSync(answerPath);

    const mcqCount = finalQuestions.filter(q => q.type === "MCQ").length;
    const natCount = finalQuestions.filter(q => q.type === "NAT").length;
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