import React from "react";

// ✅ FIXED: Sections are now dynamic — passed as props from TestPage
// Old code had hardcoded "Aptitude" and "CSE" buttons
const SectionTabs = ({ section, changeSection, sections }) => {
  return (
    <div className="section-tabs">
      {sections.map((sec) => (
        <button
          key={sec}
          className={section === sec ? "active-section" : ""}
          onClick={() => changeSection(sec)}
        >
          {sec}
        </button>
      ))}
    </div>
  );
};

export default SectionTabs;