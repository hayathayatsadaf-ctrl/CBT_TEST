const mongoose = require("mongoose");

const testSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    year: { type: Number, default: new Date().getFullYear() },
    uploadedBy: { type: String, default: "admin" },
    totalQuestions: { type: Number, default: 0 },
    totalStudents: { type: Number, default: 1000 }, // ✅ Added
  },
  { timestamps: true }
);

module.exports = mongoose.models.Test || mongoose.model("Test", testSchema);