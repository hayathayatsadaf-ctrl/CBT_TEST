const Question = require("../models/Question");
const Test = require("../models/Test");

// ══════════════════════════════════════════════════════════════════
// PDF TEXT EXTRACTOR — pdfjs-dist (handles any PDF)
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
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(" ");
    fullText += pageText + "\n";
  }
  return { text: fullText };
}

// ══════════════════════════════════════════════════════════════════
// ANSWER KEY PARSER
// FORMAT A: "Q1. Answer: B [MCQ | 1 Mark | Negative: -0.33] Subject: ..."
// FORMAT B: "| 1 | MCA | CS2 | D | 1 |"
// FORMAT C: "1. B"  "Q1. B"
// FORMAT D: NAT "Q3. 9"
// ══════════════════════════════════════════════════════════════════
function parseAnswerMap(ansText) {
  const answerMap = {};

  let lines = ansText.split("\n").map(l => l.trim()).filter(Boolean);

  // If few lines (PDF merged text), split on Q\d+. boundaries
  if (lines.length <= 5) {
    const expanded = [];
    for (const line of lines) {
      const parts = line.split(/(?=Q\d+\.\s)/);
      expanded.push(...parts.map(p => p.trim()).filter(Boolean));
    }
    lines = expanded;
  }

  for (const line of lines) {
    // FORMAT A: "Q1. Answer: B [MCQ | 1 Mark..."
    const fmtA = line.match(
      /Q?(\d+)[.)]\s*Answer:\s*([A-D]|-?\d+(?:\.\d+)?)\s*\[\s*(MCQ|NAT)[^|]*\|\s*(\d+)\s*Mark/i
    );
    if (fmtA) {
      const type  = fmtA[3].toUpperCase();
      const marks = parseInt(fmtA[4]);
      answerMap[fmtA[1]] = {
        answer: type === "NAT" ? fmtA[2] : fmtA[2].toUpperCase(),
        type, marks,
        negativeMarks: type === "NAT" ? 0 : marks === 2 ? 0.66 : 0.33,
      };
      continue;
    }

    // FORMAT B: GATE table "| 1 | MCA | CS2 | D | 1 |"
    const fmtB = line.match(
      /\|?\s*(\d+)\s*\|\s*(MCA|NAT|MCQ)\s*\|\s*\w+\s*\|\s*([A-D]|-?\d+(?:\.\d+)?(?:t[o0]-?\d+(?:\.\d+)?)?)\s*\|\s*([12])/i
    );
    if (fmtB) {
      const type  = fmtB[2].toUpperCase() === "MCA" ? "MCQ" : fmtB[2].toUpperCase();
      const marks = parseInt(fmtB[4]);
      let ans     = fmtB[3];
      if (type === "NAT") {
        const r = ans.match(/^(-?\d+(?:\.\d+)?)/);
        if (r) ans = r[1];
      } else {
        ans = ans.toUpperCase();
      }
      answerMap[fmtB[1]] = { answer: ans, type, marks, negativeMarks: type === "NAT" ? 0 : marks === 2 ? 0.66 : 0.33 };
      continue;
    }

    // FORMAT C: "1. B"  "Q1. B"
    const fmtC = line.match(/^Q?(\d+)[.)]\s*(?:Ans(?:wer)?[:\s]*)?\(?([A-D])\)?(?:\s|$)/i);
    if (fmtC) {
      let marks = 1;
      const mh = line.match(/\b([12])\s*[Mm]arks?\b/);
      if (mh) marks = parseInt(mh[1]);
      answerMap[fmtC[1]] = { answer: fmtC[2].toUpperCase(), type: "MCQ", marks, negativeMarks: marks === 2 ? 0.66 : 0.33 };
      continue;
    }

    // FORMAT D: NAT "Q3. 9"
    const fmtD = line.match(/^Q?(\d+)[.)]\s*(?:Ans(?:wer)?[:\s]*)?(-?\d+(?:\.\d+)?)(?:\s|$)/i);
    if (fmtD) {
      let marks = 1;
      const mh = line.match(/\b([12])\s*[Mm]arks?\b/);
      if (mh) marks = parseInt(mh[1]);
      answerMap[fmtD[1]] = { answer: fmtD[2], type: "NAT", marks, negativeMarks: 0 };
    }
  }

  return answerMap;
}

