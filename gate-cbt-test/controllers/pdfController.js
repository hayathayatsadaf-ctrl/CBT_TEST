const Question = require("../models/Question");
const Test = require("../models/Test");

// ── PDF TEXT EXTRACTOR ─────────────────────────────────────────────
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
    try {
      const pdfParseLib = require("pdf-parse");
      const fn = typeof pdfParseLib === "function" ? pdfParseLib : pdfParseLib.default;
      const data = await fn(buffer);
      return data.text || "";
    } catch (e2) {
      console.error("pdf-parse error:", e2.message);
      return "";
    }
  }
}

// ── ANSWER KEY PARSER ──────────────────────────────────────────────
// Supports ALL formats:
//
// FORMAT 1 — GATE Official table (your CS2012 file):
//   "CS 1 B    C    B    D"  → Code A answer = first column
//   "CS 3 Marks to All  C   C   C" → give marks to all
//
// FORMAT 2 — Generated PDF:
//   "Q1. Answer: B [MCQ | 1 Mark | Negative: -0.33]"
//
// FORMAT 3 — Simple:
//   "1. B"  "1) B"  "Q1. B"  "3. 9" (NAT)
//
function parseAnswerMap(ansText) {
  const map = {};
  const lines = ansText.split("\n").map(l => l.trim()).filter(l => l);

  for (const line of lines) {

    // ── FORMAT 1: GATE Official "CS 1 B    C    B    D" ──
    // Paper codes: CS, CE, ME, EE, EC, IN, CH, MA, PH, etc.
    const gateTable = line.match(
      /^(CS|CE|ME|EE|EC|IN|CH|MA|PH|GG|AE|AG|BT|CY|GE|MN|MT|PE|PI|TF|XE|XL)\s+(\d+)\s+(Marks\s+to\s+All|[A-D])/i
    );
    if (gateTable) {
      const qno  = gateTable[2];
      const ans  = gateTable[3];
      const isMarksToAll = /marks/i.test(ans);
      // Detect marks: Q1-25 = 1 mark, Q26-55 = 2 marks, Q56-60 = 1 mark GA, Q61-65 = 2 marks GA
      const qNum = parseInt(qno);
      const marks = (qNum >= 26 && qNum <= 55) || (qNum >= 61 && qNum <= 65) ? 2 : 1;
      const section = (qNum >= 56) ? "General Aptitude" : "CS";
      map[qno] = {
        answer: isMarksToAll ? "MARKS_TO_ALL" : ans.toUpperCase(),
        type: "MCQ",
        marks,
        negativeMarks: marks === 2 ? 0.66 : 0.33,
        section,
        marksToAll: isMarksToAll,
      };
      continue;
    }

    // ── FORMAT 2: Generated PDF "Q1. Answer: B [MCQ | 1 Mark ...]" ──
    const fmt2 = line.match(
      /^Q(\d+)\.\s+Answer:\s+([A-D]|-?\d+(?:\.\d+)?)\s+\[(MCQ|NAT)\s*\|\s*(\d+)\s*Marks?/i
    );
    if (fmt2) {
      const type  = fmt2[3].toUpperCase();
      const marks = parseInt(fmt2[4]);
      map[fmt2[1]] = {
        answer: type === "MCQ" ? fmt2[2].toUpperCase() : fmt2[2],
        type, marks,
        negativeMarks: type === "NAT" ? 0 : marks === 2 ? 0.66 : 0.33,
      };
      continue;
    }

    // ── FORMAT 3: Simple "1. B" or "Q1. B" ──
    const simple = line.match(/^Q?(\d+)[.)]\s*([A-D])\s*$/i);
    if (simple) {
      map[simple[1]] = {
        answer: simple[2].toUpperCase(),
        type: "MCQ", marks: 1, negativeMarks: 0.33,
      };
      continue;
    }

    // ── FORMAT 3 NAT: "1. 9" ──
    const nat = line.match(/^Q?(\d+)[.)]\s*(-?\d+(?:\.\d+)?)$/i);
    if (nat) {
      map[nat[1]] = { answer: nat[2], type: "NAT", marks: 1, negativeMarks: 0 };
      continue;
    }

    // ── FORMAT 4: Inline "1. B 2. C 3. D ..." ──
    const inlineMatches = [...line.matchAll(/(\d+)\.\s+([A-D])/g)];
    if (inlineMatches.length >= 2) {
      for (const m of inlineMatches) {
        if (!map[m[1]]) {
          map[m[1]] = { answer: m[2].toUpperCase(), type: "MCQ", marks: 1, negativeMarks: 0.33 };
        }
      }
    }

    // ── FORMAT 5: GATE table "1 MCQ GA C 1" ──
    const gateNew = line.match(/^(\d+)\s+(MCQ|NAT)\s+(\w+)\s+(.+?)\s+(\d+)\s*$/i);
    if (gateNew) {
      const qno   = gateNew[1];
      const type  = gateNew[2].toUpperCase();
      const sec   = gateNew[3];
      const key   = gateNew[4].trim();
      const marks = parseInt(gateNew[5]);
      let answer  = key;
      if (type === "MCQ") {
        const lm = key.match(/[A-D]/i);
        if (!lm) continue;
        answer = lm[0].toUpperCase();
      }
      map[qno] = {
        answer, type, marks,
        negativeMarks: type === "NAT" ? 0 : marks === 2 ? 0.66 : 0.33,
        section: sec === "GA" ? "General Aptitude" : "CS",
      };
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
  let section = "CS";

  const SKIP = [
    /^page\s+\d/i, /^\d+\/\d+$/, /^end of the question/i,
    /^total questions/i, /^time:/i, /^max marks/i,
    /^read the following/i, /^duration:/i, /^name\s*$/i,
    /^registration number/i, /^cs-a/i,
  ];

  for (const line of lines) {
    if (SKIP.some(p => p.test(line))) continue;

    // Section detection
    if (/general aptitude/i.test(line) && line.length < 60) { section = "General Aptitude"; continue; }
    if (/computer science/i.test(line) && line.length < 60) { section = "CS"; continue; }
    if (/^Q\.\s*\d+\s*[–-]\s*Q\.\s*\d+\s+carry/i.test(line)) continue; // "Q.1-Q.25 carry one mark"

    // ── Question: "Q.1 " or "Q1." or "Q. 1" ──
    const qfmt = line.match(/^Q\.?\s*(\d+)[\.\s]\s*(.*)/i);
    if (qfmt) {
      if (cur) questions.push(cur);
      const qno  = parseInt(qfmt[1]);
      const rest = qfmt[2].trim();
      const info = answerMap[String(qno)] || {};

      // Use section from answerMap if available
      const qSection = info.section || section;

      cur = {
        testId,
        questionNumber: qno,
        question: rest || "",
        options: [],
        correctAnswer: "",
        section: qSection,
        subject: qSection,
        topic: qSection,
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
        if (m) {
          const txt = m[2].replace(/\s*\([A-D]\).*$/, "").trim();
          if (txt) cur.options.push(txt);
        }
      }
      continue;
    }

    // Single option "(A) text"
    const opt = line.match(/^\(([A-D])\)\s*(.+)/i);
    if (opt) { cur.options.push(opt[2].trim()); continue; }

    // Question text continuation
    if (line.length > 2 && !SKIP.some(p => p.test(line))) {
      if (!cur.question) cur.question = line;
      else if (cur.options.length === 0 && cur.question.length < 600) cur.question += " " + line;
    }
  }

  if (cur) questions.push(cur);

  // ── Assign correct answers ──
  for (const q of questions) {
    const info = answerMap[String(q.questionNumber)];
    if (!info) continue;

    q.type          = info.type          || q.type;
    q.marks         = info.marks         || q.marks;
    q.negativeMarks = info.negativeMarks ?? q.negativeMarks;

    if (info.marksToAll) {
      // "Marks to All" — use first option as correct or skip
      q.correctAnswer = q.options[0] || "MARKS_TO_ALL";
      continue;
    }

    if (q.type === "NAT") {
      q.correctAnswer = String(info.answer);
      q.options       = [];
      q.negativeMarks = 0;
    } else {
      // MCQ — convert letter to option text
      const idx = info.answer.charCodeAt(0) - 65; // A=0,B=1,C=2,D=3
      q.correctAnswer = q.options[idx] ?? info.answer; // fallback to letter if option not found
    }
  }

  return questions;
}

// ── MAIN UPLOAD HANDLER ────────────────────────────────────────────
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

    const [pyqText, ansText] = await Promise.all([
      extractText(pyqBuffer),
      extractText(ansBuffer),
    ]);

    console.log("PYQ sample:", pyqText.slice(0, 300));
    console.log("ANS sample:", ansText.slice(0, 300));

    const answerMap = parseAnswerMap(ansText);

    test = new Test({ name: testName, year: testYear, uploadedBy: "admin", totalStudents });
    await test.save();

    const questions = parseQuestions(pyqText, answerMap, test._id, testYear);

    // Filter valid questions
    const final = questions.filter(q =>
      q.question?.trim().length >= 5 &&
      q.correctAnswer &&
      (q.type === "NAT" || q.options.length >= 2)
    );

    console.log(`Parsed: ${questions.length}, Valid: ${final.length}`);

    if (final.length === 0) {
      await Test.findByIdAndDelete(test._id);
      return res.status(422).json({
        message: "No valid questions parsed.",
        debug: {
          pyqSample: pyqText.slice(0, 500),
          ansSample: ansText.slice(0, 500),
          answerMapKeys: Object.keys(answerMap).slice(0, 20),
          totalParsed: questions.length,
        },
      });
    }

    await Question.insertMany(final);
    await Test.findByIdAndUpdate(test._id, { totalQuestions: final.length });

    return res.status(200).json({
      message: "✅ Test uploaded successfully!",
      testId: test._id,
      testName: test.name,
      totalQuestions: final.length,
      totalStudents: test.totalStudents,
      mcqQuestions: final.filter(q => q.type === "MCQ").length,
      natQuestions: final.filter(q => q.type === "NAT").length,
      totalPossibleMarks: final.reduce((s, q) => s + q.marks, 0),
      sections: [...new Set(final.map(q => q.section))],
    });

  } catch (err) {
    console.error("uploadPDFs error:", err);
    if (test?._id) await Test.findByIdAndDelete(test._id).catch(() => {});
    return res.status(500).json({ message: "Upload failed", error: err.message });
  }
};

// ── EXTRA ROUTES ───────────────────────────────────────────────────
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