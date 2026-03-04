const pdf = require("pdf-parse");
const Question = require("../models/Question");
const Test = require("../models/Test");

// ✅ Parse PDF directly from buffer (NO temp file)
async function pdfParseBuffer(buffer) {
  const data = await pdf(buffer);
  return { text: data.text };
}

function detectSection(text) {
  if (/linked.?list/i.test(text)) return "Linked List";
  if (/\barray\b/i.test(text)) return "Array";
  if (/\bstack\b/i.test(text)) return "Stack";
  if (/\bqueue\b/i.test(text)) return "Queue";
  if (/\btree\b/i.test(text)) return "Tree";
  if (/\bgraph\b/i.test(text)) return "Graph";
  if (/mixed|advanced/i.test(text)) return "Mixed Advanced";
  if (/aptitude/i.test(text)) return "Aptitude";
  if (/reasoning/i.test(text)) return "Reasoning";
  if (/english/i.test(text)) return "English";
  if (/technical/i.test(text)) return "Technical";
  return null;
}

function parseInlineQuestion(text, section, testId, year, questionNumber) {
  const optionMatch = text.match(
    /^(.*?)\s+a\)\s+(.*?)\s+b\)\s+(.*?)\s+c\)\s+(.*?)\s+d\)\s+(.*)$/i
  );
  if (!optionMatch) return null;

  const question = optionMatch[1].trim();
  const options = [
    optionMatch[2].trim(),
    optionMatch[3].trim(),
    optionMatch[4].trim(),
    optionMatch[5].trim(),
  ];

  if (!question || options.some((o) => !o)) return null;

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
    console.log("FILES RECEIVED:", req.files);

    if (!req.files || !req.files["pyq"] || !req.files["answerKey"]) {
      return res
        .status(400)
        .json({ message: "Both PYQ and Answer Key PDFs required" });
    }

    const pyqBuffer = req.files["pyq"][0].buffer;
    const answerBuffer = req.files["answerKey"][0].buffer;

    const testName =
      req.body.testName || `Test ${new Date().toLocaleDateString()}`;
    const testYear =
      parseInt(req.body.year) || new Date().getFullYear();
    const totalStudents =
      parseInt(req.body.totalStudents) || 1000;

    console.log("Parsing PYQ...");
    const pyqText = (await pdfParseBuffer(pyqBuffer)).text;

    console.log("Parsing Answer Key...");
    const answerText = (await pdfParseBuffer(answerBuffer)).text;

    const pyqLines = pyqText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 5);

    const ansLines = answerText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l);

    // ✅ Build answer map
    const answerMap = {};
    for (let line of ansLines) {
      const m1 = line.match(/^Q?(\d+)[.)]\s*([A-Da-d])\b/i);
      if (m1) {
        answerMap[m1[1]] = m1[2].toUpperCase();
        continue;
      }
    }

    const test = new Test({
      name: testName,
      year: testYear,
      uploadedBy: "admin",
      totalStudents,
    });

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

      const stdMatch = line.match(/^Q?(\d+)[.)]\s+(.+)/i);
      if (stdMatch) {
        questionNumber = parseInt(stdMatch[1]);
        const rest = stdMatch[2];

        const inlineOpts =
          rest.match(
            /^(.*?)\s+\(A\)\s+(.*?)\s+\(B\)\s+(.*?)\s+\(C\)\s+(.*?)\s+\(D\)\s+(.*)$/i
          ) ||
          rest.match(
            /^(.*?)\s+a\)\s+(.*?)\s+b\)\s+(.*?)\s+c\)\s+(.*?)\s+d\)\s+(.*)$/i
          );

        if (inlineOpts) {
          questionsArray.push({
            testId: test._id,
            questionNumber,
            question: inlineOpts[1].trim(),
            options: [
              inlineOpts[2].trim(),
              inlineOpts[3].trim(),
              inlineOpts[4].trim(),
              inlineOpts[5].trim(),
            ],
            correctAnswer: "",
            section: currentSection,
            subject: currentSection,
            topic: currentSection,
            marks: 1,
            negativeMarks: 0,
            year: testYear,
          });
        } else {
          questionsArray.push({
            testId: test._id,
            questionNumber,
            question: rest.trim(),
            options: [],
            correctAnswer: "",
            section: currentSection,
            subject: currentSection,
            topic: currentSection,
            marks: 1,
            negativeMarks: 0,
            year: testYear,
          });
        }
        continue;
      }

      if (questionsArray.length > 0) {
        const lastQ = questionsArray[questionsArray.length - 1];
        const optMatch =
          line.match(/^\(([A-D])\)\s*(.+)/i) ||
          line.match(/^([a-d])\)\s*(.+)/i);

        if (optMatch && lastQ.options.length < 4) {
          lastQ.options.push(optMatch[2].trim());
        }
      }
    }

    const finalQuestions = questionsArray.filter(
      (q) => q.options.length === 4
    );

    finalQuestions.forEach((q) => {
      const answerLetter = answerMap[String(q.questionNumber)];
      if (answerLetter) {
        const idx = answerLetter.charCodeAt(0) - 65;
        if (q.options[idx]) {
          q.correctAnswer = q.options[idx];
        }
      }
    });

    if (finalQuestions.length === 0) {
      return res
        .status(400)
        .json({ message: "No questions parsed. Check PDF format." });
    }

    await Question.insertMany(finalQuestions);
    await Test.findByIdAndUpdate(test._id, {
      totalQuestions: finalQuestions.length,
    });

    res.status(200).json({
      message: "PDF uploaded successfully",
      testId: test._id,
      testName: test.name,
      totalQuestions: finalQuestions.length,
      totalStudents: test.totalStudents,
      sections: [...new Set(finalQuestions.map((q) => q.section))],
    });
  } catch (error) {
    console.error("PDF PARSE ERROR:", error);
    res.status(500).json({
      message: "PDF parsing failed",
      error: error.message,
    });
  }
};