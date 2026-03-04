const express = require("express");
const router = express.Router();
const { submitTest, getLatestResult, checkAttempts } = require("../controllers/resultController");
const auth = require("../middleware/authMiddleware");

router.post("/submit", auth, submitTest);
router.get("/latest", auth, getLatestResult);
router.get("/attempts/:testId", auth, checkAttempts); // ✅ Check attempts per test

module.exports = router;