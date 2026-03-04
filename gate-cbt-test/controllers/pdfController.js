const pdfParseLib = require("pdf-parse");
const Question = require("../models/Question");
const Test = require("../models/Test");

// ✅ Safe wrapper — handles both default and named export
async function pdfParseBuffer(buffer) {
  const fn = typeof pdfParseLib === "function" ? pdfParseLib : pdfParseLib.default;
  const data = await fn(buffer);
  return { text: data.text };
}

// ── ANSWER KEY PARSER ────────────────────────────────────────────
function parseAnswerMap(ansLines) {
  const answerMap = {};

  for (let line of ansLines) {
    // FORMAT 1: "Q1. Answer: B [MCQ | 1 Mark | Negative: -0.33]"
    const fmt1 = line.match(
      /^Q(\d+)\.\s+Answer:\s+([A-D]|-?\d+(?:\.\d+)?)\s+\[(MCQ|NAT)\s*\|\s*(\d+)\s*Marks?/i
    );
    if (fmt1) {
      const type = fmt1[3].toUpperCase();
      const marks = parseInt(fmt1[4]);
      answerMap[fmt1[1]] = {
        answer: type === "MCQ" ? fmt1[2].toUpperCase() : fmt1[2],
        type,
        marks,
        negativeMarks: type === "NAT" ? 0 : marks === 2 ? 0.66 : 0.33,
      };
      continue;
    }

    // Marks hint
    let marks = 1;
    const mh = line.match(/\b([12])\s*(?:marks?|M)\b/i) || line.match(/[(\[]\s*([12])\s*[)\]]/);
    if (mh) marks = parseInt(mh[1]);

    // FORMAT 2 MCQ: "1. B"  "Q1. B"
    const mcq =
      line.match(/^Q?(\d+)[.)]\s*(?:Ans(?:wer)?[:\s]*)?\(?([A-D])\)?/i) ||
      line.match(/^Q?(\d+)\s+([A-D])$/i);
    if (mcq) {
      answerMap[mcq[1]] = {
        answer: mcq[2].toUpperCase(),
        type: "MCQ",
        marks,
        negativeMarks: marks === 2 ? 0.66 : 0.33,
      };
      continue;
    }

    // FORMAT 3 NAT: "3. 9"  "7. 236"
    const nat = line.match(/^Q?(\d+)[.)]\s*(?:Ans(?:wer)?[:\s]*)?(-?\d+(?:\.\d+)?)$/i);
    if (nat) {
      answerMap[nat[1]] = { answer: nat[2], type: "NAT", marks, negativeMarks: 0 };
    }
  }

  return answerMap;
}

// ── SECTION DETECTOR ─────────────────────────────────────────────
function detectSection(line) {
  if (/general\s*aptitude/i.test(line))        return "General Aptitude";
  if (/engineering\s*mathematics/i.test(line)) return "Engineering Mathematics";
  if (/linked.?list/i.test(line))              return "Linked List";
  if (/\barray\b/i.test(line))                 return "Array";
  if (/\bstack\b/i.test(line))                 return "Stack";
  if (/\bqueue\b/i.test(line))                 return "Queue";
  if (/\btree\b/i.test(line))                  return "Tree";
  if (/\bgraph\b/i.test(line))                 return "Graph";
  if (/mixed|advanced/i.test(line))            return "Mixed Advanced";
  if (/aptitude/i.test(line))                  return "Aptitude";
  if (/reasoning/i.test(line))                 return "Reasoning";
  if (/english/i.test(line))                   return "English";
  if (/technical/i.test(line))                 return "Technical";
  if (/computer\s*science/i.test(line))        return "Computer Science";
  return null;
}

