const Result      = require("../models/Result");
const Question    = require("../models/Question");
const TestAttempt = require("../models/TestAttempt");
const User        = require("../models/User");
const PDFDocument = require("pdfkit");

// ── REALISTIC RANK CALCULATOR ─────────────────────────────────────
// Real GATE exam mein lakho students hote hain
// Marks ke hisaab se realistic rank aur totalStudents assign karo
function calculateRealisticRank(percentage, totalMarks, totalPossibleMarks) {
  // GATE CS mein ~1,00,000+ students hote hain
  const TOTAL_STUDENTS = 100000;

  let rank;

  if (percentage >= 90) {
    // Top 0.01% — Rank 1 to 10
    rank = Math.floor(Math.random() * 10) + 1;
  } else if (percentage >= 85) {
    // Top 0.05% — Rank 10 to 50
    rank = Math.floor(Math.random() * 40) + 10;
  } else if (percentage >= 80) {
    // Top 0.1% — Rank 50 to 100
    rank = Math.floor(Math.random() * 50) + 50;
  } else if (percentage >= 75) {
    // Top 0.3% — Rank 100 to 300
    rank = Math.floor(Math.random() * 200) + 100;
  } else if (percentage >= 70) {
    // Top 1% — Rank 300 to 1000
    rank = Math.floor(Math.random() * 700) + 300;
  } else if (percentage >= 65) {
    // Top 2% — Rank 1000 to 2000
    rank = Math.floor(Math.random() * 1000) + 1000;
  } else if (percentage >= 60) {
    // Top 5% — Rank 2000 to 5000
    rank = Math.floor(Math.random() * 3000) + 2000;
  } else if (percentage >= 55) {
    // Top 10% — Rank 5000 to 10000
    rank = Math.floor(Math.random() * 5000) + 5000;
  } else if (percentage >= 50) {
    // Top 20% — Rank 10000 to 20000
    rank = Math.floor(Math.random() * 10000) + 10000;
  } else if (percentage >= 40) {
    // Top 40% — Rank 20000 to 40000
    rank = Math.floor(Math.random() * 20000) + 20000;
  } else if (percentage >= 30) {
    // Top 60% — Rank 40000 to 60000
    rank = Math.floor(Math.random() * 20000) + 40000;
  } else if (percentage >= 20) {
    // Top 80% — Rank 60000 to 80000
    rank = Math.floor(Math.random() * 20000) + 60000;
  } else {
    // Bottom — Rank 80000 to 100000
    rank = Math.floor(Math.random() * 20000) + 80000;
  }

  return { rank, totalStudents: TOTAL_STUDENTS };
}

// ── SUBMIT TEST ────────────────────────────────────────────────────
exports.submitTest = async (req, res) => {
  try {
    const { userId, testId, answers } = req.body;

    if (!userId || !testId || !answers || answers.length === 0) {
      return res.status(400).json({ message: "Invalid submission data" });
    }

    // Check attempts
    let attemptRecord = await TestAttempt.findOne({ userId, testId });

    if (attemptRecord && attemptRecord.attempts >= 2) {
      return res.status(403).json({ message: "You have used all 2 attempts for this test." });
    }
    if (attemptRecord && attemptRecord.attempts === 1 && attemptRecord.lastScore < 50) {
      return res.status(403).json({
        message: `Second attempt requires 50% score. Your last score: ${attemptRecord.lastScore.toFixed(1)}%`,
      });
    }

    // All questions for totalPossibleMarks
    const allTestQuestions   = await Question.find({ testId });
    const totalPossibleMarks = allTestQuestions.reduce((sum, q) => sum + q.marks, 0);

    // Answered questions
    const questionIds = answers.map(a => a.questionId);
    const questions   = await Question.find({ _id: { $in: questionIds } });

    let correct = 0, wrong = 0, attempted = 0, totalMarks = 0;
    const subjectMap = {};

    for (let ans of answers) {
      const q = questions.find(q => q._id.toString() === ans.questionId);
      if (!q || !ans.selectedOption) continue;

      attempted++;

      const isCorrect = q.type === "NAT"
        ? parseFloat(ans.selectedOption) === parseFloat(q.correctAnswer)
        : ans.selectedOption === q.correctAnswer;

      if (isCorrect) {
        correct++;
        totalMarks += q.marks;
      } else {
        wrong++;
        totalMarks -= q.negativeMarks;
      }

      if (!subjectMap[q.subject]) subjectMap[q.subject] = { correct: 0, wrong: 0 };
      if (isCorrect) subjectMap[q.subject].correct++;
      else           subjectMap[q.subject].wrong++;
    }

    const percentage    = totalPossibleMarks > 0 ? (totalMarks / totalPossibleMarks) * 100 : 0;
    const attemptNumber = attemptRecord ? attemptRecord.attempts + 1 : 1;
    const skipped       = allTestQuestions.length - attempted;
    const selected      = percentage >= 40;

    // ── REALISTIC RANK ─────────────────────────────────────────
    const { rank, totalStudents } = calculateRealisticRank(
      percentage, totalMarks, totalPossibleMarks
    );

    const result = new Result({
      userId,
      testId,
      totalMarks:         parseFloat(totalMarks.toFixed(2)),
      totalPossibleMarks,
      correct,
      wrong,
      attempted,
      skipped,
      rank,
      totalStudents,
      selected,
      percentage:         parseFloat(percentage.toFixed(2)),
      attemptNumber,
      subjectWisePerformance: Object.keys(subjectMap).map(subject => ({
        subject,
        correct: subjectMap[subject].correct,
        wrong:   subjectMap[subject].wrong,
      })),
    });

    await result.save();

    // Update attempt record
    if (attemptRecord) {
      attemptRecord.attempts  += 1;
      attemptRecord.lastScore  = parseFloat(percentage.toFixed(2));
      await attemptRecord.save();
    } else {
      await TestAttempt.create({
        userId, testId,
        attempts:  1,
        lastScore: parseFloat(percentage.toFixed(2)),
      });
    }

    res.status(200).json({ message: "Test submitted successfully", result });

  } catch (error) {
    console.error("submitTest error:", error);
    res.status(500).json({ message: "Test submission failed", error: error.message });
  }
};

