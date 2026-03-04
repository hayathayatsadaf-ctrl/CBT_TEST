const pdfParseLib = require("pdf-parse");
const Question = require("../models/Question");
const Test = require("../models/Test");

// ✅ Safe wrapper
async function pdfParseBuffer(buffer) {
  const fn = typeof pdfParseLib === "function" ? pdfParseLib : pdfParseLib.default;
  const data = await fn(buffer);
  return { text: data.text };
}

// ══════════════════════════════════════════════════════════════════
// ANSWER KEY PARSER — handles ALL known formats
// ══════════════════════════════════════════════════════════════════
function parseAnswerMap(ansText) {
  const answerMap = {};
  const lines = ansText.split("\n").map(l => l.trim()).filter(Boolean);

  for (let line of lines) {

    // FORMAT 1: "Q1. Answer: B [MCQ | 1 Mark | Negative: -0.33]"
    const fmt1 = line.match(
      /^Q?(\d+)[.)]\s+Answer:\s+([A-D]|-?\d+(?:\.\d+)?(?:to-?\d+(?:\.\d+)?)?)\s*\[(MCQ|NAT).*?(\d+)\s*Marks?/i
    );
    if (fmt1) {
      const type = fmt1[3].toUpperCase();
      const marks = parseInt(fmt1[4]);
      answerMap[fmt1[1]] = {
        answer: fmt1[2].toUpperCase(),
        type,
        marks,
        negativeMarks: type === "NAT" ? 0 : marks === 2 ? 0.66 : 0.33,
      };
      continue;
    }

    // FORMAT 2: Table row like "| 1 | MCA | CS2 | D | 1 |"  (GATE official answer key tables)
    const tableRow = line.match(/\|?\s*(\d+)\s*\|\s*(MCA|NAT|MCQ)\s*\|\s*\w+\s*\|\s*([A-D]|-?\d+(?:\.\d+)?(?:t[o0]-?\d+(?:\.\d+)?)?)\s*\|\s*([12])/i);
    if (tableRow) {
      const qno   = tableRow[1];
      const type  = tableRow[2].toUpperCase() === "MCA" ? "MCQ" : tableRow[2].toUpperCase();
      const ans   = tableRow[3];
      const marks = parseInt(tableRow[4]);

      // NAT answers come as "6t06" or "90t090" meaning range — take first number
      let cleanAns = ans;
      if (type === "NAT") {
        const natRange = ans.match(/^(-?\d+(?:\.\d+)?)(?:t[o0](-?\d+(?:\.\d+)?))?$/i);
        if (natRange) cleanAns = natRange[1];
      } else {
        cleanAns = ans.toUpperCase();
      }

      answerMap[qno] = {
        answer: cleanAns,
        type,
        marks,
        negativeMarks: type === "NAT" ? 0 : marks === 2 ? 0.66 : 0.33,
      };
      continue;
    }

    // FORMAT 3: "1. B"  "Q1. B"  "1) B"
    const simpleMCQ =
      line.match(/^Q?(\d+)[.)]\s*(?:Ans(?:wer)?[:\s]*)?\(?([A-D])\)?(?:\s|$)/i) ||
      line.match(/^Q?(\d+)\s+([A-D])$/i);
    if (simpleMCQ) {
      let marks = 1;
      const mh = line.match(/\b([12])\s*(?:marks?|M)\b/i);
      if (mh) marks = parseInt(mh[1]);
      answerMap[simpleMCQ[1]] = {
        answer: simpleMCQ[2].toUpperCase(),
        type: "MCQ",
        marks,
        negativeMarks: marks === 2 ? 0.66 : 0.33,
      };
      continue;
    }

    // FORMAT 4: NAT "3. 9"  "Q7. 236"
    const simpleNAT = line.match(/^Q?(\d+)[.)]\s*(?:Ans(?:wer)?[:\s]*)?(-?\d+(?:\.\d+)?)$/i);
    if (simpleNAT) {
      let marks = 1;
      const mh = line.match(/\b([12])\s*(?:marks?|M)\b/i);
      if (mh) marks = parseInt(mh[1]);
      answerMap[simpleNAT[1]] = {
        answer: simpleNAT[2],
        type: "NAT",
        marks,
        negativeMarks: 0,
      };
    }
  }

  return answerMap;
}

