const mongoose = require("mongoose");

const testAttemptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    testId: { type: mongoose.Schema.Types.ObjectId, ref: "Test", required: true },
    attempts: { type: Number, default: 0 },
    lastScore: { type: Number, default: 0 },
  },
  { timestamps: true }
);

testAttemptSchema.index({ userId: 1, testId: 1 }, { unique: true });

module.exports = mongoose.models.TestAttempt || mongoose.model("TestAttempt", testAttemptSchema);