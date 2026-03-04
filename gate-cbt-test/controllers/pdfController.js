const Question = require("../models/Question");
const Test = require("../models/Test");

async function extractText(buffer) {
  try {
    const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
    pdfjs.GlobalWorkerOptions.workerSrc = "";
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(" ") + "\n";
    }
    return text;
  } catch (e) {
    console.error("pdfjs error:", e.message);
    // fallback to pdf-parse
    try {
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);
      return data.text || "";
    } catch(e2) {
      console.error("pdf-parse error:", e2.message);
      return "";
    }
  }
}

// ── ANSWER KEY PARSER ──────────────────────────────────────────────
function parseAnswerMap(ansText) {
  const map = {};
  const fullText = ansText.replace(/\n/g, " ");

  // ✅ Format: "1. B 2. B 3. C 4. B 5. C ..."
  const pattern = /(\d+)\.\s+([A-D])/gi;
  let match;
  while ((match = pattern.exec(fullText)) !== null) {
    map[match[1]] = {
      answer: match[2].toUpperCase(),
      type: "MCQ",
      marks: 1,
      negativeMarks: 0.33,
      section: "General",
    };
  }

  // ✅ Format: "Q.No Answer 1. B" table
  const lines = ansText.split("\n").map(l => l.trim()).filter(l => l);
  for (const line of lines) {
    // "1. B" or "Q1. B" or "1) B"
    const simple = line.match(/^Q?(\d+)[.)]\s*([A-D])\s*$/i);
    if (simple) {
      map[simple[1]] = { answer: simple[2].toUpperCase(), type: "MCQ", marks: 1, negativeMarks: 0.33, section: "General" };
      continue;
    }

    // GATE table: "1 MCQ GA C 1"
    const gate = line.match(/^(\d+)\s+(MCQ|NAT)\s+(\w+)\s+(.+?)\s+(\d+)\s*$/i);
    if (gate) {
      const qno = gate[1], type = gate[2].toUpperCase(), sec = gate[3].toUpperCase(), key = gate[4].trim(), marks = parseInt(gate[5]);
      let answer = key;
      if (type === "MCQ") { const lm = key.match(/[A-D]/i); if (!lm) continue; answer = lm[0].toUpperCase(); }
      map[qno] = { answer, type, marks, negativeMarks: type === "NAT" ? 0 : marks === 2 ? 0.66 : 0.33, section: sec === "GA" ? "General Aptitude" : "CS" };
    }
  }

  console.log("Answer map total:", Object.keys(map).length);
  return map;
}

// ── QUESTION PARSER ────────────────────────────────────────────────
function parseQuestions(pyqText, answerMap, testId, testYear) {
  const lines = pyqText.split("\n").map(l => l.trim()).filter(l => l.length > 1);
  const questions = [];
  let cur = null;
  let section = "General";

  // Detect section from header
  const fullText = pyqText.toLowerCase();
  if (fullText.includes("general aptitude")) section = "General Aptitude";
  if (fullText.includes("computer science")) section = "CS";

  const SKIP = [/^page\s+\d/i, /^\d+\/\d+$/, /^end of the question/i, /^total questions/i, /^time:/i, /^max marks/i];

  for (const line of lines) {
    if (SKIP.some(p => p.test(line))) continue;

    if (/general aptitude/i.test(line) && line.length < 50) { section = "General Aptitude"; continue; }
    if (/computer science/i.test(line) && line.length < 50) { section = "CS"; continue; }
    if (/^section:/i.test(line)) { section = line.replace(/^section:\s*/i, "").trim(); continue; }

    // Q1. or Q.1 format
    const qfmt = line.match(/^Q\.?\s*(\d+)[\.\s]\s*(.*)/i);
    if (qfmt) {
      if (cur) questions.push(cur);
      const qno  = parseInt(qfmt[1]);
      const rest = qfmt[2].trim();
      const info = answerMap[String(qno)] || {};
      cur = {
        testId, questionNumber: qno,
        question: rest || "", options: [], correctAnswer: "",
        section, subject: section, topic: section,
        type: info.type || "MCQ",
        marks: info.marks || 1,
        negativeMarks: info.negativeMarks ?? 0.33,
        year: testYear,
      };
      continue;
    }

    if (!cur) continue;

    // Options on one line: "(A) x (B) y (C) z (D) w"
    if (/\(A\)\s*.+\(B\)\s*.+/i.test(line)) {
      const parts = line.split(/(?=\([A-D]\))/i);
      for (const p of parts) {
        const m = p.match(/^\(([A-D])\)\s*(.+)/i);
        if (m) { const txt = m[2].replace(/\([A-D]\).*$/, "").trim(); if (txt) cur.options.push(txt); }
      }
      continue;
    }

    // Single option
    const opt = line.match(/^\(([A-D])\)\s*(.+)/i);
    if (opt) { cur.options.push(opt[2].trim()); continue; }

    // Question text
    if (line.length > 2 && !SKIP.some(p => p.test(line))) {
      if (!cur.question) cur.question = line;
      else if (cur.options.length === 0 && cur.question.length < 600) cur.question += " " + line;
    }
  }
  if (cur) questions.push(cur);

  // Assign answers
  for (const q of questions) {
    const info = answerMap[String(q.questionNumber)];
    if (!info) continue;
    q.type = info.type; q.marks = info.marks; q.negativeMarks = info.negativeMarks;
    if (q.type === "NAT") {
      q.correctAnswer = String(info.answer); q.options = []; q.negativeMarks = 0;
    } else {
      const idx = info.answer.charCodeAt(0) - 65;
      q.correctAnswer = q.options[idx] ?? info.answer;
    }
  }

  return questions;
}

// ── MAIN ───────────────────────────────────────────────────────────
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

    const [pyqText, ansText] = await Promise.all([extractText(pyqBuffer), extractText(ansBuffer)]);

    console.log("PYQ sample:", pyqText.slice(0, 300));
    console.log("ANS sample:", ansText.slice(0, 300));

    const answerMap = parseAnswerMap(ansText);

    test = new Test({ name: testName, year: testYear, uploadedBy: "admin", totalStudents });
    await test.save();

    const questions = parseQuestions(pyqText, answerMap, test._id, testYear);

    const final = questions.filter(q =>
      q.question?.trim().length >= 5 && q.correctAnswer &&
      (q.type === "NAT" || q.options.length >= 2)
    );

    console.log(`Parsed: ${questions.length}, Valid: ${final.length}`);

    if (final.length === 0) {
      await Test.findByIdAndDelete(test._id);
      return res.status(422).json({
        message: "No valid questions parsed.",
        debug: { pyqSample: pyqText.slice(0, 400), ansSample: ansText.slice(0, 400), answerMapLen: Object.keys(answerMap).length, totalParsed: questions.length }
      });
    }

    await Question.insertMany(final);
    await Test.findByIdAndUpdate(test._id, { totalQuestions: final.length });

    return res.status(200).json({
      message: "✅ Test uploaded successfully!",
      testId: test._id, testName: test.name,
      totalQuestions: final.length, totalStudents: test.totalStudents,
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