// ══════════════════════════════════════════════════════════════════
// SECTION DETECTOR
// ══════════════════════════════════════════════════════════════════
function detectSection(line) {
  const l = line.toLowerCase();
  if (/general\s*aptitude|^ga$/.test(l))          return "General Aptitude";
  if (/engineering\s*math/.test(l))               return "Engineering Mathematics";
  if (/computer\s*science|^cs\d?$/.test(l))       return "Computer Science";
  if (/linked.?list/.test(l))                     return "Linked List";
  if (/\barray\b/.test(l))                        return "Array";
  if (/\bstack\b/.test(l))                        return "Stack";
  if (/\bqueue\b/.test(l))                        return "Queue";
  if (/\btree\b/.test(l))                         return "Tree";
  if (/\bgraph\b/.test(l))                        return "Graph";
  if (/aptitude/.test(l))                         return "Aptitude";
  if (/reasoning/.test(l))                        return "Reasoning";
  if (/english/.test(l))                          return "English";
  if (/technical/.test(l))                        return "Technical";
  return null;
}

// ══════════════════════════════════════════════════════════════════
// QUESTION PARSER — universal, handles GATE PYQ format
// ══════════════════════════════════════════════════════════════════
function parseQuestions(pyqText, answerMap, testId, testYear) {
  const lines = pyqText.split("\n").map(l => l.trim()).filter(l => l.length > 1);

  const skipPatterns = [
    /^graduate\s*aptitude/i,
    /^question\s*paper\s*name/i,
    /^subject\s*name/i,
    /^duration:/i,
    /^total\s*marks:/i,
    /^organizing\s*institute/i,
    /^correct:\s*\d/i,
    /^wrong\s*:/i,
    /^question\s*number\s*:/i,
    /^\d{4}\s*$/,                   // bare year
    /^page\s*\d+/i,
    /^GATE CBT/i,
    /^Total Questions/i,
    /^INSTRUCTIONS/i,
    /^Not Attempted/i,
    /^—\s*END/i,
    /^All the best/i,
    /^Answer:\s*_+/i,
    /^\(Enter integer\)/i,
    /^session\s*\d/i,
    /^iit\s+/i,                      // IIT Roorkee etc.
    /^indian\s+institute/i,
  ];

  const questionsArray = [];
  let currentSection  = "General";
  let currentQuestion = null;

  // Helper: push current question if valid
  function pushCurrent() {
    if (currentQuestion) questionsArray.push({ ...currentQuestion });
    currentQuestion = null;
  }

  // ── GATE PYQ FORMAT DETECTOR ──────────────────────────────────
  // Detects lines like: "Question Number : 1 Correct: 1 Wrong: -0.33"
  const isGateHeaderLine = (l) =>
    /^Question\s*Number\s*[:\s]+\d+/i.test(l);

  // Marks extractor from GATE header
  const extractGateMarks = (l) => {
    const m = l.match(/Correct\s*[:\s]+(\d+)/i);
    return m ? parseInt(m[1]) : 1;
  };

  let gateMode = lines.some(isGateHeaderLine);
  console.log("GATE header mode:", gateMode);

  if (gateMode) {
    // ── GATE OFFICIAL PYQ FORMAT ──────────────────────────────
    // "Question Number : 1 Correct: 1 Wrong : -0.33"
    // then question text
    // then (A) ... (B) ... (C) ... (D) ...
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      if (isGateHeaderLine(line)) {
        pushCurrent();

        const qnoMatch = line.match(/Question\s*Number\s*[:\s]+(\d+)/i);
        const qno = qnoMatch ? parseInt(qnoMatch[1]) : null;
        const marks = extractGateMarks(line);
        const ansInfo = answerMap[String(qno)] || {};
        const type = ansInfo.type || (marks === 2 ? "MCQ" : "MCQ");

        currentQuestion = {
          testId,
          questionNumber: qno,
          question: "",
          options: [],
          correctAnswer: "",
          section: currentSection,
          subject: currentSection,
          topic: currentSection,
          type: ansInfo.type || type,
          marks: ansInfo.marks || marks,
          negativeMarks: ansInfo.negativeMarks ?? (marks === 2 ? 0.66 : 0.33),
          year: testYear,
        };
        i++;
        continue;
      }

      // Section detection
      const sec = detectSection(line);
      if (sec && line.length < 60 && !currentQuestion) {
        currentSection = sec;
        i++;
        continue;
      }

      if (currentQuestion) {
        if (skipPatterns.some(p => p.test(line))) { i++; continue; }

        // Option line: "(A) text"  "A) text"  "A. text"
        const optMatch = line.match(/^\(?([A-Da-d])\)?[.)]\s*(.+)/);
        if (optMatch) {
          currentQuestion.options.push(optMatch[2].trim());
          currentQuestion.type = "MCQ";
          i++;
          continue;
        }

        // Multi-line question text (before options appear)
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

  } else {
    // ── CUSTOM / MIXED FORMAT ─────────────────────────────────
    for (let line of lines) {
      if (skipPatterns.some(p => p.test(line))) continue;

      const sec = detectSection(line);
      if (sec && line.length < 50) { currentSection = sec; continue; }

      // "Q1. ..." or "1. ..."
      const qMatch = line.match(/^Q?(\d+)[.)]\s+(.*)/i);
      if (qMatch) {
        pushCurrent();
        const questionNumber = parseInt(qMatch[1]);
        const restOfLine     = qMatch[2].trim();
        const ansInfo        = answerMap[String(questionNumber)] || {};
        const metaInline     = restOfLine.match(/^\[(MCQ|NAT)\s*\|\s*(\d+)\s*Marks?/i);

        let type          = ansInfo.type          || "MCQ";
        let marks         = ansInfo.marks         || 1;
        let negativeMarks = ansInfo.negativeMarks ?? (marks === 2 ? 0.66 : 0.33);

        if (metaInline) {
          type          = metaInline[1].toUpperCase();
          marks         = parseInt(metaInline[2]);
          negativeMarks = /No Negative/i.test(restOfLine) ? 0 : marks === 2 ? 0.66 : 0.33;
        }

        // Inline options in same line
        const inlineOpts =
          restOfLine.match(/^(.*?)\s+\(A\)\s+(.*?)\s+\(B\)\s+(.*?)\s+\(C\)\s+(.*?)\s+\(D\)\s+(.*)$/i) ||
          restOfLine.match(/^(.*?)\s+a\)\s+(.*?)\s+b\)\s+(.*?)\s+c\)\s+(.*?)\s+d\)\s+(.*)$/i);

        if (inlineOpts) {
          questionsArray.push({
            testId, questionNumber,
            question: inlineOpts[1].trim(),
            options: [inlineOpts[2].trim(), inlineOpts[3].trim(), inlineOpts[4].trim(), inlineOpts[5].trim()],
            correctAnswer: "",
            section: currentSection, subject: currentSection, topic: currentSection,
            type: "MCQ", marks, negativeMarks, year: testYear,
          });
          currentQuestion = null;
        } else {
          currentQuestion = {
            testId, questionNumber,
            question: metaInline ? "" : restOfLine,
            options: [], correctAnswer: "",
            section: currentSection, subject: currentSection, topic: currentSection,
            type, marks, negativeMarks, year: testYear,
          };
        }
        continue;
      }

      if (currentQuestion) {
        const metaMatch = line.match(/^\[(MCQ|NAT)\s*\|\s*(\d+)\s*Marks?/i);
        if (metaMatch) {
          currentQuestion.type          = metaMatch[1].toUpperCase();
          currentQuestion.marks         = parseInt(metaMatch[2]);
          currentQuestion.negativeMarks = /No Negative/i.test(line) ? 0
                                        : currentQuestion.marks === 2 ? 0.66 : 0.33;
          continue;
        }

        const optMatch = line.match(/^\(?([A-Da-d])\)?[.)]\s*(.+)/i);
        if (optMatch && currentQuestion.options.length < 4) {
          currentQuestion.options.push(optMatch[2].trim());
          currentQuestion.type = "MCQ";
          continue;
        }

        if (!skipPatterns.some(p => p.test(line)) && line.length > 3) {
          if (currentQuestion.question === "") {
            currentQuestion.question = line;
          } else if (currentQuestion.options.length === 0) {
            currentQuestion.question += " " + line;
          }
        }
      }
    }
    pushCurrent();
  }

  return questionsArray;
}

