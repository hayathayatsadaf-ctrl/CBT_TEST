import React from "react";

const QuestionPanel = ({ question, index, handleAnswer, selected }) => {
  if (!question) return <div className="left-panel"><p>No question found.</p></div>;

  return (
    <div className="left-panel">
      <h3>Question {index + 1}</h3>

      {/* ✅ Fixed: was question.questionText — correct field is question.question */}
      <p>{question.question}</p>

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
    </div>
  );
};

export default QuestionPanel;