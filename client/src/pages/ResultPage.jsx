import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

const ResultPage = () => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
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

  if (loading) return <h2 style={{ textAlign: "center", marginTop: "100px" }}>Loading result...</h2>;
  if (!result) return <h2 style={{ textAlign: "center", marginTop: "100px" }}>No result found.</h2>;

  const percentage = result.percentage ?? ((result.totalMarks / result.attempted) * 100).toFixed(1);
  const isFirstAttempt = result.attemptNumber === 1;
  const passedFirstAttempt = parseFloat(percentage) >= 50;
  const showRetryButton = isFirstAttempt && passedFirstAttempt;

  const noRetryMessage = isFirstAttempt && !passedFirstAttempt
    ? `Your score is ${percentage}%. You need 50% to unlock a second attempt.`
    : result.attemptNumber >= 2
    ? "You have used both attempts for this test."
    : null;

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>📊 Test Result</h2>
          <p style={styles.subtitle}>GATE CBT Sample Test</p>
          <span style={styles.attemptBadge}>Attempt {result.attemptNumber} of 2</span>
        </div>

        {/* Score Circle */}
        <div style={{
          ...styles.scoreCircle,
          backgroundColor: result.selected === false ? "#dc2626" : passedFirstAttempt ? "#1a3a8f" : "#dc2626",
        }}>
          <div style={styles.scoreNumber}>{result.totalMarks}</div>
          <div style={styles.scoreLabel}>Total Marks</div>
        </div>

        {/* Stats Grid */}
        <div style={styles.statsGrid}>
          <div style={{ ...styles.statBox, backgroundColor: "#dcfce7" }}>
            <div style={{ ...styles.statNumber, color: "#16a34a" }}>{result.correct}</div>
            <div style={styles.statLabel}>✅ Correct</div>
          </div>
          <div style={{ ...styles.statBox, backgroundColor: "#fee2e2" }}>
            <div style={{ ...styles.statNumber, color: "#dc2626" }}>{result.wrong}</div>
            <div style={styles.statLabel}>❌ Wrong</div>
          </div>
          <div style={{ ...styles.statBox, backgroundColor: "#dbeafe" }}>
            <div style={{ ...styles.statNumber, color: "#1a3a8f" }}>{result.attempted}</div>
            <div style={styles.statLabel}>📝 Attempted</div>
          </div>
          <div style={{ ...styles.statBox, backgroundColor: "#fef9c3" }}>
            <div style={{ ...styles.statNumber, color: "#ca8a04" }}>{percentage}%</div>
            <div style={styles.statLabel}>📈 Percentage</div>
          </div>
        </div>

        {/* ✅ Rank Badge — shows Not Selected if below 40% */}
        {result.selected === false ? (
          <div style={styles.notSelectedBadge}>
            ❌ Not Selected — Score below 40% cutoff
          </div>
        ) : (
          <div style={styles.rankBadge}>
            🏆 Rank: <strong>{result.rank?.toLocaleString()}</strong>
            {result.totalStudents && (
              <span style={{ fontSize: "14px", fontWeight: "400" }}>
                {" "}out of <strong>{result.totalStudents?.toLocaleString()}</strong> students
              </span>
            )}
          </div>
        )}

        {/* Subject Wise */}
        {result.subjectWisePerformance?.length > 0 && (
          <div style={styles.subjectSection}>
            <h3 style={styles.subjectTitle}>Subject-wise Performance</h3>
            {result.subjectWisePerformance.map((s, i) => (
              <div key={i} style={styles.subjectRow}>
                <span style={styles.subjectName}>{s.subject}</span>
                <span style={{ color: "#16a34a", fontWeight: "600" }}>✅ {s.correct}</span>
                <span style={{ color: "#dc2626", fontWeight: "600" }}>❌ {s.wrong}</span>
              </div>
            ))}
          </div>
        )}

        {/* No retry message */}
        {noRetryMessage && (
          <div style={styles.noRetryMsg}>ℹ️ {noRetryMessage}</div>
        )}

        {/* Buttons */}
        <div style={styles.btnRow}>
          {showRetryButton && (
            <button onClick={() => navigate("/test")} style={styles.retryBtn}>
              🔄 Retry Test
            </button>
          )}
          <button
            onClick={() => navigate("/")}
            style={showRetryButton ? styles.logoutBtn : styles.exitOnlyBtn}
          >
            🚪 Exit
          </button>
        </div>

      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #1a3a8f 0%, #0d2461 100%)",
    display: "flex", justifyContent: "center", alignItems: "center",
    padding: "30px",
  },
  card: {
    backgroundColor: "#fff", borderRadius: "16px", padding: "40px",
    width: "100%", maxWidth: "560px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  },
  header: { textAlign: "center", marginBottom: "24px" },
  title: { fontSize: "26px", fontWeight: "bold", color: "#1a3a8f" },
  subtitle: { color: "#6b7280", fontSize: "14px", marginTop: "4px" },
  attemptBadge: {
    display: "inline-block", marginTop: "8px",
    backgroundColor: "#dbeafe", color: "#1a3a8f",
    fontSize: "12px", fontWeight: "700",
    padding: "4px 12px", borderRadius: "20px",
  },
  scoreCircle: {
    width: "130px", height: "130px", borderRadius: "50%",
    display: "flex", flexDirection: "column",
    justifyContent: "center", alignItems: "center",
    margin: "0 auto 28px",
    boxShadow: "0 4px 16px rgba(26,58,143,0.3)",
  },
  scoreNumber: { fontSize: "38px", fontWeight: "bold", color: "#fff" },
  scoreLabel: { fontSize: "12px", color: "#bfdbfe" },
  statsGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr",
    gap: "14px", marginBottom: "20px",
  },
  statBox: { borderRadius: "10px", padding: "16px", textAlign: "center" },
  statNumber: { fontSize: "28px", fontWeight: "bold" },
  statLabel: { fontSize: "13px", color: "#555", marginTop: "4px" },
  rankBadge: {
    textAlign: "center", fontSize: "18px",
    backgroundColor: "#fef9c3", color: "#92400e",
    padding: "12px", borderRadius: "8px", marginBottom: "20px",
  },
  notSelectedBadge: {
    textAlign: "center", fontSize: "16px", fontWeight: "700",
    backgroundColor: "#fee2e2", color: "#991b1b",
    padding: "14px", borderRadius: "8px", marginBottom: "20px",
    border: "1px solid #fca5a5",
  },
  subjectSection: { marginBottom: "24px" },
  subjectTitle: { fontSize: "16px", fontWeight: "bold", color: "#1a3a8f", marginBottom: "12px" },
  subjectRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 14px", backgroundColor: "#f9fafb",
    borderRadius: "8px", marginBottom: "8px", fontSize: "14px",
  },
  subjectName: { fontWeight: "600", color: "#374151" },
  noRetryMsg: {
    backgroundColor: "#fff7ed", border: "1px solid #fed7aa",
    color: "#9a3412", borderRadius: "8px",
    padding: "12px 16px", fontSize: "13px",
    marginBottom: "16px", textAlign: "center",
  },
  btnRow: { display: "flex", gap: "12px" },
  retryBtn: {
    flex: 1, padding: "12px", backgroundColor: "#1a3a8f", color: "#fff",
    border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: "bold", cursor: "pointer",
  },
  logoutBtn: {
    flex: 1, padding: "12px", backgroundColor: "#f3f4f6", color: "#374151",
    border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "15px", fontWeight: "bold", cursor: "pointer",
  },
  exitOnlyBtn: {
    width: "100%", padding: "12px", backgroundColor: "#f3f4f6", color: "#374151",
    border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "15px", fontWeight: "bold", cursor: "pointer",
  },
};

export default ResultPage;