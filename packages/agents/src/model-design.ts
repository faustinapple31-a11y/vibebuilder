import type { IAgentProvider, FileIO } from "./types";
import type { ProcessRunner } from "./runner";
import { SESSION_DEFAULTS, askModel, type EnhancerModel } from "./prompt-enhancer";
import { runBlenderJob, type BlenderJob, type BlenderReport } from "./blender-job";

/**
 * The 3D model pipeline, the twin of the map's hidden brief. The user sees none of the first three steps:
 *   1. a small model rewrites the request into a modelling brief ("une épée" stays the intent);
 *   2. Sonnet draws reference images from that brief;
 *   3. Sonnet receives the images and the brief and writes the Blender script;
 *   4. Blender builds the model and exports GLB and FBX; one review pass compares it with the references.
 * Claude produces no pixels: the references are SVG drawings, rasterized by the caller when it can.
 */
export interface ModelContext {
  /** "landmark", "prop", "building", "vegetation" or "rock". */
  category?: string;
  heightStuds?: number;
  styleName?: string;
  /** The world's palette, so the object belongs to the map it is placed on. */
  palette?: string[];
}

export const MODEL_CRAFT = [
  "Silhouette first: the object must be recognised as a black shape from 40 studs. Exaggerate what makes it itself.",
  "Three levels of detail: 2 or 3 large masses, then 6 to 12 medium forms, then small accents. Most of the area stays calm.",
  "Chunky proportions: thick parts, no thin needles; anything under 0.4 stud vanishes on a phone.",
  "A real object has structure: joints, straps, rims, feet, a base that meets the ground. Name them.",
  "Colour: 3 to 5 flat colours from one family plus a single accent on the focal detail. No pure black or pure white.",
  "Break perfect symmetry with one or two details: a dent, a tilted plank, a missing tile.",
  "One object only, standing on the ground, no scene and no background.",
];

const MODEL_EXAMPLES = `Request: un coffre
<brief>
OBJECT: a heavy pirate treasure chest, lid half open, gold spilling over the front edge.
SILHOUETTE: wide low box with a domed lid tilted back, wider than tall.
MASSES: plank body; domed lid; heap of coins inside.
FORMS: two iron bands around body and lid, corner brackets, a big lock plate at the front, two side handles, four short feet.
ACCENTS: loose coins on the ground, one cracked plank, a red gem on the lock.
PALETTE: #6b4226 wood, #8a5a33 lighter wood, #3a3a40 iron, #e0b040 gold, accent #c8324a.
FRONT: the lock faces the viewer.
</brief>

Request: un lampadaire de rue
<brief>
OBJECT: an old cast-iron street lantern, four glass panes, warm light inside.
SILHOUETTE: tall thin post with a wide cap and a bulging lantern head.
MASSES: stepped stone base; tapered post; lantern head under a pointed cap.
FORMS: a collar halfway up, four corner bars, a ladder rest crossing the post below the head.
ACCENTS: a small finial on the cap, one bent ladder rest.
PALETTE: #2f3236 iron, #4a4e54 lighter iron, #8a8780 stone, accent #ffc56e glowing panes.
FRONT: any side.
</brief>`;

export function buildModelBriefPrompt(request: string, context: ModelContext = {}): string {
  const facts = [
    context.category && `Used in the world as: ${context.category}.`,
    context.heightStuds && `Height in the game: ${context.heightStuds} studs.`,
    context.styleName && `Art direction of the world: ${context.styleName}.`,
    context.palette?.length && `World palette, take colours from it first: ${context.palette.join(" ")}.`,
  ].filter(Boolean);
  return `You turn a short request into a precise brief for a 3D game model on Roblox. The player never sees the brief.
The request is the intent: keep every object, material and style it names, invent the rest.

Craft rules:
${MODEL_CRAFT.map((r) => `- ${r}`).join("\n")}
${facts.length ? `\n${facts.join("\n")}\n` : ""}
Examples of the format (never reuse their content):
${MODEL_EXAMPLES}

Request: ${request}
Answer with the <brief> block only, in English, under 130 words.`;
}

export function parseModelBrief(answer: string): string | null {
  const text = /<brief>([\s\S]*?)<\/brief>/.exec(answer)?.[1]?.trim();
  return text && /OBJECT:/.test(text) && /PALETTE:/.test(text) ? text : null;
}

/** Offline fallback: the craft rules around the request, without inventing details. */
export function buildLocalModelBrief(request: string, context: ModelContext = {}): string {
  return [
    `OBJECT: ${request}, one single game asset standing on the ground.`,
    "SILHOUETTE: exaggerated, chunky, recognisable from far away.",
    "MASSES: 2 or 3 large volumes. FORMS: joints, rims and a solid base. ACCENTS: one small focal detail.",
    `PALETTE: ${context.palette?.length ? context.palette.join(" ") : "3 to 5 flat colours and one accent"}.`,
    "FRONT: the main detail faces the viewer.",
  ].join("\n");
}

