import React from "react";

const QuestionPanel = ({ question, index, handleAnswer, selected }) => {
  if (!question) return <div className="left-panel"><p>No question found.</p></div>;

  // ✅ NAT = no options or empty options array
  const isNAT = !question.options || question.options.length === 0;

  return (
    <div className="left-panel">

      {/* Question Header */}
      <h3>
        Question {index + 1}
        {isNAT && (
          <span style={{
            marginLeft: "10px",
            fontSize: "11px",
            backgroundColor: "#fef9c3",
            color: "#92400e",
            padding: "2px 8px",
            borderRadius: "10px",
            fontWeight: "600",
          }}>
            NAT Type
          </span>
        )}
      </h3>

      {/* Question Text */}
      <p>{question.question}</p>

      {/* ✅ MCQ — radio options */}
      {!isNAT && (
        <div className="options">
          {question.options.map((opt, i) => (
            <label key={i}>
              <input
                type="radio"
                name={`question-${index}`}
                checked={selected === opt}
                onChange={() => handleAnswer(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {/* ✅ NAT — number input */}
      {isNAT && (
        <div style={{ marginTop: "10px" }}>
          <p style={{ fontSize: "14px", color: "#0369a1", marginBottom: "12px", fontWeight: "500" }}>
            📝 Enter your numerical answer:
          </p>
          <input
            type="number"
            step="any"
            placeholder="Type your answer here..."
            value={selected || ""}
            onChange={(e) => handleAnswer(e.target.value)}
            style={{
              width: "280px",
              padding: "12px 16px",
              fontSize: "16px",
              border: "2px solid #7dd3fc",
              borderRadius: "8px",
              outline: "none",
              color: "#1a1a1a",
              backgroundColor: "#f0f8ff",
            }}
          />
          {selected && (
            <p style={{ marginTop: "10px", fontSize: "13px", color: "#16a34a" }}>
              ✅ Your answer: <strong>{selected}</strong>
            </p>
          )}
        </div>
      )}

    </div>
  );
};

export default QuestionPanel;