// ══════════════════════════════════════════════════════════════════
// SECTION DETECTOR
// ══════════════════════════════════════════════════════════════════
function detectSection(text) {
  const t = text.toLowerCase();
  if (/general\s*aptitude|^ga$/.test(t))            return "General Aptitude";
  if (/engineering\s*math/.test(t))                 return "Engineering Mathematics";
  if (/data\s*struct/.test(t))                      return "Data Structures";
  if (/operating\s*sys/.test(t))                    return "Operating Systems";
  if (/computer\s*network/.test(t))                 return "Computer Networks";
  if (/database|dbms/.test(t))                      return "Database Management";
  if (/algorithm/.test(t))                          return "Algorithms";
  if (/discrete\s*math/.test(t))                    return "Discrete Mathematics";
  if (/digital\s*logic/.test(t))                    return "Digital Logic";
  if (/graph\s*theory/.test(t))                     return "Graph Theory";
  if (/computer\s*(science|org)|^cs\d?$/.test(t))   return "Computer Science";
  if (/data\s*compress/.test(t))                    return "Data Compression";
  if (/linked.?list/.test(t))                       return "Linked List";
  if (/\barray\b/.test(t))                          return "Array";
  if (/\bstack\b/.test(t))                          return "Stack";
  if (/\bqueue\b/.test(t))                          return "Queue";
  if (/\btree\b/.test(t))                           return "Tree";
  if (/\bgraph\b/.test(t))                          return "Graph";
  if (/mixed|advanced/.test(t))                     return "Mixed Advanced";
  if (/aptitude/.test(t))                           return "Aptitude";
  if (/reasoning/.test(t))                          return "Reasoning";
  if (/english/.test(t))                            return "English";
  return null;
}

