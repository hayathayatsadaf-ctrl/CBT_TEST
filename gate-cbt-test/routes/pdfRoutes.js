const express  = require("express");
const router   = express.Router();
const upload   = require("../middleware/upload");
const { uploadPDFs } = require("../controllers/pdfController");
const Question = require("../models/Question");
const Test     = require("../models/Test");

// ✅ Try both middleware names — works either way
let auth;
try {
  auth = require("../middleware/authMiddleware");
} catch (e) {
  try {
    auth = require("../middleware/auth");
  } catch (e2) {
    // No auth middleware — use passthrough
    auth = (req, res, next) => next();
  }
}

// Upload PDFs
router.post("/upload", upload.fields([
  { name: "pyq",       maxCount: 1 },
  { name: "answerKey", maxCount: 1 },
]), uploadPDFs);

// Get all tests
router.get("/tests", auth, async (req, res) => {
  try {
    const tests = await Test.find().sort({ createdAt: -1 });
    res.status(200).json(tests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Questions for specific test
router.get("/questions/:testId", auth, async (req, res) => {
  try {
    const questions = await Question.find({ testId: req.params.testId });
    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Latest test questions (fallback)
router.get("/questions", auth, async (req, res) => {
  try {
    const latest = await Test.findOne().sort({ createdAt: -1 });
    if (!latest) return res.status(404).json({ message: "No tests found" });
    const questions = await Question.find({ testId: latest._id });
    res.status(200).json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;