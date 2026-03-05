const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// ✅ Fix pdf-parse test file issue on Render
const pdfTestDir = path.join(__dirname, "node_modules", "pdf-parse", "test", "data");
const pdfTestFile = path.join(pdfTestDir, "05-versions-space.pdf");
if (!fs.existsSync(pdfTestDir)) fs.mkdirSync(pdfTestDir, { recursive: true });
if (!fs.existsSync(pdfTestFile)) {
  fs.writeFileSync(pdfTestFile, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF");
  console.log("✅ pdf-parse test file created");
}

const app = express();

app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://cbt-test-backend.onrender.com",
    /\.onrender\.com$/,
    /\.vercel\.app$/,
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.options("*", cors());

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── API Routes ──────────────────────────────────────────────────
const authRoutes   = require("./routes/authRoutes");
const pdfRoutes    = require("./routes/pdfRoutes");
const resultRoutes = require("./routes/resultRoutes");
const excelRoutes  = require("./routes/excelRoutes");

app.use("/api/auth",   authRoutes);
app.use("/api/pdf",    pdfRoutes);
app.use("/api/result", resultRoutes);
app.use("/api/excel",  excelRoutes);

// ── Serve React Frontend ────────────────────────────────────────
const frontendBuild = path.join(__dirname, "../client/build");

if (fs.existsSync(frontendBuild)) {
  app.use(express.static(frontendBuild));
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendBuild, "index.html"));
  });
  console.log("✅ Serving React frontend");
} else {
  app.get("/", (req, res) => res.send("CBT Backend Running ✅"));
}

// ── MongoDB + Server ────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => console.error("MongoDB error:", err));