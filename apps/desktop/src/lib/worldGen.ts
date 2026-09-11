import type { QAReport, StyleBible, WorldBake, WorldSpec } from "@worldforge/core";
import type { GenerateOptions } from "@worldforge/world-gen";
import type { WorkerRequest, WorkerResponse } from "./worldWorker";

let worker: Worker | null = null;
let seq = 0;

function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL("./worldWorker.ts", import.meta.url), { type: "module" });
  return worker;
}

/** Run the deterministic generator off the UI thread. */
export function generateInWorker(spec: WorldSpec, style: StyleBible, options: Omit<GenerateOptions, "onProgress">, onProgress?: (stage: string, p: number) => void): Promise<{ bake: WorldBake; report: QAReport }> {
  const id = `gen_${++seq}`;
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === "progress") onProgress?.(msg.stage, msg.p);
      else if (msg.type === "done") {
        w.removeEventListener("message", handler);
        resolve({ bake: msg.bake, report: JSON.parse(msg.reportJson) as QAReport });
      } else {
        w.removeEventListener("message", handler);
        reject(new Error(msg.message));
      }
    };
    w.addEventListener("message", handler);
    w.postMessage({ id, spec, style, options } satisfies WorkerRequest);
  });
}
