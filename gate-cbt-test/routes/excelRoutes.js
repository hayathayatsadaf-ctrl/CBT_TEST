const express = require("express");
const multer  = require("multer");
const { uploadExcel } = require("../controllers/excelController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith(".xlsx") || file.originalname.endsWith(".xls"))
      cb(null, true);
    else cb(new Error("Only Excel files allowed"));
  },
});

router.post("/upload", auth, upload.single("excel"), uploadExcel);
module.exports = router;