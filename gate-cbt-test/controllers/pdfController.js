const pdfParse = require("pdf-parse");
const Question = require("../models/Question");
const Test     = require("../models/Test");

async function extractText(buffer) {
  try {
    const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
    pdfjsLib.GlobalWorkerOptions.workerSrc = false;
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer), standardFontDataUrl: null, disableFontFace: true });
    const pdf = await loadingTask.promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(" ") + "\n";
    }
    return fullText;
  } catch (e) {
    console.error("pdfjs error:", e.message);
    try {
      const data = await pdfParse(buffer);
      return data.text || "";
    } catch(e2) {
      console.error("pdf-parse error:", e2.message);
      return "";
    }
  }
}

// ── ANSWER KEY PARSER ──────────────────────────────────────────────
function parseAnswerMap(ansText, setCode) {
  const map = {};
  const lines = ansText.split("\n").map(l => l.trim()).filter(l => l);
  const setIndex = setCode ? "ABCD".indexOf(setCode.toUpperCase()) : 0;

  for (let line of lines) {
    if (/Q\.No|Type|Section|Key|Marks|Answer Key|^Paper|^Question|^Code/i.test(line)) continue;

    // Format 1 old GATE: "CS 1 B C B D"
    const m1 = line.match(/^(CS|GA)\s+(\d+)\s+([A-D*])\s+([A-D*])\s+([A-D*])\s+([A-D*])\s*$/i);
    if (m1) {
      const sec = m1[1].toUpperCase(), qno = m1[2];
      const answers = [m1[3], m1[4], m1[5], m1[6]];
      const answer = answers[setIndex] === "*" ? null : answers[setIndex].toUpperCase();
      if (answer) map[sec+"_"+qno] = { answer, type:"MCQ", marks:1, section: sec==="GA"?"General Aptitude":"CS", negativeMarks:0.33 };
      continue;
    }

    // Format 1b: "CS 3 Marks to All"
    const m1b = line.match(/^(CS|GA)\s+(\d+)\s+Marks\s+to\s+All/i);
    if (m1b) {
      map[m1b[1].toUpperCase()+"_"+m1b[2]] = { answer:"MARKS_TO_ALL", type:"MCQ", marks:1, section: m1b[1]==="GA"?"General Aptitude":"CS", negativeMarks:0 };
      continue;
    }

    // Format 2 new GATE 2019+: "1 MCQ GA C 1"
    const m2 = line.match(/^(\d+)\s+(MCQ|NAT)\s+(\w+)\s+(.+?)\s+(\d+)\s*$/i);
    if (m2) {
      const qno=m2[1], type=m2[2].toUpperCase(), sec=m2[3].toUpperCase(), key=m2[4].trim(), marks=parseInt(m2[5]);
      let answer = key;
      if (type==="MCQ") { const lm=key.match(/[A-D]/i); if(!lm) continue; answer=lm[0].toUpperCase(); }
      map[sec+"_"+qno] = { answer, type, marks, section:sec==="GA"?"General Aptitude":"CS", negativeMarks:type==="NAT"?0:marks===2?0.66:0.33 };
      continue;
    }

    // Format 3: "1. C"
    const m3 = line.match(/^Q?(\d+)[.)]\s*([A-D])\s*$/i);
    if (m3) {
      const ans = { answer:m3[2].toUpperCase(), type:"MCQ", marks:1, section:"CS", negativeMarks:0.33 };
      map["CS_"+m3[1]] = ans;
      map["GA_"+m3[1]] = { ...ans, section:"General Aptitude" };
    }
  }
  return map;
}


