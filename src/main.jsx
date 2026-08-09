import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// The original app uses window.storage. This adapter makes it work
// in an ordinary browser by storing the same JSON payload in localStorage.
window.storage = window.storage || {
  get: async (key) => {
    const value = localStorage.getItem(key);
    return value == null ? null : { value };
  },
  set: async (key, value) => {
    localStorage.setItem(key, value);
    return { value };
  },
  delete: async (key) => {
    localStorage.removeItem(key);
    return { value: null };
  },
};

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
