const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: "student",
    },
    rollNumber: {
      type: String,
      unique: true,
    },
    profileImage: {
      type: String,
      default: "", // URL or base64
    },
    attempts: {
      type: Number,
      default: 0, // ✅ Track number of attempts
    },
    lastScore: {
      type: Number,
      default: 0, // ✅ Track last score percentage
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);