exports.uploadPDFs = async (req, res) => {
  let test = null;
  try {
    if (!req.files?.["pyq"] || !req.files?.["answerKey"]) {
      return res.status(400).json({ message: "Both PYQ and Answer Key PDFs required" });
    }

    const pyqBuffer     = req.files["pyq"][0].buffer;
    const ansBuffer     = req.files["answerKey"][0].buffer;
    const testName      = req.body.testName || `GATE Test`;
    const testYear      = parseInt(req.body.year) || new Date().getFullYear();
    const totalStudents = parseInt(req.body.totalStudents) || 1000;
    const setCode       = req.body.setCode || "A"; // ✅ Which set: A, B, C, D

    const [pyqText, ansText] = await Promise.all([extractText(pyqBuffer), extractText(ansBuffer)]);

    console.log("PYQ sample:", pyqText.slice(0, 200));
    console.log("ANS sample:", ansText.slice(0, 300));

    const pyqLines  = pyqText.split("\n").map(l => l.trim()).filter(l => l.length > 1);
    const answerMap = parseAnswerMap(ansText, setCode);
    console.log(`Answer map total: ${Object.keys(answerMap).length}`);

    test = new Test({ name: testName, year: testYear, uploadedBy: "admin", totalStudents });
    await test.save();

    const questions = [];
    let cur = null;
    let section = "CS";
    let sectionCode = "CS";

    for (let line of pyqLines) {
      if (SKIP.some(p => p.test(line))) continue;

      if (/GATE 20\d\d General Aptitude/i.test(line)) { section = "General Aptitude"; sectionCode = "GA"; continue; }
      if (/GATE 20\d\d.*Computer Science/i.test(line)) { section = "CS"; sectionCode = "CS"; continue; }
      if (/^General Aptitude/i.test(line) && line.length < 30) { section = "General Aptitude"; sectionCode = "GA"; continue; }
      if (/^Q\.\s*1\s*[–-]\s*Q\.\s*5/i.test(line)) { section = "General Aptitude"; sectionCode = "GA"; continue; }

      // Q format: "Q.1" "Q1." "Q. 1"
      const qfmt = line.match(/^Q\.?\s*(\d+)[\s.)]\s*(.*)/i);
      if (qfmt) {
        if (cur) questions.push(cur);
        const qno  = parseInt(qfmt[1]);
        const rest = qfmt[2].trim();
        const info = answerMap[`${sectionCode}_${qno}`] || {};
        cur = { testId: test._id, questionNumber: qno, question: rest || "",
          options: [], correctAnswer: "", section, subject: section, topic: section,
          type: info.type || "MCQ", marks: info.marks || 1,
          negativeMarks: info.negativeMarks ?? 0.33, year: testYear };
        continue;
      }

      if (!cur) continue;

      // All options on one line "(A) x (B) y (C) z (D) w"
      if (/\(A\)\s*.+\(B\)\s*.+/i.test(line)) {
        const parts = line.split(/(?=\([A-D]\))/i);
        for (const p of parts) {
          const m = p.match(/^\(([A-D])\)\s*(.+)/i);
          if (m) { const txt = m[2].replace(/\([A-D]\).*$/, "").trim(); if (txt) cur.options.push(txt); }
        }
        continue;
      }

      // Single option "(A) text"
      const opt = line.match(/^\(([A-D])\)\s*(.+)/i);
      if (opt) { cur.options.push(opt[2].trim()); continue; }

      // Question text
      if (line.length > 2) {
        if (!cur.question) cur.question = line;
        else if (cur.options.length === 0 && cur.question.length < 600) cur.question += " " + line;
      }
    }
    if (cur) questions.push(cur);

    // Assign answers
    for (const q of questions) {
      const sc = q.section === "General Aptitude" ? "GA" : "CS";
      const info = answerMap[`${sc}_${q.questionNumber}`];
      if (!info) continue;
      q.type = info.type; q.marks = info.marks; q.negativeMarks = info.negativeMarks;
      if (q.type === "NAT") { q.correctAnswer = String(info.answer); q.options = []; q.negativeMarks = 0; }
      else { const idx = info.answer.charCodeAt(0) - 65; q.correctAnswer = q.options[idx] ?? info.answer; }
    }

    const final = questions.filter(q =>
      q.question?.trim().length >= 5 && q.correctAnswer &&
      (q.type === "NAT" || q.options.length >= 2)
    );

    if (final.length === 0) {
      await Test.findByIdAndDelete(test._id);
      return res.status(422).json({
        message: "No valid questions parsed.",
        debug: { pyqSample: pyqText.slice(0, 300), ansSample: ansText.slice(0, 300), answerMapLen: Object.keys(answerMap).length, totalParsed: questions.length }
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