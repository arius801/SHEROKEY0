import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

declare global {
  interface Window { __skBoot?: ReturnType<typeof setTimeout>; }
}

const rootEl = document.getElementById("root")!;

try {
  ReactDOM.createRoot(rootEl).render(
    /* StrictMode enabled: startup is deterministic and idempotent (A1) — double-mounted
       effects share a single init promise, so dev-mode double renders are safe. */
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  // React scheduled a render — cancel the black-screen watchdog (index.html).
  if (window.__skBoot) clearTimeout(window.__skBoot);
} catch (err) {
  // Never leave a black screen: surface the failure, sanitized.
  const msg = err instanceof Error ? err.message : String(err);
  rootEl.innerHTML =
    '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0f17;color:#e9f0f8;font-family:Manrope,system-ui,sans-serif;padding:1rem">' +
    '<div style="max-width:26rem;width:100%;border:1px solid #1d2839;background:#0f1622;border-radius:14px;padding:2rem;text-align:center">' +
    '<div style="font-weight:800;font-size:1.05rem">SHERO<span style="color:#2fc98a">KEY</span></div>' +
    '<p style="color:#93a3b8;font-size:.85rem;line-height:1.6;margin:.9rem 0">Failed to start: ' +
    msg.replace(/</g, "&lt;") + "</p></div></div>";
  console.error("[sherokey] bootstrap failed", err);
}