// ══════════════════════════════════════════════════════════════════
// ASSIGN CORRECT ANSWERS
// ══════════════════════════════════════════════════════════════════
function assignAnswers(questionsArray, answerMap) {
  questionsArray.forEach(q => {
    const ansInfo = answerMap[String(q.questionNumber)];
    if (!ansInfo) return;

    // Sync type & marks from answer map if not already set
    if (ansInfo.type)         q.type         = ansInfo.type;
    if (ansInfo.marks)        q.marks        = ansInfo.marks;
    if (ansInfo.negativeMarks !== undefined) q.negativeMarks = ansInfo.negativeMarks;

    if (q.type === "NAT") {
      q.correctAnswer = String(ansInfo.answer);
    } else {
      // Answer is like "A", "B", "C", "D"
      const idx = ansInfo.answer.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
      if (q.options[idx] !== undefined) {
        q.correctAnswer = q.options[idx];
      } else if (q.options.length > 0) {
        // fallback: store letter
        q.correctAnswer = ansInfo.answer;
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

    if (!req.files || !req.files["pyq"] || !req.files["answerKey"]) {
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

    // Debug: log first 30 lines of each
    const pyqLines30 = pyqText.split("\n").slice(0, 30).map(l => l.trim()).filter(Boolean);
    const ansLines30 = answerText.split("\n").slice(0, 30).map(l => l.trim()).filter(Boolean);
    console.log("PYQ sample lines:", pyqLines30);
    console.log("ANS sample lines:", ansLines30);

    const answerMap = parseAnswerMap(answerText);
    console.log(`Answers parsed: ${Object.keys(answerMap).length}`, answerMap);

    const test = new Test({ name: testName, year: testYear, uploadedBy: "admin", totalStudents });
    await test.save();

    const questionsArray = parseQuestions(pyqText, answerMap, test._id, testYear);
    console.log(`Questions parsed before answer assign: ${questionsArray.length}`);

    assignAnswers(questionsArray, answerMap);

    // Filter: must have question text; MCQ needs options; NAT needs numeric answer
    const finalQuestions = questionsArray.filter(q => {
      if (!q.question || q.question.trim().length < 3) return false;
      if (q.type === "NAT") return q.correctAnswer !== "";
      // MCQ: accept even if no answer found (for test display purposes)
      return q.options.length >= 2;
    });

    console.log(`Final questions: ${finalQuestions.length}`);

    if (finalQuestions.length === 0) {
      await Test.findByIdAndDelete(test._id);
      return res.status(400).json({
        message: "No questions parsed. Check PDF format.",
        debug: {
          answerMapSize: Object.keys(answerMap).length,
          answerMapSample: Object.entries(answerMap).slice(0, 5),
          pyqSampleLines: pyqLines30,
          ansSampleLines: ansLines30,
          totalRawQuestions: questionsArray.length,
        },
      });
    }

    await Question.insertMany(finalQuestions);
    await Test.findByIdAndUpdate(test._id, { totalQuestions: finalQuestions.length });

    res.status(200).json({
      message: "PDF uploaded successfully",
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