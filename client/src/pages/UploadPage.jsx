import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

const UploadPage = () => {
  const [pyqFile, setPyqFile] = useState(null);
  const [answerFile, setAnswerFile] = useState(null);
  const [profileImage, setProfileImage] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [totalStudents, setTotalStudents] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const navigate = useNavigate();

  // ================= Profile Image =================
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

    try {
      setProfileLoading(true);

      const formData = new FormData();
      formData.append("profileImage", profileImage);

      // ❌ DO NOT set Content-Type manually
      await API.post("/auth/upload-profile", formData);

      setProfileSuccess(true);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Profile image upload failed."
      );
    } finally {
      setProfileLoading(false);
    }
  };

  // ================= PDF Upload =================
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

      console.log("Uploading files...");

      // ❌ DO NOT set headers manually
      const res = await API.post("/pdf/upload", formData);

      setResult(res.data);
    } catch (err) {
      console.error("UPLOAD ERROR:", err);

      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
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

        {/* Total Students */}
        <div style={styles.box}>
          <label>Total Students Appearing</label>
          <input
            type="number"
            min="1"
            value={totalStudents}
            onChange={(e) =>
              setTotalStudents(parseInt(e.target.value) || 1)
            }
            style={styles.input}
          />
        </div>

        {/* PYQ */}
        <div style={styles.box}>
          <label>PYQ PDF</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setPyqFile(e.target.files[0])}
          />
          {pyqFile && <p>✅ {pyqFile.name}</p>}
        </div>

        {/* Answer Key */}
        <div style={styles.box}>
          <label>Answer Key PDF</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setAnswerFile(e.target.files[0])}
          />
          {answerFile && <p>✅ {answerFile.name}</p>}
        </div>

        <button
          onClick={handleUpload}
          disabled={loading}
          style={styles.button}
        >
          {loading ? "Uploading & Parsing..." : "Upload PDFs"}
        </button>

        {/* Success */}
        {result && (
          <div style={styles.success}>
            <h3>Upload Successful ✅</h3>
            <p>Total Questions: {result.totalQuestions}</p>
            <p>Total Students: {result.totalStudents}</p>
            <button onClick={() => navigate("/test")}>
              Go to Test →
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={styles.error}>
            ❌ {error}
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#f4f4f4",
  },
  card: {
    background: "#fff",
    padding: "30px",
    borderRadius: "12px",
    width: "100%",
    maxWidth: "500px",
    boxShadow: "0 5px 20px rgba(0,0,0,0.1)",
  },
  title: {
    marginBottom: "20px",
  },
  box: {
    marginBottom: "20px",
  },
  input: {
    width: "100%",
    padding: "8px",
    marginTop: "5px",
  },
  button: {
    width: "100%",
    padding: "12px",
    background: "#ff8c00",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  success: {
    marginTop: "20px",
    padding: "15px",
    background: "#e8f5e9",
    borderRadius: "6px",
  },
  error: {
    marginTop: "20px",
    padding: "15px",
    background: "#ffebee",
    color: "red",
    borderRadius: "6px",
  },
};

export default UploadPage;