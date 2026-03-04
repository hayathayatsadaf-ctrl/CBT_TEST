import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

const UploadPage = () => {
  const [pyqFile, setPyqFile] = useState(null);
  const [answerFile, setAnswerFile] = useState(null);
  const [profileImage, setProfileImage] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [totalStudents, setTotalStudents] = useState(1000);
  const [paperSet, setPaperSet] = useState("A");
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const navigate = useNavigate();

  const handleProfileImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setProfileImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setProfilePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleProfileUpload = async () => {
    if (!profileImage) return;
    setProfileLoading(true);
    try {
      const formData = new FormData();
      formData.append("profileImage", profileImage);
      await API.post("/auth/upload-profile", formData);
      setProfileSuccess(true);
    } catch (err) {
      alert(err.response?.data?.message || "Profile image upload failed.");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!pyqFile || !answerFile) {
      setError("Please select both PDF files before uploading.");
      return;
    }
    if (!totalStudents || totalStudents < 1) {
      setError("Please enter a valid number of students.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("pyq", pyqFile);
      formData.append("answerKey", answerFile);
      formData.append("totalStudents", totalStudents);
      formData.append("setCode", paperSet);
      const res = await API.post("/pdf/upload", formData);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        {/* Profile Image Upload */}
        <div style={styles.profileSection}>
          <h3 style={styles.profileTitle}>👤 Profile Photo</h3>
          <div style={styles.profileRow}>
            <div style={styles.avatarPreview}>
              {profilePreview
                ? <img src={profilePreview} alt="preview" style={styles.avatarImg} />
                : <span style={styles.avatarPlaceholder}>📷</span>
              }
            </div>
            <div style={styles.profileActions}>
              <input type="file" accept="image/*" onChange={handleProfileImage}
                style={{ fontSize: "13px", marginBottom: "8px" }} />
              {profileImage && (
                <button onClick={handleProfileUpload} disabled={profileLoading}
                  style={profileLoading ? { ...styles.profileBtn, ...styles.btnDisabled } : styles.profileBtn}>
                  {profileLoading ? "Uploading..." : "📤 Save Photo"}
                </button>
              )}
              {profileSuccess && <p style={{ color: "#4caf50", fontSize: "13px", marginTop: "6px" }}>✅ Photo saved!</p>}
            </div>
          </div>
        </div>

        <hr style={{ margin: "24px 0", borderColor: "#eee" }} />

        <h2 style={styles.title}>📄 Upload Question Paper</h2>
        <p style={styles.subtitle}>Upload PYQ and Answer Key PDFs to populate the test</p>

        {/* Total Students */}
        <div style={styles.studentsBox}>
          <label style={styles.label}>👥 Total Students Appearing in Exam</label>
          <input
            type="number"
            min="1"
            value={totalStudents}
            onChange={(e) => setTotalStudents(parseInt(e.target.value) || 1)}
            style={styles.numberInput}
            placeholder="e.g. 3000"
          />
          <p style={styles.studentsHint}>
            Rank will be calculated out of <strong>{totalStudents.toLocaleString()}</strong> students
          </p>
          <p style={{ marginTop: "10px", fontWeight: "bold" }}>Question Paper Set</p>
          <select
            value={paperSet}
            onChange={e => setPaperSet(e.target.value)}
            style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #ccc", fontSize: "16px", width: "100%" }}
          >
            <option value="A">Set A</option>
            <option value="B">Set B</option>
            <option value="C">Set C</option>
            <option value="D">Set D</option>
          </select>
        </div>

        {/* PYQ Upload */}
        <div style={styles.uploadBox}>
          <label style={styles.label}>📝 PYQ (Question Paper) PDF</label>
          <input type="file" accept="application/pdf"
            onChange={(e) => setPyqFile(e.target.files[0])} style={styles.fileInput} />
          {pyqFile && <p style={styles.fileName}>✅ {pyqFile.name}</p>}
        </div>

        {/* Answer Key Upload */}
        <div style={styles.uploadBox}>
          <label style={styles.label}>🔑 Answer Key PDF</label>
          <input type="file" accept="application/pdf"
            onChange={(e) => setAnswerFile(e.target.files[0])} style={styles.fileInput} />
          {answerFile && <p style={styles.fileName}>✅ {answerFile.name}</p>}
        </div>

        <button onClick={handleUpload} disabled={loading}
          style={loading ? { ...styles.btn, ...styles.btnDisabled } : styles.btn}>
          {loading ? "⏳ Uploading & Parsing..." : "🚀 Upload PDFs"}
        </button>

        {/* Excel Upload Link */}
        <div style={styles.excelBox}>
          <p style={{ margin: 0, fontSize: "14px", color: "#555" }}>
            📊 Ya Excel file upload karo →{" "}
            <a href="/upload-excel" style={{ color: "#1a3a8f", fontWeight: "bold" }}>
              Excel Upload
            </a>
          </p>
        </div>

        {result && (
          <div style={styles.success}>
            <h3>✅ Upload Successful!</h3>
            <p>Total Questions: <strong>{result.totalQuestions}</strong></p>
            <p>Total Students: <strong>{result.totalStudents?.toLocaleString()}</strong></p>
            {result.sections && <p>Sections: <strong>{result.sections.join(", ")}</strong></p>}
            <button onClick={() => navigate("/test")} style={styles.goBtn}>Go to Test →</button>
          </div>
        )}

        {error && <div style={styles.errorBox}><p>❌ {error}</p></div>}

        <div style={styles.guide}>
          <h4>📌 PDF Format Requirements</h4>
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
  container: { minHeight: "100vh", backgroundColor: "#f5f5f5", display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" },
  card: { backgroundColor: "#fff", borderRadius: "12px", padding: "40px", width: "100%", maxWidth: "550px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" },
  profileSection: { backgroundColor: "#f0f4ff", borderRadius: "10px", padding: "20px", marginBottom: "8px" },
  profileTitle: { fontSize: "16px", fontWeight: "700", color: "#1a3a8f", marginBottom: "14px" },
  profileRow: { display: "flex", alignItems: "center", gap: "20px" },
  avatarPreview: { width: "80px", height: "80px", borderRadius: "50%", backgroundColor: "#1a3a8f", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  avatarPlaceholder: { fontSize: "28px" },
  profileActions: { display: "flex", flexDirection: "column" },
  profileBtn: { padding: "8px 16px", backgroundColor: "#1a3a8f", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: "bold", cursor: "pointer" },
  studentsBox: { backgroundColor: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: "10px", padding: "18px", marginBottom: "20px" },
  numberInput: { width: "100%", padding: "10px 14px", fontSize: "18px", fontWeight: "700", border: "2px solid #4ade80", borderRadius: "8px", textAlign: "center", color: "#166534", outline: "none", boxSizing: "border-box", marginTop: "8px" },
  studentsHint: { fontSize: "13px", color: "#166534", marginTop: "8px", marginBottom: "10px" },
  title: { fontSize: "24px", fontWeight: "bold", marginBottom: "8px", color: "#1a1a1a" },
  subtitle: { color: "#666", marginBottom: "30px", fontSize: "14px" },
  uploadBox: { backgroundColor: "#f9f9f9", border: "2px dashed #ddd", borderRadius: "8px", padding: "20px", marginBottom: "20px" },
  label: { display: "block", fontWeight: "600", marginBottom: "10px", fontSize: "15px", color: "#333" },
  fileInput: { width: "100%", fontSize: "14px" },
  fileName: { marginTop: "8px", fontSize: "13px", color: "#4caf50", fontWeight: "500" },
  btn: { width: "100%", padding: "14px", backgroundColor: "#ff8c00", color: "#fff", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: "bold", cursor: "pointer", marginTop: "10px" },
  btnDisabled: { backgroundColor: "#ccc", cursor: "not-allowed" },
  excelBox: { marginTop: "12px", padding: "12px", backgroundColor: "#f0f4ff", borderRadius: "8px", textAlign: "center" },
  success: { marginTop: "20px", backgroundColor: "#e8f5e9", border: "1px solid #4caf50", borderRadius: "8px", padding: "20px", textAlign: "center", color: "#2e7d32" },
  goBtn: { marginTop: "12px", padding: "10px 24px", backgroundColor: "#4caf50", color: "#fff", border: "none", borderRadius: "6px", fontSize: "15px", cursor: "pointer", fontWeight: "bold" },
  errorBox: { marginTop: "20px", backgroundColor: "#ffebee", border: "1px solid #f44336", borderRadius: "8px", padding: "15px", color: "#c62828", textAlign: "center" },
  guide: { marginTop: "30px", backgroundColor: "#fff8e1", border: "1px solid #ffe082", borderRadius: "8px", padding: "16px", fontSize: "13px", color: "#555", lineHeight: "1.8" },
};

export default UploadPage;
