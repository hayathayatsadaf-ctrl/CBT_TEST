import React from "react";
import Timer from "../test/Timer";

const TopBar = ({ section, changeSection, user }) => {
  const sections = ["Aptitude", "Reasoning", "English", "Technical"];

  const attemptNumber = user?.attempts !== undefined ? user.attempts + 1 : 1;

  const initials = user?.name
    ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className="top-bar">
      {/* Section Buttons — left side */}
      <div className="top-bar-sections">
        {sections.map((sec) => (
          <button
            key={sec}
            onClick={() => changeSection(sec)}
            className={section === sec ? "active" : ""}
          >
            {sec}
          </button>
        ))}
      </div>

      {/* User Profile — pushed to right by margin-left: auto */}
      <div className="user-profile">
        <div className="user-avatar">
          {user?.profileImage
            ? <img src={user.profileImage} alt="profile" className="avatar-img" />
            : <span className="avatar-initials">{initials}</span>
          }
        </div>
        <div className="user-info">
          <span className="user-name">{user?.name || "Student"}</span>
          <span className="user-roll">📋 {user?.rollNumber || "N/A"}</span>
          <span className="user-attempt">Attempt: {attemptNumber}/2</span>
        </div>
      </div>

      {/* ✅ Timer — far right end */}
      <Timer />
    </div>
  );
};

export default TopBar;