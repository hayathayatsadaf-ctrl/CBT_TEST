const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true, // ✅ Every question belongs to a test
    },
    question: { type: String, required: true, trim: true },
    options: {
      type: [String],
      required: true,
      validate: [arr => arr.length === 4, "There must be exactly 4 options"],
    },
    correctAnswer: { type: String, required: true },
    section: { type: String, default: "Aptitude" },
    subject: { type: String, trim: true },
    topic: { type: String, trim: true },
    marks: { type: Number, default: 1 },
    negativeMarks: { type: Number, default: 0 },
    year: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Question", questionSchema);