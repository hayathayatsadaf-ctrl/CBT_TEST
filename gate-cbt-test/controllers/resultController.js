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

    // ✅ BUG FIX #1: Fetch ALL questions for this test, not just answered ones.
    // Old code fetched only answered question IDs → totalPossibleMarks was wrong.
    // Example: 2 answered out of 20 → totalPossibleMarks = 2 marks → 100% bug.
    const allTestQuestions = await Question.find({ testId });

    // Also build a map for quick lookup by ID
    const questionMap = {};
    for (const q of allTestQuestions) {
      questionMap[q._id.toString()] = q;
    }

    // ✅ BUG FIX #2: totalPossibleMarks = sum of ALL questions in the test (not just answered)
    const totalPossibleMarks = allTestQuestions.reduce((sum, q) => sum + q.marks, 0);

    let correct = 0, wrong = 0, attempted = 0, totalMarks = 0;
    const subjectPerformance = {};

    for (let ans of answers) {
      const q = questionMap[ans.questionId];

      // Skip if question not found or no option selected (unanswered = 0 marks, no penalty)
      if (!q || !ans.selectedOption) continue;

      attempted++;

      if (ans.selectedOption === q.correctAnswer) {
        // ✅ Correct answer → add marks
        correct++;
        totalMarks += q.marks;
      } else {
        // ✅ BUG FIX #3: NAT (Numerical Answer Type) questions have NO negative marking.
        // Old code applied negativeMarks to ALL wrong answers including NAT.
        // Only MCQ wrong answers get negative marks.
        wrong++;
        const isNAT = q.type === "NAT" || q.questionType === "NAT";
        if (!isNAT) {
          totalMarks -= q.negativeMarks; // MCQ wrong → deduct negative marks
        }
        // NAT wrong → 0 deduction (do nothing)
      }

      // Subject-wise tracking
      if (!subjectPerformance[q.subject]) {
        subjectPerformance[q.subject] = { correct: 0, wrong: 0 };
      }
      if (ans.selectedOption === q.correctAnswer) {
        subjectPerformance[q.subject].correct++;
      } else {
        subjectPerformance[q.subject].wrong++;
      }
    }

    // ✅ CORRECT percentage formula: obtained marks / ALL question marks × 100
    // Old fallback in frontend was: totalMarks / attempted × 100 → also wrong
    const percentage = totalPossibleMarks > 0
      ? (totalMarks / totalPossibleMarks) * 100
      : 0;

    const attemptNumber = attemptRecord ? attemptRecord.attempts + 1 : 1;

    // Get totalStudents from Test record
    const test = await Test.findById(testId);
    const totalStudents = test?.totalStudents || 1000;

    // Rank logic
    let rank = null;
    let selected = true;

    if (percentage < 40) {
      selected = false;
      rank = null;
    } else if (percentage > 80) {
      rank = Math.max(1, Math.ceil(totalStudents * ((100 - percentage) / 100) * 0.1));
    } else {
      rank = Math.ceil(totalStudents * (1 - percentage / 100));
    }

    const result = new Result({
      userId,
      testId,
      totalMarks,
      totalPossibleMarks, // ✅ Also save this so frontend can show X / totalPossibleMarks
      correct,
      wrong,
      attempted,
      skipped: allTestQuestions.length - attempted, // ✅ Now we know total questions
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