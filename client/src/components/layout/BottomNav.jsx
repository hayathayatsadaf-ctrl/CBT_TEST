import React from "react";

const BottomNav = ({ currentIndex, setCurrentIndex, total }) => {
  return (
    <div className="bottom-nav">
      <button
        disabled={currentIndex === 0}
        onClick={() => setCurrentIndex(currentIndex - 1)}
      >
        Prev
      </button>

      <button
        disabled={currentIndex === total - 1}
        onClick={() => setCurrentIndex(currentIndex + 1)}
      >
        Next
      </button>
    </div>
  );
};

export default BottomNav;