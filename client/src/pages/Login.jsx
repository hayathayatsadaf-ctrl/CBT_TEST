import React, { useState } from "react";
import API from "../services/api";
import "../styles/auth.css";
import { useNavigate } from "react-router-dom";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async () => {
    try {
      if (isLogin) {
        const res = await API.post("/auth/login", { email, password });
        localStorage.setItem("token", res.data.token);
        navigate("/upload"); // ✅ Fixed: go to upload page after login
      } else {
        await API.post("/auth/register", { name, email, password });
        alert("Registration Successful! Please login.");
        setIsLogin(true);
        setName(""); setEmail(""); setPassword("");
      }
    } catch (err) {
      const msg = err.response?.data?.message || "Authentication Failed";
      alert(msg);
    }
  };

  return (
    <div className="login-container">
      <h2>{isLogin ? "Login" : "Register"}</h2>

      {!isLogin && (
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button onClick={handleSubmit}>{isLogin ? "Login" : "Register"}</button>

      <p
        onClick={() => {
          setIsLogin(!isLogin);
          setName(""); setEmail(""); setPassword("");
        }}
        className="toggle-auth"
      >
        {isLogin
          ? "Don't have an account? Register"
          : "Already have an account? Login"}
      </p>
    </div>
  );
};

export default Auth;