import { jitterHex, lightenHex, mixHex, type PrefabVariant, type Vec3 } from "@worldforge/core";
import { PartListBuilder, jitter, v3, type PrefabContext } from "./builder";

/**
 * Architecture prefabs. Origin = center of the footprint at ground level; the front (door) faces -Z.
 */

function wallColor(ctx: PrefabContext): string {
  return jitterHex(ctx.style.palette.wall, jitter(ctx.rng, 6), jitter(ctx.rng, 0.04), jitter(ctx.rng, 0.06));
}
function roofColor(ctx: PrefabContext): string {
  return jitterHex(ctx.style.palette.roof, jitter(ctx.rng, 8), jitter(ctx.rng, 0.05), jitter(ctx.rng, 0.06));
}
function stoneColor(ctx: PrefabContext): string {
  return jitterHex(ctx.style.palette.stone, jitter(ctx.rng, 6), 0, jitter(ctx.rng, 0.06));
}
function beamColor(ctx: PrefabContext): string {
  return jitterHex(ctx.style.palette.wood, jitter(ctx.rng, 4), 0, -0.1 + jitter(ctx.rng, 0.04));
}

export function cottage(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const arch = style.architecture;
  const b = new PartListBuilder();
  const sv = arch.scaleVariance;
  const s = style.scaleRules.buildingScale * rng.float(1 - sv, 1 + sv);
  const W = rng.float(14, 20) * s;
  const D = rng.float(11, 16) * s;
  const H = rng.float(8, 10.5) * s;
  const weathering = arch.style === "ruined" ? 1 : arch.weathering;
  const wCol = wallColor(ctx);
  const rCol = roofColor(ctx);
  const sCol = stoneColor(ctx);
  const bCol = beamColor(ctx);
  const isStone = arch.style === "stone_hut" || arch.style === "nordic";
  const isAdobe = arch.style === "desert_adobe";
  const isCyber = arch.style === "cyber_block";
  const timber = !isStone && !isAdobe && !isCyber;
  const wallMat = isStone ? style.materials.stoneWall : isAdobe ? "Sandstone" : isCyber ? "Metal" : style.materials.wall;
  const wallColor2 = isStone ? mixHex(wCol, sCol, 0.6) : wCol;
  const inhabited = weathering <= 0.6;

  // foundation + stone base course (sunk below ground so it never floats on slopes)
  b.box([0, 0.2, 0], [W + 1.6, 2.6, D + 1.6], sCol, { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.box([0, 1.9, 0], [W + 0.5, 1.4, D + 0.5], jitterHex(sCol, 0, 0, -0.06), { material: style.materials.stoneWall, collide: true, lod: 1 });
  // walls
  const wallY0 = 1.5;
  b.box([0, wallY0 + H / 2, 0], [W, H, D], wallColor2, { material: wallMat, collide: true, lod: 2 });

  // timber frame beams
  const bw = 0.7 * s;
  if (timber) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        b.box([(sx * W) / 2, wallY0 + H / 2, (sz * D) / 2], [bw, H + 0.2, bw], bCol, { material: style.materials.trunk, collide: false, lod: 1 });
      }
    }
    for (const sz of [-1, 1]) {
      b.box([0, wallY0 + H - bw / 2, (sz * D) / 2], [W + bw, bw, bw], bCol, { material: style.materials.trunk, collide: false, lod: 0 });
      b.box([0, wallY0 + H * 0.5, sz * (D / 2 + 0.05)], [W * 0.9, bw * 0.8, bw * 0.6], bCol, { material: style.materials.trunk, collide: false, lod: 0 });
    }
    for (const sx of [-1, 1]) {
      b.box([sx * (W / 2 + 0.05), wallY0 + H * 0.5, 0], [bw * 0.6, bw * 0.8, D * 0.9], bCol, { material: style.materials.trunk, collide: false, lod: 0 });
    }
    // diagonal braces on the front corners
    for (const sx of [-1, 1]) {
      b.beam([sx * W * 0.45, wallY0 + 0.6, -D / 2 - 0.05], [sx * W * 0.2, wallY0 + H * 0.5 - 0.4, -D / 2 - 0.05], bw * 0.7, bw * 0.5, bCol, { material: style.materials.trunk, collide: false, lod: 0 });
    }
  }

  // roof
  const roofBaseY = wallY0 + H;
  const roofH = D * 0.5 * arch.roofPitch * (isAdobe || isCyber ? 0.12 : 1);
  const overhang = 1.8 * s;
  const roofW = W + overhang * 2;
  const roofD = D + overhang * 2;
  const collapsed = weathering > 0.45 && rng.chance(weathering * 0.7);
  if (isAdobe || isCyber) {
    b.box([0, roofBaseY + 0.5, 0], [W + 0.6, 1.0, D + 0.6], isCyber ? mixHex(wCol, "#222633", 0.5) : lightenHex(wCol, 0.05), { material: wallMat, collide: true, lod: 2 });
    // parapet
    b.box([0, roofBaseY + 1.5, -D / 2], [W + 0.6, 1.6, 0.8], wallColor2, { material: wallMat, collide: false, lod: 1 });
    b.box([0, roofBaseY + 1.5, D / 2], [W + 0.6, 1.6, 0.8], wallColor2, { material: wallMat, collide: false, lod: 1 });
    if (isCyber) {
      b.box([0, roofBaseY + 0.2, -D / 2 - 0.35], [W * 0.8, 0.3, 0.3], style.palette.glow, { material: "Neon", collide: false, lod: 1, light: { type: "point", color: style.palette.glow, brightness: 1.2, range: 18 } });
    }
  } else if (!collapsed) {
    b.gableRoof([0, roofBaseY + roofH / 2, 0], roofW, roofD, roofH, rCol, { material: style.materials.roof, collide: true, lod: 2 });
    // shingle strips (near detail only)
    b.roofShingles([0, roofBaseY + roofH / 2, 0], roofW + 0.2, roofD, roofH, 4, rCol, { material: style.materials.roof, collide: false, castShadow: false, lod: 0 });
    // ridge beam + gable trims
    b.box([0, roofBaseY + roofH + 0.25, 0], [roofW + 0.4, 0.7, 0.9], mixHex(rCol, bCol, 0.5), { material: style.materials.trunk, collide: false, lod: 1 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        b.beam([sx * (roofW / 2 + 0.1), roofBaseY + 0.1, sz * (roofD / 2)], [sx * (roofW / 2 + 0.1), roofBaseY + roofH + 0.1, 0], 0.5, 0.5, bCol, { material: style.materials.trunk, collide: false, lod: 0, overlap: 0.2 });
      }
    }
    // eave brackets
    for (const sz of [-1, 1]) {
      for (const sx of [-0.35, 0.35]) {
        b.beam([sx * W, roofBaseY - 1.6, sz * (D / 2 + 0.05)], [sx * W, roofBaseY - 0.2, sz * (D / 2 + overhang - 0.3)], 0.45, 0.45, bCol, { material: style.materials.trunk, collide: false, lod: 0 });
      }
    }
  } else {
    // collapsed roof: one intact half, one broken shorter half, exposed rafters
    b.wedge([0, roofBaseY + roofH / 2, roofD / 4], [roofW, roofH, roofD / 2], rCol, { material: style.materials.roof, rotation: [0, 180, 0], collide: true, lod: 2 });
    b.wedge([-W * 0.28, roofBaseY + roofH * 0.35, -roofD / 4], [W * 0.42, roofH * 0.7, roofD / 2], jitterHex(rCol, 0, 0, -0.06), { material: style.materials.roof, rotation: [0, 0, 0], collide: true, lod: 2 });
    for (let i = 0; i < 4; i++) {
      const x = W * 0.05 + i * W * 0.12;
      b.beam([x, roofBaseY, -roofD / 2 + 0.5], [x, roofBaseY + roofH, 0], 0.55, 0.55, bCol, { material: style.materials.trunk, collide: false, lod: 1 });
    }
    // rubble
    for (let i = 0; i < 4; i++) {
      b.box([jitter(rng, W * 0.4), 0.8 + jitter(rng, 0.3), -D / 2 - rng.float(1, 4)], [rng.float(1.5, 3), rng.float(1, 2), rng.float(1.5, 3)], sCol, { material: style.materials.rock, rotation: [jitter(rng, 20), rng.float(0, 360), jitter(rng, 20)], collide: false, lod: 0 });
    }
  }

  // door (front -Z)
  const doorW = 4 * s;
  const doorH = 7 * s;
  const doorX = jitter(rng, W * 0.25);
  const doorOpen = weathering > 0.5 && rng.chance(0.5);
  b.box([doorX, wallY0 + doorH / 2, -D / 2 - 0.2], [doorW, doorH, 0.5], doorOpen ? "#1a1612" : mixHex(bCol, "#2a1c14", 0.5), { material: doorOpen ? "SmoothPlastic" : style.materials.trunk, collide: false, lod: 1 });
  b.box([doorX, wallY0 + doorH + 0.4, -D / 2 - 0.25], [doorW + 1.2, 0.8, 0.6], bCol, { material: style.materials.trunk, collide: false, lod: 0 });
  for (const sx of [-1, 1]) b.box([doorX + sx * (doorW / 2 + 0.3), wallY0 + doorH / 2, -D / 2 - 0.25], [0.6, doorH, 0.6], bCol, { material: style.materials.trunk, collide: false, lod: 0 });
  if (!doorOpen) b.sphere([doorX + doorW * 0.3, wallY0 + doorH * 0.5, -D / 2 - 0.5], 0.5, "#c9a24a", { material: style.materials.metal, collide: false, lod: 0 });

  // porch: stone step + two posts + small awning
  b.box([doorX, 0.45, -D / 2 - 1.6], [doorW + 2.4, 1.3, 2.6], sCol, { material: style.materials.stoneWall, collide: true, lod: 1 });
  if (timber && !collapsed && rng.chance(0.6)) {
    const az = -D / 2 - overhang + 0.4;
    for (const sx of [-1, 1]) {
      b.box([doorX + sx * (doorW / 2 + 1.2), wallY0 + doorH * 0.6, az], [0.7, doorH * 1.2, 0.7], bCol, { material: style.materials.trunk, collide: false, lod: 1 });
    }
    b.box([doorX, wallY0 + doorH * 1.2 + 0.3, az], [doorW + 3.2, 0.6, 0.7], bCol, { material: style.materials.trunk, collide: false, lod: 0 });
  }

  // lantern by the door (inhabited houses)
  if (inhabited && rng.chance(0.75)) {
    const lx = doorX + (doorX > 0 ? -1 : 1) * (doorW / 2 + 1.4);
    const glow = mixHex("#ffb866", style.palette.glow, 0.25);
    b.box([lx, wallY0 + doorH * 0.85, -D / 2 - 0.5], [0.4, 0.4, 1.0], "#2b2622", { material: style.materials.metal, collide: false, lod: 0 });
    b.box([lx, wallY0 + doorH * 0.85 - 0.9, -D / 2 - 0.9], [0.9, 1.3, 0.9], glow, { material: "Neon", transparency: 0.15, collide: false, lod: 1, light: { type: "point", color: glow, brightness: 1.3, range: 22 } });
  }

  // windows (+ shutters, flower box)
  const winColor = inhabited ? mixHex(style.palette.glow, "#ffe2a8", 0.65) : "#1c1a17";
  const winMat = inhabited ? "Neon" : "SmoothPlastic";
  const windows: [number, number, number, number][] = []; // x, y, z, rotY
  const frontWinX = doorX > 0 ? -W * 0.3 : W * 0.3;
  windows.push([frontWinX, wallY0 + H * 0.55, -D / 2 - 0.15, 0]);
  windows.push([W / 2 + 0.15, wallY0 + H * 0.55, jitter(rng, D * 0.2), 90]);
  windows.push([-W / 2 - 0.15, wallY0 + H * 0.55, jitter(rng, D * 0.2), -90]);
  const ws = 3.2 * s;
  for (const [x, y, z, ry] of windows) {
    const boarded = weathering > 0.5 && rng.chance(weathering * 0.6);
    const outward: Vec3 = ry === 0 ? [0, 0, -1] : ry === 90 ? [1, 0, 0] : [-1, 0, 0];
    const along: Vec3 = ry === 0 ? [1, 0, 0] : [0, 0, 1];
    const c: Vec3 = [x, y, z];
    b.box(c, [ws, ws, 0.4], boarded ? bCol : winColor, { material: boarded ? style.materials.trunk : winMat, rotation: [0, ry, 0], collide: false, lod: 1, light: !boarded && inhabited ? { type: "point", color: "#ffd9a0", brightness: 0.9, range: 16 } : undefined });
    b.box(c, [ws + 0.7, 0.5, 0.5], bCol, { material: style.materials.trunk, rotation: [0, ry, 0], collide: false, lod: 0 });
    b.box(c, [0.5, ws + 0.7, 0.5], bCol, { material: style.materials.trunk, rotation: [0, ry, 0], collide: false, lod: 0 });
    if (boarded) {
      b.box(c, [ws + 1, 0.6, 0.6], jitterHex(bCol, 0, 0, 0.05), { material: style.materials.trunk, rotation: [0, ry, 25], collide: false, lod: 0 });
    } else if (timber) {
      // shutters on both sides
      for (const side of [-1, 1]) {
        const p = v3.add(v3.add(c, v3.scale(along, side * (ws / 2 + 0.75))), v3.scale(outward, 0.1));
        b.box(p, [1.2, ws, 0.3], jitterHex(rCol, 0, 0, -0.1), { material: style.materials.wall, rotation: [0, ry, 0], collide: false, lod: 0 });
      }
      // flower box under the front window
      if (ry === 0 && inhabited) {
        const p = v3.add(v3.add(c, [0, -ws / 2 - 0.5, 0]), v3.scale(outward, 0.5));
        b.box(p, [ws + 0.4, 0.8, 1.0], bCol, { material: style.materials.trunk, collide: false, lod: 0 });
        b.box(v3.add(p, [0, 0.6, 0]), [ws, 0.6, 0.8], rng.pick([style.palette.accent, "#d96c8a", "#e8c46a", style.palette.glow]), { material: style.materials.canopy, collide: false, castShadow: false, lod: 0 });
      }
    }
  }

  // chimney (+ smoke when inhabited)
  if (!isAdobe && !isCyber && rng.chance(arch.chimneyChance)) {
    const cx = rng.chance(0.5) ? W * 0.3 : -W * 0.3;
    const cz = D * 0.15;
    const roofAt = roofBaseY + roofH * Math.max(0, 1 - Math.abs(cz) / (roofD / 2));
    const top = roofBaseY + roofH + 3 * s;
    b.box([cx, (roofAt - 2 + top) / 2, cz], [2.4 * s, top - (roofAt - 2), 2.4 * s], sCol, { material: style.materials.stoneWall, collide: false, lod: 1 });
    b.box([cx, top + 0.35, cz], [3 * s, 0.7, 3 * s], jitterHex(sCol, 0, 0, -0.05), { material: style.materials.stoneWall, collide: false, lod: 0 });
    if (inhabited && !collapsed) b.effect([cx, top + 1.5, cz], [1.2, 1, 1.2], { kind: "smoke", rate: 2.5 }, { lod: 1 });
  }

  // annex (L-shape) for variety
  if (rng.chance(0.4)) {
    const aw = W * 0.5;
    const ad = D * 0.7;
    const ah = H * 0.75;
    const side = rng.chance(0.5) ? 1 : -1;
    const ax = side * (W / 2 + aw / 2 - 0.5);
    b.box([ax, 0.2, D * 0.1], [aw + 1.2, 2.6, ad + 1.2], sCol, { material: style.materials.stoneWall, collide: true, lod: 2 });
    b.box([ax, wallY0 + ah / 2, D * 0.1], [aw, ah, ad], jitterHex(wallColor2, 0, 0, -0.03), { material: wallMat, collide: true, lod: 2 });
    if (!isAdobe && !isCyber) {
      const arh = ad * 0.5 * arch.roofPitch;
      b.gableRoof([ax, wallY0 + ah + arh / 2, D * 0.1], aw + overhang, ad + overhang, arh, jitterHex(rCol, 0, 0, -0.03), { material: style.materials.roof, collide: true, lod: 2 });
    } else {
      b.box([ax, wallY0 + ah + 0.4, D * 0.1], [aw + 0.4, 0.8, ad + 0.4], lightenHex(wallColor2, 0.05), { material: wallMat, collide: true, lod: 2 });
    }
  }

  // ivy / moss on weathered walls
  if (weathering > 0.35 && rng.chance(style.rock.mossChance)) {
    const sx = rng.chance(0.5) ? 1 : -1;
    b.box([sx * (W / 2 + 0.2), wallY0 + H * 0.3, jitter(rng, D * 0.25)], [0.3, H * 0.6, rng.float(3, 6)], style.palette.foliageAlt, { material: "Grass", collide: false, castShadow: false, lod: 0 });
  }

  const footprint = Math.max(W, D) * 0.62 + overhang;
  return b.build({ id: `cottage/${variant}`, prefab: "cottage", category: "building", sinkDepth: 0.5, footprintRadius: footprint, baseRadius: Math.max(W, D) / 2 + 0.8, tags: ["building", "house", arch.style] });
}

