/// <reference lib="webworker" />
import { generateWorld, type GenerateOptions } from "@worldforge/world-gen";
import { critiqueBake } from "@worldforge/quality";
import type { StyleBible, WorldBake, WorldSpec } from "@worldforge/core";

export interface WorkerRequest {
  id: string;
  spec: WorldSpec;
  style: StyleBible;
  options: Omit<GenerateOptions, "onProgress">;
}
export type WorkerResponse = { id: string; type: "progress"; stage: string; p: number } | { id: string; type: "done"; bake: WorldBake; reportJson: string } | { id: string; type: "error"; message: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, spec, style, options } = e.data;
  try {
    const bake = generateWorld(spec, style, { ...options, onProgress: (stage, p) => self.postMessage({ id, type: "progress", stage, p } satisfies WorkerResponse) });
    const report = critiqueBake(bake, spec, style);
    self.postMessage({ id, type: "done", bake, reportJson: JSON.stringify(report) } satisfies WorkerResponse);
  } catch (err) {
    self.postMessage({ id, type: "error", message: (err as Error).message ?? String(err) } satisfies WorkerResponse);
  }
};
