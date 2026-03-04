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
    options: {
      type: [String],
      // ✅ Flexible: MCQ needs 2-4 options, NAT needs 0
      validate: {
        validator: function (arr) {
          if (this.type === "NAT") return arr.length === 0;
          return arr.length >= 2 && arr.length <= 4;
        },
        message: "MCQ questions must have 2-4 options. NAT questions must have 0 options.",
      },
    },
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