const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
    },
    question: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["MCQ", "NAT"],
      default: "MCQ",
    },
    // ✅ No validator — controller handles filtering
    options: { type: [String], default: [] },
    correctAnswer: { type: String, required: true },
    section: { type: String, default: "General" },
    subject: { type: String, trim: true },
    topic: { type: String, trim: true },
    marks: { type: Number, default: 1 },
    negativeMarks: { type: Number, default: 0 },
    year: { type: Number },
    questionNumber: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Question || mongoose.model("Question", questionSchema);