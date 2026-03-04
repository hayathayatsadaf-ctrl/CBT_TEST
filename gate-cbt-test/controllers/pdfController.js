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
            catch(e) { return r.T; }
          }).join("") + "\n";
        });
      });
      resolve({ text });
    });
    pdfParser.on("pdfParser_dataError", (err) => reject(err));
    pdfParser.loadPDF(filePath);
  });
}

exports.uploadPDFs = async (req, res) => {
  try {
    if (!req.files || !req.files["pyq"] || !req.files["answerKey"]) {
      return res.status(400).json({ message: "Both PYQ and Answer Key PDFs required" });
    }

    const pyqPath = req.files["pyq"][0].path;
    const answerPath = req.files["answerKey"][0].path;
    const testName = req.body.testName || `Test ${new Date().toLocaleDateString()}`;
    const testYear = parseInt(req.body.year) || new Date().getFullYear();

    const pyqText = (await pdfParse(pyqPath)).text;
    const answerText = (await pdfParse(answerPath)).text;

    const pyqLines = pyqText.split("\n").map(l => l.trim()).filter(l => l);
    const ansLines = answerText.split("\n").map(l => l.trim()).filter(l => l);

    // ✅ Build answer map: { "1": "B", "2": "B", ... }
    // Handles formats: "1. B", "1) B", "Answer: B", "Q1. B"
    const answerMap = {};
    for (let line of ansLines) {
      // Match "1. B" or "1) B" or "Q1. B" or "1 B"
      const match = line.match(/^Q?(\d+)[.)]\s*([A-D])/i)
                 || line.match(/^Q?(\d+)\s+([A-D])$/i);
      if (match) {
        answerMap[match[1]] = match[2].toUpperCase();
      }
    }

    // Create a new Test record for this upload
    const test = new Test({
      name: testName,
      year: testYear,
      uploadedBy: "admin",
    });
    await test.save();

    const questionsArray = [];
    let currentQuestion = null;
    let currentSection = "Aptitude";
    let questionNumber = 0;

    for (let line of pyqLines) {
      // Detect section changes
      if (/^Section[:\s-]*Aptitude/i.test(line)) currentSection = "Aptitude";
      else if (/^Section[:\s-]*Reasoning/i.test(line)) currentSection = "Reasoning";
      else if (/^Section[:\s-]*English/i.test(line)) currentSection = "English";
      else if (/^Section[:\s-]*Technical/i.test(line)) currentSection = "Technical";

      // Detect question start: Q1. or Q1) or 1.
      const qMatch = line.match(/^Q?(\d+)[.)]\s+(.+)/i);
      if (qMatch) {
        if (currentQuestion && currentQuestion.options.length === 4) {
          questionsArray.push(currentQuestion);
        }
        questionNumber = parseInt(qMatch[1]);
        currentQuestion = {
          testId: test._id,
          questionNumber,
          question: qMatch[2],
          options: [],
          correctAnswer: "",
          section: currentSection,
          subject: "General",
          topic: "General",
          marks: 1,
          negativeMarks: 0,
          year: testYear,
        };
      } else if (currentQuestion) {
        // Detect options (A), (B), (C), (D)
        const optMatch = line.match(/^\(([A-D])\)\s*(.+)/i);
        if (optMatch) {
          currentQuestion.options.push(optMatch[2]);
        }
      }
    }

    // Push last question
    if (currentQuestion && currentQuestion.options.length === 4) {
      questionsArray.push(currentQuestion);
    }

    // ✅ Match answers by question NUMBER not array index
    questionsArray.forEach((q) => {
      const answer = answerMap[String(q.questionNumber)];
      if (answer) {
        // Convert letter (A/B/C/D) to actual option text
        const optionIndex = answer.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
        if (q.options[optionIndex]) {
          q.correctAnswer = q.options[optionIndex]; // ✅ store option TEXT not letter
        }
      }
    });

    const finalQuestions = questionsArray.filter(q => q.correctAnswer !== "");

    await Question.insertMany(finalQuestions);

    // Update test with total questions
    await Test.findByIdAndUpdate(test._id, { totalQuestions: finalQuestions.length });

    fs.unlinkSync(pyqPath);
    fs.unlinkSync(answerPath);

    res.status(200).json({
      message: "PDF uploaded successfully",
      testId: test._id,
      testName: test.name,
      totalQuestions: finalQuestions.length,
      sections: [...new Set(finalQuestions.map(q => q.section))],
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "PDF parsing failed", error: error.message });
  }
};