/** Meshy takes 600 characters of plain prose: the brief without its labels. */
export function briefAsPlainPrompt(brief: string, limit = 580): string {
  const text = brief.replace(/^[A-Z]+:\s*/gm, "").replace(/\s*\n\s*/g, " ").trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return cut.slice(0, Math.max(cut.lastIndexOf(". ") + 1, 200));
}

export interface ModelAgentOptions {
  provider?: IAgentProvider;
  cwd: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function ask(prompt: string, options: ModelAgentOptions, model: EnhancerModel, timeoutMs: number, images?: string[]): Promise<string> {
  const { provider, cwd, signal } = options;
  const base = provider && SESSION_DEFAULTS[provider.id]?.(model);
  if (!provider || !base) throw new Error("no agent can design the model");
  // the images are read through the Read tool, the only tool these agents get
  const defaults = images?.length ? { ...base, extraArgs: base.extraArgs?.map((a) => (a === "--tools=" ? "--tools=Read" : a)) } : base;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, options.timeoutMs ?? timeoutMs);
  signal?.addEventListener("abort", abort);
  const stopped = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("timed out"))));
  try {
    return await Promise.race([provider.startSession({ cwd, ...defaults }).then((s) => askModel(provider, s, prompt, controller.signal, images)), stopped]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/** Step 1. Never throws: without an agent the brief comes from the craft rules. */
export async function enhanceModelPrompt(request: string, context: ModelContext, options: ModelAgentOptions): Promise<{ brief: string; source: "model" | "local"; reason?: string }> {
  const text = request.trim();
  try {
    const brief = parseModelBrief(await ask(buildModelBriefPrompt(text, context), options, "haiku", 45_000));
    if (brief) return { brief, source: "model" };
    return { brief: buildLocalModelBrief(text, context), source: "local", reason: "no brief returned" };
  } catch (e) {
    return { brief: buildLocalModelBrief(text, context), source: "local", reason: (e as Error).message };
  }
}

export type ReferenceView = "front" | "side" | "three_quarter";
export interface ModelReference {
  view: ReferenceView;
  svg: string;
}

export function buildReferencePrompt(brief: string): string {
  return `You are a concept artist preparing the model sheet a 3D modeller works from.

${brief}

Draw the object three times, each as a standalone SVG with viewBox="0 0 768 768":
- front: straight on, flat, the proportions exact.
- side: straight from the right, same scale and same ground line as the front.
- three_quarter: seen from the front right, slightly above, showing the volumes.

Rules: a plain light grey background, the object filling two thirds of the frame, flat fills from the brief's palette, a darker shade on the side away from the light, a thick dark outline around the silhouette. Draw the real structure: every mass, form and accent the brief names. Only shapes: rect, circle, ellipse, polygon, path, line, g. No text, no script, no images, no filters.

Answer with exactly these three blocks and nothing else:
<reference view="front"><svg ...>...</svg></reference>
<reference view="side"><svg ...>...</svg></reference>
<reference view="three_quarter"><svg ...>...</svg></reference>`;
}

/** Keeps drawing elements only: the SVG comes from a model and may be opened by the webview. */
export function sanitizeSvg(svg: string): string | null {
  if (/<\s*(script|foreignObject|image|iframe|style|use|a)\b/i.test(svg) || /\son\w+\s*=/i.test(svg) || /(href|src)\s*=|javascript:|url\(\s*['"]?http/i.test(svg)) return null;
  return /^<svg[\s>]/.test(svg.trim()) && /<\/svg>\s*$/.test(svg) ? svg.trim() : null;
}

export function parseReferences(answer: string): ModelReference[] {
  const out: ModelReference[] = [];
  for (const m of answer.matchAll(/<reference view="(front|side|three_quarter)">\s*([\s\S]*?)\s*<\/reference>/g)) {
    const svg = sanitizeSvg(m[2]!);
    if (svg) out.push({ view: m[1] as ReferenceView, svg });
  }
  return out;
}

/** Step 2. Returns what could be drawn: the model can still be built from the brief alone. */
export async function drawModelReferences(brief: string, options: ModelAgentOptions): Promise<ModelReference[]> {
  return parseReferences(await ask(buildReferencePrompt(brief), options, "sonnet", 240_000));
}

const BLENDER_RULES = `Write Blender 5 Python. Define a single function build() that creates the model in the empty scene.
- Blender coordinates: Z up, ground at z = 0, the front of the object faces -Y, 1 unit = 1 stud.
- Allowed imports: bpy, bmesh, math, mathutils, random. No file access, no export, no camera, no light: those are handled for you.
- Already defined: mat(name, "#rrggbb", roughness=0.75, metallic=0.0). Every object gets its colour with obj.data.materials.append(mat(...)). Use only the brief's palette.
- Model real forms, not stacked primitives: bmesh or mesh operators, extrusions, tapers, lathe-like profiles from vertex rings, BEVEL modifiers on hard edges (width about 2% of the model, 2 segments), SOLIDIFY for thin shells, MIRROR for symmetry.
- Every part overlaps its neighbour: nothing floats. The base meets z = 0.
- Keep it game-ready: under 15000 triangles, no subdivision above level 1, no booleans that can fail.
- Modifiers are applied for you. Objects may stay separate: they are joined for you.`;

export function buildBlenderPrompt(brief: string, context: ModelContext, references: ModelReference[], images: string[] = []): string {
  const drawings = images.length
    ? "The reference images listed below show the object: follow their proportions and forms."
    : references.length
      ? `Reference drawings of the object, as SVG on a 768 canvas. Read their coordinates for the proportions:\n${references.map((r) => `${r.view}:\n${r.svg}`).join("\n\n")}`
      : "";
  return `You are a senior game prop artist working in Blender.

${brief}
${context.heightStuds ? `\nHeight in the game: ${context.heightStuds} studs. The model is rescaled to that height for you.` : ""}
${drawings}

${BLENDER_RULES}

Answer with the script only, inside <script></script>.`;
}

export function parseBlenderScript(answer: string): string | null {
  const body = /<script>([\s\S]*?)<\/script>/.exec(answer)?.[1];
  const code = body?.replace(/^\s*```(?:python)?\s*\n/, "").replace(/\n\s*```\s*$/, "").trim();
  return code && /^def build\(\s*\)\s*:/m.test(code) ? code : null;
}

export interface CreateModelOptions extends ModelAgentOptions {
  runner: ProcessRunner;
  files: FileIO;
  blender: string;
  job: BlenderJob;
  /** Where the hidden working files go: the Blender job, and the rasterized references. */
  workDir: string;
  /** Turns a reference into a PNG the agents can see; returns its path. Without it they read the SVG. */
  rasterize?: (reference: ModelReference) => Promise<string | null>;
  /** Images the user supplied: they outrank the drawings. */
  extraImages?: string[];
  onStep?: (step: "brief" | "references" | "modelling" | "building" | "review" | "done", detail?: string) => void;
}

export interface CreatedModel {
  brief: string;
  references: ModelReference[];
  referenceImages: string[];
  report: BlenderReport;
  script: string;
}

/** The whole hidden chain from a request to GLB and FBX. Throws when Blender cannot produce a model. */
export async function createModel(request: string, context: ModelContext, options: CreateModelOptions): Promise<CreatedModel> {
  const { job, blender, runner, files, workDir, onStep } = options;
  const step = onStep ?? (() => undefined);
  step("brief");
  const { brief } = await enhanceModelPrompt(request, context, options);
  step("references");
  const references = await drawModelReferences(brief, options).catch(() => [] as ModelReference[]);
  const images: string[] = [...(options.extraImages ?? [])];
  for (const r of references) {
    const png = await options.rasterize?.(r).catch(() => null);
    if (png) images.push(png);
  }
  step("modelling");
  const write = async (prompt: string, seen: string[]) => {
    const script = parseBlenderScript(await ask(prompt, options, "sonnet", 300_000, seen));
    if (!script) throw new Error("the modelling agent returned no Blender script");
    return script;
  };
  const build = (code: string) => runBlenderJob(code, job, blender, runner, files, `${workDir}/job.py`);
  let script = await write(buildBlenderPrompt(brief, context, references, images), images);
  step("building");
  let report = await build(script);
  if (!report.ok) {
    // the error goes back once: most failures are a wrong operator argument in a new Blender version
    step("modelling", report.error);
    script = await write(`${buildBlenderPrompt(brief, context, references, images)}\n\nYour previous script:\n${script}\n\nBlender refused it:\n${report.error}\n\nFix it. Answer with the whole script.`, images);
    report = await build(script);
  }
  if (!report.ok) throw new Error(`Blender could not build the model: ${(report.error ?? "").slice(-300)}`);

  // one review: the render against the references
  step("review");
  const seen = [...images, job.preview];
  const reviewed = await write(
    `${buildBlenderPrompt(brief, context, references, images)}\n\nYour script:\n${script}\n\nThe last image is the render of your model. Compare it with the brief${images.length ? " and the references" : ""}: silhouette, proportions, missing forms, floating parts, colours. Rewrite the script to fix what is wrong and add the structure that is missing. Answer with the whole script.`,
    seen,
  ).catch(() => null);
  if (reviewed) {
    const better = await build(reviewed);
    // a review that breaks the model must not cost the first version
    if (better.ok) {
      script = reviewed;
      report = better;
    } else {
      report = await build(script);
    }
  }
  step("done");
  return { brief, references, referenceImages: images, report, script };
}
