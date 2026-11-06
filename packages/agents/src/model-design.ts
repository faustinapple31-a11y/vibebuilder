import type { IAgentProvider, FileIO } from "./types";
import type { ProcessRunner } from "./runner";
import { SESSION_DEFAULTS, askModel } from "./prompt-enhancer";
import { CONCEPT_VIEWS, runBlenderConcept, runBlenderJob, type BlenderJob, type BlenderReport, type ConceptView } from "./blender-job";
import { gateProblemsForPrompt, gateScore, modelGateProblems, type GateProblem } from "./mesh-gates";

/**
 * The 3D model pipeline, the twin of the map's hidden brief. The user sees none of the first three steps:
 *   1. a small model rewrites the request into a modelling brief ("une épée" stays the intent);
 *   2. Claude Design, on Opus 5.5, builds a 3D concept in Blender, as detailed as it can, with no triangle
 *      budget; it is rendered from every side;
 *   3. those renders and the brief go back to Opus 5.5, which writes the game-ready Blender script;
 *   4. Blender builds the model and exports GLB and FBX, measures the mesh gates (mesh-gates.ts) and renders it
 *      from the design's sides and as 64 px silhouettes; one review pass compares it with the concept, with the
 *      measured defects in hand, and one repair pass follows when a serious gate still fails.
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

/** The 3D design and the game model are both made by Opus 5.5, whatever the settings say. */
export const DESIGN_MODEL = "claude-opus-5-5";
/** Measured on 5 Nov 2026: Opus 5.5 needed more than 10 minutes for a detailed design script. */
const OPUS_TIMEOUT_MS = 1_500_000;

