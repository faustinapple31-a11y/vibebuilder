import type { ProcessRunner } from "../runner";

/**
 * Minimal MCP (Model Context Protocol) client over stdio, built on the ProcessRunner so it works
 * in the Tauri webview (Rust child process) and in Node. Used for the Roblox Studio MCP server.
 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpContent {
  type: "text" | "image" | "resource" | string;
  text?: string;
  data?: string;
  mimeType?: string;
  [k: string]: unknown;
}

export interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
  structuredContent?: unknown;
}

export class McpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private unsubOut: (() => void) | null = null;
  private unsubExit: (() => void) | null = null;
  private buffer = "";
  connected = false;
  serverInfo: { name?: string; version?: string } = {};
  onLog?: (line: string) => void;

  constructor(
    private runner: ProcessRunner,
    private processId: string,
  ) {}

  async connect(program: string, args: string[] = [], clientName = "worldforge-ai"): Promise<void> {
    this.unsubOut = this.runner.onOutput(this.processId, (stream, line) => {
      if (stream === "stderr") {
        this.onLog?.(line);
        return;
      }
      this.handleLine(line);
    });
    this.unsubExit = this.runner.onExit(this.processId, () => {
      this.connected = false;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("MCP server exited"));
      }
      this.pending.clear();
    });
    await this.runner.spawn({ id: this.processId, program, args, keepStdin: true });
    const init = (await this.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: clientName, version: "0.1.0" } }, 30000)) as { serverInfo?: { name?: string; version?: string } };
    this.serverInfo = init?.serverInfo ?? {};
    await this.notify("notifications/initialized", {});
    this.connected = true;
  }

  private handleLine(line: string): void {
    const t = line.trim();
    if (!t.startsWith("{")) return;
    let msg: { id?: number; result?: unknown; error?: { message?: string; code?: number } };
    try {
      msg = JSON.parse(t);
    } catch {
      return;
    }
    if (msg.id === undefined) return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(msg.error.message ?? `MCP error ${msg.error.code}`));
    else p.resolve(msg.result);
  }

  request(method: string, params: unknown, timeoutMs = 120000): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      void this.runner.writeStdin(this.processId, JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n").catch((e) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  }

  notify(method: string, params: unknown): Promise<void> {
    return this.runner.writeStdin(this.processId, JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async listTools(): Promise<McpTool[]> {
    const res = (await this.request("tools/list", {})) as { tools?: McpTool[] };
    return res?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs = 180000): Promise<McpToolResult> {
    const res = (await this.request("tools/call", { name, arguments: args }, timeoutMs)) as McpToolResult;
    return res ?? { content: [] };
  }

  async close(): Promise<void> {
    this.unsubOut?.();
    this.unsubExit?.();
    this.connected = false;
    await this.runner.kill(this.processId).catch(() => {});
  }
}

/** Text of a tool result (joined text blocks). */
export function mcpText(res: McpToolResult): string {
  return res.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");
}

/** First image block (base64 + mime) of a tool result. */
export function mcpImage(res: McpToolResult): { data: string; mimeType: string } | null {
  const img = res.content.find((c) => c.type === "image" && typeof c.data === "string");
  return img ? { data: img.data as string, mimeType: (img.mimeType as string) ?? "image/png" } : null;
}
