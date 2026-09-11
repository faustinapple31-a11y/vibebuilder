/** Global error overlay so runtime failures are visible (and screenshot-able) in the app. */
export function installErrorOverlay(): void {
  const show = (title: string, detail: string) => {
    let box = document.getElementById("wf-error-overlay");
    if (!box) {
      box = document.createElement("div");
      box.id = "wf-error-overlay";
      box.style.cssText = "position:fixed;left:12px;bottom:12px;max-width:640px;max-height:40vh;overflow:auto;z-index:99999;background:#fce8e6;color:#8b1e18;border:1px solid #e7a8a2;border-radius:10px;padding:10px 12px;font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap;box-shadow:0 8px 24px rgba(0,0,0,.15)";
      const close = document.createElement("button");
      close.textContent = "×";
      close.style.cssText = "position:absolute;right:6px;top:4px;border:0;background:transparent;font-size:16px;cursor:pointer;color:#8b1e18";
      close.onclick = () => box?.remove();
      box.appendChild(close);
      document.body.appendChild(box);
    }
    const line = document.createElement("div");
    line.textContent = `[${new Date().toLocaleTimeString()}] ${title}: ${detail}`;
    box.appendChild(line);
  };
  window.addEventListener("error", (e) => show("Error", `${e.message} (${e.filename?.split("/").pop()}:${e.lineno})`));
  window.addEventListener("unhandledrejection", (e) => {
    const msg = typeof e.reason === "string" ? e.reason : (e.reason?.message ?? JSON.stringify(e.reason));
    if (/Pointer Lock/i.test(String(msg))) return; // benign: first-person mode needs a click
    show("Unhandled rejection", msg);
  });
}
