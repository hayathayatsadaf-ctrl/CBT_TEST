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
  const [section, setSection] = useState("Aptitude");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testId, setTestId] = useState(null);

  const navigate = useNavigate();

  // ✅ Fetch user info - always gets latest including profileImage
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await API.get("/auth/me"); // ✅ /me always returns latest user from DB
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
        setAllQuestions(questionsRes.data);
      } catch (err) {
        console.error("Questions fetch error:", err.response?.data || err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, [navigate]);

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

  if (questions.length === 0) return (
    <div style={{ textAlign: "center", marginTop: "100px", fontFamily: "sans-serif" }}>
      <div style={{ fontSize: "60px" }}>🔍</div>
      <h2>No questions found for section: {section}</h2>
      <p style={{ color: "#666" }}>Try switching to a different section.</p>
    </div>
  );

  return (
    <div className="test-container">
      {/* ✅ Pass full user object including profileImage */}
      <TopBar section={section} changeSection={changeSection} user={user} />

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