import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Typed wrappers around the Rust commands (see src-tauri/src/commands). */

export interface ToolStatus {
  id: string;
  name: string;
  found: boolean;
  path: string | null;
  version: string | null;
  install_hint: string;
  installable: boolean;
  category: "runtime" | "roblox" | "agent" | "sandbox";
}
export interface SystemInfo {
  os: string;
  os_version: string;
  arch: string;
  ram_gb: number;
  cpu_cores: number;
  docker: boolean;
  wsl: boolean;
  hyperv_or_virtualization: boolean;
}
export interface ToolsReport {
  system: SystemInfo;
  tools: ToolStatus[];
  studio_path: string | null;
  rojo_plugin_installed: boolean;
  studio_mcp_plugin_installed: boolean;
}
export interface InstallPlan {
  id: string;
  kind: "npm" | "download-rojo";
  program: string | null;
  args: string[];
  label: string;
}
export interface AppPaths {
  app_data: string;
  projects_dir: string;
  tools_dir: string;
  logs_dir: string;
  home: string;
}
export interface DirEntryInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified_ms: number;
}
export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}
export interface StudioInfo {
  found: boolean;
  path: string | null;
  plugins_dir: string | null;
  rojo_plugin: boolean;
  mcp_plugin: boolean;
  running: boolean;
  mcp_server: string | null;
}
export interface LogFile {
  path: string;
  name: string;
  modified_ms: number;
  size: number;
}
export interface LogChunk {
  content: string;
  offset: number;
  size: number;
}
export interface CaptureResult {
  path: string;
  width: number;
  height: number;
  window_title: string;
}
export interface OcResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const tools = {
  detect: () => invoke<ToolsReport>("detect_tools"),
  installPlan: (id: string) => invoke<InstallPlan>("install_plan", { id }),
  installRojo: () => invoke<string>("install_rojo"),
};

export interface SpawnOptions {
  id: string;
  program: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  keep_stdin?: boolean;
  strip_env?: string[];
}
export const proc = {
  spawn: (opts: SpawnOptions) => invoke<number>("spawn_process", { opts }),
  writeStdin: (id: string, data: string) => invoke<void>("write_stdin", { id, data }),
  closeStdin: (id: string) => invoke<void>("close_stdin", { id }),
  kill: (id: string) => invoke<boolean>("kill_process", { id }),
  list: () => invoke<string[]>("list_processes"),
  run: (program: string, args: string[], cwd?: string, timeoutSecs?: number) => invoke<CommandResult>("run_command", { program, args, cwd, timeoutSecs }),
  resolve: (name: string) => invoke<string | null>("resolve_tool", { name }),
  onOutput: (cb: (e: { id: string; stream: "stdout" | "stderr"; line: string }) => void): Promise<UnlistenFn> => listen<{ id: string; stream: "stdout" | "stderr"; line: string }>("process-output", (ev) => cb(ev.payload)),
  onExit: (cb: (e: { id: string; code: number }) => void): Promise<UnlistenFn> => listen<{ id: string; code: number }>("process-exit", (ev) => cb(ev.payload)),
};

export type SecretSource = "keyring" | "env" | "none";
export interface EnvConfig {
  creator_user_id: number | null;
  creator_group_id: number | null;
  universe_id: number | null;
  place_id: number | null;
  dotenv_loaded: boolean;
}

export const secrets = {
  set: (key: string, value: string) => invoke<void>("secret_set", { key, value }),
  get: (key: string) => invoke<string | null>("secret_get", { key }),
  exists: (key: string) => invoke<boolean>("secret_exists", { key }),
  /** "keyring" (OS secure storage), "env" (environment / .env file) or "none". */
  source: (key: string) => invoke<SecretSource>("secret_source", { key }),
  delete: (key: string) => invoke<void>("secret_delete", { key }),
  /** Non-secret ids that may live in .env (ROBLOX_CREATOR_USER_ID, ROBLOX_UNIVERSE_ID, ROBLOX_PLACE_ID…). */
  envConfig: () => invoke<EnvConfig>("env_config"),
};

export const studio = {
  info: () => invoke<StudioInfo>("studio_info"),
  openPlace: (placePath: string) => invoke<number>("open_place_in_studio", { placePath }),
  launch: () => invoke<number>("launch_studio"),
  installRojoPlugin: () => invoke<string>("install_rojo_plugin"),
  listLogs: (limit = 5) => invoke<LogFile[]>("list_studio_logs", { limit }),
  readLog: (path: string, offset: number, maxBytes?: number) => invoke<LogChunk>("read_studio_log", { path, offset, maxBytes }),
  rojoStatus: (port?: number) => invoke<Record<string, unknown>>("rojo_serve_status", { port }),
};

export const opencloud = {
  request: (req: { method: string; url: string; json_body?: string; body_file?: string; content_type?: string; headers?: Record<string, string>; multipart?: { name: string; text?: string; file_path?: string; file_name?: string; content_type?: string }[] }) => invoke<OcResponse>("oc_request", { req }),
  hasKey: () => invoke<boolean>("oc_has_key"),
};

export const ai = {
  request: (req: { provider: string; method: string; url: string; json_body?: string; response?: "text" | "base64"; headers?: Record<string, string> }) => invoke<OcResponse>("ai_request", { req }),
  hasKey: (provider: string) => invoke<boolean>("ai_has_key", { provider }),
};

export const capture = {
  listWindows: () => invoke<{ id: number; title: string; app_name: string; width: number; height: number }[]>("list_windows"),
  window: (titleContains: string | null, outPath: string) => invoke<CaptureResult>("capture_window", { titleContains, outPath }),
};

export const fs = {
  appPaths: () => invoke<AppPaths>("app_paths"),
  readText: (path: string) => invoke<string>("fs_read_text", { path }),
  writeText: (path: string, content: string) => invoke<void>("fs_write_text", { path, content }),
  writeFiles: (root: string, files: [string, string][]) => invoke<number>("fs_write_files", { root, files }),
  readBinaryBase64: (path: string) => invoke<string>("fs_read_binary_base64", { path }),
  writeBinaryBase64: (path: string, data: string) => invoke<void>("fs_write_binary_base64", { path, data }),
  exists: (path: string) => invoke<boolean>("fs_exists", { path }),
  isDir: (path: string) => invoke<boolean>("fs_is_dir", { path }),
  mkdirp: (path: string) => invoke<void>("fs_mkdirp", { path }),
  listDir: (path: string) => invoke<DirEntryInfo[]>("fs_list_dir", { path }),
  walk: (root: string, maxEntries?: number) => invoke<string[]>("fs_walk", { root, maxEntries }),
  remove: (path: string) => invoke<void>("fs_remove", { path }),
  copyFile: (from: string, to: string) => invoke<number>("fs_copy_file", { from, to }),
  fileSize: (path: string) => invoke<number>("fs_file_size", { path }),
};

/** Path helpers that work for both separators. */
export const path = {
  join: (...parts: string[]): string => {
    const sep = parts[0]?.includes("\\") ? "\\" : "/";
    return parts
      .filter((p) => p !== undefined && p !== "")
      .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
      .join(sep);
  },
  basename: (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p,
  dirname: (p: string): string => {
    const parts = p.split(/[\\/]/);
    parts.pop();
    return parts.join(p.includes("\\") ? "\\" : "/");
  },
  toPosix: (p: string): string => p.replace(/\\/g, "/"),
};
