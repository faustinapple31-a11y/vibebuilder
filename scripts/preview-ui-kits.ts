/**
 * Renders every UI kit library as a mock screen in a single HTML sheet, so the look of a library can
 * be reviewed (and diffed) without opening Roblox Studio.
 *
 *   npx tsx scripts/preview-ui-kits.ts [--out demo-output/ui-kits.html] [--kit pixel_retro] [--locale fr]
 *
 * It is an approximation (browser CSS, not Roblox GUI), but it uses the same tokens and the same
 * shape language as `templates/roblox-ts-project/src/ui/kit.ts`: radius, outline weight, gradients,
 * shadow, bevel, text outline, panel transparency, ornament, fonts and the `textOn` label choice.
 * Pair it with `.claude/skills/studio-verify` when the real thing must be checked in Studio.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UI_KITS, bestTextOn, panelEdge, textStroke, type UiKitDef } from "../packages/core/src/taxonomy/ui-kits";
import { UI_LOCALES, UI_STRINGS, type UiLocale } from "../packages/core/src/taxonomy/ui-strings";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outArg = args.indexOf("--out");
const kitArg = args.indexOf("--kit");
const out = join(root, outArg >= 0 ? args[outArg + 1]! : "demo-output/ui-kits.html");
const only = kitArg >= 0 ? args[kitArg + 1] : undefined;
const localeArg = args.indexOf("--locale");
const locale = (localeArg >= 0 ? args[localeArg + 1] : "en") as UiLocale;
if (!UI_LOCALES.includes(locale)) throw new Error(`--locale must be one of ${UI_LOCALES.join(", ")}`);
/** The sheet shows the real labels, so it also reviews a translation. */
const T = UI_STRINGS[locale];

/** Roblox font → a web stack that reads similarly (the sheet is a look review, not a pixel match). */
const FONTS: Record<string, string> = {
  FredokaOne: '"Fredoka One", "Baloo 2", system-ui, sans-serif',
  LuckiestGuy: '"Luckiest Guy", "Fredoka One", system-ui, sans-serif',
  GothamBlack: '"Montserrat", system-ui, sans-serif',
  GothamBold: '"Montserrat", system-ui, sans-serif',
  Gotham: '"Inter", system-ui, sans-serif',
  Michroma: '"Michroma", "Orbitron", system-ui, sans-serif',
  Jura: '"Jura", "Inter", system-ui, sans-serif',
  Arcade: '"Press Start 2P", "VT323", monospace',
  Code: '"IBM Plex Mono", ui-monospace, monospace',
  Creepster: '"Creepster", "Nosifer", cursive',
  SpecialElite: '"Special Elite", "Courier New", monospace',
  Fondamento: '"Fondamento", "Georgia", serif',
  Merriweather: '"Merriweather", Georgia, serif',
  Bodoni: '"Playfair Display", Georgia, serif',
  Antique: '"Cinzel", Georgia, serif',
  PatrickHand: '"Patrick Hand", "Comic Sans MS", cursive',
  Kalam: '"Kalam", "Comic Sans MS", cursive',
  Nunito: '"Nunito", system-ui, sans-serif',
  PermanentMarker: '"Permanent Marker", "Comic Sans MS", cursive',
};

const font = (name: string) => FONTS[name] ?? "system-ui, sans-serif";

function ornamentLayers(kit: UiKitDef): string {
  const t = kit.tokens;
  switch (kit.shape.ornament) {
    case "scanlines":
      return `<div class="orn" style="background:repeating-linear-gradient(rgba(255,255,255,.12) 0 1px, transparent 1px 4px)"></div>`;
    case "grain":
      return `<div class="orn" style="background:radial-gradient(rgba(255,255,255,.25) .5px, transparent .6px) 0 0/7px 7px"></div>`;
    case "glow":
      return `<div class="orn" style="box-shadow:inset 0 0 14px ${t.ink}, 0 0 10px ${t.ink}"></div>`;
    case "stitch":
      return `<div class="orn" style="inset:7px;border:1.5px dashed ${t.inkSoft}"></div>`;
    case "grid":
      return `<div class="orn" style="top:55%;background:repeating-linear-gradient(${t.primary[0]}55 0 1px, transparent 1px 9px),repeating-linear-gradient(90deg, ${t.primary[0]}44 0 1px, transparent 1px 16px)"></div>`;
    case "rivets":
      return [0, 1, 2, 3]
        .map((i) => `<span class="rivet" style="background:${t.inkSoft};border:1px solid ${t.ink};${i < 2 ? "top:7px" : "bottom:7px"};${i % 2 === 0 ? "left:7px" : "right:7px"}"></span>`)
        .join("");
    case "brackets":
      return [0, 1, 2, 3]
        .map((i) => `<span class="bracket" style="border-color:${t.ink};${i < 2 ? "top:5px;border-top-width:3px" : "bottom:5px;border-bottom-width:3px"};${i % 2 === 0 ? "left:5px;border-left-width:3px" : "right:5px;border-right-width:3px"}"></span>`)
        .join("");
    case "filigree":
      return [0, 1, 2, 3, 4, 5]
        .map((i) => `<span class="gem" style="background:${t.gold[0]};border:1px solid ${t.ink};${i < 3 ? "top:6px" : "bottom:6px"};left:calc(50% + ${(i % 3) * 46 - 46}px)"></span>`)
        .join("");
    case "stripes":
      return `<div class="orn" style="height:12px;bottom:auto;background:repeating-linear-gradient(115deg, ${t.gold[1]} 0 10px, ${t.ink} 10px 20px)"></div>`;
    case "chevrons":
      return `<div class="orn" style="height:14px;bottom:auto;top:6px;background:repeating-linear-gradient(115deg, ${t.primary[0]}99 0 4px, transparent 4px 14px)"></div>`;
    case "bubbles":
      return [0, 1, 2, 3, 4]
        .map((i) => `<span class="bubble" style="border:1px solid ${t.inkSoft};width:${6 + (i % 3) * 5}px;height:${6 + (i % 3) * 5}px;bottom:${12 + i * 16}px;${i % 2 ? "right" : "left"}:${10 + (i % 2) * 12}px"></span>`)
        .join("");
    case "notch":
      return `<div class="orn" style="height:2px;bottom:auto;top:9px;left:14px;right:14px;background:${t.ink};opacity:.5"></div><span class="cut" style="background:${t.ink}"></span>`;
    default:
      return "";
  }
}

