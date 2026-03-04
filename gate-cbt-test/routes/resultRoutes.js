const express = require("express");
const router  = express.Router();
const {
  submitTest,
  getLatestResult,
  checkAttempts,
  downloadResultPdf
} = require("../controllers/resultController");

// ✅ Try both middleware names
let auth;
try {
  auth = require("../middleware/authMiddleware");
} catch (e) {
  try {
    auth = require("../middleware/auth");
  } catch (e2) {
    auth = (req, res, next) => next();
  }
}

router.post("/submit",          auth, submitTest);
router.get("/latest",           auth, getLatestResult);
router.get("/attempts/:testId", auth, checkAttempts);
router.get("/download-pdf",     auth, downloadResultPdf);

module.exports = router;