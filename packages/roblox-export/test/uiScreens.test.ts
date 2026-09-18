import { describe, expect, it } from "vitest";
import { GENRES } from "@worldforge/core";
import { GameSpecSchema } from "@worldforge/core";
import { TEMPLATE_FILES } from "../src/template-files.generated";
import { buildUiKitsTs, buildUiStringsTs } from "../src/uiKitFiles";
import { UI_KITS, UI_LOCALES, UI_STRINGS_EN } from "@worldforge/core";

/**
 * Every screen a genre declares (GameSpec `ui.screens`) must exist in the template and be mounted by
 * the client bootstrap — otherwise a generated game promises a screen nobody implemented.
 */
const SCREEN_FILES: Record<string, string> = {
  hud: "src/ui/Hud.ts",
  loading: "src/ui/Hud.ts", // the loading overlay lives in the HUD
  shop: "src/ui/ShopUi.ts",
  gamepass_shop: "src/ui/ShopUi.ts", // Robux section of the same window
  inventory: "src/ui/Inventory.ts",
  quests: "src/ui/Quests.ts",
  crafting: "src/ui/Crafting.ts",
  leaderboard: "src/ui/Leaderboard.ts",
  teams: "src/ui/Teams.ts",
  round_status: "src/ui/RoundStatus.ts",
  settings: "src/ui/Settings.ts",
  minimap: "src/ui/Minimap.ts",
  menu: "src/ui/Menu.ts",
};

