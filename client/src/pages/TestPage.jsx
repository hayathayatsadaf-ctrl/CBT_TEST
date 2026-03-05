import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "../components/layout/TopBar";
import QuestionPanel from "../components/test/QuestionPanel";
import QuestionPalette from "../components/test/QuestionPalette";
import BottomNav from "../components/layout/BottomNav";
import API from "../services/api";
import "../styles/test.css";

// ⏱ Time per question based on marks
const getTimeForQuestion = (marks) => {
  if (marks === 2) return 3 * 60;   // 3 minutes for 2-mark
  return 1.5 * 60;                  // 1.5 minutes for 1-mark
};

const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const TestPage = () => {
  const [allQuestions, setAllQuestions] = useState([]);
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testId, setTestId] = useState(null);

  // ⏱ Timer state
  const [timeLeft, setTimeLeft] = useState(null);
  const [totalTime, setTotalTime] = useState(null);
  const timerRef = useRef(null);

  const navigate = useNavigate();

  // Fetch user
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await API.get("/auth/me");
        setUser(res.data);
      } catch (err) {
        alert("Session expired. Please login again.");
        navigate("/");
      }
    };
    fetchUser();
  }, [navigate]);

  // Fetch questions
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const testsRes = await API.get("/pdf/tests");
        if (!testsRes.data || testsRes.data.length === 0) {
          setLoading(false);
          return;
        }
        const latestTest = testsRes.data[0];
        setTestId(latestTest._id);

        const questionsRes = await API.get(`/pdf/questions/${latestTest._id}`);
        const qs = questionsRes.data;
        setAllQuestions(qs);

        // ⏱ Calculate total time based on question marks
        const total = qs.reduce((sum, q) => sum + getTimeForQuestion(q.marks || 1), 0);
        setTimeLeft(total);
        setTotalTime(total);

        const uniqueSections = [...new Set(qs.map(q => q.section).filter(Boolean))];
        if (uniqueSections.length > 0) {
          setSections(uniqueSections);
          setSection(uniqueSections[0]);
        }
      } catch (err) {
        console.error("Questions fetch error:", err.response?.data || err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, [navigate]);

  // ⏱ Countdown timer
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [timeLeft === null]); // only start once

  const questions = allQuestions.filter((q) => q.section === section);
  const safeIndex = Math.min(currentIndex, Math.max(questions.length - 1, 0));

  // ⏱ Timer color
  const timerColor = timeLeft < 300 ? "#e53935" : timeLeft < 600 ? "#ff8c00" : "#1a3a8f";
  const timerPercent = totalTime ? Math.round((timeLeft / totalTime) * 100) : 100;

  const handleAnswer = (option) => {
    setAnswers({ ...answers, [questions[safeIndex]._id]: option });
  };

  const handleSubmit = async () => {
    clearInterval(timerRef.current);
    try {
      const answersArray = Object.keys(answers).map((questionId) => ({
        questionId,
        selectedOption: answers[questionId],
      }));
      await API.post("/result/submit", {
        userId: user._id,
        testId,
        answers: answersArray,
      });
      alert("Submitted successfully!");
      navigate("/result");
    } catch (err) {
      alert(err.response?.data?.message || "Submission failed!");
    }
  };

  const changeSection = (newSection) => {
    setSection(newSection);
    setCurrentIndex(0);
  };

  if (!user) return <h2 style={{ textAlign: "center", marginTop: "100px" }}>Loading user info...</h2>;
  if (loading) return <h2 style={{ textAlign: "center", marginTop: "100px" }}>Loading questions...</h2>;

  if (allQuestions.length === 0) return (
    <div style={{ textAlign: "center", marginTop: "100px", fontFamily: "sans-serif" }}>
      <div style={{ fontSize: "60px" }}>📄</div>
      <h2>No Questions Found</h2>
      <p style={{ color: "#666", marginBottom: "30px" }}>Please upload an Excel file.</p>
      <button onClick={() => navigate("/upload-excel")} style={{
        padding: "14px 36px", backgroundColor: "#0ea5e9", color: "#fff",
        border: "none", borderRadius: "8px", fontSize: "16px", fontWeight: "bold", cursor: "pointer",
      }}>
        📤 Upload Excel
      </button>
    </div>
  );

  if (!section) return <h2 style={{ textAlign: "center", marginTop: "100px" }}>Loading sections...</h2>;

  if (questions.length === 0) return (
    <div style={{ textAlign: "center", marginTop: "100px", fontFamily: "sans-serif" }}>
      <div style={{ fontSize: "60px" }}>🔍</div>
      <h2>No questions found for section: {section}</h2>
      <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
        {sections.map(sec => (
          <button key={sec} onClick={() => changeSection(sec)} style={{
            padding: "10px 20px", backgroundColor: "#1a3a8f", color: "#fff",
            border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px",
          }}>
            {sec}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="test-container">

      {/* ⏱ Timer Bar */}
      {timeLeft !== null && (
        <div style={styles.timerBar}>
          <div style={styles.timerLeft}>
            <span style={{ fontSize: "13px", color: "#666" }}>⏱ Time Remaining</span>
            <span style={{ ...styles.timerDisplay, color: timerColor }}>
              {formatTime(timeLeft)}
            </span>
          </div>
          <div style={styles.timerBarOuter}>
            <div style={{
              ...styles.timerBarInner,
              width: `${timerPercent}%`,
              backgroundColor: timerColor,
              transition: "width 1s linear, background-color 0.5s"
            }} />
          </div>
          <div style={styles.timerRight}>
            <span style={{ fontSize: "12px", color: "#666" }}>
              Q{safeIndex + 1}/{questions.length} •{" "}
              {questions[safeIndex]?.marks || 1}M •{" "}
              {formatTime(getTimeForQuestion(questions[safeIndex]?.marks || 1))}/q
            </span>
          </div>
        </div>
      )}

      <TopBar
        section={section}
        changeSection={changeSection}
        user={user}
        sections={sections}
      />

      <div className="main-content">
        <QuestionPanel
          question={questions[safeIndex]}
          index={safeIndex}
          handleAnswer={handleAnswer}
          selected={answers[questions[safeIndex]._id]}
        />
        <QuestionPalette
          questions={questions}
          currentIndex={safeIndex}
          setCurrentIndex={setCurrentIndex}
          answers={answers}
          handleSubmit={handleSubmit}
        />
      </div>

      <BottomNav
        currentIndex={safeIndex}
        setCurrentIndex={setCurrentIndex}
        total={questions.length}
      />
    </div>
  );
};

const styles = {
  timerBar: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "8px 16px", backgroundColor: "#fff",
    borderBottom: "1px solid #eee", flexWrap: "wrap",
  },
  timerLeft: { display: "flex", flexDirection: "column", minWidth: "100px" },
  timerDisplay: { fontSize: "22px", fontWeight: "800", fontFamily: "monospace" },
  timerBarOuter: {
    flex: 1, height: "8px", backgroundColor: "#e0e0e0",
    borderRadius: "4px", overflow: "hidden", minWidth: "100px",
  },
  timerBarInner: { height: "100%", borderRadius: "4px" },
  timerRight: { minWidth: "120px", textAlign: "right" },
};

export default TestPage;
