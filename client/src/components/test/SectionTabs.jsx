import React from "react";

const SectionTabs = ({ section, changeSection }) => {
  return (
    <div className="section-tabs">
      <button
        className={section === "Aptitude" ? "active-section" : ""}
        onClick={() => changeSection("Aptitude")}
      >
        Aptitude
      </button>

      <button
        className={section === "CSE" ? "active-section" : ""}
        onClick={() => changeSection("CSE")}
      >
        CSE
      </button>
    </div>
  );
};

export default SectionTabs;