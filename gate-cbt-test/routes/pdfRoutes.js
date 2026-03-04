const express = require("express");
const multer = require("multer");
const { uploadPDFs, getTests, getQuestionsByTest, getAllQuestions } = require("../controllers/pdfController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// ✅ Use memory storage — works on Render (no disk needed)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files allowed"));
  },
});

router.post("/upload", auth, upload.fields([
  { name: "pyq", maxCount: 1 },
  { name: "answerKey", maxCount: 1 },
]), uploadPDFs);

router.get("/tests", auth, getTests);
router.get("/questions/:testId", auth, getQuestionsByTest);
router.get("/questions", auth, getAllQuestions);

module.exports = router;