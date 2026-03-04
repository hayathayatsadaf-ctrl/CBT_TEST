const PDFParser = require("pdf2json");
const Question = require("../models/Question");
const Test = require("../models/Test");

// ✅ Parse from buffer (memory) instead of file path
function pdfParseBuffer(buffer) {
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
    pdfParser.parseBuffer(buffer); // ✅ buffer not file path
  });
}

function detectSection(text) {
  if (/linked.?list/i.test(text)) return "Linked List";
  if (/array/i.test(text)) return "Array";
  if (/stack/i.test(text)) return "Stack";
  if (/queue/i.test(text)) return "Queue";
  if (/tree/i.test(text)) return "Tree";
  if (/graph/i.test(text)) return "Graph";
  if (/mixed|advanced/i.test(text)) return "Mixed Advanced";
  if (/aptitude/i.test(text)) return "Aptitude";
  if (/reasoning/i.test(text)) return "Reasoning";
  if (/english/i.test(text)) return "English";
  if (/technical/i.test(text)) return "Technical";
  return null;
}

function parseInlineQuestion(text, section, testId, year, questionNumber) {
  const optionMatch = text.match(/^(.*?)\s+a\)\s+(.*?)\s+b\)\s+(.*?)\s+c\)\s+(.*?)\s+d\)\s+(.*)$/i);
  if (!optionMatch) return null;
  const question = optionMatch[1].trim();
  const options = [optionMatch[2].trim(), optionMatch[3].trim(), optionMatch[4].trim(), optionMatch[5].trim()];
  if (!question || options.some(o => !o)) return null;
  return { testId, questionNumber, question, options, correctAnswer: "", section, subject: section, topic: section, marks: 1, negativeMarks: 0, year };
}

exports.uploadPDFs = async (req, res) => {
  try {
    if (!req.files || !req.files["pyq"] || !req.files["answerKey"]) {
      return res.status(400).json({ message: "Both PYQ and Answer Key PDFs required" });
    }

    const pyqBuffer = req.files["pyq"][0].buffer;
    const answerBuffer = req.files["answerKey"][0].buffer;
    const testName = req.body.testName || `Test ${new Date().toLocaleDateString()}`;
    const testYear = parseInt(req.body.year) || new Date().getFullYear();
    const totalStudents = parseInt(req.body.totalStudents) || 1000;

    const pyqText = (await pdfParseBuffer(pyqBuffer)).text;
    const answerText = (await pdfParseBuffer(answerBuffer)).text;

    const pyqLines = pyqText.split("\n").map(l => l.trim()).filter(l => l.length > 5);
    const ansLines = answerText.split("\n").map(l => l.trim()).filter(l => l);

    // Build answer map
    const answerMap = {};
    for (let line of ansLines) {
      const m1 = line.match(/^Q?(\d+)[.)]\s*([A-Da-d])\b/i);
      if (m1) { answerMap[m1[1]] = m1[2].toUpperCase(); continue; }
      const m2 = line.match(/^Q?(\d+)[.)]\s+([a-d])\)/i);
      if (m2) { answerMap[m2[1]] = m2[2].toUpperCase(); continue; }
    }

    const test = new Test({ name: testName, year: testYear, uploadedBy: "admin", totalStudents });
    await test.save();

    const questionsArray = [];
    let currentSection = "General";
    let questionNumber = 0;

    for (let line of pyqLines) {
      const detectedSection = detectSection(line);
      if (detectedSection && line.length < 40) {
        currentSection = detectedSection;
        continue;
      }

      // Format 1: Q1. question with inline options
      const stdMatch = line.match(/^Q?(\d+)[.)]\s+(.+)/i);
      if (stdMatch) {
        questionNumber = parseInt(stdMatch[1]);
        const rest = stdMatch[2];
        const inlineOpts = rest.match(/^(.*?)\s+\(A\)\s+(.*?)\s+\(B\)\s+(.*?)\s+\(C\)\s+(.*?)\s+\(D\)\s+(.*)$/i)
                        || rest.match(/^(.*?)\s+a\)\s+(.*?)\s+b\)\s+(.*?)\s+c\)\s+(.*?)\s+d\)\s+(.*)$/i);
        if (inlineOpts) {
          questionsArray.push({ testId: test._id, questionNumber, question: inlineOpts[1].trim(),
            options: [inlineOpts[2].trim(), inlineOpts[3].trim(), inlineOpts[4].trim(), inlineOpts[5].trim()],
            correctAnswer: "", section: currentSection, subject: currentSection, topic: currentSection,
            marks: 1, negativeMarks: 0, year: testYear });
        } else {
          questionsArray.push({ testId: test._id, questionNumber, question: rest.trim(),
            options: [], correctAnswer: "", section: currentSection, subject: currentSection,
            topic: currentSection, marks: 1, negativeMarks: 0, year: testYear });
        }
        continue;
      }

      // Format 2: Pure inline "question a) opt b) opt c) opt d) opt"
      if (/\ba\)\s+.+\bb\)\s+.+\bc\)\s+.+\bd\)/i.test(line)) {
        questionNumber++;
        const q = parseInlineQuestion(line, currentSection, test._id, testYear, questionNumber);
        if (q) { questionsArray.push(q); continue; }
      }

      // Format 3: Separate option lines
      if (questionsArray.length > 0) {
        const lastQ = questionsArray[questionsArray.length - 1];
        const optMatch = line.match(/^\(([A-D])\)\s*(.+)/i) || line.match(/^([a-d])\)\s*(.+)/i);
        if (optMatch && lastQ.options.length < 4) {
          lastQ.options.push(optMatch[2].trim());
          continue;
        }
      }
    }

    const finalQuestions = questionsArray.filter(q => q.options.length === 4);

    finalQuestions.forEach((q) => {
      const answerLetter = answerMap[String(q.questionNumber)];
      if (answerLetter) {
        const idx = answerLetter.charCodeAt(0) - 65;
        if (q.options[idx]) q.correctAnswer = q.options[idx];
      }
    });

    if (finalQuestions.length === 0) {
      return res.status(400).json({ message: "No questions parsed. Check PDF format." });
    }

    await Question.insertMany(finalQuestions);
    await Test.findByIdAndUpdate(test._id, { totalQuestions: finalQuestions.length });

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

exports.getTests = async (req, res) => {
  try {
    const tests = await Test.find().sort({ createdAt: -1 });
    res.status(200).json(tests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getQuestionsByTest = async (req, res) => {
  try {
    const questions = await Question.find({ testId: req.params.testId });
    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllQuestions = async (req, res) => {
  try {
    const questions = await Question.find().sort({ createdAt: -1 });
    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};;