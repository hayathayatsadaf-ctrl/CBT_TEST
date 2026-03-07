const express = require("express");
const router  = express.Router();
const { submitTest, getLatestResult, checkAttempts, downloadResultPdf } = require("../controllers/resultController");
const auth = require("../middleware/authMiddleware");

router.post("/submit",              submitTest);
router.get("/latest",         auth, getLatestResult);
router.get("/attempts/:testId", auth, checkAttempts);
router.get("/download-pdf",   auth, downloadResultPdf);

module.exports = router;
