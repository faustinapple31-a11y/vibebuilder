/**
 * A plan holding one variant of every prefab, facility and place of a style: to judge the Blender models without a world.
 *   npx tsx scripts/kit-plan.ts modern_city out.json [--variants 1]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { STYLE_FAMILY_INDEX, StyleBibleSchema, styleFamilyToBible } from "../packages/core/src";
import { buildPrefabLibrary, PREFAB_INDEX } from "../packages/prefabs/src";
import { facilityLibrary } from "../packages/world-gen/src/pipeline/facilities";
import { placeLibrary } from "../packages/world-gen/src/pipeline/places";
import { kitEntry } from "../packages/blender-map/src/plan";

const [family = "modern_city", out = "demo-output/kit/plan.json"] = process.argv.slice(2);
const at = process.argv.indexOf("--variants");
const n = at > 0 ? Number(process.argv[at + 1]) : 1;
const style = StyleBibleSchema.parse(styleFamilyToBible(STYLE_FAMILY_INDEX[family]!));
const lib = buildPrefabLibrary(Object.keys(PREFAB_INDEX), style, 7, {});
const kit = Object.entries(lib).flatMap(([prefab, vs]) => vs.slice(0, n).map((v, i) => kitEntry(v, prefab, i)));
for (const v of [...facilityLibrary(style, 7), ...placeLibrary(style, 7)]) kit.push(kitEntry(v, v.prefab, 0));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ kit, palette: style.palette, architecture: style.architecture.style, weathering: style.architecture.weathering ?? 0.2, seed: 7 }));
console.log(family, kit.length, "pieces");
