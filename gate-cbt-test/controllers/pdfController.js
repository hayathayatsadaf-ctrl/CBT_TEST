const Question = require("../models/Question");
const Test = require("../models/Test");
const https = require("https");

// ══════════════════════════════════════════════════════════════════
// PDF TEXT EXTRACTOR — pdfjs-dist
// ══════════════════════════════════════════════════════════════════
async function pdfParseBuffer(buffer) {
  let pdfjsLib;
  try { pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js"); }
  catch(e) {
    try { pdfjsLib = require("pdfjs-dist"); }
    catch(e2) { pdfjsLib = require("pdfjs-dist/build/pdf.js"); }
  }
  if (pdfjsLib.GlobalWorkerOptions) pdfjsLib.GlobalWorkerOptions.workerSrc = false;

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    standardFontDataUrl: null,
  });

  const pdf = await loadingTask.promise;
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!item.str) continue;
      const s = item.str.trim();
      if (/^Q\d+[.)]/.test(s) || /^\([A-D]\)/.test(s)) {
        fullText += "\n" + item.str;
      } else {
        fullText += " " + item.str;
      }
    }
    fullText += "\n";
  }

  // Post-process: split on Q\d+ mid-line
  fullText = fullText
    .replace(/\s+(Q\d+[.)]\s)/g, "\n$1")
    .replace(/\s+(\([A-D]\)\s)/g, "\n$1");

  return { text: fullText };
}

// ══════════════════════════════════════════════════════════════════
// GROQ AI PARSER — free, fast Llama model
// ══════════════════════════════════════════════════════════════════
async function parseWithGroq(pyqText, answerText) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set in environment");

  const prompt = `You are a question paper parser. Extract all questions from the question paper and match with answer key.

QUESTION PAPER:
${pyqText.slice(0, 12000)}

ANSWER KEY:
${answerText.slice(0, 4000)}

Return ONLY a valid JSON array. No explanation, no markdown, no extra text. Example:
[
  {
    "questionNumber": 1,
    "question": "Full question text",
    "type": "MCQ",
    "options": ["option A text", "option B text", "option C text", "option D text"],
    "correctAnswer": "option B text",
    "section": "General Aptitude",
    "marks": 1,
    "negativeMarks": 0.33
  },
  {
    "questionNumber": 3,
    "question": "NAT question text",
    "type": "NAT",
    "options": [],
    "correctAnswer": "9",
    "section": "Operating Systems",
    "marks": 1,
    "negativeMarks": 0
  }
]

Rules:
- type: "MCQ" or "NAT" only
- MCQ correctAnswer: full option text (not just A/B/C/D)
- NAT correctAnswer: numeric value as string
- section: from headings e.g. "General Aptitude", "Data Structures"
- marks: 1 or 2
- negativeMarks: 0.33 for 1-mark MCQ, 0.66 for 2-mark MCQ, 0 for NAT
- Extract ALL questions without skipping
- Return ONLY the JSON array`;

  const body = JSON.stringify({
    model: "llama-3.3-70b-versatile",
    max_tokens: 8000,
    temperature: 0,
    messages: [{ role: "user", content: prompt }]
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Length": Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          if (response.error) return reject(new Error(response.error.message));
          const text = response.choices[0].message.content.trim();
          // Strip markdown code blocks if present
          const clean = text
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```\s*$/i, "")
            .trim();
          const questions = JSON.parse(clean);
          resolve(questions);
        } catch(e) {
          reject(new Error("Groq response parse failed: " + e.message));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════════
// MAIN UPLOAD HANDLER
// ══════════════════════════════════════════════════════════════════
exports.uploadPDFs = async (req, res) => {
  try {
    console.log("FILES RECEIVED:", req.files);

    if (!req.files?.["pyq"] || !req.files?.["answerKey"]) {
      return res.status(400).json({ message: "Both PYQ and Answer Key PDFs required" });
    }

    const pyqBuffer     = req.files["pyq"][0].buffer;
    const answerBuffer  = req.files["answerKey"][0].buffer;
    const testName      = req.body.testName || `Test ${new Date().toLocaleDateString()}`;
    const testYear      = parseInt(req.body.year) || new Date().getFullYear();
    const totalStudents = parseInt(req.body.totalStudents) || 1000;

    console.log("Extracting text from PDFs...");
    const pyqText    = (await pdfParseBuffer(pyqBuffer)).text;
    const answerText = (await pdfParseBuffer(answerBuffer)).text;

    console.log("Sending to Groq AI for parsing...");
    const parsedQuestions = await parseWithGroq(pyqText, answerText);
    console.log(`Groq parsed: ${parsedQuestions.length} questions`);

    const test = new Test({ name: testName, year: testYear, uploadedBy: "admin", totalStudents });
    await test.save();

    // Attach testId and year to each question
    const finalQuestions = parsedQuestions
      .filter(q => q.question && q.question.trim().length > 3 && q.correctAnswer)
      .map(q => ({
        ...q,
        testId: test._id,
        year: testYear,
        subject: q.section || "General",
        topic: q.section || "General",
        options: q.options || [],
        correctAnswer: String(q.correctAnswer),
      }));

    console.log(`Final questions to save: ${finalQuestions.length}`);

    if (finalQuestions.length === 0) {
      await Test.findByIdAndDelete(test._id);
      return res.status(400).json({ message: "No questions parsed. Check PDF content." });
    }

    await Question.insertMany(finalQuestions);
    await Test.findByIdAndUpdate(test._id, { totalQuestions: finalQuestions.length });

    res.status(200).json({
      message: "PDF uploaded successfully ✅",
      testId: test._id,
      testName: test.name,
      totalQuestions: finalQuestions.length,
      mcqQuestions: finalQuestions.filter(q => q.type === "MCQ").length,
      natQuestions: finalQuestions.filter(q => q.type === "NAT").length,
      totalPossibleMarks: finalQuestions.reduce((s, q) => s + (q.marks || 1), 0),
      sections: [...new Set(finalQuestions.map(q => q.section))],
    });

  } catch (error) {
    console.error("PDF PARSE ERROR:", error);
    res.status(500).json({ message: "PDF parsing failed", error: error.message });
  }
};

// ══════════════════════════════════════════════════════════════════
// OTHER ROUTES
// ══════════════════════════════════════════════════════════════════
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
    const latest = await Test.findOne().sort({ createdAt: -1 });
    if (!latest) return res.status(404).json({ message: "No tests found" });
    const questions = await Question.find({ testId: latest._id });
    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};