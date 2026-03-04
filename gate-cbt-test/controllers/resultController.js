const Result = require("../models/Result");
const Question = require("../models/Question");
const TestAttempt = require("../models/TestAttempt");
const Test = require("../models/Test");

exports.submitTest = async (req, res) => {
  try {
    const { userId, testId, answers } = req.body;

    if (!userId || !testId || !answers || answers.length === 0) {
      return res.status(400).json({ message: "Invalid submission data" });
    }

    let attemptRecord = await TestAttempt.findOne({ userId, testId });

    if (attemptRecord && attemptRecord.attempts >= 2) {
      return res.status(403).json({ message: "You have used all 2 attempts for this test." });
    }

    if (attemptRecord && attemptRecord.attempts === 1 && attemptRecord.lastScore < 50) {
      return res.status(403).json({
        message: `Your first attempt score was ${attemptRecord.lastScore.toFixed(1)}%. You need 50% or more to unlock a second attempt.`,
      });
    }

    const questionIds = answers.map((a) => a.questionId);
    const questions = await Question.find({ _id: { $in: questionIds } });

    let correct = 0, wrong = 0, attempted = 0, totalMarks = 0;
    const subjectPerformance = {};

    for (let ans of answers) {
      const q = questions.find((q) => q._id.toString() === ans.questionId);
      if (!q || !ans.selectedOption) continue;

      attempted++;
      if (ans.selectedOption === q.correctAnswer) {
        correct++;
        totalMarks += q.marks;
      } else {
        wrong++;
        totalMarks -= q.negativeMarks;
      }

      if (!subjectPerformance[q.subject]) subjectPerformance[q.subject] = { correct: 0, wrong: 0 };
      if (ans.selectedOption === q.correctAnswer) subjectPerformance[q.subject].correct++;
      else subjectPerformance[q.subject].wrong++;
    }

    const totalPossibleMarks = questions.reduce((sum, q) => sum + q.marks, 0);
    const percentage = totalPossibleMarks > 0 ? (totalMarks / totalPossibleMarks) * 100 : 0;
    const attemptNumber = attemptRecord ? attemptRecord.attempts + 1 : 1;

    // ✅ Get totalStudents from Test record
    const test = await Test.findById(testId);
    const totalStudents = test?.totalStudents || 1000;

    // ✅ Rank logic:
    // Above 80%  → top ranks 1, 2, 3, 4... (based on how far above 80%)
    // 40% - 80%  → smooth rank out of totalStudents
    // Below 40%  → not selected (rank = null)
    let rank = null;
    let selected = true;

    if (percentage < 40) {
      // Not selected
      selected = false;
      rank = null;
    } else if (percentage > 80) {
      // Top ranks — every 1% above 80 = roughly 1 rank step
      // 100% → rank 1, 99% → rank ~20, 87% → rank ~260 etc.
      // Formula: rank = ceil(totalStudents * (100 - percentage) / 100 * 0.1)
      rank = Math.max(1, Math.ceil(totalStudents * ((100 - percentage) / 100) * 0.1));
    } else {
      // 40-80% → smooth rank from ~20% to ~80% of totalStudents
      // 80% → rank ~200, 65% → rank ~1600, 50% → rank ~2500, 40% → rank ~2800
      rank = Math.ceil(totalStudents * (1 - percentage / 100));
    }

    const result = new Result({
      userId,
      testId,
      totalMarks,
      correct,
      wrong,
      attempted,
      rank,
      totalStudents,
      selected,
      percentage: parseFloat(percentage.toFixed(2)),
      attemptNumber,
      subjectWisePerformance: Object.keys(subjectPerformance).map((subject) => ({
        subject,
        correct: subjectPerformance[subject].correct,
        wrong: subjectPerformance[subject].wrong,
      })),
    });

    await result.save();

    if (attemptRecord) {
      attemptRecord.attempts += 1;
      attemptRecord.lastScore = parseFloat(percentage.toFixed(2));
      await attemptRecord.save();
    } else {
      await TestAttempt.create({
        userId,
        testId,
        attempts: 1,
        lastScore: parseFloat(percentage.toFixed(2)),
      });
    }

    res.status(200).json({ message: "Test submitted successfully", result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Test submission failed", error: error.message });
  }
};

exports.getLatestResult = async (req, res) => {
  try {
    const result = await Result.findOne({ userId: req.user.id }).sort({ createdAt: -1 });
    if (!result) return res.status(404).json({ message: "No result found" });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch result", error: error.message });
  }
};

exports.checkAttempts = async (req, res) => {
  try {
    const { testId } = req.params;
    const userId = req.user.id;
    const attemptRecord = await TestAttempt.findOne({ userId, testId });
    res.status(200).json({
      attempts: attemptRecord?.attempts || 0,
      lastScore: attemptRecord?.lastScore || 0,
      canAttempt: !attemptRecord || attemptRecord.attempts < 2,
      canAttemptSecond: attemptRecord?.attempts === 1 && attemptRecord?.lastScore >= 50,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};