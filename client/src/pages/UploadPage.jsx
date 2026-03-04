import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

const UploadPage = () => {
  const [pyqFile, setPyqFile] = useState(null);
  const [answerFile, setAnswerFile] = useState(null);
  const [totalStudents, setTotalStudents] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!pyqFile || !answerFile) {
      setError("Please select both PDF files before uploading.");
      return;
    }
    if (!totalStudents || totalStudents < 1) {
      setError("Please enter a valid number of students.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const formData = new FormData();
      formData.append("pyq", pyqFile);
      formData.append("answerKey", answerFile);
      formData.append("totalStudents", totalStudents);

      const res = await API.post("/pdf/upload", formData);
      setResult(res.data);
    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      setError(
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        "Upload failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>📄 Upload Question Paper</h2>

        <div style={styles.box}>
          <label>Total Students Appearing</label>
          <input
            type="number"
            min="1"
            value={totalStudents}
            onChange={(e) => setTotalStudents(parseInt(e.target.value) || 1)}
            style={styles.input}
          />
        </div>

        <div style={styles.box}>
          <label>🗒️ PYQ (Question Paper) PDF</label>
          <br />
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setPyqFile(e.target.files[0])}
          />
          {pyqFile && <p style={{ color: "green" }}>✅ {pyqFile.name}</p>}
        </div>

        <div style={styles.box}>
          <label>🔑 Answer Key PDF</label>
          <br />
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setAnswerFile(e.target.files[0])}
          />
          {answerFile && <p style={{ color: "green" }}>✅ {answerFile.name}</p>}
        </div>

        <button onClick={handleUpload} disabled={loading} style={styles.button}>
          {loading ? "⏳ Uploading & Parsing..." : "🚀 Upload PDFs"}
        </button>

        {result && (
          <div style={styles.success}>
            <h3>✅ Upload Successful!</h3>
            <p>Total Questions: <strong>{result.totalQuestions}</strong></p>
            <p>MCQ: {result.mcqQuestions} | NAT: {result.natQuestions}</p>
            <p>Total Marks: {result.totalPossibleMarks}</p>
            <p>Sections: <strong>{result.sections?.join(", ")}</strong></p>
            <button onClick={() => navigate("/test")} style={styles.goBtn}>
              Go to Test →
            </button>
          </div>
        )}

        {error && (
          <div style={styles.error}>
            ❌ {error}
          </div>
        )}

        <div style={styles.formatBox}>
          <p>📌 <strong>PDF Format Requirements</strong></p>
          <p><strong>Question Paper:</strong> Each question must start with <code>Q1.</code>, <code>Q2.</code> etc.</p>
          <p><strong>Options:</strong> Must be labeled <code>(A)</code>, <code>(B)</code>, <code>(C)</code>, <code>(D)</code></p>
          <p><strong>Sections:</strong> Add a line like <code>Section: Aptitude</code> before each section</p>
          <p><strong>Answer Key:</strong> Each line like <code>1. A</code> or <code>Answer: B</code></p>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    background: "#f4f4f4",
    padding: "40px 16px",
  },
  card: {
    background: "#fff",
    padding: "30px",
    borderRadius: "12px",
    width: "100%",
    maxWidth: "520px",
    boxShadow: "0 5px 20px rgba(0,0,0,0.1)",
  },
  title: { marginBottom: "20px" },
  box: { marginBottom: "20px" },
  input: { width: "100%", padding: "8px", marginTop: "5px" },
  button: {
    width: "100%", padding: "12px",
    background: "#ff8c00", color: "#fff",
    border: "none", borderRadius: "6px", cursor: "pointer",
    fontSize: "1rem", fontWeight: "bold",
  },
  goBtn: {
    marginTop: "10px", padding: "10px 20px",
    background: "#2e7d32", color: "#fff",
    border: "none", borderRadius: "6px", cursor: "pointer",
  },
  success: {
    marginTop: "20px", padding: "15px",
    background: "#e8f5e9", borderRadius: "6px",
  },
  error: {
    marginTop: "20px", padding: "15px",
    background: "#ffebee", color: "red", borderRadius: "6px",
  },
  formatBox: {
    marginTop: "24px", padding: "14px",
    background: "#fff8e1", borderRadius: "8px",
    fontSize: "0.82rem", lineHeight: "1.8",
  },
};

export default UploadPage;