export interface ModelAgentOptions {
  provider?: IAgentProvider;
  cwd: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function ask(prompt: string, options: ModelAgentOptions, model: "haiku" | typeof DESIGN_MODEL, timeoutMs: number, images?: string[]): Promise<string> {
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

const BLENDER_RULES = `Write Blender 5 Python. Define a single function build() that creates the model in the empty scene.
- Blender coordinates: Z up, ground at z = 0, the front of the object faces -Y, 1 unit = 1 stud.
- Allowed imports: bpy, bmesh, math, mathutils, random. No file access, no export, no camera, no light: those are handled for you.
- Already defined: mat(name, "#rrggbb", roughness=0.75, metallic=0.0). Every object gets its colour with obj.data.materials.append(mat(...)). Use only the brief's palette.
- Model real forms, not stacked primitives: bmesh or mesh operators, extrusions, tapers, lathe-like profiles from vertex rings, BEVEL modifiers on hard edges (width about 2% of the model, 2 segments), SOLIDIFY for thin shells, MIRROR for symmetry.
- Every part overlaps its neighbour: nothing floats. The base meets z = 0.
- Modifiers are applied for you. Objects may stay separate: they are joined for you.
- Blender 5 names: bmesh.ops.create_uvsphere, create_icosphere, create_cone, create_cube, create_circle, create_grid. A bmesh sphere takes u_segments, v_segments, radius.
- Your own helper names must not start with an underscore.
- Blender runs headless: there is no viewport and little operator context. Prefer bmesh and the data API; after bmesh, call bm.to_mesh(me) then bm.free(), or the mesh stays empty. bmesh.ops.bevel takes clamp_overlap=True on thin parts. Wrap bm.faces.new in try/except. create_icosphere needs subdivisions of 2 or more to look round.
- Symmetric by design? Build half and mirror it. Anything meant to be centred is centred; anything meant to sit on a surface touches it.
- One dominant shape family and one accent family, straight against curve on the main masses. Small details stay under 15% of the silhouette.
- Spend geometry on the top silhouette and the focal feature, not evenly: segment count follows the radius, small round parts need their own.
- Faceted style: a 1-segment chamfer on edges. Smooth style: 2 segments. A bevel under 2 pixels at play distance is wasted, so landmarks get double.
- A creature or character gets one exaggerated feature and open gaps between its masses, so the outline reads as a filled shape.`;

const BUDGET_RULES = "- Game-ready: under 15000 triangles, no subdivision above level 1, no booleans that can fail.";

const CONCEPT_RULES = `- This is the design, not the game asset: no triangle budget. Go as far as the form deserves, up to 300000 triangles.
- Sculpt real volume: subdivision surface on organic forms, displaced or hand-placed detail, individual scales, rivets, planks, folds, wear. No flat placeholder surfaces.`;

export function buildConceptPrompt(brief: string, context: ModelContext): string {
  return `You are the lead 3D concept designer of a game studio. Design this object in 3D, in Blender, with as much detail as you can.

${brief}
${context.heightStuds ? `\nHeight in the game: ${context.heightStuds} studs.` : ""}

Write compact code: small reusable helpers and loops, not one line per part, under 500 lines. The silhouette must stay readable; the detail serves it. Your design is rendered from the front, the right, the back and in three-quarter view, then handed to the modellers: every side must be designed, not only the front.

${BLENDER_RULES}
${CONCEPT_RULES}

Answer with the script only, inside <script></script>.`;
}

export function buildBlenderPrompt(brief: string, context: ModelContext, images: string[] = []): string {
  return `You are a senior game prop artist working in Blender.

${brief}
${context.heightStuds ? `\nHeight in the game: ${context.heightStuds} studs. The model is rescaled to that height for you.` : ""}
${images.length ? "\nThe images listed below are renders of the approved 3D design, from several sides. Read each one. Match its silhouette, proportions, forms and colours, and turn it into a game-ready model: keep what reads at game distance, simplify the rest." : ""}

${BLENDER_RULES}
${BUDGET_RULES}

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
  /** Where the hidden working files go: the Blender scripts and the renders of the 3D design. */
  workDir: string;
  /** Images the user supplied: they go with the renders. */
  extraImages?: string[];
  onStep?: (step: "brief" | "design" | "modelling" | "building" | "review" | "repair" | "done", detail?: string) => void;
}

export interface CreatedModel {
  brief: string;
  /** Renders of the 3D design; empty when the design failed and the model came from the brief alone. */
  designImages: string[];
  designScript?: string;
  report: BlenderReport;
  script: string;
  /** The mesh gates the delivered model still fails, if any. */
  problems: GateProblem[];
}

const script = (answer: string): string => {
  const code = parseBlenderScript(answer);
  if (!code) throw new Error("the agent returned no Blender script");
  return code;
};

/** Writes a script and runs it; a refusal goes back to the agent, because most are a wrong name in Blender's API. */
async function writeAndBuild(prompt: string, model: Parameters<typeof ask>[2], options: ModelAgentOptions, timeoutMs: number, images: string[], build: (code: string) => Promise<BlenderReport>, onRetry?: (error?: string) => void): Promise<{ code: string; report: BlenderReport }> {
  let code = script(await ask(prompt, options, model, timeoutMs, images));
  let report = await build(code);
  for (let attempt = 0; attempt < 2 && !report.ok; attempt++) {
    onRetry?.(report.error);
    code = script(await ask(`${prompt}\n\nYour previous script:\n${code}\n\nBlender refused it:\n${report.error}\n\nFix it. Answer with the whole script.`, options, model, timeoutMs, images));
    report = await build(code);
  }
  return { code, report };
}

/** Step 2: the 3D design, rendered from every side. Returns nothing rather than stop the model. */
async function designIn3D(brief: string, context: ModelContext, options: CreateModelOptions): Promise<{ images: string[]; script?: string }> {
  const { workDir, blender, runner, files } = options;
  const renders = Object.fromEntries((Object.keys(CONCEPT_VIEWS) as ConceptView[]).map((v) => [v, `${workDir}/design_${v}.png`])) as Record<ConceptView, string>;
  const build = (code: string) => runBlenderConcept(code, renders, `${workDir}/design.json`, blender, runner, files, `${workDir}/design.py`);
  try {
    const { code, report } = await writeAndBuild(buildConceptPrompt(brief, context), DESIGN_MODEL, options, OPUS_TIMEOUT_MS, [], build, (e) => options.onStep?.("design", e));
    if (report.ok) return { images: Object.values(renders), script: code };
    options.onStep?.("design", `no design: ${report.error}`);
  } catch (e) {
    options.onStep?.("design", `no design: ${(e as Error).message}`);
  }
  return { images: [] };
}

/** The review: the renders of the finished model against the design, with the measured defects in hand. */
export function buildReviewPrompt(prompt: string, code: string, problems: GateProblem[], hasDesign: boolean, job: BlenderJob): string {
  const finals = Object.values(job.views ?? {});
  const seen = [
    hasDesign && "design_*.png are the approved design",
    finals.length ? `${finals.map((f) => f.split("/").pop()).join(", ")} are your model from the same sides` : `${job.preview.split("/").pop()} is your model in three-quarter view`,
    job.silhouette && `${job.silhouette.split("/").pop()} shows it as black silhouettes at 64 pixels (front, side, three-quarter), the size a player reads it at`,
  ].filter(Boolean);
  return `${prompt}

Your script:
${code}

${gateProblemsForPrompt(problems)}

Images: ${seen.join("; ")}.
Review it as a strict art director against the brief${hasDesign ? " and the design" : ""}, in this order. First the measured problems above. Then correctness: is a symmetric object lopsided, a centred feature off-centre, anything floating or sunk? Then surface: pinches, seams, stray faceting. Then style: does each silhouette read as this object, are large, medium and small forms clearly separate, do proportions look designed rather than stiff primitives, do the edges catch light, is the palette disciplined? Rewrite the script to fix what fails and add the structure that is missing. Answer with the whole script.`;
}

/** The final job with the review's renders: the design's sides and the silhouettes, in the work folder. */
export function withReviewRenders(job: BlenderJob, workDir: string): BlenderJob {
  const views = job.views ?? (Object.fromEntries((Object.keys(CONCEPT_VIEWS) as ConceptView[]).map((v) => [v, `${workDir}/final_${v}.png`])) as Record<ConceptView, string>);
  return { ...job, views, silhouette: job.silhouette ?? `${workDir}/silhouette.png` };
}

/** The whole hidden chain from a request to GLB and FBX. Throws when Blender cannot produce a model. */
export async function createModel(request: string, context: ModelContext, options: CreateModelOptions): Promise<CreatedModel> {
  const { blender, runner, files, workDir, onStep } = options;
  const job = withReviewRenders(options.job, workDir);
  const step = onStep ?? (() => undefined);
  const gates = (report: BlenderReport) => modelGateProblems(report, { heightStuds: job.heightStuds, maxTriangles: job.maxTriangles, category: context.category });
  step("brief");
  const { brief } = await enhanceModelPrompt(request, context, options);
  step("design");
  const design = await designIn3D(brief, context, options);
  const images = [...(options.extraImages ?? []), ...design.images];
  const reviewImages = [...images, ...Object.values(job.views ?? {}), ...(job.silhouette ? [job.silhouette] : [])];

  step("modelling");
  const build = (code: string) => runBlenderJob(code, job, blender, runner, files, `${workDir}/job.py`);
  const prompt = buildBlenderPrompt(brief, context, images);
  const first = await writeAndBuild(prompt, DESIGN_MODEL, options, OPUS_TIMEOUT_MS, images, build, (e) => step("modelling", e));
  if (!first.report.ok) throw new Error(`Blender could not build the model: ${(first.report.error ?? "").slice(-300)}`);
  let { code, report } = first;
  let problems = gates(report);

  /** Builds a candidate and keeps it unless it is broken or fails the gates worse; the files on disk follow the kept one. */
  const attempt = async (answer: string): Promise<void> => {
    const candidate = parseBlenderScript(answer);
    if (!candidate) return;
    const built = await build(candidate);
    const found = built.ok ? gates(built) : [];
    if (built.ok && gateScore(found) <= gateScore(problems)) {
      code = candidate;
      report = built;
      problems = found;
    } else {
      // a review that breaks the model must not cost the earlier version
      report = await build(code);
    }
  };

  step("review", problems.map((p) => p.gate).join(", ") || undefined);
  await attempt(await ask(buildReviewPrompt(prompt, code, problems, design.images.length > 0, job), options, DESIGN_MODEL, OPUS_TIMEOUT_MS, reviewImages).catch(() => ""));

  // the review may trade one defect for another: a serious gate gets one focused repair
  const serious = problems.filter((p) => p.severity === "high");
  if (serious.length) {
    step("repair", serious.map((p) => p.gate).join(", "));
    await attempt(await ask(`${prompt}\n\nYour script:\n${code}\n\n${gateProblemsForPrompt(serious)}\n\nFix only these, keep everything else as it is. Answer with the whole script.`, options, DESIGN_MODEL, OPUS_TIMEOUT_MS, reviewImages).catch(() => ""));
  }
  step("done");
  return { brief, designImages: design.images, designScript: design.script, report, script: code, problems };
}
