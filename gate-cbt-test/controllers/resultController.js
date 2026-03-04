const Result = require("../models/Result");
const Question = require("../models/Question");
const TestAttempt = require("../models/TestAttempt");

exports.submitTest = async (req, res) => {
  try {
    const { userId, testId, answers } = req.body;

    if (!userId || !testId || !answers || answers.length === 0) {
      return res.status(400).json({ message: "Invalid submission data" });
    }

    // ✅ Check per-test attempt limits
    let attemptRecord = await TestAttempt.findOne({ userId, testId });

    if (attemptRecord && attemptRecord.attempts >= 2) {
      return res.status(403).json({ message: "You have used all 2 attempts for this test." });
    }

    if (attemptRecord && attemptRecord.attempts === 1 && attemptRecord.lastScore < 50) {
      return res.status(403).json({
        message: `Second attempt requires 50% score. Your last score: ${attemptRecord.lastScore.toFixed(1)}%`,
      });
    }

    // ✅ Fetch ALL questions for this test (not just answered ones)
    const allTestQuestions = await Question.find({ testId });
    const totalPossibleMarks = allTestQuestions.reduce((sum, q) => sum + q.marks, 0);

    // ✅ Fetch only the answered questions
    const questionIds = answers.map(a => a.questionId);
    const questions = await Question.find({ _id: { $in: questionIds } });

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
        totalMarks -= q.negativeMarks; // can go negative
      }

      if (!subjectMap[q.subject]) subjectMap[q.subject] = { correct: 0, wrong: 0 };
      if (isCorrect) subjectMap[q.subject].correct++;
      else subjectMap[q.subject].wrong++;
    }

    // ✅ Correct percentage: marks obtained / total possible marks * 100
    const percentage = totalPossibleMarks > 0
      ? (totalMarks / totalPossibleMarks) * 100
      : 0;

    const attemptNumber = attemptRecord ? attemptRecord.attempts + 1 : 1;
    const skipped = allTestQuestions.length - attempted;

    // ✅ Rank based on percentage
    let rank;
    if (percentage >= 85) rank = Math.floor(Math.random() * 50) + 1;
    else if (percentage >= 70) rank = Math.floor(Math.random() * 200) + 50;
    else if (percentage >= 50) rank = Math.floor(Math.random() * 500) + 200;
    else rank = Math.floor(Math.random() * 2000) + 700;

    // ✅ Selected = above 40% cutoff
    const selected = percentage >= 40;

    const result = new Result({
      userId,
      testId,
      totalMarks: parseFloat(totalMarks.toFixed(2)),
      correct,
      wrong,
      attempted,
      skipped,
      rank,
      totalStudents: 10000,
      selected,
      percentage: parseFloat(percentage.toFixed(2)),
      totalPossibleMarks,
      attemptNumber,
      subjectWisePerformance: Object.keys(subjectMap).map(subject => ({
        subject,
        correct: subjectMap[subject].correct,
        wrong: subjectMap[subject].wrong,
      })),
    });

    await result.save();

    // ✅ Update TestAttempt record
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

// ✅ Get latest result for logged-in user
exports.getLatestResult = async (req, res) => {
  try {
    // ✅ Convert string ID to ObjectId for reliable matching
    const userId = req.user.id;
    const result = await Result.findOne({ userId }).sort({ createdAt: -1 });

    if (!result) {
      return res.status(404).json({ message: "No result found" });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("getLatestResult error:", error);
    res.status(500).json({ message: "Failed to fetch result", error: error.message });
  }
};

// ✅ Check attempt status for a specific test
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