function kitSheet(kit: UiKitDef): string {
  const t = kit.tokens;
  const s = kit.shape;
  const edge = panelEdge(kit);
  const onPrimary = bestTextOn(kit, t.primary[1]);
  const onGold = bestTextOn(kit, t.gold[1]);
  const onInfo = bestTextOn(kit, t.info[1]);
  const stroke = Math.max(1, s.strokeThickness);
  const rim = textStroke(kit);
  const outline = s.textOutline > 0 ? `-webkit-text-stroke:${Math.min(1.6, s.textOutline / 2)}px ${rim};paint-order:stroke fill;` : "";
  const panelBg = s.gradients ? `linear-gradient(${t.paper}, ${t.paperDark})` : t.paper;
  const shadow = s.shadow > 0 ? `box-shadow:${s.shadow}px ${s.shadow}px 0 rgba(0,0,0,${(1 - s.shadowTransparency).toFixed(2)});` : "";
  const scale = s.textScale;
  const button = (label: string, colors: [string, string], color: string) => `
    <span class="btn" style="background:${s.gradients ? `linear-gradient(${colors[0]}, ${colors[1]})` : colors[1]};color:${color};border:${stroke}px solid ${edge};border-radius:${Math.max(2, s.radius - 2)}px;${s.bevel ? `border-bottom-width:${stroke + 3}px;` : ""}font-family:${font(s.font)};font-size:${13 * scale}px;${outline}">${label}</span>`;
  return `
  <section class="card">
    <header>
      <b>${kit.name}</b><code>${kit.id}</code>
      <span class="meta">${s.ornament} · ${s.press} · ${s.enter} · ${s.font} · r${s.radius} · ×${s.textScale}</span>
    </header>
    <p class="desc">${kit.description}</p>
    <div class="window" style="background:${panelBg};border:${stroke}px solid ${edge};border-radius:${s.radius}px;${shadow}opacity:${1 - s.panelTransparency / 2};">
      ${ornamentLayers(kit)}
      <div class="row top">
        <span class="title" style="color:${t.textDark};font-family:${font(s.font)};font-size:${20 * scale}px;${outline}">${T.shop.toUpperCase()}</span>
        <span class="pill" style="background:${t.pill};border:1px solid ${t.pillStroke};border-radius:${Math.min(12, s.radius)}px;color:${t.text};font-family:${font(s.fontBody)};font-size:${12 * scale}px">
          <i style="background:${t.gold[0]}"></i>1 250
        </span>
        <span class="x" style="background:${s.gradients ? `linear-gradient(${t.danger[0]}, ${t.danger[1]})` : t.danger[1]};color:${bestTextOn(kit, t.danger[1])};border:${stroke}px solid ${edge};border-radius:${Math.max(2, s.radius - 2)}px;${outline}">✕</span>
      </div>
      <div class="bundle" style="background:linear-gradient(${t.gold[0]}, ${t.gold[1]});border:${stroke}px solid ${edge};border-radius:${Math.min(16, s.radius)}px;color:${onGold}">
        <b style="font-family:${font(s.font)};font-size:${14 * scale}px;${outline}">${T.upgrades.toUpperCase()}</b>
        <span style="font-family:${font(s.fontBody)};font-size:${10 * scale}px">${T.emptyBackpack}</span>
        <span class="badge" style="background:transparent;color:${kit.tokens.text};-webkit-text-stroke:2px ${rim};paint-order:stroke fill">-85%</span>
      </div>
      <div class="tiles">
        ${[0, 1, 2]
          .map(
            (i) => `<span class="tile" style="background:${t.tile};border:${stroke}px solid ${t.tileStroke};border-radius:${Math.min(14, s.radius)}px;color:${t.text};font-family:${font(s.fontBody)};font-size:${10 * scale}px">
            <i style="background:${[t.primary[0], t.info[0], t.gold[0]][i]}"></i>x${i + 2}</span>`,
          )
          .join("")}
      </div>
      <div class="bar" style="background:${t.ink};border:1px solid ${edge};border-radius:${Math.min(9, s.radius)}px">
        <span style="width:62%;background:${s.gradients ? `linear-gradient(${t.primary[0]}, ${t.primary[1]})` : t.primary[1]};border-radius:${Math.min(9, s.radius)}px"></span>
        <em style="color:${onPrimary};font-family:${font(s.fontBody)};font-size:${9 * scale}px;${outline}">3 / 5</em>
      </div>
      <div class="row bottom">
        ${button(T.buy, t.primary, onPrimary)}
        ${button(T.owned, t.info, onInfo)}
        ${button(T.claimed, t.gold, onGold)}
      </div>
    </div>
  </section>`;
}

