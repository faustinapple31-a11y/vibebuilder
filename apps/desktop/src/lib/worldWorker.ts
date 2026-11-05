/// <reference lib="webworker" />
import { generateWorld, type GenerateOptions } from "@worldforge/world-gen";
import { critiqueBake, renderThumbnail } from "@worldforge/quality";
import type { StyleBible, WorldBake, WorldSpec } from "@worldforge/core";

export interface WorkerRequest {
  id: string;
  spec: WorldSpec;
  style: StyleBible;
  options: Omit<GenerateOptions, "onProgress">;
}
export type WorkerResponse = { id: string; type: "progress"; stage: string; p: number } | { id: string; type: "done"; bake: WorldBake; reportJson: string; thumbnail?: Uint8Array } | { id: string; type: "error"; message: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, spec, style, options } = e.data;
  try {
    const bake = generateWorld(spec, style, { ...options, onProgress: (stage, p) => self.postMessage({ id, type: "progress", stage, p } satisfies WorkerResponse) });
    const report = critiqueBake(bake, spec, style);
    self.postMessage({ id, type: "progress", stage: "thumbnail", p: 1 } satisfies WorkerResponse);
    // a missing store image must never cost the client their world
    const thumbnail = await renderThumbnail(bake).catch(() => undefined);
    self.postMessage({ id, type: "done", bake, reportJson: JSON.stringify(report), thumbnail } satisfies WorkerResponse);
  } catch (err) {
    self.postMessage({ id, type: "error", message: (err as Error).message ?? String(err) } satisfies WorkerResponse);
  }
};
