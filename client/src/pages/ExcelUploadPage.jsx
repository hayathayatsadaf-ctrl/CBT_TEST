import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

const ExcelUploadPage = () => {
  const [file, setFile]         = useState(null);
  const [testName, setTestName] = useState("");
  const [year, setYear]         = useState(new Date().getFullYear());
  const [students, setStudents] = useState(1000);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!file) return setError("Excel file select karo");
    setLoading(true); setError(null); setResult(null);
    try {
      const fd = new FormData();
      fd.append("excel", file);  // ← "excelFile" ki jagah "excel"
      fd.append("testName", testName || `GATE ${year}`);
      fd.append("year", year);
      fd.append("totalStudents", students);
      const res = await API.post("/excel/upload", fd);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h2 style={S.title}>📊 Excel Upload</h2>
        <p style={S.sub}>Excel ya CSV file upload karo — questions automatically save ho jayenge</p>

        {/* Test Info */}
        <div style={S.row}>
          <div style={S.field}>
            <label style={S.label}>Test Name</label>
            <input style={S.input} placeholder="GATE CS 2012"
              value={testName} onChange={e => setTestName(e.target.value)} />
          </div>
          <div style={S.field}>
            <label style={S.label}>Year</label>
            <input style={S.input} type="number" value={year}
              onChange={e => setYear(e.target.value)} />
          </div>
          <div style={S.field}>
            <label style={S.label}>Total Students</label>
            <input style={S.input} type="number" value={students}
              onChange={e => setStudents(e.target.value)} />
          </div>
        </div>

        {/* File Upload */}
        <div style={S.dropzone} onClick={() => document.getElementById("xlFile").click()}>
          <input id="xlFile" type="file" accept=".xlsx,.xls,.csv"
            style={{ display: "none" }} onChange={e => setFile(e.target.files[0])} />
          {file ? (
            <div>
              <div style={{ fontSize: 32 }}>📊</div>
              <div style={S.fileName}>{file.name}</div>
              <div style={S.fileSize}>({(file.size / 1024).toFixed(1)} KB)</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 40 }}>📂</div>
              <div style={S.dropText}>Click karo ya file drag karo</div>
              <div style={S.dropSub}>.xlsx, .xls, .csv supported</div>
            </div>
          )}
        </div>

        {/* Format Guide */}
        <div style={S.guide}>
          <strong>📋 Required Columns:</strong>
          <div style={S.cols}>
            {["QuestionNo","Question","OptionA","OptionB","OptionC","OptionD","CorrectAnswer","Marks","Section"].map(c => (
              <span key={c} style={S.col}>{c}</span>
            ))}
          </div>
          <div style={S.note}>
            💡 CorrectAnswer mein option ka pura text likho (e.g. "Both I1 and I2 are correct")
          </div>
        </div>

        {/* Upload Button */}
        <button onClick={handleUpload} disabled={loading || !file} style={{
          ...S.btn, opacity: loading || !file ? 0.6 : 1
        }}>
          {loading ? "⏳ Uploading..." : "🚀 Upload Excel"}
        </button>

        {/* Success */}
        {result && (
          <div style={S.success}>
            <div style={S.successTitle}>✅ Upload Successful!</div>
            <div style={S.successInfo}>
              <span>📝 {result.totalQuestions} Questions</span>
              <span>👥 {result.totalStudents} Students</span>
              <span>📚 {result.sections?.join(", ")}</span>
            </div>
            <button style={S.goBtn} onClick={() => navigate("/test")}>
              Test Shuru Karo →
            </button>
          </div>
        )}

        {/* Error */}
        {error && <div style={S.error}>❌ {error}</div>}
      </div>
    </div>
  );
};

const S = {
  page:        { minHeight:"100vh", display:"flex", justifyContent:"center", alignItems:"center", background:"#f0f4ff", padding:"20px" },
  card:        { background:"#fff", borderRadius:"16px", padding:"32px", width:"100%", maxWidth:"620px", boxShadow:"0 8px 32px rgba(0,0,0,0.1)" },
  title:       { margin:"0 0 4px", fontSize:"24px", color:"#1a3a8f" },
  sub:         { margin:"0 0 24px", color:"#666", fontSize:"14px" },
  row:         { display:"flex", gap:"12px", marginBottom:"20px", flexWrap:"wrap" },
  field:       { flex:1, minWidth:"140px" },
  label:       { display:"block", fontSize:"12px", fontWeight:"600", color:"#444", marginBottom:"4px" },
  input:       { width:"100%", padding:"8px 12px", borderRadius:"8px", border:"1.5px solid #ddd", fontSize:"14px", boxSizing:"border-box" },
  dropzone:    { border:"2px dashed #1a3a8f", borderRadius:"12px", padding:"32px", textAlign:"center", cursor:"pointer", marginBottom:"20px", background:"#f8faff", transition:"background 0.2s" },
  fileName:    { fontSize:"16px", fontWeight:"600", color:"#1a3a8f", marginTop:"8px" },
  fileSize:    { fontSize:"12px", color:"#888" },
  dropText:    { fontSize:"16px", color:"#444", marginTop:"8px" },
  dropSub:     { fontSize:"12px", color:"#999", marginTop:"4px" },
  guide:       { background:"#f8faff", border:"1px solid #dde3ff", borderRadius:"10px", padding:"14px", marginBottom:"20px" },
  cols:        { display:"flex", flexWrap:"wrap", gap:"6px", marginTop:"8px" },
  col:         { background:"#1a3a8f", color:"#fff", borderRadius:"4px", padding:"2px 8px", fontSize:"11px", fontFamily:"monospace" },
  note:        { marginTop:"10px", fontSize:"12px", color:"#555" },
  btn:         { width:"100%", padding:"14px", background:"#ff8c00", color:"#fff", border:"none", borderRadius:"10px", fontSize:"16px", fontWeight:"700", cursor:"pointer" },
  success:     { marginTop:"20px", background:"#e8f5e9", border:"1px solid #a5d6a7", borderRadius:"10px", padding:"20px" },
  successTitle:{ fontSize:"18px", fontWeight:"700", color:"#2e7d32", marginBottom:"10px" },
  successInfo: { display:"flex", gap:"16px", flexWrap:"wrap", marginBottom:"14px", fontSize:"14px", color:"#444" },
  goBtn:       { background:"#2e7d32", color:"#fff", border:"none", borderRadius:"8px", padding:"10px 20px", cursor:"pointer", fontSize:"14px", fontWeight:"600" },
  error:       { marginTop:"16px", background:"#ffebee", border:"1px solid #ef9a9a", borderRadius:"8px", padding:"14px", color:"#c62828", fontSize:"14px" },
};

export default ExcelUploadPage;