const kits = only ? UI_KITS.filter((k) => k.id === only) : UI_KITS;
if (kits.length === 0) throw new Error(`no kit matches "${only}"`);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>WorldForge — UI kit libraries</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=Luckiest+Guy&family=Montserrat:wght@700;900&family=Inter:wght@400;700&family=Michroma&family=Jura:wght@500;700&family=Press+Start+2P&family=IBM+Plex+Mono:wght@500&family=Creepster&family=Special+Elite&family=Fondamento&family=Merriweather:wght@700&family=Playfair+Display:wght@700&family=Cinzel:wght@700&family=Patrick+Hand&family=Kalam:wght@700&family=Nunito:wght@700&family=Permanent+Marker&display=swap" rel="stylesheet" />
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 24px; background: #16181d; color: #e8e8ea; font: 13px/1.45 Inter, system-ui, sans-serif; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #9a9aa2; font-size: 12px; margin-bottom: 18px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px; }
  .card { background: #1e2127; border: 1px solid #2c3039; border-radius: 10px; padding: 10px; }
  header { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  header b { font-size: 13px; }
  header code { color: #8ab4ff; font-size: 11px; }
  .meta { color: #7f838c; font-size: 10px; margin-left: auto; }
  .desc { color: #a8acb5; font-size: 11px; margin: 4px 0 8px; min-height: 30px; }
  .window { position: relative; padding: 12px; overflow: hidden; }
  .orn { position: absolute; inset: 0; pointer-events: none; }
  .rivet, .gem, .bubble { position: absolute; width: 9px; height: 9px; border-radius: 50%; }
  .gem { border-radius: 2px; transform: rotate(45deg); }
  .bubble { border-radius: 50%; background: rgba(255,255,255,.28); }
  .bracket { position: absolute; width: 20px; height: 20px; border: 0 solid; }
  .cut { position: absolute; width: 16px; height: 16px; right: -8px; top: -8px; transform: rotate(45deg); }
  .row { position: relative; display: flex; align-items: center; gap: 8px; }
  .row.top { margin-bottom: 10px; }
  .row.bottom { margin-top: 10px; }
  .title { font-weight: 700; letter-spacing: .5px; }
  .pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; margin-left: auto; font-weight: 700; }
  .pill i, .tile i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .x { display: inline-grid; place-items: center; width: 24px; height: 24px; font-size: 11px; font-weight: 700; }
  .bundle { position: relative; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
  .badge { position: absolute; right: 8px; top: 6px; font-size: 13px; font-weight: 800; transform: rotate(-10deg); }
  .tiles { display: flex; gap: 6px; margin-top: 8px; }
  .tile { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 10px 0; font-weight: 700; }
  .bar { position: relative; height: 16px; margin-top: 8px; overflow: hidden; }
  .bar span { position: absolute; inset: 0 auto 0 0; }
  .bar em { position: absolute; inset: 0; display: grid; place-items: center; font-style: normal; font-weight: 700; }
  .btn { padding: 5px 12px; font-weight: 700; display: inline-block; }
</style></head>
<body>
  <h1>UI kit libraries — ${kits.length} design systems · ${locale.toUpperCase()}</h1>
  <div class="sub">Labels from the ${locale} table (<code>--locale</code> to switch). Generated by <code>scripts/preview-ui-kits.ts</code> from packages/core/src/taxonomy/ui-kits.ts. Browser approximation of src/ui/kit.ts: same tokens, radius, outline, gradients, shadow, bevel, text outline, ornament and label-colour choice.</div>
  <div class="grid">${kits.map(kitSheet).join("\n")}</div>
</body></html>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html, "utf8");
console.log(`${kits.length} libraries → ${out.replace(`${root}/`, "")}`);