export function ruinWall(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const len = rng.float(12, 24);
  const segs = rng.int(4, 7);
  const segW = len / segs;
  const sCol = stoneColor(ctx);
  let x = -len / 2 + segW / 2;
  for (let i = 0; i < segs; i++) {
    if (rng.chance(0.2)) {
      x += segW;
      continue;
    }
    const h = rng.float(2.5, 9);
    b.box([x, h / 2 - 0.5, 0], [segW + 0.3, h + 1, rng.float(1.8, 2.6)], jitterHex(sCol, 0, 0, jitter(rng, 0.05)), { material: style.materials.stoneWall, rotation: [jitter(rng, 3), jitter(rng, 4), jitter(rng, 3)], collide: true, lod: 2 });
    if (rng.chance(0.4)) {
      b.box([x + jitter(rng, 1), h + 0.4, 0], [segW * 0.6, 1.2, 1.5], jitterHex(sCol, 0, 0, -0.04), { material: style.materials.stoneWall, rotation: [0, jitter(rng, 20), jitter(rng, 15)], collide: false, lod: 0 });
    }
    x += segW;
  }
  // rubble
  const rubble = rng.int(3, 6);
  for (let i = 0; i < rubble; i++) {
    b.box([jitter(rng, len * 0.5), 0.4, jitter(rng, 4)], [rng.float(1, 2.6), rng.float(0.8, 1.6), rng.float(1, 2.6)], sCol, { material: style.materials.rock, rotation: [jitter(rng, 20), rng.float(0, 360), jitter(rng, 20)], collide: false, lod: 0 });
  }
  if (rng.chance(style.rock.mossChance)) {
    b.box([jitter(rng, len * 0.3), 1.2, 1.2], [rng.float(3, 6), 1.5, 0.4], style.palette.foliageAlt, { material: "Grass", collide: false, castShadow: false, lod: 0 });
  }
  return b.build({ id: `ruin_wall/${variant}`, prefab: "ruin_wall", category: "building", sinkDepth: 0.8, footprintRadius: len / 2, tags: ["ruins"] });
}

