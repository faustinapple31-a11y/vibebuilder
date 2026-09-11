import { ROBLOX_MATERIAL_ENUM, hexToColor3, type Part, type PrefabVariant, type Vec3 } from "@worldforge/core";

/**
 * Minimal .rbxmx (Roblox XML model) writer for PartList prefabs.
 * Used for the asset browser (insert into Studio) and for Rojo `assets/models/*.rbxmx`.
 */
type Mat3 = [number, number, number, number, number, number, number, number, number];

function mul(a: Mat3, b: Mat3): Mat3 {
  const r: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!);
  return r as Mat3;
}

/** Roblox CFrame.fromEulerAnglesXYZ = Rx * Ry * Rz (degrees in). */
export function eulerXYZToMatrix([dx, dy, dz]: Vec3): Mat3 {
  const x = (dx * Math.PI) / 180;
  const y = (dy * Math.PI) / 180;
  const z = (dz * Math.PI) / 180;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  const Rx: Mat3 = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry: Mat3 = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz: Mat3 = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul(mul(Rx, Ry), Rz);
}

const RZ90: Mat3 = eulerXYZToMatrix([0, 0, 90]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function num(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(5).replace(/\.?0+$/, "");
}

function color3uint8(hex: string): number {
  const [r, g, b] = hexToColor3(hex);
  return ((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

const SHAPE_TOKEN: Record<string, number> = { sphere: 0, box: 1, cylinder: 2 };

export function partToRbxmx(p: Part, ref: number, offset: Vec3 = [0, 0, 0]): string {
  const className = p.shape === "wedge" ? "WedgePart" : p.shape === "cornerWedge" ? "CornerWedgePart" : "Part";
  let R = eulerXYZToMatrix(p.rotation);
  let size = p.size;
  if (p.shape === "cylinder") {
    R = mul(R, RZ90);
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
    `<Color3uint8 name="Color3uint8">${color3uint8(p.color)}</Color3uint8>`,
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
  lines.push(`</Item>`);
  return lines.join("\n");
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
