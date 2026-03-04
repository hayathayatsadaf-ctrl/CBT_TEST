const fs       = require("fs");
const pdfParse = require("pdf-parse");
const Question = require("../models/Question");
const Test     = require("../models/Test");

// ── PDF TEXT EXTRACTOR ─────────────────────────────────────────────
async function extractText(filePath) {
  const buffer = fs.readFileSync(filePath);
  try {
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (e) {
    console.error("PDF parse error:", e.message);
    return "";
  }
}

// ── OCR NUMBER FIXER ───────────────────────────────────────────────
// OCR garbles numbers — fix common mistakes
function fixOcrNumber(raw) {
  if (!raw) return null;
  const s = raw.trim()
    .replace(/[—_\-]/g, "")   // remove leading dashes/underscores
    .replace(/,/g, "")         // remove commas
    .replace(/\s+/g, "")       // remove spaces
    .replace(/^[^0-9]*/, "")   // strip leading non-digits
    // common OCR digit errors
    .replace(/o/gi, "0")
    .replace(/l(?=\d)/gi, "1")
    .replace(/I(?=\d)/gi, "1")
    .replace(/%/g, "6")        // "1%" → "16"
    .replace(/m(\d)/i, "1$1")  // "m4" → "14"
    .replace(/st$/i, "51")     // "st" → "51"
    .replace(/sf$/i, "57");    // "sf" → "57"
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}

// ── MCQ ANSWER CLEANER ─────────────────────────────────────────────
function cleanMcqAnswer(raw) {
  if (!raw) return null;
  const s = raw.trim()
    .replace(/[()[\]]/g, "")  // remove brackets
    .toUpperCase();
  // take first letter A-D
  const m = s.match(/[A-D]/);
  return m ? m[0] : null;
}

// ── ANSWER KEY PARSER ──────────────────────────────────────────────
// Handles garbled OCR table: "— m4 | mca | cs2 | A | 1"
function parseAnswerMap(ansLines) {
  const map = {};

  // Known Q numbers from GATE 2017 CS in order
  // We process sequentially and assign in order when number is unreadable
  let seqNum = 0;

  for (let line of ansLines) {
    line = line.trim();
    if (!line || line.length < 3) continue;

    // Skip header/page lines
    if (/Q\.No\.|answer key|source:|page \d|^nn |^mm /i.test(line)) continue;

    // ── GATE table format: "1 | MCQ | CS2 | D | 1" ──────────────
    // Very flexible — handles OCR garbage in Q.No column
    const colSplit = line.split("|").map(c => c.trim());
    if (colSplit.length >= 4) {
      const rawNum  = colSplit[0];
      const rawType = colSplit[1];
      const rawKey  = colSplit[colSplit.length >= 5 ? 3 : 2];
      const rawMark = colSplit[colSplit.length - 1];

      const isTypeMCQ = /MCQ|MCA|mca/i.test(rawType);
      const isTypeNAT = /NAT/i.test(rawType);
      if (!isTypeMCQ && !isTypeNAT) continue;

      const type  = isTypeNAT ? "NAT" : "MCQ";
      const marks = parseInt(rawMark) || 1;
      const qno   = fixOcrNumber(rawNum);

      // Parse answer/key
      let key = rawKey.trim();

      if (type === "NAT") {
        // "0.0t000" or "90t090" or "472t0472" → take value before "to"/"t0"
        key = key.replace(/t0+/i, "to").split(/to/i)[0].trim();
        // clean spaces: "6 20" → "6.20"? No — "6 20" is OCR of "6.20"
        key = key.replace(/\s+/g, ".");
        // Remove trailing dots
        key = key.replace(/\.$/, "");
      } else {
        // MCQ — extract A/B/C/D
        const cleaned = cleanMcqAnswer(key);
        if (!cleaned) continue;
        key = cleaned;
      }

      if (qno) {
        map[String(qno)] = { answer: key, type, marks, negativeMarks: type === "NAT" ? 0 : marks === 2 ? 0.66 : 0.33 };
      }
      continue;
    }

    // ── Simple format: "1. A" or "Q1. B" ─────────────────────────
    const simple = line.match(/^Q?(\d+)[.)]\s*([A-D])\s*$/i);
    if (simple) {
      map[simple[1]] = { answer: simple[2].toUpperCase(), type: "MCQ", marks: 1, negativeMarks: 0.33 };
      continue;
    }

    // ── NAT simple: "19. 0" ───────────────────────────────────────
    const natSimple = line.match(/^Q?(\d+)[.)]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (natSimple) {
      map[natSimple[1]] = { answer: natSimple[2], type: "NAT", marks: 1, negativeMarks: 0 };
    }
  }

  return map;
}

