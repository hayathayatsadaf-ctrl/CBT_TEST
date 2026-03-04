import React from "react";
import Timer from "../test/Timer";

const TopBar = ({ section, changeSection, user }) => {
  const sections = ["Aptitude", "Reasoning", "English", "Technical"];

  // ✅ Cap at 2 max
  const attemptNumber = Math.min((user?.attempts ?? 0) + 1, 2);

  const initials = user?.name
    ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className="top-bar">

      {/* LEFT — Section Buttons */}
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

      {/* CENTER — Timer (flex:1 + text-align:center in CSS) */}
      <Timer />

      {/* RIGHT — User Profile */}
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

    </div>
  );
};

export default TopBar;