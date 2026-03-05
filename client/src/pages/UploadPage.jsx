import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

const UploadPage = () => {
  const [profileImage, setProfileImage] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
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

        {/* Excel Upload */}
        <div style={styles.excelSection}>
          <div style={styles.excelIcon}>📊</div>
          <h2 style={styles.title}>Upload Question Paper</h2>
          <p style={styles.subtitle}>Excel file upload karo — questions automatically save ho jayenge</p>
          <button onClick={() => navigate("/upload-excel")} style={styles.excelBtn}>
            📤 Upload Excel File
          </button>
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
  btnDisabled: { backgroundColor: "#ccc", cursor: "not-allowed" },
  excelSection: { textAlign: "center", padding: "20px 0" },
  excelIcon: { fontSize: "48px", marginBottom: "12px" },
  title: { fontSize: "24px", fontWeight: "bold", marginBottom: "8px", color: "#1a1a1a" },
  subtitle: { color: "#666", marginBottom: "24px", fontSize: "14px" },
  excelBtn: { width: "100%", padding: "14px", backgroundColor: "#1a3a8f", color: "#fff", border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: "bold", cursor: "pointer" },
};

export default UploadPage;