// ── MAIN UPLOAD HANDLER ──────────────────────────────────────────
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

    const pyqLines = pyqText.split("\n").map(l => l.trim()).filter(l => l.length > 2);
    const ansLines = answerText.split("\n").map(l => l.trim()).filter(l => l);

    const answerMap = parseAnswerMap(ansLines);
    console.log(`Answers parsed: ${Object.keys(answerMap).length}`);

    const test = new Test({ name: testName, year: testYear, uploadedBy: "admin", totalStudents });
    await test.save();

    const questionsArray = [];
    let currentSection  = "General";
    let currentQuestion = null;

    const skipPatterns = [
      /^GATE CBT/i, /^Total Questions/i, /^Total Marks/i, /^Time:/i,
      /^INSTRUCTIONS/i, /^1-Mark MCQ/i, /^2-Mark MCQ/i, /^NAT \(any\)/i,
      /^Not Attempted/i, /^—\s*END/i, /^All the best/i,
      /^Answer:\s*_+/i, /^\(Enter integer\)/i,
    ];

    for (let line of pyqLines) {
      if (skipPatterns.some(p => p.test(line))) continue;

      // Section detection
      const sec = detectSection(line);
      if (sec && line.length < 50) { currentSection = sec; continue; }

      // Question line: "Q1. ..." or "1. ..."
      const qMatch = line.match(/^Q?(\d+)[.)]\s+(.*)/i);
      if (qMatch) {
        if (currentQuestion) questionsArray.push(currentQuestion);

        const questionNumber = parseInt(qMatch[1]);
        const restOfLine     = qMatch[2].trim();
        const answerInfo     = answerMap[String(questionNumber)] || {};
        const metaInline     = restOfLine.match(/^\[(MCQ|NAT)\s*\|\s*(\d+)\s*Marks?/i);

        let type          = answerInfo.type          || "MCQ";
        let marks         = answerInfo.marks         || 1;
        let negativeMarks = answerInfo.negativeMarks ?? (marks === 2 ? 0.66 : 0.33);

        if (metaInline) {
          type          = metaInline[1].toUpperCase();
          marks         = parseInt(metaInline[2]);
          negativeMarks = /No Negative/i.test(restOfLine) ? 0 : marks === 2 ? 0.66 : 0.33;
        }

        // Inline options: "question text (A) opt1 (B) opt2 (C) opt3 (D) opt4"
        const inlineOpts =
          restOfLine.match(/^(.*?)\s+\(A\)\s+(.*?)\s+\(B\)\s+(.*?)\s+\(C\)\s+(.*?)\s+\(D\)\s+(.*)$/i) ||
          restOfLine.match(/^(.*?)\s+a\)\s+(.*?)\s+b\)\s+(.*?)\s+c\)\s+(.*?)\s+d\)\s+(.*)$/i);

        if (inlineOpts) {
          questionsArray.push({
            testId: test._id, questionNumber,
            question: inlineOpts[1].trim(),
            options: [inlineOpts[2].trim(), inlineOpts[3].trim(), inlineOpts[4].trim(), inlineOpts[5].trim()],
            correctAnswer: "", section: currentSection, subject: currentSection,
            topic: currentSection, type: "MCQ", marks,
            negativeMarks: marks === 2 ? 0.66 : 0.33, year: testYear,
          });
          currentQuestion = null;
        } else {
          currentQuestion = {
            testId: test._id, questionNumber,
            question: metaInline ? "" : restOfLine,
            options: [], correctAnswer: "",
            section: currentSection, subject: currentSection,
            topic: currentSection, type, marks, negativeMarks, year: testYear,
          };
        }
        continue;
      }

      if (currentQuestion) {
        // Meta line: "[MCQ | 1 Mark | Negative: -0.33]"
        const metaMatch = line.match(/^\[(MCQ|NAT)\s*\|\s*(\d+)\s*Marks?/i);
        if (metaMatch) {
          currentQuestion.type          = metaMatch[1].toUpperCase();
          currentQuestion.marks         = parseInt(metaMatch[2]);
          currentQuestion.negativeMarks = /No Negative/i.test(line) ? 0
                                        : currentQuestion.marks === 2 ? 0.66 : 0.33;
          continue;
        }

        // Options: "(A) text" or "a) text"
        const optMatch = line.match(/^\(?([A-Da-d])\)?[.)]\s*(.+)/i);
        if (optMatch && currentQuestion.options.length < 4) {
          currentQuestion.options.push(optMatch[2].trim());
          currentQuestion.type = "MCQ";
          continue;
        }

        // Multi-line question text
        if (!skipPatterns.some(p => p.test(line)) && line.length > 3) {
          if (currentQuestion.question === "") {
            currentQuestion.question = line;
          } else if (currentQuestion.options.length === 0) {
            currentQuestion.question += " " + line;
          }
        }
      }
    }

    if (currentQuestion) questionsArray.push(currentQuestion);

    // Assign correct answers
    questionsArray.forEach(q => {
      const ansInfo = answerMap[String(q.questionNumber)];
      if (!ansInfo) return;
      if (q.type === "NAT") {
        q.correctAnswer = String(ansInfo.answer);
      } else {
        const idx = ansInfo.answer.charCodeAt(0) - 65;
        if (q.options[idx] !== undefined) q.correctAnswer = q.options[idx];
      }
    });

    // Filter valid questions
    const finalQuestions = questionsArray.filter(q => {
      if (!q.question || q.question.trim() === "") return false;
      if (q.type === "NAT") return q.correctAnswer !== "";
      return q.options.length >= 2 && q.correctAnswer !== "";
    });

    console.log(`Final questions: ${finalQuestions.length}`);

    if (finalQuestions.length === 0) {
      await Test.findByIdAndDelete(test._id);
      return res.status(400).json({
        message: "No questions parsed. Check PDF format.",
        debug: {
          answerMapKeys: Object.keys(answerMap),
          sampleLines: pyqLines.slice(0, 15),
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
      totalStudents: test.totalStudents,
      sections: [...new Set(finalQuestions.map(q => q.section))],
    });

  } catch (error) {
    console.error("PDF PARSE ERROR:", error);
    res.status(500).json({ message: "PDF parsing failed", error: error.message });
  }
};

// ── EXTRA ROUTES ─────────────────────────────────────────────────

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