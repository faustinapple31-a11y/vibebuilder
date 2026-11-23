/**
 * Visual quality of a Blender kit, from measurements (packages/blender-map/python/wf_quality.py). Eight weighted
 * criteria, three distances; every point lost names the piece and what to change. A kit nobody measured has no score.
 */
export const VISUAL_WEIGHTS = { silhouette: 15, geometry: 15, materials: 15, textures: 10, details: 15, vegetation: 10, terrain: 10, consistency: 10 } as const;
export type VisualCriterion = keyof typeof VISUAL_WEIGHTS;

export interface PieceMetrics {
  name: string;
  kind: "vegetation" | "architecture" | "prop";
  tris: number;
  size: number[];
  /** Outline length over that of its bounding box: 1 is a box, 2 a crenellated castle. */
  outline: number;
  fill: number;
  /** Share of the surface in one flat plane. */
  largestPlane: number;
  secondary: number;
  tertiary: number;
  materials: number;
  textured: number;
  hues: number;
  /** Texels per stud (median) and 90th over 10th percentile. */
  texel: number;
  texelSpread: number;
  medium?: number;
  far?: number;
  mediumTris?: number;
  farTris?: number;
}

export interface VisualSurvey {
  pieces: PieceMetrics[];
  variants: Record<string, { count: number; difference: number | null }>;
  floating: number;
  /** Textures the manifest asks for and the disk does not have. */
  missingTextures?: number;
  instances?: number;
}

export interface VisualProblem {
  criterion: VisualCriterion;
  distance: "close" | "medium" | "far" | "all";
  piece?: string;
  message: string;
  fix: string;
}

export interface VisualReport {
  score: number;
  criteria: Record<VisualCriterion, number>;
  distances: { close: number; medium: number; far: number };
  problems: VisualProblem[];
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ramp = (v: number, bad: number, good: number) => clamp((v - bad) / (good - bad));
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 1);

