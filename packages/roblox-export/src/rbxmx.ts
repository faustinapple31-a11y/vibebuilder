import { EFFECT_PRESETS, NEON_COLOR_SCALE, ROBLOX_MATERIAL_ENUM, eulerXYZToMatrix, hexToColor3, mat3Mul, type Mat3, type Part, type PrefabVariant, type Vec3 } from "@worldforge/core";

/**
 * Minimal .rbxmx (Roblox XML model) writer for PartList prefabs.
 * Used for the asset browser (insert into Studio) and for Rojo `assets/models/*.rbxmx`.
 */
export { eulerXYZToMatrix };

const RZ90: Mat3 = eulerXYZToMatrix([0, 0, 90]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function num(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(5).replace(/\.?0+$/, "");
}

function color3uint8(hex: string, scale = 1): number {
  const [r, g, b] = hexToColor3(hex).map((v) => Math.round(v * scale)) as [number, number, number];
  return ((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

const SHAPE_TOKEN: Record<string, number> = { sphere: 0, box: 1, cylinder: 2 };

export function partToRbxmx(p: Part, ref: number, offset: Vec3 = [0, 0, 0]): string {
  const className = p.shape === "wedge" ? "WedgePart" : p.shape === "cornerWedge" ? "CornerWedgePart" : "Part";
  let R = eulerXYZToMatrix(p.rotation);
  let size = p.size;
  if (p.shape === "cylinder") {
    R = mat3Mul(R, RZ90);
    size = [p.size[1], p.size[0], p.size[2]];
  }
  const [x, y, z] = [p.position[0] + offset[0], p.position[1] + offset[1], p.position[2] + offset[2]];
  const collide = p.collide ?? true;
  const lines = [
    `<Item class="${className}" referent="RBX${ref}">`,
    `<Properties>`,
    `<string name="Name">${esc(p.name ?? p.shape)}</string>`,
    `<bool name="Anchored">true</bool>`,
    `<bool name="CanCollide">${collide}</bool>`,
    `<bool name="CanQuery">${collide}</bool>`,
    `<bool name="CanTouch">${collide}</bool>`,
    `<bool name="CastShadow">${p.castShadow ?? true}</bool>`,
    `<CoordinateFrame name="CFrame"><X>${num(x)}</X><Y>${num(y)}</Y><Z>${num(z)}</Z><R00>${num(R[0])}</R00><R01>${num(R[1])}</R01><R02>${num(R[2])}</R02><R10>${num(R[3])}</R10><R11>${num(R[4])}</R11><R12>${num(R[5])}</R12><R20>${num(R[6])}</R20><R21>${num(R[7])}</R21><R22>${num(R[8])}</R22></CoordinateFrame>`,
    `<Color3uint8 name="Color3uint8">${color3uint8(p.color, p.material === "Neon" ? NEON_COLOR_SCALE : 1)}</Color3uint8>`,
    `<token name="Material">${ROBLOX_MATERIAL_ENUM[p.material] ?? 256}</token>`,
    `<float name="Transparency">${num(p.transparency ?? 0)}</float>`,
    `<float name="Reflectance">${num(p.reflectance ?? 0)}</float>`,
    `<Vector3 name="size"><X>${num(size[0])}</X><Y>${num(size[1])}</Y><Z>${num(size[2])}</Z></Vector3>`,
    `<token name="TopSurface">0</token>`,
    `<token name="BottomSurface">0</token>`,
  ];
  if (className === "Part") lines.push(`<token name="shape">${SHAPE_TOKEN[p.shape] ?? 1}</token>`);
  lines.push(`</Properties>`);
  if (p.light) {
    const [r, g, b] = hexToColor3(p.light.color);
    lines.push(
      `<Item class="PointLight" referent="RBX${ref}L"><Properties><string name="Name">PointLight</string><Color3 name="Color"><R>${num(r / 255)}</R><G>${num(g / 255)}</G><B>${num(b / 255)}</B></Color3><float name="Brightness">${num(p.light.brightness)}</float><float name="Range">${num(p.light.range)}</float><bool name="Shadows">false</bool></Properties></Item>`,
    );
  }
  if (p.effect) lines.push(effectToRbxmx(p, ref));
  lines.push(`</Item>`);
  return lines.join("\n");
}

/** ParticleEmitter child for an ambient effect part (presets mirror the Roblox runtime factory). */
function effectToRbxmx(p: Part, ref: number): string {
  const fx = p.effect!;
  const preset = EFFECT_PRESETS[fx.kind];
  const [r, g, b] = hexToColor3(fx.color ?? preset.color).map((v) => v / 255);
  const [s0, s1, s2] = preset.size;
  const [t0, t1, t2] = preset.transparency;
  return [
    `<Item class="ParticleEmitter" referent="RBX${ref}E"><Properties>`,
    `<string name="Name">fx_${fx.kind}</string>`,
    `<Content name="Texture"><url>${preset.texture}</url></Content>`,
    `<ColorSequence name="Color">0 ${num(r!)} ${num(g!)} ${num(b!)} 0 1 ${num(r!)} ${num(g!)} ${num(b!)} 0 </ColorSequence>`,
    `<NumberSequence name="Size">0 ${num(s0)} 0 0.5 ${num(s1)} 0 1 ${num(s2)} 0 </NumberSequence>`,
    `<NumberSequence name="Transparency">0 ${num(t0)} 0 0.5 ${num(t1)} 0 1 ${num(t2)} 0 </NumberSequence>`,
    `<NumberRange name="Lifetime">${num(preset.lifetime[0])} ${num(preset.lifetime[1])} </NumberRange>`,
    `<NumberRange name="Speed">${num(preset.speed[0])} ${num(preset.speed[1])} </NumberRange>`,
    `<NumberRange name="RotSpeed">${num(preset.rotSpeed[0])} ${num(preset.rotSpeed[1])} </NumberRange>`,
    `<float name="Rate">${num(fx.rate ?? preset.rate)}</float>`,
    `<Vector2 name="SpreadAngle"><X>${num(preset.spread)}</X><Y>${num(preset.spread)}</Y></Vector2>`,
    `<Vector3 name="Acceleration"><X>${num(preset.acceleration[0])}</X><Y>${num(preset.acceleration[1])}</Y><Z>${num(preset.acceleration[2])}</Z></Vector3>`,
    `<float name="Drag">${num(preset.drag)}</float>`,
    `<float name="LightEmission">${num(preset.lightEmission)}</float>`,
    `<float name="LightInfluence">0</float>`,
    `<bool name="Enabled">true</bool>`,
    `</Properties></Item>`,
  ].join("\n");
}

export function prefabToRbxmx(variant: PrefabVariant, minLod = 0): string {
  const items: string[] = [];
  let ref = 1;
  for (const p of variant.parts) {
    if ((p.lod ?? 0) < minLod) continue;
    items.push(partToRbxmx(p, ref++));
  }
  return [
    `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">`,
    `<Item class="Model" referent="RBX0">`,
    `<Properties><string name="Name">${esc(variant.id)}</string></Properties>`,
    ...items,
    `</Item>`,
    `</roblox>`,
  ].join("\n");
}

/** A whole set of variants as a Folder of Models (e.g. for the asset browser). */
export function prefabSetToRbxmx(name: string, variants: PrefabVariant[]): string {
  let ref = 1;
  const models = variants.map((v, vi) => {
    const parts = v.parts.map((p) => partToRbxmx(p, ref++, [vi * 40, 0, 0]));
    return `<Item class="Model" referent="RBXM${vi}"><Properties><string name="Name">${esc(v.id)}</string></Properties>${parts.join("\n")}</Item>`;
  });
  return `<roblox version="4"><Item class="Folder" referent="RBXF0"><Properties><string name="Name">${esc(name)}</string></Properties>${models.join("\n")}</Item></roblox>`;
}
