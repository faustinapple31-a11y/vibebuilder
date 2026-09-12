import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { installErrorOverlay } from "./lib/errorOverlay";

installErrorOverlay();

if (import.meta.env.DEV) {
  // dev console access to the stores (window.__wf.useWorld.getState() …)
  void Promise.all([import("./stores/worldStore"), import("./stores/projectStore"), import("./stores/robloxStore"), import("./stores/agentStore"), import("./stores/settingsStore"), import("@worldforge/core")]).then(([w, p, r, a, s, core]) => {
    (window as unknown as { __wf: unknown }).__wf = { useWorld: w.useWorld, useProjects: p.useProjects, useRoblox: r.useRoblox, useAgents: a.useAgents, useSettings: s.useSettings, core };
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
