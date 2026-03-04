const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    testId: { type: mongoose.Schema.Types.ObjectId, ref: "Test", required: true },
    attemptNumber: { type: Number, default: 1 },
    percentage: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    wrong: { type: Number, default: 0 },
    attempted: { type: Number, default: 0 },
    rank: { type: Number, default: null },
    totalStudents: { type: Number, default: 1000 },
    selected: { type: Boolean, default: true }, // ✅ false if below 40%
    subjectWisePerformance: [
      {
        subject: { type: String, required: true },
        correct: { type: Number, default: 0 },
        wrong: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.models.Result || mongoose.model("Result", resultSchema);