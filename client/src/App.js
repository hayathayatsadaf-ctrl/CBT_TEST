import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import TestPage from "./pages/TestPage";
import ResultPage from "./pages/ResultPage";
import UploadPage from "./pages/UploadPage";
import ExcelUploadPage from "./pages/ExcelUploadPage";  // ← NEW

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/test" element={<TestPage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/upload-excel" element={<ExcelUploadPage />} />  {/* ← NEW */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;