export function scoreVisual(s: VisualSurvey): VisualReport {
  const problems: VisualProblem[] = [];
  const note = (ok: number, criterion: VisualCriterion, distance: VisualProblem["distance"], piece: string | undefined, message: string, fix: string) => {
    if (ok < 0.6) problems.push({ criterion, distance, ...(piece ? { piece } : {}), message, fix });
    return ok;
  };
  const arch = s.pieces.filter((p) => p.kind === "architecture" && Math.max(...p.size) > 8);
  const veg = s.pieces.filter((p) => p.kind === "vegetation");
  const trees = veg.filter((p) => p.size[2]! > 9);
  const big = s.pieces.filter((p) => Math.max(...p.size) > 6);

  const silhouette = mean([
    ...arch.map((p) => note(ramp(p.outline, 0.98, 1.16), "silhouette", "far", p.name, `${p.name} reads as a box from afar (outline ${p.outline.toFixed(2)})`, "give it a second volume, a porch, a dormer or a chimney")),
    ...trees.map((p) => note(ramp(p.outline, 1.05, 1.5) * ramp(0.86 - p.fill, 0, 0.12), "silhouette", "far", p.name, `${p.name} is a solid lump (fill ${p.fill.toFixed(2)})`, "more branches, fewer filler cards")),
  ]);
  const geometry = mean([
    ...arch.map((p) => note(1 - ramp(p.largestPlane, 0.09, 0.28), "geometry", "close", p.name, `${Math.round(p.largestPlane * 100)}% of ${p.name} is one flat plane`, "break the wall with framing, courses, reveals or a set-back")),
    ...big.map((p) => note(p.tris > 150_000 ? 0 : 1, "geometry", "all", p.name, `${p.name} has ${p.tris} triangles`, "split it or drop chamfers on parts under half a stud")),
  ]);
  const materials = mean(arch.map((p) => note(ramp(p.materials, 1.5, 5) * 0.6 + ramp(p.hues, 0.02, 0.1) * 0.4, "materials", "close", p.name, `${p.name} has ${p.materials} materials and little colour variation (${p.hues.toFixed(3)})`, "use the materials its construction would need, vary each element")));
  const textures = mean([
    ...s.pieces.filter((p) => p.kind !== "vegetation").map((p) => note(p.textured, "textures", "close", p.name, `${Math.round((1 - p.textured) * 100)}% of the materials of ${p.name} have no texture`, "map the material to a texture set")),
    // sixty texels per stud is sharp at arm's length, under twenty-five is a smear
    ...arch.map((p) => note(ramp(p.texel, 22, 70) * (1 - ramp(p.texelSpread, 6, 18)), "textures", "close", p.name, `${p.name}: ${p.texel} texels per stud, spread ${p.texelSpread}`, "bring the UV scale of its parts together")),
    s.missingTextures ? 0 : 1,
  ]);
  const details = mean(arch.map((p) => note(ramp(p.secondary, 0.04, 0.16) * 0.5 + ramp(p.tertiary, 0.2, 0.5) * 0.5, "details", "close", p.name, `${p.name} lacks mid-size parts (${Math.round(p.secondary * 100)}%) or small ones (${Math.round(p.tertiary * 100)}%)`, "add frames, sills, brackets (secondary) and hinges, studs, stones (tertiary)")));
  const vegetation = mean([
    ...Object.entries(s.variants)
      .filter(([k, v]) => veg.some((p) => p.name.startsWith(`${k}_`)) && v.count > 1 && trees.some((p) => p.name.startsWith(`${k}_`)))
      .map(([k, v]) => note(ramp(v.difference ?? 0, 0.08, 0.28), "vegetation", "medium", k, `the ${v.count} ${k} differ by ${Math.round((v.difference ?? 0) * 100)}%`, "vary the branching and the envelope, not the scale")),
    ...trees.map((p) => note(p.tris > 6000 ? 0.2 : 1, "vegetation", "all", p.name, `${p.name} costs ${p.tris} triangles`, "fewer, larger cards")),
  ]);
  const terrain = note(clamp(1 - s.floating / 12), "terrain", "all", undefined, `${s.floating} objects hang over the ground`, "settle them on the lowest point of their base");
  // the far versions must stay the same object, and cost less
  const med = big.filter((p) => p.medium !== undefined).map((p) => note(ramp(p.medium!, 0.6, 0.86), "consistency", "medium", p.name, `${p.name} loses its shape at medium distance (${Math.round(p.medium! * 100)}% of the silhouette)`, "keep every part that touches the outline"));
  const far = big.filter((p) => p.far !== undefined).map((p) => note(ramp(p.far!, 0.5, 0.8), "consistency", "far", p.name, `${p.name} loses its shape far away (${Math.round(p.far! * 100)}%)`, "widen what is left instead of dropping more"));
  const cost = big.filter((p) => p.farTris !== undefined && p.tris > 2000).map((p) => note(1 - ramp(p.farTris! / p.tris, 0.35, 0.8), "consistency", "far", p.name, `${p.name} keeps ${p.farTris} of its ${p.tris} triangles far away`, "drop thin parts and chamfers earlier"));
  const templates = Object.entries(s.variants)
    .filter(([k, v]) => v.count > 2 && arch.some((p) => p.name.startsWith(`${k}_`)))
    .map(([k, v]) => note(ramp(v.difference ?? 0, 0.06, 0.26), "consistency", "far", k, `the ${v.count} ${k} share one silhouette (${Math.round((v.difference ?? 0) * 100)}% apart)`, "add a family to its configuration"));
  const consistency = mean([...med, ...far, ...cost, ...templates]);

  const raw = { silhouette, geometry, materials, textures, details, vegetation, terrain, consistency };
  const criteria = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.round(clamp(v) * 100)])) as Record<VisualCriterion, number>;
  const score = Math.round((Object.keys(VISUAL_WEIGHTS) as VisualCriterion[]).reduce((t, k) => t + (criteria[k] * VISUAL_WEIGHTS[k]) / 100, 0) * 10) / 10;
  const pct = (v: number) => Math.round(clamp(v) * 100);
  return { score, criteria, distances: { close: pct(mean([geometry, materials, textures, details])), medium: pct(mean([...med, vegetation])), far: pct(mean([...far, ...cost, silhouette])) }, problems };
}
