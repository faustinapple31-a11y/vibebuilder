import type { FileIO } from "@worldforge/agents";
import { fs, path } from "./tauri";

export const tauriFiles: FileIO = {
  readText: (p) => fs.readText(p),
  writeText: (p, c) => fs.writeText(p, c),
  exists: (p) => fs.exists(p),
  mkdirp: (p) => fs.mkdirp(p),
  join: (...parts) => path.join(...parts),
};

export async function readJsonFile<T>(p: string): Promise<T | null> {
  try {
    if (!(await fs.exists(p))) return null;
    return JSON.parse(await fs.readText(p)) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(p: string, value: unknown): Promise<void> {
  await fs.writeText(p, JSON.stringify(value, null, 2) + "\n");
}
