const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const User = require("../models/User");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// ✅ Create uploads/profiles folder if it doesn't exist
const profileDir = "uploads/profiles";
if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

// ✅ Multer config for profile images
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/profiles/"),
  filename: (req, file, cb) => cb(null, `profile_${req.user.id}${path.extname(file.originalname)}`),
});
const profileUpload = multer({
  storage: profileStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"));
  },
});

function generateRollNumber() {
  const year = new Date().getFullYear();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `GATE${year}${random}`;
}

// ── REGISTER ──────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existUser = await User.findOne({ email });
    if (existUser) return res.status(400).json({ message: "User already exists" });

    const hashPassword = await bcrypt.hash(password, 10);

    let rollNumber;
    let isUnique = false;
    while (!isUnique) {
      rollNumber = generateRollNumber();
      const existing = await User.findOne({ rollNumber });
      if (!existing) isUnique = true;
    }

    const user = new User({ name, email, password: hashPassword, rollNumber });
    await user.save();

    res.status(201).json({
      message: "User Registered Successfully",
      user: { _id: user._id, name: user.name, email: user.email, rollNumber: user.rollNumber },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        rollNumber: user.rollNumber,
        profileImage: user.profileImage,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET CURRENT USER ──────────────────────────────────────────────────────────
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── UPLOAD PROFILE IMAGE ──────────────────────────────────────────────────────
router.post("/upload-profile", auth, profileUpload.single("profileImage"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image uploaded" });

    // ✅ Use BASE_URL env variable — works both locally and on Render
    const baseUrl = process.env.BASE_URL || "http://localhost:5000";
    const imageUrl = `${baseUrl}/uploads/profiles/${req.file.filename}`;

    await User.findByIdAndUpdate(req.user.id, { profileImage: imageUrl });

    res.status(200).json({ message: "Profile image updated", profileImage: imageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;