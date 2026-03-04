import React from "react";

const QuestionPalette = ({
  questions,
  currentIndex,
  setCurrentIndex,
  answers,
  handleSubmit,
}) => {
  return (
    <div className="right-panel">
      <div className="question-grid">
        {questions.map((q, i) => (
          <button
            key={q._id}
            className={
              answers[q._id]
                ? "answered"
                : i === currentIndex
                ? "active"
                : ""
            }
            onClick={() => setCurrentIndex(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <button className="submit-btn" onClick={handleSubmit}>
        Submit Test
      </button>
    </div>
  );
};

export default QuestionPalette;