// ══════════════════════════════════════════════════════════════════
// QUESTION PARSER
// Handles FORMAT 1 (Custom Q1.[MCQ|1 Mark]), FORMAT 2 (GATE header),
// FORMAT 3 (plain Q1. text)
// ══════════════════════════════════════════════════════════════════
function parseQuestions(pyqText, answerMap, testId, testYear) {
  const rawLines = pyqText.split("\n").map(l => l.trim()).filter(l => l.length > 1);

  // Expand merged long lines on Q\d+. boundaries
  const lines = [];
  for (const line of rawLines) {
    if (line.length > 200) {
      const parts = line.split(/(?=Q\d+\.\s)/);
      if (parts.length > 1) {
        parts.forEach(p => p.trim() && lines.push(p.trim()));
        continue;
      }
    }
    lines.push(line);
  }

  const skipPatterns = [
    /^graduate\s*aptitude/i,
    /^question\s*paper\s*name/i,
    /^subject\s*name/i,
    /^duration\s*:/i,
    /^total\s*(marks|questions)\s*[:|]/i,
    /^organizing\s*institute/i,
    /^session\s*\d/i,
    /^iit\s+/i,
    /^indian\s+institute/i,
    /^GATE CBT/i,
    /^INSTRUCTIONS/i,
    /^\d+\.\s+(this paper|mcq|nat questions|unanswered|for mcq)/i,
    /^1-Mark MCQ/i,
    /^2-Mark MCQ/i,
    /^NAT \(any\)/i,
    /^Not Attempted/i,
    /^MARKING SCHEME/i,
    /^—\s*END/i,
    /^All the best/i,
    /^Answer:\s*_+/i,
    /^\(Enter integer\)/i,
    /^Answer:\s*___/i,
    /^Total Marks:/i,
    /^Time:/i,
  ];

  const questionsArray = [];
  let currentSection  = "General";
  let currentQuestion = null;

  function pushCurrent() {
    if (currentQuestion && currentQuestion.question.trim().length > 3) {
      questionsArray.push({ ...currentQuestion });
    }
    currentQuestion = null;
  }

  const isGateHeader = (l) => /^Question\s*Number\s*[:\s]+\d+/i.test(l);
  const gateMode = lines.some(isGateHeader);
  console.log("Parser mode:", gateMode ? "GATE-header" : "Custom/Mixed");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (skipPatterns.some(p => p.test(line))) { i++; continue; }

    // Section heading (only if no question number)
    if (!/^Q?\d+[.)]/i.test(line)) {
      const sec = detectSection(line);
      if (sec && line.length < 60) {
        currentSection = sec;
        i++; continue;
      }
    }

    // GATE header mode
    if (gateMode && isGateHeader(line)) {
      pushCurrent();
      const qnoM    = line.match(/Question\s*Number\s*[:\s]+(\d+)/i);
      const qno     = qnoM ? parseInt(qnoM[1]) : null;
      const corrM   = line.match(/Correct\s*[:\s]+(\d+)/i);
      const marks   = corrM ? parseInt(corrM[1]) : 1;
      const ansInfo = answerMap[String(qno)] || {};
      currentQuestion = {
        testId, questionNumber: qno, question: "", options: [],
        correctAnswer: "", section: currentSection, subject: currentSection,
        topic: currentSection,
        type: ansInfo.type || "MCQ",
        marks: ansInfo.marks || marks,
        negativeMarks: ansInfo.negativeMarks ?? (marks === 2 ? 0.66 : 0.33),
        year: testYear,
      };
      i++; continue;
    }

    // Q1. ... or 1. ...
    const qMatch = line.match(/^Q?(\d+)[.)]\s+(.*)/i);
    if (qMatch) {
      pushCurrent();
      const qno     = parseInt(qMatch[1]);
      const rest    = qMatch[2].trim();
      const ansInfo = answerMap[String(qno)] || {};

      // Meta tag: "[MCQ | 1 Mark | Negative: -0.33]"
      const metaM = rest.match(/^\[\s*(MCQ|NAT)\s*\|\s*(\d+)\s*Mark/i);
      let type  = ansInfo.type  || (metaM ? metaM[1].toUpperCase() : "MCQ");
      let marks = ansInfo.marks || (metaM ? parseInt(metaM[2]) : 1);
      let neg   = ansInfo.negativeMarks ?? (type === "NAT" ? 0 : marks === 2 ? 0.66 : 0.33);
      if (metaM && /No Negative/i.test(rest)) neg = 0;

      // Inline options: "text (A) x (B) y (C) z (D) w"
      const inlineOpts = rest.match(
        /^(.*?)\s+\(A\)\s+(.*?)\s+\(B\)\s+(.*?)\s+\(C\)\s+(.*?)\s+\(D\)\s+(.+)$/i
      );
      if (inlineOpts) {
        questionsArray.push({
          testId, questionNumber: qno,
          question: inlineOpts[1].replace(/^\[.*?\]\s*/, "").trim(),
          options: [inlineOpts[2].trim(), inlineOpts[3].trim(), inlineOpts[4].trim(), inlineOpts[5].trim()],
          correctAnswer: "", section: currentSection, subject: currentSection,
          topic: currentSection, type: "MCQ", marks, negativeMarks: neg, year: testYear,
        });
        currentQuestion = null;
      } else {
        currentQuestion = {
          testId, questionNumber: qno,
          question: metaM ? "" : rest,
          options: [], correctAnswer: "",
          section: currentSection, subject: currentSection, topic: currentSection,
          type, marks, negativeMarks: neg, year: testYear,
        };
      }
      i++; continue;
    }

    // Lines belonging to current question
    if (currentQuestion) {
      // Meta line
      const metaM = line.match(/^\[\s*(MCQ|NAT)\s*\|\s*(\d+)\s*Mark/i);
      if (metaM) {
        currentQuestion.type  = metaM[1].toUpperCase();
        currentQuestion.marks = parseInt(metaM[2]);
        currentQuestion.negativeMarks = /No Negative/i.test(line) ? 0
          : currentQuestion.marks === 2 ? 0.66 : 0.33;
        i++; continue;
      }

      // Subject line
      const subM = line.match(/^Subject:\s*(.+)/i);
      if (subM) {
        currentQuestion.section = subM[1].trim();
        currentQuestion.subject = subM[1].trim();
        i++; continue;
      }

      // Option: "(A) text" "A) text"
      const optM = line.match(/^\(?([A-Da-d])\)?[.)]\s*(.+)/);
      if (optM && currentQuestion.options.length < 4) {
        currentQuestion.options.push(optM[2].trim());
        currentQuestion.type = "MCQ";
        i++; continue;
      }

      // Multi-line question text
      if (currentQuestion.options.length === 0 && line.length > 2) {
        if (!skipPatterns.some(p => p.test(line))) {
          currentQuestion.question = currentQuestion.question
            ? currentQuestion.question + " " + line
            : line;
        }
      }
    }

    i++;
  }
  pushCurrent();
  return questionsArray;
}