export function ruinArch(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const span = rng.float(8, 13);
  const h = rng.float(9, 14);
  const sCol = stoneColor(ctx);
  const broken = rng.chance(0.5);
  for (const sx of [-1, 1]) {
    const ph = sx === 1 && broken ? h * rng.float(0.4, 0.7) : h;
    b.box([(sx * span) / 2, ph / 2 - 0.4, 0], [2.6, ph + 0.8, 2.6], jitterHex(sCol, 0, 0, jitter(rng, 0.04)), { material: style.materials.stoneWall, rotation: [jitter(rng, 2), 0, jitter(rng, 2)], collide: true, lod: 2 });
    b.box([(sx * span) / 2, 0.8, 0], [3.4, 2.4, 3.4], jitterHex(sCol, 0, 0, -0.05), { material: style.materials.stoneWall, collide: true, lod: 1 });
  }
  if (!broken) {
    b.box([0, h + 1.2, 0], [span + 2.6, 2.4, 2.8], jitterHex(sCol, 0, 0, 0.03), { material: style.materials.stoneWall, collide: true, lod: 2 });
    // keystone wedges under lintel
    b.wedge([-span * 0.25, h - 0.6, 0], [span * 0.35, 1.6, 2.2], sCol, { material: style.materials.stoneWall, rotation: [0, 90, 180], collide: false, lod: 0 });
    b.wedge([span * 0.25, h - 0.6, 0], [span * 0.35, 1.6, 2.2], sCol, { material: style.materials.stoneWall, rotation: [0, -90, 180], collide: false, lod: 0 });
    if (style.mushroom.glow > 0.2) {
      b.box([0, h + 1.2, -1.5], [1.2, 1.2, 0.2], style.palette.glow, { material: "Neon", transparency: 0.2, rotation: [0, 0, 45], collide: false, lod: 1, light: { type: "point", color: style.palette.glow, brightness: 1, range: 18 } });
    }
  } else {
    b.box([-span * 0.2, h + 1.2, 0], [span * 0.55, 2.4, 2.8], jitterHex(sCol, 0, 0, 0.03), { material: style.materials.stoneWall, rotation: [0, 0, rng.float(4, 12)], collide: true, lod: 2 });
    for (let i = 0; i < 3; i++) {
      b.box([span * 0.3 + jitter(rng, 3), 0.6, jitter(rng, 3)], [rng.float(1.5, 3), rng.float(1, 1.8), rng.float(1.5, 3)], sCol, { material: style.materials.rock, rotation: [jitter(rng, 20), rng.float(0, 360), jitter(rng, 20)], collide: false, lod: 0 });
    }
  }
  return b.build({ id: `ruin_arch/${variant}`, prefab: "ruin_arch", category: "building", sinkDepth: 0.8, footprintRadius: span / 2 + 2, tags: ["ruins"] });
}