describe("UI screens of the template", () => {
  const client = TEMPLATE_FILES["src/client/main.client.ts"]!;
  const screenIds = Object.keys(GameSpecSchema.shape.ui.unwrap().shape.screens.unwrap().element.enum);

  it("implements every screen id of the GameSpec enum", () => {
    for (const id of screenIds) {
      const file = SCREEN_FILES[id];
      expect(file, `screen "${id}" has no template file`).toBeTruthy();
      expect((TEMPLATE_FILES[file!] ?? "").length, file).toBeGreaterThan(200);
    }
  });

  it("mounts every screen a genre declares from the client bootstrap", () => {
    for (const genre of GENRES) {
      for (const id of genre.screens) {
        expect(SCREEN_FILES[id], `genre ${genre.id} declares the unknown screen "${id}"`).toBeTruthy();
        // hud / loading / shop / gamepass_shop are always mounted; the others are gated on ui.screens
        if (id === "hud" || id === "loading" || id === "shop" || id === "gamepass_shop") continue;
        expect(client.includes(`enabled("${id}")`), `${genre.id}: "${id}" is never mounted by main.client.ts`).toBe(true);
      }
    }
  });

  it("ships the UI kit library in sync with the taxonomy (run scripts/sync-template.ts)", () => {
    expect(TEMPLATE_FILES["src/ui/kits.generated.ts"]).toBe(buildUiKitsTs());
  });

  it("ships the UI strings in sync with the taxonomy, in every language", () => {
    expect(TEMPLATE_FILES["src/ui/strings.generated.ts"]).toBe(buildUiStringsTs());
    const strings = TEMPLATE_FILES["src/ui/strings.generated.ts"]!;
    for (const locale of UI_LOCALES) expect(strings.includes(`\t${locale}: {`), locale).toBe(true);
  });

  it("only uses string keys that exist (no screen invents a label)", () => {
    const known = new Set(Object.keys(UI_STRINGS_EN));
    for (const [path, content] of Object.entries(TEMPLATE_FILES)) {
      if (!path.startsWith("src/ui/") && path !== "src/client/main.client.ts") continue;
      if (path.endsWith("strings.generated.ts")) continue;
      for (const match of content.matchAll(/\bL\.([a-zA-Z]+)/g)) {
        expect(known.has(match[1]!), `${path} uses L.${match[1]} which is not in the string table`).toBe(true);
      }
    }
  });

  it("leaves no hard-coded English label in the screens", () => {
    // the screens read L.<key>; a literal window title or button label would not translate.
    // `new Window("Inventory", L.inventory, …)` is fine: the first argument names the ScreenGui.
    for (const [path, content] of Object.entries(TEMPLATE_FILES)) {
      if (!path.startsWith("src/ui/") || path.endsWith(".generated.ts")) continue;
      const scanned = content.replace(/new Window\("[A-Za-z]+"/g, "new Window(");
      for (const literal of ['"Inventory"', '"Quests"', '"Crafting"', '"Leaderboard"', '"Settings"', '"Resources"', '"Consumables"', '"Search…"', '"Cancel"', '"Camera shake"', '"Active buffs"', '"In progress"', '"Completed"']) {
        expect(scanned.includes(literal), `${path} hard-codes ${literal} instead of a string key`).toBe(false);
      }
    }
  });

  it("lets the client resolve the selected kit and falls back when it is unknown", () => {
    const kit = TEMPLATE_FILES["src/ui/kit.ts"]!;
    expect(kit.includes("UI_KITS[UI.kit ?? DEFAULT_UI_KIT] ?? UI_KITS[DEFAULT_UI_KIT]")).toBe(true);
    // every kit of the taxonomy reaches the project
    for (const k of UI_KITS) expect(TEMPLATE_FILES["src/ui/kits.generated.ts"]!.includes(`\t${k.id}: {`), k.id).toBe(true);
  });

  it("renders every ornament, press and entrance a library asks for", () => {
    const kit = TEMPLATE_FILES["src/ui/kit.ts"]!;
    const ornaments = new Set(UI_KITS.map((k) => k.shape.ornament));
    for (const o of ornaments) {
      if (o === "none") continue;
      // "notch" is the fall-through branch at the end of ornament()
      const handled = kit.includes(`kind === "${o}"`) || (o === "notch" && kit.includes("// notch:"));
      expect(handled, `ornament "${o}" has no branch in kit.ts`).toBe(true);
    }
    for (const p of new Set(UI_KITS.map((k) => k.shape.press))) {
      const handled = kit.includes(`press === "${p}"`) || p === "squash"; // squash is the default tail
      expect(handled, `press "${p}" has no branch in kit.ts`).toBe(true);
    }
    for (const e of new Set(UI_KITS.map((k) => k.shape.enter))) {
      const handled = kit.includes(`theme.enter === "${e}"`) || e === "none";
      expect(handled, `entrance "${e}" has no branch in kit.ts`).toBe(true);
    }
    for (const sound of new Set(UI_KITS.map((k) => k.shape.sound))) {
      // every click sound must map to a built-in Roblox asset in kit.ts (nothing to upload)
      const handled = kit.includes(`\t${sound}: "rbxasset://sounds/`) || sound === "none";
      expect(handled, `sound "${sound}" has no built-in asset in kit.ts`).toBe(true);
    }
  });

  it("renders every hover, click and rarity effect a library asks for", () => {
    const kit = TEMPLATE_FILES["src/ui/kit.ts"]!;
    for (const h of new Set(UI_KITS.map((k) => k.shape.hover))) {
      const handled = kit.includes(`kind === "${h}"`) || h === "none";
      expect(handled, `hover "${h}" has no branch in kit.ts`).toBe(true);
    }
    for (const c of new Set(UI_KITS.map((k) => k.shape.clickFx))) {
      const handled = kit.includes(`kind === "${c}"`) || c === "burst" || c === "none"; // burst is the tail
      expect(handled, `clickFx "${c}" has no branch in kit.ts`).toBe(true);
    }
    for (const r of new Set(UI_KITS.map((k) => k.shape.rarityFx))) {
      const handled = kit.includes(`kind === "${r}"`) || r === "none";
      expect(handled, `rarityFx "${r}" has no branch in kit.ts`).toBe(true);
    }
    // the motion budget gates every looping effect
    expect(kit.includes("theme.motion <= 0")).toBe(true);
    for (const api of ["export function hoverable(", "export function clickFx(", "export function rarityEffect(", "export function tweenNumber(", "export function floatText(", "export function barShine(", "export function staggerIn(", "export function emptyIllustration("]) {
      expect(kit.includes(api), `kit.ts is missing ${api}`).toBe(true);
    }
  });

  it("wires the effects into the screens", () => {
    const kit = TEMPLATE_FILES["src/ui/kit.ts"]!;
    // buttons: hover + a click effect at the cursor; cards and tiles: hover
    expect(kit.includes("hoverable(b, { shadow: lastShadow(parent) })")).toBe(true);
    expect(kit.includes("clickFx(b, input.Position.X, input.Position.Y)")).toBe(true);
    expect(kit.includes("staggerIn(this.body)"), "a screen should stagger its rows in").toBe(true);
    // the HUD animates the currency and flashes on damage
    const hud = TEMPLATE_FILES["src/ui/Hud.ts"]!;
    expect(hud.includes("tweenNumber(")).toBe(true);
    expect(hud.includes("floatText(")).toBe(true);
    expect(hud.includes("damageFlash")).toBe(true);
    // the tiles of both item screens carry the rarity treatment and react to the cursor
    for (const path of ["src/ui/Inventory.ts", "src/ui/ShopUi.ts"]) {
      expect(TEMPLATE_FILES[path]!.includes("rarityFrame("), path).toBe(true);
      expect(TEMPLATE_FILES[path]!.includes("hoverable("), path).toBe(true);
    }
  });

  it("ships the polish details the screens rely on", () => {
    const kit = TEMPLATE_FILES["src/ui/kit.ts"]!;
    for (const api of ["export function abbreviate(", "export function stamp(", "export function acquirePop("]) {
      expect(kit.includes(api), `kit.ts is missing ${api}`).toBe(true);
    }
    // big numbers are abbreviated everywhere they are shown
    expect(kit.includes("this.coins.Text = abbreviate(value)"), "a window's coin pill should abbreviate").toBe(true);
    expect(TEMPLATE_FILES["src/ui/Hud.ts"]!.includes("abbreviate"), "the HUD currency should abbreviate").toBe(true);
    expect(TEMPLATE_FILES["src/ui/ShopUi.ts"]!.includes("abbreviate(price)"), "a price button should abbreviate").toBe(true);
    // owned upgrades get a stamp, a grown stack pops, a buff shows its countdown
    expect(TEMPLATE_FILES["src/ui/ShopUi.ts"]!.includes("stamp(L.owned")).toBe(true);
    expect(TEMPLATE_FILES["src/ui/Inventory.ts"]!.includes("acquirePop(")).toBe(true);
    expect(TEMPLATE_FILES["src/ui/Inventory.ts"]!.includes("this.buffMax")).toBe(true);
    // a tooltip waits before showing, a window animates on the way out
    expect(kit.includes("task.delay(0.22, () => {"), "the tooltip should wait before showing").toBe(true);
    expect(kit.includes("// close with the mirror of the entrance")).toBe(true);
  });

  it("ships the widget set the screens (and agents) build on", () => {
    const kit = TEMPLATE_FILES["src/ui/kit.ts"]!;
    for (const api of ["export function tabs(", "export function confirmDialog(", "export function input(", "export function stepper(", "export function rarityFrame(", "export function makeSelectable(", "export function selectFirst(", "export function progressBar(", "export function toggle(", "export function slider(", "export const RARITY_COLORS"]) {
      expect(kit.includes(api), `kit.ts is missing ${api}`).toBe(true);
    }
    // the widgets are used, not just available
    expect(TEMPLATE_FILES["src/ui/Inventory.ts"]!.includes("tabs(["), "the inventory should use the tab row").toBe(true);
    expect(TEMPLATE_FILES["src/ui/Inventory.ts"]!.includes("rarityFrame("), "the inventory should show rarity").toBe(true);
    expect(TEMPLATE_FILES["src/ui/ShopUi.ts"]!.includes("confirmDialog("), "a big purchase should ask first").toBe(true);
  });

  it("makes every button reachable with a gamepad", () => {
    const kit = TEMPLATE_FILES["src/ui/kit.ts"]!;
    // button() marks its control Selectable and gives it the library's selection highlight
    expect(kit.includes("makeSelectable(b);")).toBe(true);
    expect(kit.includes("b.Selectable = true;")).toBe(true);
    expect(kit.includes("SelectionImageObject")).toBe(true);
    // opening a screen focuses its first control when a gamepad is in use
    expect(kit.includes("selectFirst(this.window)")).toBe(true);
  });

  it("builds every screen on the kit's Window (same open / close / scaling behaviour)", () => {
    for (const [id, file] of Object.entries(SCREEN_FILES)) {
      if (id === "hud" || id === "loading" || id === "round_status" || id === "minimap") continue; // HUD-level overlays, not modals
      expect(TEMPLATE_FILES[file]!.includes("new Window("), file).toBe(true);
    }
  });
});
