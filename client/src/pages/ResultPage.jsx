import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

const ResultPage = () => {
  const [result,      setResult]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [downloading, setDownloading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const res = await API.get("/result/latest");
        setResult(res.data);
      } catch (err) {
        console.error("Result fetch error:", err.response?.data || err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchResult();
  }, []);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await API.get("/result/download-pdf", { responseType: "blob" });
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href  = url;
      link.setAttribute("download", "GATE_Result.pdf");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("PDF download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return (
    <div style={styles.container}>
      <div style={styles.loadingBox}>
        <p style={{ fontSize: 40 }}>⏳</p>
        <p style={{ color: "#6b7280" }}>Loading your result...</p>
      </div>
    </div>
  );

  if (!result) return (
    <div style={styles.container}>
      <div style={styles.loadingBox}>
        <p style={{ fontSize: 48 }}>😕</p>
        <p style={{ color: "#6b7280" }}>No result found.</p>
        <button onClick={() => navigate("/")} style={styles.exitOnlyBtn}>Go Home</button>
      </div>
    </div>
  );

  const percentage     = parseFloat(result.percentage ?? 0);
  const pct            = percentage.toFixed(1);
  const passed         = percentage >= 50;
  const qualified      = percentage >= 40;
  const isFirstAttempt = result.attemptNumber === 1;
  const showRetry      = isFirstAttempt && passed;
  const skipped        = result.skipped ?? "—";

  const noRetryMessage = isFirstAttempt && !passed
    ? `Score ${pct}% — need 50% to unlock second attempt.`
    : result.attemptNumber >= 2
    ? "You have used both attempts for this test."
    : null;

  const circleColor = percentage >= 70 ? "#16a34a"
                    : percentage >= 50 ? "#1a3a8f"
                    : percentage >= 40 ? "#d97706"
                    : "#dc2626";

  const grade = percentage >= 85 ? "Excellent 🏅"
              : percentage >= 70 ? "Very Good 👍"
              : percentage >= 50 ? "Good ✅"
              : percentage >= 40 ? "Average ⚠️"
              : "Needs Work ❌";

  const analysis = percentage >= 85
    ? "Outstanding! You are in the top percentile. Keep up the great work."
    : percentage >= 70
    ? "Great score! Focus on weak subjects to push into top ranks."
    : percentage >= 50
    ? "You passed! Work on speed and accuracy to improve your rank."
    : percentage >= 40
    ? "You qualified the cutoff but did not pass. Practice more and retry."
    : "Below cutoff. Revise fundamentals and practice more mock tests.";

  const accuracy = result.attempted > 0
    ? ((result.correct / result.attempted) * 100).toFixed(0)
    : 0;

  const betterThan = result.totalStudents > 0
    ? Math.max(0, 100 - (result.rank / result.totalStudents) * 100).toFixed(1)
    : 0;

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        {/* HEADER */}
        <div style={styles.header}>
          <h2 style={styles.title}>📊 Test Result</h2>
          <p style={styles.subtitle}>GATE CBT · {new Date().getFullYear()}</p>
          <span style={styles.attemptBadge}>Attempt {result.attemptNumber} of 2</span>
        </div>

        {/* SCORE CIRCLE */}
        <div style={{ ...styles.scoreCircle, backgroundColor: circleColor }}>
          <div style={styles.scoreNumber}>{result.totalMarks}</div>
          <div style={styles.scoreLabel}>
            {result.totalPossibleMarks ? `/ ${result.totalPossibleMarks}` : "Marks"}
          </div>
        </div>

        {/* GRADE STRIP */}
        <div style={{
          ...styles.gradeStrip,
          backgroundColor: passed ? "#dcfce7" : qualified ? "#fef3c7" : "#fee2e2",
          color:           passed ? "#166534" : qualified ? "#92400e" : "#991b1b",
          border: `1px solid ${passed ? "#86efac" : qualified ? "#fcd34d" : "#fca5a5"}`,
        }}>
          {grade} &nbsp;·&nbsp; {pct}%
        </div>

        {/* STATS GRID */}
        <div style={styles.statsGrid}>
          <StatBox value={result.correct}   label="✅ Correct"   bg="#dcfce7" color="#16a34a" />
          <StatBox value={result.wrong}     label="❌ Wrong"     bg="#fee2e2" color="#dc2626" />
          <StatBox value={result.attempted} label="📝 Attempted" bg="#dbeafe" color="#1d4ed8" />
          <StatBox value={skipped}          label="⬜ Skipped"   bg="#fef9c3" color="#ca8a04" />
        </div>

        {/* RANK CARD */}
        {qualified ? (
          <div style={styles.rankCard}>
            <div style={styles.rankTop}>
              <span style={{ fontSize: 28 }}>🏆</span>
              <div>
                <div style={styles.rankText}>
                  Rank <strong style={{ fontSize: 22 }}>{result.rank?.toLocaleString()}</strong>
                </div>
                <div style={styles.rankSub}>
                  out of <strong>{result.totalStudents?.toLocaleString()}</strong> students
                </div>
              </div>
            </div>
            <div style={styles.rankBarBg}>
              <div style={{
                ...styles.rankBarFill,
                width: `${Math.max(5, 100 - (result.rank / result.totalStudents) * 100)}%`,
                backgroundColor: circleColor,
              }} />
            </div>
            <div style={styles.rankBarLabel}>
              Better than <strong>{betterThan}%</strong> of students
            </div>
          </div>
        ) : (
          <div style={styles.notSelectedBadge}>
            ❌ Not Qualified — Score below 40% cutoff
          </div>
        )}

        {/* ANALYSIS */}
        <div style={styles.analysisBox}>
          <div style={styles.analysisTitle}>📈 Performance Analysis</div>
          <p style={styles.analysisText}>{analysis}</p>

          <BarRow label="Score"    value={pct}      max={100} color={circleColor} />
          <BarRow label="Accuracy" value={accuracy} max={100} color="#16a34a" />
        </div>

        {/* SUBJECT-WISE */}
        {result.subjectWisePerformance?.length > 0 && (
          <div style={styles.subjectSection}>
            <h3 style={styles.subjectTitle}>📚 Subject-wise Performance</h3>
            {result.subjectWisePerformance.map((s, i) => {
              const tot = s.correct + s.wrong;
              const acc = tot > 0 ? ((s.correct / tot) * 100).toFixed(0) : 0;
              return (
                <div key={i} style={styles.subjectRow}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={styles.subjectName}>{s.subject}</span>
                    <span style={styles.accBadge}>{acc}% accuracy</span>
                  </div>
                  <div style={styles.subjectStats}>
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>✅ {s.correct} correct</span>
                    <span style={{ color: "#dc2626", fontWeight: 600 }}>❌ {s.wrong} wrong</span>
                  </div>
                  <div style={styles.breakdownBarBg}>
                    <div style={{
                      ...styles.breakdownBarFill,
                      width: `${acc}%`,
                      backgroundColor: acc >= 60 ? "#16a34a" : acc >= 40 ? "#d97706" : "#dc2626",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MARKS TABLE */}
        <div style={styles.marksTable}>
          <MarksRow label="Marks Obtained"  value={result.totalMarks} />
          <MarksRow label="Total Possible"  value={result.totalPossibleMarks} />
          <MarksRow label="Percentage"      value={`${pct}%`} color={circleColor} />
          <MarksRow
            label="Status"
            value={passed ? "PASS ✅" : "FAIL ❌"}
            color={passed ? "#16a34a" : "#dc2626"}
          />
        </div>

        {/* NO RETRY MSG */}
        {noRetryMessage && (
          <div style={styles.noRetryMsg}>ℹ️ {noRetryMessage}</div>
        )}

        {/* BUTTONS */}
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          style={{ ...styles.pdfBtn, opacity: downloading ? 0.7 : 1 }}
        >
          {downloading ? "⏳ Generating PDF..." : "📥 Download Result PDF"}
        </button>

        <div style={{ ...styles.btnRow, marginTop: 10 }}>
          {showRetry && (
            <button onClick={() => navigate("/test")} style={styles.retryBtn}>
              🔄 Retry Test
            </button>
          )}
          <button
            onClick={() => navigate("/")}
            style={showRetry ? styles.exitBtn : styles.exitOnlyBtn}
          >
            🚪 Exit
          </button>
        </div>

      </div>
    </div>
  );
};

// ── MINI COMPONENTS ────────────────────────────────────────────────
const StatBox = ({ value, label, bg, color }) => (
  <div style={{ backgroundColor: bg, borderRadius: 10, padding: "14px 10px", textAlign: "center" }}>
    <div style={{ fontSize: 26, fontWeight: "bold", color }}>{value}</div>
    <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{label}</div>
  </div>
);

const BarRow = ({ label, value, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
    <span style={{ fontSize: 12, color: "#6b7280", minWidth: 60 }}>{label}</span>
    <div style={{ flex: 1, backgroundColor: "#e5e7eb", borderRadius: 99, height: 8, overflow: "hidden" }}>
      <div style={{
        height: "100%", borderRadius: 99,
        width: `${Math.min(100, Math.max(0, parseFloat(value)))}%`,
        backgroundColor: color, transition: "width 0.8s ease",
      }} />
    </div>
    <span style={{ fontSize: 12, color: "#6b7280", minWidth: 36 }}>{value}%</span>
  </div>
);

const MarksRow = ({ label, value, color = "#1a3a8f" }) => (
  <>
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0" }}>
      <span style={{ fontSize: 13, color: "#6b7280" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{value}</span>
    </div>
    <div style={{ height: 1, backgroundColor: "#bae6fd" }} />
  </>
);

// ── STYLES ─────────────────────────────────────────────────────────
const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #1a3a8f 0%, #0d2461 100%)",
    display: "flex", justifyContent: "center", alignItems: "flex-start",
    padding: "30px 16px",
  },
  loadingBox: {
    backgroundColor: "#fff", borderRadius: 16, padding: 40,
    textAlign: "center", marginTop: 80,
  },
  card: {
    backgroundColor: "#fff", borderRadius: 16, padding: "36px 28px",
    width: "100%", maxWidth: 580,
    boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
  },
  header:      { textAlign: "center", marginBottom: 24 },
  title:       { fontSize: 26, fontWeight: "bold", color: "#1a3a8f", margin: 0 },
  subtitle:    { color: "#6b7280", fontSize: 13, marginTop: 4 },
  attemptBadge: {
    display: "inline-block", marginTop: 8,
    backgroundColor: "#dbeafe", color: "#1a3a8f",
    fontSize: 12, fontWeight: 700, padding: "4px 14px", borderRadius: 20,
  },
  scoreCircle: {
    width: 130, height: 130, borderRadius: "50%",
    display: "flex", flexDirection: "column",
    justifyContent: "center", alignItems: "center",
    margin: "0 auto 20px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
  },
  scoreNumber: { fontSize: 38, fontWeight: "bold", color: "#fff" },
  scoreLabel:  { fontSize: 12, color: "rgba(255,255,255,0.8)" },
  gradeStrip: {
    textAlign: "center", fontSize: 15, fontWeight: 700,
    padding: "10px 16px", borderRadius: 8, marginBottom: 20,
  },
  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 },
  rankCard: {
    backgroundColor: "#fefce8", border: "1px solid #fde68a",
    borderRadius: 12, padding: "16px 20px", textAlign: "center", marginBottom: 20,
  },
  rankTop:  { display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 8 },
  rankText: { fontSize: 16, color: "#92400e", fontWeight: 600 },
  rankSub:  { fontSize: 13, color: "#78716c", marginTop: 2 },
  rankBarBg: {
    backgroundColor: "#e5e7eb", borderRadius: 99,
    height: 8, margin: "10px 0 4px", overflow: "hidden",
  },
  rankBarFill:  { height: "100%", borderRadius: 99, transition: "width 1s ease" },
  rankBarLabel: { fontSize: 12, color: "#78716c" },
  notSelectedBadge: {
    textAlign: "center", fontSize: 15, fontWeight: 700,
    backgroundColor: "#fee2e2", color: "#991b1b",
    padding: 14, borderRadius: 8, marginBottom: 20,
    border: "1px solid #fca5a5",
  },
  analysisBox: {
    backgroundColor: "#f8fafc", border: "1px solid #e2e8f0",
    borderRadius: 12, padding: "16px 18px", marginBottom: 20,
  },
  analysisTitle: { fontSize: 14, fontWeight: 700, color: "#1a3a8f", marginBottom: 6 },
  analysisText:  { fontSize: 13, color: "#374151", lineHeight: 1.6, margin: "0 0 8px" },
  breakdownBarBg: {
    flex: 1, backgroundColor: "#e5e7eb",
    borderRadius: 99, height: 8, overflow: "hidden",
  },
  breakdownBarFill: { height: "100%", borderRadius: 99, transition: "width 0.8s ease" },
  subjectSection: { marginBottom: 20 },
  subjectTitle:   { fontSize: 15, fontWeight: "bold", color: "#1a3a8f", marginBottom: 12 },
  subjectRow: {
    backgroundColor: "#f9fafb", border: "1px solid #e5e7eb",
    borderRadius: 10, padding: "12px 14px", marginBottom: 10,
  },
  subjectStats: { display: "flex", gap: 14, marginTop: 6, marginBottom: 6, flexWrap: "wrap" },
  subjectName:  { fontWeight: 700, color: "#1f2937", fontSize: 14 },
  accBadge: {
    backgroundColor: "#dbeafe", color: "#1d4ed8",
    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
  },
  marksTable: {
    backgroundColor: "#f0f9ff", border: "1px solid #bae6fd",
    borderRadius: 12, padding: "16px 20px", marginBottom: 20,
  },
  noRetryMsg: {
    backgroundColor: "#fff7ed", border: "1px solid #fed7aa",
    color: "#9a3412", borderRadius: 8,
    padding: "12px 16px", fontSize: 13,
    marginBottom: 16, textAlign: "center",
  },
  pdfBtn: {
    width: "100%", padding: 13,
    backgroundColor: "#0369a1", color: "#fff",
    border: "none", borderRadius: 8,
    fontSize: 15, fontWeight: "bold", cursor: "pointer",
  },
  btnRow:  { display: "flex", gap: 12 },
  retryBtn: {
    flex: 1, padding: 12, backgroundColor: "#1a3a8f", color: "#fff",
    border: "none", borderRadius: 8, fontSize: 15, fontWeight: "bold", cursor: "pointer",
  },
  exitBtn: {
    flex: 1, padding: 12, backgroundColor: "#f3f4f6", color: "#374151",
    border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, fontWeight: "bold", cursor: "pointer",
  },
  exitOnlyBtn: {
    width: "100%", padding: 12, backgroundColor: "#f3f4f6", color: "#374151",
    border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, fontWeight: "bold", cursor: "pointer",
    marginTop: 10,
  },
};

export default ResultPage;