export function watchtower(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const h = rng.float(26, 38);
  const d = rng.float(9, 12);
  const sCol = stoneColor(ctx);
  const bCol = beamColor(ctx);
  const rCol = roofColor(ctx);
  const ruined = style.architecture.weathering > 0.6 && rng.chance(0.5);
  const bodyH = ruined ? h * rng.float(0.55, 0.8) : h;
  b.cylinder([0, bodyH / 2 - 0.5, 0], d, bodyH + 1, sCol, { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.cylinder([0, 0.6, 0], d + 2.4, 2.4, jitterHex(sCol, 0, 0, -0.05), { material: style.materials.stoneWall, collide: true, lod: 1 });
  // stone bands
  for (let i = 1; i < 3; i++) b.cylinder([0, (bodyH * i) / 3, 0], d + 0.6, 0.8, jitterHex(sCol, 0, 0, -0.08), { material: style.materials.stoneWall, collide: false, lod: 0 });
  // window slits
  for (let i = 0; i < 3; i++) {
    const a = rng.float(0, Math.PI * 2);
    b.box([Math.cos(a) * d * 0.5, bodyH * rng.float(0.4, 0.85), Math.sin(a) * d * 0.5], [1, 3, 1], "#15130f", { rotation: [0, (-a * 180) / Math.PI, 0], collide: false, lod: 0 });
  }
  if (!ruined) {
    // platform + posts + railing + roof
    b.cylinder([0, bodyH + 0.5, 0], d + 3, 1, bCol, { material: style.materials.trunk, collide: true, lod: 2 });
    const posts = 6;
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2;
      const a2 = ((i + 1) / posts) * Math.PI * 2;
      const r = d / 2 + 1.2;
      b.box([Math.cos(a) * r, bodyH + 3.5, Math.sin(a) * r], [0.8, 6, 0.8], bCol, { material: style.materials.trunk, collide: false, lod: 1 });
      b.beam([Math.cos(a) * r, bodyH + 2.2, Math.sin(a) * r], [Math.cos(a2) * r, bodyH + 2.2, Math.sin(a2) * r], 0.4, 0.4, bCol, { material: style.materials.trunk, collide: false, lod: 0 });
    }
    b.pyramidRoof([0, bodyH + 6.5 + (d * 0.55) / 2, 0], d + 4, d + 4, d * 0.55, rCol, { material: style.materials.roof, collide: true, lod: 2 });
    // brazier on a pedestal under the roof
    const glow = mixHex("#ffb866", style.palette.glow, 0.3);
    b.cylinder([0, bodyH + 1.4, 0], 1.4, 1.8, jitterHex(sCol, 0, 0, -0.1), { material: style.materials.metal, collide: false, lod: 1 });
    b.box([0, bodyH + 2.7, 0], [1.6, 1.6, 1.6], glow, { material: "Neon", transparency: 0.2, collide: false, lod: 1, light: { type: "point", color: glow, brightness: 2, range: 40 } });
    b.effect([0, bodyH + 3.7, 0], [1.2, 1, 1.2], { kind: "embers", rate: 4 }, { lod: 1 });
    // flag
    b.box([0, bodyH + 6.5 + d * 0.55 + 2.5, 0], [0.3, 5, 0.3], bCol, { material: style.materials.trunk, collide: false, lod: 0 });
    b.box([1.4, bodyH + 6.5 + d * 0.55 + 4.2, 0], [2.8, 1.6, 0.15], style.palette.accent, { material: "Fabric", collide: false, castShadow: false, lod: 0 });
  } else {
    // crenellated broken top
    for (let i = 0; i < 8; i++) {
      if (rng.chance(0.35)) continue;
      const a = (i / 8) * Math.PI * 2;
      const ch = rng.float(1.5, 4);
      // merlons stand on the broken rim (body top = bodyH + 0.5)
      b.box([Math.cos(a) * (d / 2 - 0.6), bodyH + 0.2 + ch / 2, Math.sin(a) * (d / 2 - 0.6)], [2.2, ch, 1.6], sCol, { material: style.materials.stoneWall, rotation: [0, (-a * 180) / Math.PI, jitter(rng, 8)], collide: false, lod: 1 });
    }
    for (let i = 0; i < 5; i++) {
      const a = rng.float(0, Math.PI * 2);
      const r = d * 0.6 + rng.float(1, 5);
      b.box([Math.cos(a) * r, 0.6, Math.sin(a) * r], [rng.float(1.5, 3), rng.float(1, 2), rng.float(1.5, 3)], sCol, { material: style.materials.rock, rotation: [jitter(rng, 20), rng.float(0, 360), jitter(rng, 20)], collide: false, lod: 0 });
    }
    if (style.rock.mossChance > 0.3) {
      // ivy strip flush with the wall: placed on the cylinder at angle `a`, thin axis pointing outward
      const a = rng.float(0, Math.PI * 2);
      b.box([Math.cos(a) * (d * 0.5 + 0.1), bodyH * 0.3, Math.sin(a) * (d * 0.5 + 0.1)], [0.4, bodyH * 0.5, 3], style.palette.foliageAlt, { material: "Grass", rotation: [0, (-a * 180) / Math.PI, 0], collide: false, castShadow: false, lod: 0 });
    }
  }
  // door
  b.box([0, 3.5, -d / 2 - 0.2], [3.6, 6.5, 0.6], "#1a1612", { collide: false, lod: 1 });
  b.box([0, 7.2, -d / 2 - 0.3], [4.6, 0.9, 0.8], bCol, { material: style.materials.trunk, collide: false, lod: 0 });
  return b.build({ id: `watchtower/${variant}`, prefab: "watchtower", category: "building", sinkDepth: 1.0, footprintRadius: d / 2 + 3, baseRadius: d / 2 + 1.2, tags: ["tower"] });
}

export function well(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const sCol = stoneColor(ctx);
  const bCol = beamColor(ctx);
  const d = rng.float(5.5, 7);
  b.cylinder([0, 1.4, 0], d, 3.6, sCol, { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.cylinder([0, 3.2, 0], d - 1.8, 0.4, "#1d2a33", { material: "SmoothPlastic", collide: false, lod: 1 });
  for (const sx of [-1, 1]) {
    b.box([(sx * d) / 2, 4.6, 0], [0.9, 7.8, 0.9], bCol, { material: style.materials.trunk, collide: false, lod: 1 });
  }
  b.segment([-d / 2, 7.2, 0], [d / 2, 7.2, 0], 1.2, bCol, { material: style.materials.trunk, collide: false, lod: 0, overlap: 0.3 });
  b.gableRoof([0, 9.3, 0], d + 2.5, d * 0.8, 2.2, roofColor(ctx), { material: style.materials.roof, collide: false, lod: 2 });
  b.box([0, 4.8, 0], [1.6, 1.8, 1.6], bCol, { material: style.materials.trunk, collide: false, lod: 0 });
  // rope + crank
  b.box([0, 6.2, 0], [0.15, 2.4, 0.15], "#b8a27a", { material: "Fabric", collide: false, castShadow: false, lod: 0 });
  b.box([d / 2 + 0.9, 7.2, 0], [1.2, 0.3, 0.3], bCol, { material: style.materials.trunk, collide: false, lod: 0 });
  return b.build({ id: `well/${variant}`, prefab: "well", category: "building", sinkDepth: 0.6, footprintRadius: d / 2 + 1.5, tags: ["village"] });
}

export function bridge(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const len = rng.float(22, 34);
  const w = rng.float(7, 9);
  const bCol = beamColor(ctx);
  const planks = Math.floor(len / 2.2);
  // arc profile: y(t) with t in [-0.5, 0.5]
  const yAt = (t: number) => 1.2 + (1 - Math.abs(t) * 2) * 2.2;
  for (let i = 0; i < planks; i++) {
    const t = i / (planks - 1) - 0.5;
    const t1 = (i + 1) / (planks - 1) - 0.5;
    const x = t * len;
    const from: Vec3 = [x - 1.1, yAt(t) - (yAt(t1) - yAt(t)) * 0.5, 0];
    const to: Vec3 = [x + 1.1, yAt(t) + (yAt(t1) - yAt(t)) * 0.5, 0];
    b.beam(from, to, 0.6, w, jitterHex(bCol, 0, 0, jitter(rng, 0.05)), { material: style.materials.trunk, collide: true, lod: i % 2 === 0 ? 2 : 1, overlap: 0.08 });
  }
  // stringers under the deck (both sides) follow the arc
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const t0 = i / 4 - 0.5;
      const t1 = (i + 1) / 4 - 0.5;
      b.beam([t0 * len, yAt(t0) - 0.6, (sz * w) / 2 - sz * 0.3], [t1 * len, yAt(t1) - 0.6, (sz * w) / 2 - sz * 0.3], 0.7, 0.6, jitterHex(bCol, 0, 0, -0.1), { material: style.materials.trunk, collide: false, lod: 1, overlap: 0.2 });
    }
    // posts + rail
    const posts: Vec3[] = [];
    for (let i = 0; i < 5; i++) {
      const t = i / 4 - 0.5;
      const x = t * len;
      const y = yAt(t);
      b.box([x, y + 2.0, (sz * w) / 2], [0.8, 4, 0.8], bCol, { material: style.materials.trunk, collide: false, lod: 1 });
      posts.push([x, y + 3.8, (sz * w) / 2]);
    }
    for (let i = 0; i + 1 < posts.length; i++) b.beam(posts[i]!, posts[i + 1]!, 0.5, 0.5, bCol, { material: style.materials.trunk, collide: false, lod: 1, overlap: 0.3 });
    // lantern on the end posts (lit villages)
    if (rng.chance(0.5)) {
      for (const end of [posts[0]!, posts[posts.length - 1]!]) {
        const glow = mixHex("#ffb866", style.palette.glow, 0.3);
        b.box([end[0], end[1] + 0.9, end[2]], [0.9, 1.2, 0.9], glow, { material: "Neon", transparency: 0.15, collide: false, lod: 1, light: { type: "point", color: glow, brightness: 1.2, range: 20 } });
      }
    }
  }
  for (const sx of [-1, 1]) {
    b.box([(sx * len) / 2, 0.3, 0], [3.5, 2.2, w + 1], stoneColor(ctx), { material: style.materials.stoneWall, collide: true, lod: 2 });
  }
  return b.build({ id: `bridge/${variant}`, prefab: "bridge", category: "building", sinkDepth: 0.2, footprintRadius: len / 2, tags: ["bridge"] });
}

export function fence(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const len = rng.float(7, 10);
  const bCol = beamColor(ctx);
  const broken = style.architecture.weathering > 0.5 && rng.chance(0.4);
  const tops: Vec3[] = [];
  for (const sx of [-1, 1]) {
    const tilt = jitter(rng, 4);
    b.box([(sx * len) / 2, 1.7, 0], [0.8, 4.6, 0.8], bCol, { material: style.materials.trunk, rotation: [jitter(rng, 4), 0, tilt], collide: false, lod: 2 });
    tops.push([(sx * len) / 2 - Math.sin((tilt * Math.PI) / 180) * 1.4, 3.3, 0]);
  }
  // rails run post to post (a broken rail hangs from one post)
  if (broken) {
    b.beam(tops[0]!, [tops[1]![0] * 0.6, 0.6, 0.4], 0.5, 0.4, bCol, { material: style.materials.trunk, collide: false, lod: 1, overlap: 0.2 });
  } else {
    b.beam(tops[0]!, tops[1]!, 0.5, 0.4, bCol, { material: style.materials.trunk, collide: false, lod: 1, overlap: 0.3 });
  }
  b.beam([tops[0]![0], 1.6, 0], [tops[1]![0], 1.6, 0], 0.5, 0.4, bCol, { material: style.materials.trunk, collide: false, lod: 1, overlap: 0.3 });
  return b.build({ id: `fence/${variant}`, prefab: "fence", category: "prop", sinkDepth: 0.4, footprintRadius: len / 2, tags: ["village", "fence"] });
}

export function stonePathSlab(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const count = rng.int(2, 4);
  const sCol = jitterHex(style.palette.stone, jitter(rng, 5), -0.05, jitter(rng, 0.05));
  for (let i = 0; i < count; i++) {
    const s = rng.float(2.2, 3.6);
    b.box([i === 0 ? 0 : jitter(rng, 2.2), 0.1, i === 0 ? 0 : jitter(rng, 2.2)], [s, 0.5, s * rng.float(0.7, 1.1)], jitterHex(sCol, 0, 0, jitter(rng, 0.04)), { material: style.materials.path, rotation: [0, rng.float(0, 360), 0], collide: false, castShadow: false, lod: i === 0 ? 1 : 0 });
  }
  return b.build({ id: `stone_path_slab/${variant}`, prefab: "stone_path_slab", category: "path", sinkDepth: 0.2, footprintRadius: 2, tags: ["path"] });
}
