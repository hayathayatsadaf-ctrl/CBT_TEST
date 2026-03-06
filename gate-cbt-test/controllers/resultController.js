const Result      = require("../models/Result");
const Question    = require("../models/Question");
const TestAttempt = require("../models/TestAttempt");
const User        = require("../models/User");

// ── REALISTIC RANK CALCULATOR ─────────────────────────────────────
function calculateRealisticRank(percentage) {
  const TOTAL_STUDENTS = 100000;
  let rank;
  if      (percentage >= 90) rank = Math.floor(Math.random() * 10)    + 1;
  else if (percentage >= 85) rank = Math.floor(Math.random() * 40)    + 10;
  else if (percentage >= 80) rank = Math.floor(Math.random() * 50)    + 50;
  else if (percentage >= 75) rank = Math.floor(Math.random() * 200)   + 100;
  else if (percentage >= 70) rank = Math.floor(Math.random() * 700)   + 300;
  else if (percentage >= 65) rank = Math.floor(Math.random() * 1000)  + 1000;
  else if (percentage >= 60) rank = Math.floor(Math.random() * 3000)  + 2000;
  else if (percentage >= 55) rank = Math.floor(Math.random() * 5000)  + 5000;
  else if (percentage >= 50) rank = Math.floor(Math.random() * 10000) + 10000;
  else if (percentage >= 40) rank = Math.floor(Math.random() * 20000) + 20000;
  else if (percentage >= 30) rank = Math.floor(Math.random() * 20000) + 40000;
  else if (percentage >= 20) rank = Math.floor(Math.random() * 20000) + 60000;
  else                       rank = Math.floor(Math.random() * 20000) + 80000;
  return { rank, totalStudents: TOTAL_STUDENTS };
}

