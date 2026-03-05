import React from "react";

const getImageUrl = (profileImage) => {
  if (!profileImage) return null;
  return profileImage.replace(
    "http://localhost:5000",
    process.env.REACT_APP_API_URL?.replace("/api", "") || "http://localhost:5000"
  );
};

const TopBar = ({ section, changeSection, user, sections: dynamicSections }) => {
  const sections = dynamicSections?.length > 0
    ? dynamicSections
    : ["Aptitude", "Reasoning", "English", "Technical"];

  const attemptNumber = Math.min((user?.attempts ?? 0) + 1, 2);

  const initials = user?.name
    ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const imageUrl = getImageUrl(user?.profileImage);

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

      {/* RIGHT — User Profile */}
      <div className="user-profile">
        <div className="user-avatar">
          {imageUrl
            ? <img src={imageUrl} alt="profile" className="avatar-img"
                onError={(e) => { e.target.style.display = "none"; }} />
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
