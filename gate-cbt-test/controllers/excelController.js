const XLSX = require("xlsx");
const Question = require("../models/Question");
const Test = require("../models/Test");

exports.uploadExcel = async (req, res) => {
  let test = null;
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Excel file required" });
    }

    const testName      = req.body.testName      || `Test ${new Date().toLocaleDateString()}`;
    const testYear      = parseInt(req.body.year) || new Date().getFullYear();
    const totalStudents = parseInt(req.body.totalStudents) || 1000;

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json(sheet);

    if (!rows || rows.length === 0) {
      return res.status(400).json({ message: "Excel mein koi data nahi mila" });
    }

    console.log(`Excel rows: ${rows.length}, Sample:`, rows[0]);

    test = new Test({ name: testName, year: testYear, uploadedBy: "admin", totalStudents });
    await test.save();

    const questions = [];

    for (const row of rows) {
      const qno     = parseInt(row["QuestionNo"]  || row["questionNo"]     || 0);
      const qtext   = String(row["Question"]      || row["question"]       || "").trim();
      const optA    = String(row["OptionA"]        || row["Option A"]       || "").trim();
      const optB    = String(row["OptionB"]        || row["Option B"]       || "").trim();
      const optC    = String(row["OptionC"]        || row["Option C"]       || "").trim();
      const optD    = String(row["OptionD"]        || row["Option D"]       || "").trim();
      const correct = String(row["CorrectAnswer"]  || row["correctAnswer"]  || row["Answer"] || "").trim();
      const marks   = parseInt(row["Marks"]        || row["marks"]          || 1);
      const section = String(row["Section"]        || row["section"]        || "General").trim();

      if (!qtext || qtext === "undefined") continue;
      if (!correct || correct === "undefined" || correct === "MARKS_TO_ALL") continue;

      const options = [optA, optB, optC, optD].filter(o => o && o !== "undefined");
      const type    = options.length >= 2 ? "MCQ" : "NAT";

      questions.push({
        testId: test._id, questionNumber: qno, question: qtext,
        options, correctAnswer: correct, section, subject: section, topic: section,
        type, marks: isNaN(marks) ? 1 : marks,
        negativeMarks: type === "NAT" ? 0 : marks === 2 ? 0.66 : 0.33,
        year: testYear,
      });
    }

    if (questions.length === 0) {
      await Test.findByIdAndDelete(test._id);
      return res.status(400).json({
        message: "Koi valid question nahi mila. Excel format check karo.",
        debug: { totalRows: rows.length, sampleRow: rows[0] },
      });
    }

    await Question.insertMany(questions);
    await Test.findByIdAndUpdate(test._id, { totalQuestions: questions.length });

    return res.status(200).json({
      message: "✅ Excel import successful!",
      testId: test._id, testName: test.name,
      totalQuestions: questions.length,
      mcqQuestions:   questions.filter(q => q.type === "MCQ").length,
      natQuestions:   questions.filter(q => q.type === "NAT").length,
      totalMarks:     questions.reduce((s, q) => s + q.marks, 0),
      totalStudents:  test.totalStudents,
      sections:       [...new Set(questions.map(q => q.section))],
    });

  } catch (err) {
    console.error("Excel upload error:", err);
    if (test?._id) await Test.findByIdAndDelete(test._id).catch(() => {});
    return res.status(500).json({ message: "Import failed", error: err.message });
  }
};