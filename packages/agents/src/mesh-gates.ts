import type { BlenderReport } from "./blender-job";

/**
 * The mesh gates a generated model must pass, read from what Blender measured on the finished mesh.
 * The rules are reformulated from "fwjelaa vault" (Exporting and Validating Models, Mesh Gates, Spending
 * Triangles; CC BY 4.0): nothing floats, a symmetric design is really symmetric, the base meets the ground,
 * the mesh is closed, triangles go where players look. Each problem is written for the modelling agent: what
 * is wrong, where, and what to do in Blender.
 */
export interface GateProblem {
  gate: "floating" | "symmetry" | "support" | "dust" | "open" | "budget" | "silhouette" | "proportions";
  /** "high" problems are sent back to the agent even after the review. */
  severity: "high" | "medium" | "low";
  text: string;
}

export interface GateContext {
  heightStuds: number;
  maxTriangles: number;
  category?: string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** A position of the finished mesh (Roblox axes, front +Y, studs) in the agent's axes (front -Y), in model heights. */
export function inAgentAxes(at: [number, number, number], heightStuds: number): [number, number, number] {
  return [r2(-at[0] / heightStuds), r2(-at[1] / heightStuds), r2(at[2] / heightStuds)];
}

export function modelGateProblems(report: BlenderReport, context: GateContext): GateProblem[] {
  const g = report.gates;
  const out: GateProblem[] = [];
  if (!report.ok || !g) return out;
  const grounded = context.category !== "vegetation";

  if (g.floatingParts > 0 && g.floatingShare > 0.002) {
    const where = g.floatingAt ? `, the largest around (${inAgentAxes(g.floatingAt, context.heightStuds).join(", ")}) in your axes, in model heights` : "";
    out.push({
      gate: "floating",
      severity: "high",
      text: `${g.floatingParts} piece${g.floatingParts > 1 ? "s" : ""} float${g.floatingParts > 1 ? "" : "s"}: ${pct(g.floatingShare)} of the triangles touch neither the ground nor anything that does${where}. Make each part overlap the part that holds it, or lower it to z = 0.`,
    });
  }
  // a centred feature off its centre by more than 2% of the size reads as a mistake (the vault's tolerance)
  if (g.offCentre && g.offCentreAt) {
    out.push({
      gate: "symmetry",
      severity: "medium",
      text: `${g.offCentre} piece${g.offCentre > 1 ? "s" : ""} cross${g.offCentre > 1 ? "" : "es"} the centre plane without being centred on it: the largest, around (${inAgentAxes(g.offCentreAt, context.heightStuds).join(", ")}) in your axes, is ${r2(g.offCentreBy ?? 0)} studs off. Centre it exactly, or move it clearly to one side.`,
    });
  } else if (g.symmetry >= 0.6 && g.symmetry < 0.85) {
    // a design that is almost mirror-symmetric reads as a mistake too
    out.push({
      gate: "symmetry",
      severity: "medium",
      text: `The model is almost mirror-symmetric (${pct(g.symmetry)} of the surface mirrors within 2% of its size) but not quite: it reads lopsided. Build one half and add a MIRROR modifier, centre what is meant to be centred, and keep only the asymmetries the brief asks for, clearly visible.`,
    });
  }
  if (grounded && g.support < 0.1) {
    out.push({
      gate: "support",
      severity: "medium",
      text: `It stands on a point: what touches the ground covers ${pct(g.support)} of its footprint. Give it a base, feet or a plinth that meets z = 0.`,
    });
  }
  if (g.dustShare > 0.15) {
    out.push({
      gate: "dust",
      severity: "medium",
      text: `${pct(g.dustShare)} of the triangles are on ${g.dustParts} pieces smaller than 0.4 stud, which vanish on a phone. Merge them into larger forms, enlarge the few that matter, drop the rest.`,
    });
  }
  if ((report.openEdges ?? 0) > 0) {
    out.push({
      gate: "open",
      severity: (report.openEdges ?? 0) > 200 ? "medium" : "low",
      text: `The mesh has ${report.openEdges} open edges: holes or single-sided planes. Close the shapes, and give flat parts (cloth, leaves, blades) thickness with SOLIDIFY.`,
    });
  }
  if (g.rawTriangles && g.rawTriangles > context.maxTriangles) {
    out.push({
      gate: "budget",
      severity: g.rawTriangles > context.maxTriangles * 2 ? "medium" : "low",
      text: `It had ${g.rawTriangles} triangles and was decimated to ${context.maxTriangles}, which blurs every form. Lower the segment counts of small and hidden parts; keep them on the top silhouette and the focal feature (${pct(g.topShare)} of the triangles are in the top quarter now).`,
    });
  }
  const fills = g.silhouetteFill ?? [];
  if (fills.length && Math.max(...fills) < 0.15) {
    out.push({
      gate: "silhouette",
      severity: "low",
      text: `At 64 pixels the silhouette is mostly empty (${fills.map(pct).join(", ")} of its box from the front, the side and three-quarter). Thicken the main masses: thin parts disappear at play distance.`,
    });
  }
  const size = report.size;
  if (size && grounded && Math.max(size[0], size[1]) > size[2] * 6) {
    out.push({
      gate: "proportions",
      severity: "low",
      text: `It is ${r2(Math.max(size[0], size[1]) / size[2])} times wider than tall: it is scaled to ${context.heightStuds} studs high, so it becomes very large on the ground. Check the proportions against the brief.`,
    });
  }
  return out;
}

const RANK = { high: 100, medium: 10, low: 0 } as const;

/** Lower is better: one high problem outweighs any number of medium ones; low ones are advice and do not count. */
export function gateScore(problems: GateProblem[]): number {
  return problems.reduce((s, p) => s + RANK[p.severity], 0);
}

/** The measured problems as the review agent reads them. */
export function gateProblemsForPrompt(problems: GateProblem[]): string {
  if (!problems.length) return "Measured by the build: no gate failed (nothing floats, symmetry, ground contact, closed mesh, budget).";
  return `Measured by the build on the finished mesh (fix these first, they are facts, not opinions):\n${problems.map((p) => `- [${p.severity}] ${p.text}`).join("\n")}`;
}