// ── SECTION DETECT ─────────────────────────────────────────────────
const SECTIONS = [
  { re: /general\s*aptitude|\bGA\b/i,   name: "General Aptitude" },
  { re: /aptitude/i,                     name: "Aptitude" },
  { re: /reasoning/i,                    name: "Reasoning" },
  { re: /english/i,                      name: "English" },
  { re: /technical/i,                    name: "Technical" },
  { re: /computer\s*science|\bCS\b/i,    name: "CS" },
  { re: /mathematics/i,                  name: "Maths" },
  { re: /verbal/i,                       name: "English" },
  { re: /quantitative/i,                 name: "Aptitude" },
];
function detectSection(line) {
  for (const { re, name } of SECTIONS) {
    if (re.test(line)) return name;
  }
  return null;
}

// ── SKIP LINES ─────────────────────────────────────────────────────
const SKIP = [
  /^source:/i, /^■+\s*page/i, /^mm\s*page/i, /^nn\s*page/i,
  /^graduate aptitude test/i, /^organizing institute/i,
  /^question paper name/i, /^subject name/i,
  /^duration/i, /^session/i, /^total marks/i,
  /^answer key/i, /^GATE CBT/i, /^instructions/i,
  /^IIT\s/i, /^Indian Institute/i,
];

// ── MAIN HANDLER ───────────────────────────────────────────────────
exports.uploadPDFs = async (req, res) => {
  let pyqPath = null, ansPath = null, test = null;

  try {
    if (!req.files?.["pyq"] || !req.files?.["answerKey"]) {
      return res.status(400).json({ message: "Both PYQ and Answer Key PDFs required" });
    }

    pyqPath = req.files["pyq"][0].path;
    ansPath = req.files["answerKey"][0].path;
    const testName = req.body.testName || `Test ${new Date().toLocaleDateString()}`;
    const testYear = parseInt(req.body.year) || new Date().getFullYear();

    // Extract text
    const [pyqText, ansText] = await Promise.all([
      extractText(pyqPath),
      extractText(ansPath),
    ]);

    const pyqLines = pyqText.split("\n").map(l => l.trim()).filter(l => l.length > 1);
    const ansLines = ansText.split("\n").map(l => l.trim()).filter(l => l.length > 1);

    // Parse answer key
    const answerMap = parseAnswerMap(ansLines);
    console.log(`Answer map keys: ${Object.keys(answerMap).length}`, Object.keys(answerMap).slice(0, 10));

    // Create test
    test = new Test({ name: testName, year: testYear, uploadedBy: "admin" });
    await test.save();

    const questions = [];
    let cur = null;
    let section = "General";

    for (let i = 0; i < pyqLines.length; i++) {
      const line = pyqLines[i];

      if (SKIP.some(p => p.test(line))) continue;

      // Section detection
      const sec = detectSection(line);
      if (sec && !line.match(/^Question\s+Number/i) && !line.match(/^\([A-D]\)/i)) {
        section = sec;
        if (cur) cur.section = cur.subject = sec;
        continue;
      }

      // ── GATE FORMAT: "Question Number : 1 Correct: 1 Wrong: -0.33" ──
      const gateQ = line.match(/Question\s+Number\s*:\s*(\d+)\s+Correct\s*:\s*([\d.]+)\s+Wrong\s*:\s*([-\d.]+)/i);
      if (gateQ) {
        if (cur) questions.push(cur);
        const qno   = parseInt(gateQ[1]);
        const marks = parseFloat(gateQ[2]);
        const neg   = Math.abs(parseFloat(gateQ[3]));
        const info  = answerMap[String(qno)] || {};

        cur = {
          testId: test._id, questionNumber: qno,
          question: "", options: [], correctAnswer: "",
          section, subject: section, topic: "General",
          type:          info.type || (neg === 0 ? "NAT" : "MCQ"),
          marks:         info.marks || marks,
          negativeMarks: info.type === "NAT" ? 0 : (info.negativeMarks ?? neg),
          year: testYear,
        };
        continue;
      }

      // ── Q FORMAT: "Q1. question text" ────────────────────────────
      const qfmt = line.match(/^Q(\d+)\.\s*(.*)/i);
      if (qfmt) {
        if (cur) questions.push(cur);
        const qno  = parseInt(qfmt[1]);
        const rest = qfmt[2].trim();
        const info = answerMap[String(qno)] || {};
        const meta = rest.match(/^\[(MCQ|NAT)\s*\|\s*(\d+)\s*Mark/i);

        cur = {
          testId: test._id, questionNumber: qno,
          question: meta ? "" : rest, options: [], correctAnswer: "",
          section, subject: section, topic: "General",
          type:          info.type || (meta ? meta[1].toUpperCase() : "MCQ"),
          marks:         info.marks || (meta ? parseInt(meta[2]) : 1),
          negativeMarks: info.negativeMarks ?? 0.33,
          year: testYear,
        };
        continue;
      }

      if (!cur) continue;

      // Meta: "[MCQ | 1 Mark ...]"
      const meta = line.match(/^\[(MCQ|NAT)\s*\|\s*(\d+)\s*Mark/i);
      if (meta) {
        cur.type  = meta[1].toUpperCase();
        cur.marks = parseInt(meta[2]);
        cur.negativeMarks = /No Negative/i.test(line) ? 0 : cur.marks === 2 ? 0.66 : 0.33;
        if (cur.type === "NAT") cur.negativeMarks = 0;
        continue;
      }

      // Options: "(A) text (B) text (C) text (D) text" all on one line
      const allOpts = line.match(/\(A\)\s*.+\(B\)\s*.+/i);
      if (allOpts) {
        const parts = line.split(/(?=\([A-D]\))/i);
        for (const p of parts) {
          const m = p.match(/^\(([A-D])\)\s*(.+)/i);
          if (m) {
            const txt = m[2].trim().replace(/\([A-D]\).*$/, "").trim();
            if (txt) cur.options.push(txt);
          }
        }
        continue;
      }

      // Single option: "(A) text"
      const singleOpt = line.match(/^\(([A-D])\)\s*(.+)/i);
      if (singleOpt) {
        cur.options.push(singleOpt[2].trim());
        continue;
      }

      // Question text accumulation
      if (!SKIP.some(p => p.test(line)) && line.length > 2) {
        if (!cur.question) {
          cur.question = line;
        } else if (cur.options.length === 0 && cur.question.length < 500) {
          cur.question += " " + line;
        }
      }
    }

    if (cur) questions.push(cur);

    // ── Assign correct answers ──────────────────────────────────────
    for (const q of questions) {
      const info = answerMap[String(q.questionNumber)];
      if (!info) continue;
      q.type          = info.type;
      q.marks         = info.marks;
      q.negativeMarks = info.negativeMarks;

      if (q.type === "NAT") {
        q.correctAnswer = String(info.answer);
        q.negativeMarks = 0;
      } else {
        const idx = info.answer.charCodeAt(0) - 65; // A=0 B=1 C=2 D=3
        q.correctAnswer = q.options[idx] ?? info.answer;
      }
    }

    // ── Filter valid questions ──────────────────────────────────────
    const final = questions.filter(q => {
      if (!q.question?.trim() || q.question.trim().length < 5) return false;
      if (q.type === "NAT") return !!q.correctAnswer;
      return q.options.length >= 2 && !!q.correctAnswer;
    });

    if (final.length === 0) {
      await Test.findByIdAndDelete(test._id);
      cleanup(pyqPath, ansPath);
      return res.status(422).json({
        message: "No valid questions parsed.",
        hint: "PDF format must have 'Question Number : N' or 'QN.' format.",
        debug: {
          sampleLines:  pyqLines.slice(0, 20),
          answerMapLen: Object.keys(answerMap).length,
          answerSample: Object.entries(answerMap).slice(0, 5),
          totalParsed:  questions.length,
        },
      });
    }

    await Question.insertMany(final);
    await Test.findByIdAndUpdate(test._id, { totalQuestions: final.length });
    cleanup(pyqPath, ansPath);

    return res.status(200).json({
      message:        "✅ Test uploaded successfully!",
      testId:         test._id,
      testName:       test.name,
      totalQuestions: final.length,
      mcqQuestions:   final.filter(q => q.type === "MCQ").length,
      natQuestions:   final.filter(q => q.type === "NAT").length,
      totalMarks:     final.reduce((s, q) => s + q.marks, 0),
      sections:       [...new Set(final.map(q => q.section))],
    });

  } catch (err) {
    console.error("uploadPDFs error:", err);
    if (test?._id) await Test.findByIdAndDelete(test._id).catch(() => {});
    cleanup(pyqPath, ansPath);
    return res.status(500).json({ message: "Upload failed", error: err.message });
  }
};

function cleanup(...paths) {
  for (const p of paths) {
    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
  }
}