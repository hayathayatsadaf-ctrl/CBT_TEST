const { GoogleGenerativeAI } = require("@google/generative-ai");
const Question = require("../models/Question");
const Test = require("../models/Test");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function extractQuestionsWithGemini(pyqBuffer, ansBuffer) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // free model

  const pyqBase64 = pyqBuffer.toString("base64");
  const ansBase64 = ansBuffer.toString("base64");

  const prompt = `Extract ALL questions from the question paper PDF and match answers from the answer key PDF.
Return ONLY a JSON array. No explanation, no markdown, no backticks.
Format:
[
  {
    "questionNumber": 1,
    "question": "full question text",
    "options": ["option A text", "option B text", "option C text", "option D text"],
    "correctAnswer": "exact text of correct option",
    "type": "MCQ",
    "section": "General Aptitude",
    "marks": 1,
    "negativeMarks": 0.33
  },
  {
    "questionNumber": 17,
    "question": "full question text",
    "options": [],
    "correctAnswer": "31",
    "type": "NAT",
    "section": "CS",
    "marks": 1,
    "negativeMarks": 0
  }
]
Rules:
- type: MCQ or NAT only
- NAT: options=[], correctAnswer=numeric value
- MCQ: exactly 4 options, correctAnswer=full text of correct option
- section: "General Aptitude" for GA, "CS" for CS questions
- Get correctAnswer from the answer key PDF
- Include ALL questions`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType: "application/pdf", data: pyqBase64 } },
    { inlineData: { mimeType: "application/pdf", data: ansBase64 } },
  ]);

  const text = result.response.text().trim().replace(/```json|```/g, "").trim();
  return JSON.parse(text);
}

exports.uploadPDFs = async (req, res) => {
  let test = null;
  try {
    if (!req.files?.["pyq"] || !req.files?.["answerKey"]) {
      return res.status(400).json({ message: "Both PYQ and Answer Key PDFs required" });
    }

    const pyqBuffer     = req.files["pyq"][0].buffer;
    const ansBuffer     = req.files["answerKey"][0].buffer;
    const testName      = req.body.testName || `GATE Test ${new Date().getFullYear()}`;
    const testYear      = parseInt(req.body.year) || new Date().getFullYear();
    const totalStudents = parseInt(req.body.totalStudents) || 1000;

    console.log("Calling Gemini AI to parse PDFs...");
    const parsed = await extractQuestionsWithGemini(pyqBuffer, ansBuffer);
    console.log(`Gemini parsed ${parsed.length} questions`);

    test = new Test({ name: testName, year: testYear, uploadedBy: "admin", totalStudents });
    await test.save();

    const questions = parsed.map(q => ({
      testId:         test._id,
      questionNumber: q.questionNumber,
      question:       q.question,
      options:        q.options || [],
      correctAnswer:  String(q.correctAnswer || ""),
      type:           q.type || "MCQ",
      section:        q.section || "CS",
      subject:        q.section || "CS",
      topic:          q.section || "CS",
      marks:          q.marks || 1,
      negativeMarks:  q.negativeMarks ?? 0.33,
      year:           testYear,
    }));

    const final = questions.filter(q =>
      q.question?.trim().length >= 5 &&
      q.correctAnswer &&
      (q.type === "NAT" || q.options.length >= 2)
    );

    if (final.length === 0) {
      await Test.findByIdAndDelete(test._id);
      return res.status(422).json({ message: "No valid questions parsed." });
    }

    await Question.insertMany(final);
    await Test.findByIdAndUpdate(test._id, { totalQuestions: final.length });

    return res.status(200).json({
      message: "✅ Test uploaded successfully!",
      testId: test._id,
      testName: test.name,
      totalQuestions: final.length,
      totalStudents: test.totalStudents,
      sections: [...new Set(final.map(q => q.section))],
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