import type { IAgentProvider, FileIO } from "./types";
import type { ProcessRunner } from "./runner";
import { SESSION_DEFAULTS, askModel } from "./prompt-enhancer";
import { runBlenderJob, type BlenderJob, type BlenderReport } from "./blender-job";

/**
 * The 3D model pipeline, the twin of the map's hidden brief. The user sees only the result:
 *   1. a small model rewrites the request into a modelling brief ("une épée" stays the intent);
 *   2. Claude Design, on Opus 5.5, builds the model in Blender, in 3D, with all the detail it can, no budget;
 *   3. Blender bakes that design onto a game shell under the Roblox triangle limit and exports GLB and FBX.
 * Step 3 takes seconds. It replaced a second and third Opus pass, each as slow as the design, and it keeps
 * every detail in the textures, where a rewritten script would have to redraw them.
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

const MODEL_EXAMPLES = `Request: une enclume
<brief>
OBJECT: a blacksmith's anvil on a sawn tree stump, scarred by years of work, a hammer resting on its face.
SILHOUETTE: long horn on one side, heavy square heel on the other, narrow waist, wide stump below.
MASSES: anvil body; tree stump; hammer.
FORMS: stepped face, pritchel holes, iron straps nailed around the stump, hammer head and wedge, bark ring.
ACCENTS: a chipped edge on the face, one glowing horseshoe, a few sparks of scale on the stump.
PALETTE: #3b3d44 iron, #5a5d66 worn iron, #6e4a2c stump, #a9825a cut wood, accent #ff8a3c hot metal.
FRONT: the horn points to the viewer's left.
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
Examples of the format only. Never reuse their content, their palette or their wording, even for a similar object: find this object's own character.
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
/**
 * The design gets Opus 5.5's full thinking and all the time it needs: quality comes first, by the user's decision.
 * Measured on 5 Nov 2026, same dragon: default effort took 26 minutes and was clearly better than low effort at
 * 6 minutes. Never lower the effort to save time.
 */
const OPUS_TIMEOUT_MS = 3_600_000;

export interface ModelAgentOptions {
  provider?: IAgentProvider;
  cwd: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function ask(prompt: string, options: ModelAgentOptions, model: "haiku" | typeof DESIGN_MODEL, timeoutMs: number, images?: string[], effort?: string): Promise<string> {
  const { provider, cwd, signal } = options;
  const base = provider && SESSION_DEFAULTS[provider.id]?.(model);
  if (!provider || !base) throw new Error("no agent can design the model");
  // the images are read through the Read tool, the only tool these agents get
  const tooled = images?.length ? { ...base, extraArgs: base.extraArgs?.map((a) => (a === "--tools=" ? "--tools=Read" : a)) } : base;
  const defaults = effort ? { ...tooled, effort } : tooled;
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

const CONCEPT_RULES = `- This is the design, not the game asset: no triangle budget. Go as far as the form deserves, up to 300000 triangles.
- Colour follows the forms: each part has its own material. Never pick a material per face from noise or random values: on large faces it turns into blocky camouflage.
- Sculpt real volume: subdivision surface on organic forms, displaced or hand-placed detail, individual scales, rivets, planks, folds, wear. No flat placeholder surfaces.`;

export function buildConceptPrompt(brief: string, context: ModelContext, images: string[] = []): string {
  return `You are the lead 3D designer of a game studio. Build this object in 3D, in Blender, with as much detail as you can.

${brief}
${context.heightStuds ? `\nHeight in the game: ${context.heightStuds} studs. The model is rescaled to that height for you.` : ""}
${images.length ? "\nThe images listed below are references from the client: follow them." : ""}

Every side is seen: design them all, not only the front. Your design is baked onto a game mesh for you: fine relief and colour survive as textures, so put them in. Compact code: small reusable helpers and loops, not one line per part, under 500 lines. The silhouette must stay readable; the detail serves it.

${BLENDER_RULES}
${CONCEPT_RULES}

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
  /** Where the hidden working files go. */
  workDir: string;
  /** Images the user supplied. */
  extraImages?: string[];
  /** Only for experiments: production leaves the model at its default effort. */
  effort?: string;
  onStep?: (step: "brief" | "design" | "building" | "done", detail?: string) => void;
}

export interface CreatedModel {
  brief: string;
  report: BlenderReport;
  script: string;
}

const scriptOf = (answer: string): string => {
  const code = parseBlenderScript(answer);
  if (!code) throw new Error("the agent returned no Blender script");
  return code;
};

/** The whole hidden chain from a request to GLB and FBX. Throws when Blender cannot produce a model. */
export async function createModel(request: string, context: ModelContext, options: CreateModelOptions): Promise<CreatedModel> {
  const { job, blender, runner, files, workDir, onStep } = options;
  const step = onStep ?? (() => undefined);
  const images = options.extraImages ?? [];
  step("brief");
  const { brief } = await enhanceModelPrompt(request, context, options);
  step("design");
  const prompt = buildConceptPrompt(brief, context, images);
  const write = (text: string) => ask(text, options, DESIGN_MODEL, OPUS_TIMEOUT_MS, images, options.effort).then(scriptOf);
  const build = (code: string) => runBlenderJob(code, job, blender, runner, files, `${workDir}/job.py`);
  let code = await write(prompt);
  step("building");
  let report = await build(code);
  // a refusal goes back to the agent: most are a wrong name in Blender's API
  for (let attempt = 0; attempt < 2 && !report.ok; attempt++) {
    step("design", report.error);
    code = await write(`${prompt}\n\nYour previous script:\n${code}\n\nBlender refused it:\n${report.error}\n\nFix it. Answer with the whole script.`);
    step("building");
    report = await build(code);
  }
  if (!report.ok) throw new Error(`Blender could not build the model: ${(report.error ?? "").slice(-300)}`);
  step("done");
  return { brief, report, script: code };
}
