import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "../components/layout/TopBar";
import QuestionPanel from "../components/test/QuestionPanel";
import QuestionPalette from "../components/test/QuestionPalette";
import BottomNav from "../components/layout/BottomNav";
import API from "../services/api";
import "../styles/test.css";

const TestPage = () => {
  const [allQuestions, setAllQuestions] = useState([]);
  const [sections, setSections] = useState([]);         // ✅ dynamic sections
  const [section, setSection] = useState(null);         // ✅ null until loaded
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testId, setTestId] = useState(null);

  const navigate = useNavigate();

  // Fetch user info
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await API.get("/auth/me");
        setUser(res.data);
      } catch (err) {
        console.error("User fetch error:", err.response?.data || err.message);
        alert("Session expired. Please login again.");
        navigate("/");
      }
    };
    fetchUser();
  }, [navigate]);

  // Fetch latest test + questions
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

        // ✅ FIXED: Extract unique sections directly from the questions
        // Old code: section was hardcoded as "Aptitude"
        // New code: sections come from DB — match exactly what PDF had
        const uniqueSections = [...new Set(qs.map(q => q.section).filter(Boolean))];

        if (uniqueSections.length > 0) {
          setSections(uniqueSections);
          setSection(uniqueSections[0]); // ✅ Start on first section from PDF
        }
      } catch (err) {
        console.error("Questions fetch error:", err.response?.data || err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, [navigate]);

  // Filter questions for current section
  const questions = allQuestions.filter((q) => q.section === section);
  const safeIndex = Math.min(currentIndex, Math.max(questions.length - 1, 0));

  const handleAnswer = (option) => {
    setAnswers({
      ...answers,
      [questions[safeIndex]._id]: option,
    });
  };

  const handleSubmit = async () => {
    try {
      const answersArray = Object.keys(answers).map((questionId) => ({
        questionId,
        selectedOption: answers[questionId],
      }));

      await API.post("/result/submit", {
        userId: user._id,
        testId: testId,
        answers: answersArray,
      });

      alert("Submitted successfully!");
      navigate("/result");
    } catch (err) {
      const msg = err.response?.data?.message || "Submission failed!";
      console.error("Submit error:", msg);
      alert(msg);
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
      <h2 style={{ fontSize: "24px", marginBottom: "10px" }}>No Questions Found</h2>
      <p style={{ color: "#666", marginBottom: "30px" }}>Please upload a PYQ and Answer Key PDF.</p>
      <button onClick={() => navigate("/upload")} style={{
        padding: "14px 36px", backgroundColor: "#0ea5e9",
        color: "#fff", border: "none", borderRadius: "8px",
        fontSize: "16px", fontWeight: "bold", cursor: "pointer",
      }}>
        📤 Upload PDF
      </button>
    </div>
  );

  // ✅ section is null until questions load — wait for it
  if (!section) return <h2 style={{ textAlign: "center", marginTop: "100px" }}>Loading sections...</h2>;

  if (questions.length === 0) return (
    <div style={{ textAlign: "center", marginTop: "100px", fontFamily: "sans-serif" }}>
      <div style={{ fontSize: "60px" }}>🔍</div>
      <h2>No questions found for section: {section}</h2>
      <p style={{ color: "#666" }}>Try switching to a different section.</p>
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
      {/* ✅ Pass dynamic sections array to TopBar */}
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

export default TestPage;