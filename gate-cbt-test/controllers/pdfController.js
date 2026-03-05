const { GoogleGenerativeAI } = require("@google/generative-ai");
const Question = require("../models/Question");
const Test = require("../models/Test");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function extractQuestionsWithGemini(pyqBuffer, ansBuffer) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `You are a GATE exam question extractor. Extract ALL questions from the question paper PDF and match answers from the answer key PDF.

Return ONLY a valid JSON array. No explanation, no markdown, no backticks, no extra text.

JSON format:
[
  {
    "questionNumber": 1,
    "question": "full question text here",
    "options": ["option A text", "option B text", "option C text", "option D text"],
    "correctAnswer": "exact text of correct option",
    "type": "MCQ",
    "section": "CS",
    "marks": 1,
    "negativeMarks": 0.33
  },
  {
    "questionNumber": 17,
    "question": "full question text here",
    "options": [],
    "correctAnswer": "31",
    "type": "NAT",
    "section": "CS",
    "marks": 1,
    "negativeMarks": 0
  }
]

STRICT RULES:
- type must be exactly "MCQ" or "NAT"
- NAT questions: options=[], correctAnswer=numeric string from answer key
- MCQ questions: exactly 4 options array, correctAnswer=full text of correct option (not just letter)
- section: "General Aptitude" for GA questions, "CS" for CS questions
- marks: 1 or 2 based on question section
- negativeMarks: 0.33 for 1-mark MCQ, 0.66 for 2-mark MCQ, 0 for NAT
- Extract ALL questions including both GA and CS sections
- Match every question with its correct answer from answer key`;

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: "application/pdf", data: pyqBuffer.toString("base64") } },
    { inlineData: { mimeType: "application/pdf", data: ansBuffer.toString("base64") } },
  ]);

  let text = result.response.text().trim();
  // Remove markdown if present
  text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  
  const parsed = JSON.parse(text);
  console.log(`Gemini extracted ${parsed.length} questions`);
  return parsed;
}

exports.uploadPDFs = async (req, res) => {
  let test = null;
  try {
    if (!req.files?.["pyq"] || !req.files?.["answerKey"]) {
      return res.status(400).json({ message: "Both PYQ and Answer Key PDFs required" });
    }

    const pyqBuffer     = req.files["pyq"][0].buffer;
    const ansBuffer     = req.files["answerKey"][0].buffer;
    const testName      = req.body.testName || `Test ${new Date().toLocaleDateString()}`;
    const testYear      = parseInt(req.body.year) || new Date().getFullYear();
    const totalStudents = parseInt(req.body.totalStudents) || 1000;

    console.log("Calling Gemini AI...");
    const parsed = await extractQuestionsWithGemini(pyqBuffer, ansBuffer);

    test = new Test({ name: testName, year: testYear, uploadedBy: "admin", totalStudents });
    await test.save();

    const questions = parsed
      .filter(q => q.question?.trim().length >= 5 && q.correctAnswer)
      .map(q => ({
        testId:         test._id,
        questionNumber: q.questionNumber,
        question:       q.question.trim(),
        options:        Array.isArray(q.options) ? q.options : [],
        correctAnswer:  String(q.correctAnswer),
        type:           q.type === "NAT" ? "NAT" : "MCQ",
        section:        q.section || "CS",
        subject:        q.section || "CS",
        topic:          q.section || "CS",
        marks:          q.marks || 1,
        negativeMarks:  q.negativeMarks ?? 0.33,
        year:           testYear,
      }))
      .filter(q => q.type === "NAT" || q.options.length >= 2);

    if (questions.length === 0) {
      await Test.findByIdAndDelete(test._id);
      return res.status(422).json({ message: "No valid questions parsed." });
    }

    await Question.insertMany(questions);
    await Test.findByIdAndUpdate(test._id, { totalQuestions: questions.length });

    return res.status(200).json({
      message: "✅ Test uploaded successfully!",
      testId: test._id,
      testName: test.name,
      totalQuestions: questions.length,
      totalStudents: test.totalStudents,
      sections: [...new Set(questions.map(q => q.section))],
    });

  } catch (err) {
    console.error("uploadPDFs error:", err);
    if (test?._id) await Test.findByIdAndDelete(test._id).catch(() => {});
    return res.status(500).json({ message: "Upload failed", error: err.message });
  }
};

exports.getTests = async (req, res) => {
  try { res.status(200).json(await Test.find().sort({ createdAt: -1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
exports.getQuestionsByTest = async (req, res) => {
  try { res.status(200).json(await Question.find({ testId: req.params.testId })); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
exports.getAllQuestions = async (req, res) => {
  try { res.status(200).json(await Question.find().sort({ createdAt: -1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
