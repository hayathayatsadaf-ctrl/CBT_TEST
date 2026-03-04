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

// ✅ Detect section from heading keywords
function detectSection(text) {
  const t = text.toLowerCase();
  if (/array/i.test(t)) return "Array";
  if (/linked.?list/i.test(t)) return "Linked List";
  if (/stack/i.test(t)) return "Stack";
  if (/queue/i.test(t)) return "Queue";
  if (/tree/i.test(t)) return "Tree";
  if (/graph/i.test(t)) return "Graph";
  if (/aptitude/i.test(t)) return "Aptitude";
  if (/reasoning/i.test(t)) return "Reasoning";
  if (/english/i.test(t)) return "English";
  if (/technical/i.test(t)) return "Technical";
  if (/mixed|advanced/i.test(t)) return "Mixed Advanced";
  return null;
}

// ✅ Parse inline options format: "question text a) opt1 b) opt2 c) opt3 d) opt4"
function parseInlineQuestion(text, section, testId, year, questionNumber) {
  // Match options pattern: a) ... b) ... c) ... d) ...
  const optionMatch = text.match(/^(.*?)\s+a\)\s+(.*?)\s+b\)\s+(.*?)\s+c\)\s+(.*?)\s+d\)\s+(.*)$/i);
  if (!optionMatch) return null;

  const question = optionMatch[1].trim();
  const options = [
    optionMatch[2].trim(),
    optionMatch[3].trim(),
    optionMatch[4].trim(),
    optionMatch[5].trim(),
  ];

  if (!question || options.some(o => !o)) return null;

  return {
    testId,
    questionNumber,
    question,
    options,
    correctAnswer: "",
    section,
    subject: section,
    topic: section,
    marks: 1,
    negativeMarks: 0,
    year,
  };
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
    const totalStudents = parseInt(req.body.totalStudents) || 1000;

    const pyqText = (await pdfParse(pyqPath)).text;
    const answerText = (await pdfParse(answerPath)).text;

    const pyqLines = pyqText.split("\n").map(l => l.trim()).filter(l => l.length > 5);
    const ansLines = answerText.split("\n").map(l => l.trim()).filter(l => l);

    // ✅ Build answer map: { "1": "A", "2": "B", ... }
    const answerMap = {};
    for (let line of ansLines) {
      // Format 1: "1. A" or "1) A"
      const m1 = line.match(/^Q?(\d+)[.)]\s*([A-Da-d])\b/i);
      if (m1) { answerMap[m1[1]] = m1[2].toUpperCase(); continue; }

      // Format 2: "1. a) text" — extract the letter
      const m2 = line.match(/^Q?(\d+)[.)]\s+([a-d])\)/i);
      if (m2) { answerMap[m2[1]] = m2[2].toUpperCase(); continue; }

      // Format 3: "Answer: A"
      const m3 = line.match(/answer[:\s]+([A-Da-d])\b/i);
      if (m3) {
        const num = Object.keys(answerMap).length + 1;
        answerMap[String(num)] = m3[1].toUpperCase();
      }
    }

    const test = new Test({ name: testName, year: testYear, uploadedBy: "admin", totalStudents });
    await test.save();

    const questionsArray = [];
    let currentSection = "General";
    let questionNumber = 0;

    for (let line of pyqLines) {
      // ✅ Detect section headings
      const detectedSection = detectSection(line);
      // Only update section if line is SHORT (likely a heading, not a question)
      if (detectedSection && line.length < 40) {
        currentSection = detectedSection;
        continue;
      }

      // ✅ Format 1: Standard "Q1. question (A) opt (B) opt..."
      const stdMatch = line.match(/^Q?(\d+)[.)]\s+(.+)/i);
      if (stdMatch) {
        questionNumber = parseInt(stdMatch[1]);
        const rest = stdMatch[2];

        // Try inline options on same line
        const inlineOpts = rest.match(/^(.*?)\s+\(A\)\s+(.*?)\s+\(B\)\s+(.*?)\s+\(C\)\s+(.*?)\s+\(D\)\s+(.*)$/i)
                        || rest.match(/^(.*?)\s+a\)\s+(.*?)\s+b\)\s+(.*?)\s+c\)\s+(.*?)\s+d\)\s+(.*)$/i);

        if (inlineOpts) {
          questionsArray.push({
            testId: test._id, questionNumber,
            question: inlineOpts[1].trim(),
            options: [inlineOpts[2].trim(), inlineOpts[3].trim(), inlineOpts[4].trim(), inlineOpts[5].trim()],
            correctAnswer: "", section: currentSection,
            subject: currentSection, topic: currentSection,
            marks: 1, negativeMarks: 0, year: testYear,
          });
        } else {
          // Question without options yet — store for next lines
          questionsArray.push({
            testId: test._id, questionNumber,
            question: rest.trim(),
            options: [],
            correctAnswer: "", section: currentSection,
            subject: currentSection, topic: currentSection,
            marks: 1, negativeMarks: 0, year: testYear,
          });
        }
        continue;
      }

      // ✅ Format 2: Pure inline "question text a) opt b) opt c) opt d) opt"
      if (/\ba\)\s+.+\bb\)\s+.+\bc\)\s+.+\bd\)/i.test(line)) {
        questionNumber++;
        const q = parseInlineQuestion(line, currentSection, test._id, testYear, questionNumber);
        if (q) { questionsArray.push(q); continue; }
      }

      // ✅ Format 3: Separate option lines "(A) text" or "a) text"
      if (questionsArray.length > 0) {
        const lastQ = questionsArray[questionsArray.length - 1];
        const optMatch = line.match(/^\(([A-D])\)\s*(.+)/i) || line.match(/^([a-d])\)\s*(.+)/i);
        if (optMatch && lastQ.options.length < 4) {
          lastQ.options.push(optMatch[2].trim());
          continue;
        }
      }
    }

    // ✅ Match answers by question number
    const finalQuestions = questionsArray.filter(q => q.options.length === 4);

    finalQuestions.forEach((q) => {
      const answerLetter = answerMap[String(q.questionNumber)];
      if (answerLetter) {
        const idx = answerLetter.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
        if (q.options[idx]) {
          q.correctAnswer = q.options[idx];
        }
      }
    });

    if (finalQuestions.length === 0) {
      fs.unlinkSync(pyqPath);
      fs.unlinkSync(answerPath);
      return res.status(400).json({
        message: "No questions parsed. Check PDF format.",
        tip: "Supported formats: 'Q1. question (A) opt' or 'question text a) opt b) opt c) opt d) opt'"
      });
    }

    await Question.insertMany(finalQuestions);
    await Test.findByIdAndUpdate(test._id, { totalQuestions: finalQuestions.length });

    fs.unlinkSync(pyqPath);
    fs.unlinkSync(answerPath);

    res.status(200).json({
      message: "PDF uploaded successfully",
      testId: test._id,
      testName: test.name,
      totalQuestions: finalQuestions.length,
      totalStudents: test.totalStudents,
      sections: [...new Set(finalQuestions.map(q => q.section))],
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "PDF parsing failed", error: error.message });
  }
};