// ══════════════════════════════════════════════════════════════════
// ASSIGN CORRECT ANSWERS
// ══════════════════════════════════════════════════════════════════
function assignAnswers(questions, answerMap) {
  questions.forEach(q => {
    const info = answerMap[String(q.questionNumber)];
    if (!info) return;
    if (info.type)  q.type  = info.type;
    if (info.marks) q.marks = info.marks;
    if (info.negativeMarks !== undefined) q.negativeMarks = info.negativeMarks;

    if (q.type === "NAT") {
      q.correctAnswer = String(info.answer);
    } else {
      const idx = info.answer.toUpperCase().charCodeAt(0) - 65;
      if (q.options[idx] !== undefined) {
        q.correctAnswer = q.options[idx];
      } else if (q.options.length > 0) {
        q.correctAnswer = q.options[0];
      } else {
        q.correctAnswer = info.answer;
      }
    }
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

    console.log("Parsing PYQ PDF...");
    const pyqText = (await pdfParseBuffer(pyqBuffer)).text;

    console.log("Parsing Answer Key PDF...");
    const answerText = (await pdfParseBuffer(answerBuffer)).text;

    const pyqSample = pyqText.split("\n").slice(0, 5).map(l => l.trim()).filter(Boolean);
    const ansSample = answerText.split("\n").slice(0, 5).map(l => l.trim()).filter(Boolean);
    console.log("PYQ sample:", pyqSample);
    console.log("ANS sample:", ansSample);

    const answerMap = parseAnswerMap(answerText);
    console.log(`Answers parsed: ${Object.keys(answerMap).length}`, answerMap);

    const test = new Test({ name: testName, year: testYear, uploadedBy: "admin", totalStudents });
    await test.save();

    const questions = parseQuestions(pyqText, answerMap, test._id, testYear);
    console.log(`Questions before answer assign: ${questions.length}`);

    assignAnswers(questions, answerMap);

    // Filter valid — correctAnswer must exist
    const finalQuestions = questions.filter(q => {
      if (!q.question || q.question.trim().length < 3) return false;
      if (!q.correctAnswer || q.correctAnswer.trim() === "") return false;
      if (q.type === "MCQ" && q.options.length < 2) return false;
      return true;
    });

    console.log(`Final questions: ${finalQuestions.length}`);
    console.log("Without answers:", questions.filter(q => !q.correctAnswer).map(q => q.questionNumber));

    if (finalQuestions.length === 0) {
      await Test.findByIdAndDelete(test._id);
      return res.status(400).json({
        message: "No questions parsed. Check PDF format.",
        debug: {
          answerMapSize: Object.keys(answerMap).length,
          answerMapSample: Object.entries(answerMap).slice(0, 5),
          rawQuestionsFound: questions.length,
          noAnswerQuestions: questions.filter(q => !q.correctAnswer).map(q => q.questionNumber),
          pyqSample,
          ansSample,
        },
      });
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
      totalPossibleMarks: finalQuestions.reduce((s, q) => s + q.marks, 0),
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