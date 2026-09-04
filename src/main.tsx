import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

/* StrictMode enabled: startup is deterministic and idempotent (A1) — double-mounted
   effects share a single init promise, so dev-mode double renders are safe. */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
