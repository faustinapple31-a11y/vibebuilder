import { type WorldBake } from "@worldforge/core";

/** Parsed compiler / runtime errors (rbxtsc output and Studio logs). */
export interface DiagnosticEntry {
  source: "rbxtsc" | "studio" | "rojo" | "npm";
  severity: "error" | "warning";
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  raw: string;
}

const TS_RE = /^(.+?)[:(](\d+)[:,](\d+)\)?\s*[:-]\s*(error|warning)\s*(TS\d+)?:?\s*(.*)$/;

/** Parse rbxtsc / tsc diagnostics from raw output. */
export function parseRbxtscOutput(output: string): DiagnosticEntry[] {
  const out: DiagnosticEntry[] = [];
  const clean = output.replace(/\x1b\[[0-9;]*m/g, "");
  const lines = clean.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const m = TS_RE.exec(line);
    if (m) {
      out.push({ source: "rbxtsc", severity: m[4] === "warning" ? "warning" : "error", file: m[1], line: Number(m[2]), column: Number(m[3]), code: m[5], message: m[6]!.trim(), raw: line });
      continue;
    }
    // roblox-ts style: "src/x.ts:12:5 - error TS123: ..." handled above; also "Diagnostic: ..." blocks
    if (/^(roblox-ts|rbxtsc)?\s*(error|Error)[: ]/.test(line) || /^Diagnostic error/.test(line)) {
      out.push({ source: "rbxtsc", severity: "error", message: line, raw: line });
    }
  }
  return out;
}

const STUDIO_ERROR_PATTERNS: RegExp[] = [
  /attempt to (index|call|perform arithmetic|compare|concatenate)/i,
  /is not a valid member of/i,
  /Infinite yield possible/i,
  /Stack Begin/i,
  /Script timeout/i,
  /expected .* got/i,
  /\berror\b/i,
];

/** Extract Luau runtime errors/warnings from a Roblox Studio log file. */
export function parseStudioLog(log: string): DiagnosticEntry[] {
  const out: DiagnosticEntry[] = [];
  const lines = log.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const isWarn = /\[FLog::/.test(line) ? false : /warning|Infinite yield/i.test(line);
    const isError = STUDIO_ERROR_PATTERNS.some((r) => r.test(line)) && !/FLog::|Info|OutputLog/.test(line.slice(0, 40));
    if (!isError && !isWarn) continue;
    if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z,[\d.]+,[0-9a-f]+,\d+ /.test(line) && !/Error|error|Stack|yield|attempt/.test(line)) continue;
    const scriptMatch = /([\w.]+\.(?:Script|LocalScript|ModuleScript|TS|Systems|World|UI)[\w.]*):(\d+)/.exec(line) ?? /(\S+):(\d+):/.exec(line);
    out.push({
      source: "studio",
      severity: isError ? "error" : "warning",
      file: scriptMatch?.[1],
      line: scriptMatch ? Number(scriptMatch[2]) : undefined,
      message: line.replace(/^\S+\s+\S+\s+\S+\s+\d+\s+/, ""),
      raw: line,
    });
  }
  return out;
}

export interface PublishCheck {
  id: "world" | "scripts" | "assets" | "ui" | "audio" | "build" | "roblox";
  label: string;
  ok: boolean;
  details: string;
}

/** Pre-publish validation over data we can check without the filesystem. */
export function validateBakeForPublish(bake: WorldBake | null): PublishCheck {
  if (!bake) return { id: "world", label: "World", ok: false, details: "No world has been generated yet." };
  const over = Object.entries(bake.stats.budgets).filter(([, b]) => b.used > b.max);
  if (over.length) return { id: "world", label: "World", ok: false, details: `Budgets exceeded: ${over.map(([k]) => k).join(", ")}` };
  if (bake.stats.partsEstimate > 40000) return { id: "world", label: "World", ok: false, details: `Too many parts (${bake.stats.partsEstimate})` };
  return { id: "world", label: "World", ok: true, details: `${bake.placements.length} placements, ≈${bake.stats.partsEstimate} parts, ${bake.meta.version}` };
}