// ── GET LATEST RESULT ─────────────────────────────────────────────
exports.getLatestResult = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await Result.findOne({ userId }).sort({ createdAt: -1 });
    if (!result) return res.status(404).json({ message: "No result found" });
    res.status(200).json(result);
  } catch (error) {
    console.error("getLatestResult error:", error);
    res.status(500).json({ message: "Failed to fetch result", error: error.message });
  }
};

// ── CHECK ATTEMPTS ────────────────────────────────────────────────
exports.checkAttempts = async (req, res) => {
  try {
    const { testId } = req.params;
    const userId     = req.user.id;
    const record     = await TestAttempt.findOne({ userId, testId });

    res.status(200).json({
      attempts:         record?.attempts  || 0,
      lastScore:        record?.lastScore || 0,
      canAttempt:       !record || record.attempts < 2,
      canAttemptSecond: record?.attempts === 1 && record?.lastScore >= 50,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── DOWNLOAD RESULT PDF ───────────────────────────────────────────
exports.downloadResultPdf = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await Result.findOne({ userId }).sort({ createdAt: -1 });
    if (!result) return res.status(404).json({ message: "No result found" });

    const user       = await User.findById(userId).select("-password");
    const percentage = parseFloat(result.percentage ?? 0);
    const passed     = percentage >= 50;
    const W          = 515;

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition",
      `attachment; filename="GATE_Result_${user.rollNumber || userId}.pdf"`);
    doc.pipe(res);

    // Header
    doc.rect(40, 40, W, 60).fill("#0369a1");
    doc.fillColor("#ffffff").fontSize(20).font("Helvetica-Bold")
       .text("GATE CBT — Test Result Report", 40, 58, { align: "center", width: W });

    // Student info
    doc.rect(40, 115, W, 50).fill("#e0f2fe").stroke("#bae6fd");
    doc.fillColor("#0369a1").fontSize(9).font("Helvetica-Bold");
    doc.text("Student Name", 50, 122); doc.text("Roll Number", 310, 122);
    doc.fillColor("#1a1a1a").font("Helvetica");
    doc.text(user.name || "—", 50, 134);
    doc.text(user.rollNumber || "N/A", 310, 134);
    doc.fillColor("#0369a1").font("Helvetica-Bold");
    doc.text("Email", 50, 147); doc.text("Attempt", 310, 147);
    doc.fillColor("#1a1a1a").font("Helvetica");
    doc.text(user.email || "—", 50, 159);
    doc.text(`${result.attemptNumber} of 2`, 310, 159);

    // Score box
    const sy = 180;
    const sc = passed ? "#0369a1" : "#dc2626";
    doc.rect(40, sy, W, 80)
       .fill(passed ? "#e0f2fe" : "#fee2e2")
       .stroke(passed ? "#bae6fd" : "#fca5a5");

    doc.fillColor(sc).fontSize(36).font("Helvetica-Bold")
       .text(String(result.totalMarks), 40, sy+14, { width: 170, align: "center" });
    doc.fillColor("#6b7280").fontSize(9).font("Helvetica")
       .text(`out of ${result.totalPossibleMarks || "?"}`, 40, sy+56, { width: 170, align: "center" });

    doc.fillColor(sc).fontSize(36).font("Helvetica-Bold")
       .text(`${percentage.toFixed(1)}%`, 170, sy+14, { width: 175, align: "center" });
    doc.fillColor("#6b7280").fontSize(9).font("Helvetica")
       .text("Percentage", 170, sy+56, { width: 175, align: "center" });

    doc.fillColor(passed ? "#16a34a" : "#dc2626").fontSize(22).font("Helvetica-Bold")
       .text(passed ? "PASS" : "FAIL", 345, sy+24, { width: 170, align: "center" });
    doc.fillColor("#6b7280").fontSize(9).font("Helvetica")
       .text("Status", 345, sy+56, { width: 170, align: "center" });

    doc.y = sy + 95;

    // Stats table
    doc.fillColor("#0369a1").fontSize(12).font("Helvetica-Bold")
       .text("Performance Breakdown", 40, doc.y);
    doc.moveDown(0.4);

    const rows = [
      ["Correct",   result.correct,   "Wrong",    result.wrong],
      ["Attempted", result.attempted, "Skipped",  result.skipped ?? "—"],
      ["Rank",      `${result.rank?.toLocaleString()}`,
       "Out of",   `${result.totalStudents?.toLocaleString()} students`],
      ["Score %",  `${percentage.toFixed(1)}%`,
       "Cutoff",   percentage >= 40 ? "✓ Qualified" : "✗ Not Qualified"],
    ];
    const cw = [130, 90, 130, 90];
    let ty   = doc.y;

    doc.rect(40, ty, W, 20).fill("#0369a1");
    doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold");
    ["Metric","Value","Metric","Value"].forEach((h, i) => {
      doc.text(h, 40+cw.slice(0,i).reduce((a,b)=>a+b,0)+4, ty+6,
        { width: cw[i]-8, align: "center" });
    });
    ty += 20;

    rows.forEach((row, ri) => {
      doc.rect(40, ty, W, 18).fill(ri%2===0 ? "#ffffff" : "#f0f8ff");
      doc.rect(40, ty, cw[0], 18).fill("#e0f2fe");
      doc.rect(40+cw[0]+cw[1], ty, cw[2], 18).fill("#e0f2fe");
      row.forEach((cell, i) => {
        const x = 40+cw.slice(0,i).reduce((a,b)=>a+b,0);
        doc.fillColor(i===0||i===2 ? "#0369a1" : "#1a1a1a")
           .font(i===0||i===2 ? "Helvetica-Bold" : "Helvetica")
           .fontSize(9).text(String(cell), x+4, ty+5, { width: cw[i]-8, align: "center" });
      });
      ty += 18;
    });
    doc.y = ty + 10;

    // Subject-wise
    const perf = result.subjectWisePerformance || [];
    if (perf.length > 0) {
      doc.fillColor("#0369a1").fontSize(12).font("Helvetica-Bold")
         .text("Subject-wise Analysis", 40, doc.y);
      doc.moveDown(0.4);
      const sw2 = [200, 80, 80, 115];
      let sy2   = doc.y;
      doc.rect(40, sy2, W, 20).fill("#0369a1");
      doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold");
      ["Subject","Correct","Wrong","Accuracy"].forEach((h, i) => {
        doc.text(h, 40+sw2.slice(0,i).reduce((a,b)=>a+b,0)+4, sy2+6,
          { width: sw2[i]-8, align: i===0?"left":"center" });
      });
      sy2 += 20;
      perf.forEach((s, ri) => {
        const tot = s.correct + s.wrong;
        const acc = tot > 0 ? `${((s.correct/tot)*100).toFixed(1)}%` : "—";
        doc.rect(40, sy2, W, 18).fill(ri%2===0 ? "#ffffff" : "#f0f8ff");
        [s.subject, String(s.correct), String(s.wrong), acc].forEach((cell, i) => {
          doc.fillColor("#1a1a1a").font("Helvetica").fontSize(9)
             .text(cell, 40+sw2.slice(0,i).reduce((a,b)=>a+b,0)+4, sy2+5,
               { width: sw2[i]-8, align: i===0?"left":"center" });
        });
        sy2 += 18;
      });
      doc.y = sy2 + 10;
    }

    // Rank banner
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke("#bae6fd");
    doc.moveDown(0.4);
    doc.rect(40, doc.y, W, 36).fill(passed ? "#dcfce7" : "#fee2e2");
    doc.fillColor(passed ? "#16a34a" : "#dc2626").fontSize(15).font("Helvetica-Bold")
       .text(
         `🏆  Rank ${result.rank?.toLocaleString()}  out of  ${result.totalStudents?.toLocaleString()} students`,
         40, doc.y + 10, { align: "center", width: W }
       );
    doc.y = doc.y + 46;

    // Recommendation
    doc.moveDown(0.4);
    doc.fillColor("#0369a1").fontSize(11).font("Helvetica-Bold").text("Recommendation");
    doc.moveDown(0.2);
    const msg = percentage >= 85 ? "Excellent! You are in the top percentile. Keep it up." :
                percentage >= 70 ? "Good performance. Focus on weak subjects to improve rank." :
                percentage >= 50 ? "You passed! Work on accuracy and speed to score higher." :
                                   "Keep practicing. Focus on fundamentals and attempt more tests.";
    doc.fillColor("#374151").fontSize(10).font("Helvetica").text(msg);
    doc.moveDown(1);

    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke("#bae6fd");
    doc.moveDown(0.3);
    doc.fillColor("#9ca3af").fontSize(8).font("Helvetica")
       .text("Computer-generated result. GATE CBT System.", { align: "center" });

    doc.end();
  } catch (error) {
    console.error("PDF error:", error);
    res.status(500).json({ message: "PDF generation failed", error: error.message });
  }
};