// ── SUBMIT TEST ────────────────────────────────────────────────────
exports.submitTest = async (req, res) => {
  try {
    const { userId, testId, answers } = req.body;
    if (!userId || !testId || !answers || answers.length === 0)
      return res.status(400).json({ message: "Invalid submission data" });

    let attemptRecord = await TestAttempt.findOne({ userId, testId });
    if (attemptRecord && attemptRecord.attempts >= 2)
      return res.status(403).json({ message: "You have used all 2 attempts for this test." });
    if (attemptRecord && attemptRecord.attempts === 1 && attemptRecord.lastScore < 50)
      return res.status(403).json({
        message: `Second attempt requires 50% score. Your last score: ${attemptRecord.lastScore.toFixed(1)}%`,
      });

    const allTestQuestions   = await Question.find({ testId });
    const totalPossibleMarks = allTestQuestions.reduce((sum, q) => sum + q.marks, 0);
    const questionIds        = answers.map(a => a.questionId);
    const questions          = await Question.find({ _id: { $in: questionIds } });

    let correct = 0, wrong = 0, attempted = 0, totalMarks = 0;
    const subjectMap = {};

    for (let ans of answers) {
      const q = questions.find(q => q._id.toString() === ans.questionId);
      if (!q || !ans.selectedOption) continue;
      attempted++;
      const isCorrect = q.type === "NAT"
        ? parseFloat(ans.selectedOption) === parseFloat(q.correctAnswer)
        : ans.selectedOption === q.correctAnswer;
      if (isCorrect) { correct++; totalMarks += q.marks; }
      else           { wrong++;   totalMarks -= q.negativeMarks; }
      if (!subjectMap[q.subject]) subjectMap[q.subject] = { correct: 0, wrong: 0 };
      if (isCorrect) subjectMap[q.subject].correct++;
      else           subjectMap[q.subject].wrong++;
    }

    const percentage    = totalPossibleMarks > 0 ? (totalMarks / totalPossibleMarks) * 100 : 0;
    const attemptNumber = attemptRecord ? attemptRecord.attempts + 1 : 1;
    const skipped       = allTestQuestions.length - attempted;
    const selected      = percentage >= 40;
    const { rank, totalStudents } = calculateRealisticRank(percentage);

    const result = new Result({
      userId, testId,
      totalMarks: parseFloat(totalMarks.toFixed(2)), totalPossibleMarks,
      correct, wrong, attempted, skipped, rank, totalStudents, selected,
      percentage: parseFloat(percentage.toFixed(2)), attemptNumber,
      subjectWisePerformance: Object.keys(subjectMap).map(subject => ({
        subject, correct: subjectMap[subject].correct, wrong: subjectMap[subject].wrong,
      })),
    });
    await result.save();

    if (attemptRecord) {
      attemptRecord.attempts += 1;
      attemptRecord.lastScore = parseFloat(percentage.toFixed(2));
      await attemptRecord.save();
    } else {
      await TestAttempt.create({ userId, testId, attempts: 1, lastScore: parseFloat(percentage.toFixed(2)) });
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

// ── DOWNLOAD RESULT — HTML page (browser prints as PDF) ───────────
exports.downloadResultPdf = async (req, res) => {
  try {
    // Token header se ya query param se lo
    const token = req.headers.authorization?.split(" ")[1] || req.query.token;
    const jwt   = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId  = decoded.id;
  }
    // ... baaki code same rahega

exports.downloadResultPdf = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await Result.findOne({ userId }).sort({ createdAt: -1 });
    if (!result) return res.status(404).json({ message: "No result found" });

    const user        = await User.findById(userId).select("-password");
    const percentage  = parseFloat(result.percentage ?? 0);
    const passed      = percentage >= 50;
    const qualified   = percentage >= 40;
    const circleColor = percentage >= 70 ? "#16a34a" : percentage >= 50 ? "#1a3a8f" : percentage >= 40 ? "#d97706" : "#dc2626";
    const grade       = percentage >= 85 ? "Excellent" : percentage >= 70 ? "Very Good" : percentage >= 50 ? "Good" : percentage >= 40 ? "Average" : "Needs Work";
    const msg         = percentage >= 85 ? "Outstanding! You are in the top percentile. Keep up the great work."
                      : percentage >= 70 ? "Great score! Focus on weak subjects to push into top ranks."
                      : percentage >= 50 ? "You passed! Work on speed and accuracy to improve your rank."
                      : percentage >= 40 ? "You qualified the cutoff but did not pass. Practice more and retry."
                      : "Below cutoff. Revise fundamentals and practice more mock tests.";

    const subjectRows = (result.subjectWisePerformance || []).map(s => {
      const tot = s.correct + s.wrong;
      const acc = tot > 0 ? ((s.correct / tot) * 100).toFixed(1) : "0";
      return `<tr><td>${s.subject}</td><td style="color:#16a34a;font-weight:bold">${s.correct}</td><td style="color:#dc2626;font-weight:bold">${s.wrong}</td><td>${acc}%</td></tr>`;
    }).join("");

    const betterThan = result.totalStudents > 0
      ? Math.max(0, 100 - (result.rank / result.totalStudents) * 100).toFixed(1) : 0;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>GATE Result - ${user?.name || "Student"}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#1a1a1a;background:#fff;padding:30px;max-width:800px;margin:0 auto}
    .header{background:#0369a1;color:#fff;padding:22px;border-radius:8px;text-align:center;margin-bottom:20px}
    .header h1{font-size:22px}.header p{font-size:13px;opacity:.85;margin-top:4px}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
    .info-box{background:#e0f2fe;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px}
    .info-box label{font-size:11px;color:#0369a1;font-weight:bold;display:block;margin-bottom:3px}
    .info-box span{font-size:15px;font-weight:bold}
    .score-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px}
    .score-box{border-radius:10px;padding:18px;text-align:center}
    .score-box .num{font-size:34px;font-weight:900}
    .score-box .lbl{font-size:12px;margin-top:3px;color:#6b7280}
    .section-title{font-size:14px;font-weight:bold;color:#0369a1;margin:16px 0 8px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px}
    th{background:#0369a1;color:#fff;padding:8px 10px;text-align:left}
    td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
    tr:nth-child(even) td{background:#f0f9ff}
    .rank-box{background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:14px;text-align:center;margin-bottom:16px}
    .rank-num{font-size:26px;font-weight:900;color:#92400e}
    .rank-sub{font-size:13px;color:#78716c;margin-top:4px}
    .not-qual{background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;border-radius:8px;padding:12px;text-align:center;margin-bottom:16px;font-weight:bold}
    .analysis{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;line-height:1.7}
    .footer{text-align:center;font-size:11px;color:#9ca3af;margin-top:20px;padding-top:10px;border-top:1px solid #e5e7eb}
    .no-print{text-align:center;margin-bottom:20px}
    .print-btn{background:#0369a1;color:#fff;border:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:bold;cursor:pointer}
    @media print{.no-print{display:none}body{padding:10px}@page{margin:.8cm}}
  </style>
</head>
<body>

  <div class="no-print">
    <button class="print-btn" onclick="window.print()">📥 Save as PDF / Print</button>
  </div>

  <div class="header">
    <h1>GATE CBT — Test Result Report</h1>
    <p>Attempt ${result.attemptNumber} of 2 &nbsp;·&nbsp; ${new Date().toLocaleDateString("en-IN",{year:"numeric",month:"long",day:"numeric"})}</p>
  </div>

  <div class="info-grid">
    <div class="info-box"><label>Student Name</label><span>${user?.name || "—"}</span></div>
    <div class="info-box"><label>Roll Number</label><span>${user?.rollNumber || "N/A"}</span></div>
    <div class="info-box"><label>Email</label><span>${user?.email || "—"}</span></div>
    <div class="info-box"><label>Test Date</label><span>${new Date(result.createdAt).toLocaleDateString("en-IN")}</span></div>
  </div>

  <div class="score-row">
    <div class="score-box" style="background:${circleColor}18;border:2px solid ${circleColor}">
      <div class="num" style="color:${circleColor}">${result.totalMarks}</div>
      <div class="lbl">out of ${result.totalPossibleMarks || "?"}</div>
    </div>
    <div class="score-box" style="background:${circleColor}18;border:2px solid ${circleColor}">
      <div class="num" style="color:${circleColor}">${percentage.toFixed(1)}%</div>
      <div class="lbl">Percentage</div>
    </div>
    <div class="score-box" style="background:${passed?"#dcfce7":"#fee2e2"};border:2px solid ${passed?"#86efac":"#fca5a5"}">
      <div class="num" style="color:${passed?"#16a34a":"#dc2626"}">${passed?"PASS":"FAIL"}</div>
      <div class="lbl">${grade}</div>
    </div>
  </div>

  <div class="section-title">📊 Performance Breakdown</div>
  <table>
    <tr><th>Correct</th><th>Wrong</th><th>Attempted</th><th>Skipped</th></tr>
    <tr>
      <td style="color:#16a34a;font-weight:bold">${result.correct}</td>
      <td style="color:#dc2626;font-weight:bold">${result.wrong}</td>
      <td style="color:#1d4ed8;font-weight:bold">${result.attempted}</td>
      <td style="color:#ca8a04;font-weight:bold">${result.skipped ?? "—"}</td>
    </tr>
  </table>

  ${qualified ? `
  <div class="rank-box">
    <div class="rank-num">🏆 Rank ${result.rank?.toLocaleString()}</div>
    <div class="rank-sub">out of ${result.totalStudents?.toLocaleString()} students &nbsp;·&nbsp; Better than ${betterThan}% students</div>
  </div>` : `<div class="not-qual">❌ Not Qualified — Score below 40% cutoff</div>`}

  ${subjectRows ? `
  <div class="section-title">📚 Subject-wise Analysis</div>
  <table>
    <tr><th>Subject</th><th>Correct</th><th>Wrong</th><th>Accuracy</th></tr>
    ${subjectRows}
  </table>` : ""}

  <div class="analysis"><strong>📈 Recommendation:</strong><br>${msg}</div>

  <div class="footer">Computer-generated result · GATE CBT System · ${new Date().toLocaleString("en-IN")}</div>

</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);

  } catch (error) {
    console.error("PDF error:", error);
    res.status(500).json({ message: "PDF generation failed", error: error.message });
  }
};
