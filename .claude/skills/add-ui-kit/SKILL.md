---
name: add-ui-kit
description: "Add or tune a UI kit library in WorldForge (packages/core/src/taxonomy/ui-kits.ts): colour tokens, shape language (radius, outline, gradients, shadow, bevel, text outline, panel transparency), fonts, panel ornament (rivets, scanlines, brackets, filigree, stripes, glow, grain, notch), button feedback, prompt keywords, theme / genre defaults, the generated project library (src/ui/kits.generated.ts) and the renderer (src/ui/kit.ts). Use when asked for a new UI look ('add a vaporwave UI', 'je veux une librairie UI western'), when a prompt should select a different library, or when a kit renders wrong."
---

# WorldForge — add or tune a UI kit library

A **UI kit** is a complete design system for every screen of a generated game: the HUD, the shop, the
inventory, the quests, the crafting, the leaderboard, the teams panel, the round status, the settings,
the minimap and the pause menu all read it. There is no per-screen styling — change the kit, the whole
game follows.

## The 4 places

1. **`packages/core/src/taxonomy/ui-kits.ts`** — the source of truth: one `UiKitDef` per library.
2. **`templates/roblox-ts-project/src/ui/kits.generated.ts`** — generated from it by
   `npx tsx scripts/sync-template.ts` (never edit by hand; a test fails when it is stale).
3. **`templates/roblox-ts-project/src/ui/kit.ts`** — the renderer: reads `GameConfig.ui.kit`, builds
   `theme` from the tokens and honours the shape language + ornament + press in every primitive.
4. **`apps/desktop/src/features/game/GameView.tsx`** (`InterfacePanel`) — the picker; it lists
   `UI_KITS` automatically, so a new kit shows up with no UI work.

## Adding a library

```ts
{
  id: "vapor_wave",                       // snake_case, unique
  name: "Vapor Wave",
  description: "One sentence a client can read in the picker (what it looks like).",
  keywords: ["vaporwave", "vapor", "pastel neon", "rose", "aesthetic"],  // English + French
  themes: [],                             // UI themes (StyleFamilyDef.ui) this kit is the default for
  genres: ["racing", "rhythm"],           // tie-break when several kits share a theme
  tokens: { paper, paperDark, ink, inkSoft, text, textDark, primary: [t, b], gold, danger, info, pill, pillStroke, tile, tileStroke },
  shape: { ...base, radius: 10, font: "Michroma", ornament: "scanlines", press: "pulse" },
}
```

- **tokens**: lowercase `#rrggbb` only (the test enforces it). `paper` is the panel background, `ink`
  the outline colour (it is also what `glow` uses), `text` goes on coloured surfaces, `textDark` on
  paper. `pill` / `tile` are the dark chips and item tiles; keep them readable against `text`.
- **readability is tested** (`packages/core/test/uiKits.test.ts`):
  - flat surfaces (`paper`, `paperDark`, `pill`, `tile`) need **4.5:1** with the label the renderer
    picks (`bestTextOn`, mirrored at runtime by `textOn()`);
  - gradients (`primary`, `gold`, `danger`, `info`) are measured at their **midpoint** against
    `bestTextOnGradient` — **3:1** for a kit with flat type (`textOutline: 0`), **2:1** when the kit
    outlines its type, because the `textStroke` rim does part of the work;
  - the panel outline needs 1.8:1 against the panel (`panelEdge`), the text rim 3:1 against `text`
    (`textStroke` deepens a light ink so gold type never gets a gold rim) and `gold[0]` 3:1 on `pill`.
  A gradient whose light stop washes the label out is the usual failure: deepen **both** stops rather
  than only the bottom.
- **shape**: start from `base` and override. `gradients: false` gives flat kits, `bevel: false` removes
  the button band, `shadow: 0` a flat look, `textOutline: 0` type without the sticker stroke,
  `panelTransparency` > 0 makes glass. `radius: 0` + `strokeThickness: 4` reads as a pixel console.
- **font / fontBody**: must exist in Roblox's `Enum.Font` (the test checks against the real list).
  Safe picks: FredokaOne, LuckiestGuy, GothamBlack, Gotham, Michroma, Jura, Arcade, Code, Creepster,
  SpecialElite, Fondamento, Merriweather, Bodoni, Antique, PatrickHand, Kalam, Nunito.
- **ornament**: `none`, `rivets`, `scanlines`, `brackets`, `filigree`, `stripes`, `glow`, `grain`,
  `notch`, `stitch`, `chevrons`, `bubbles`, `grid` — drawn by `ornament()` in `kit.ts` on panels large
  enough to carry it. A new ornament means one more branch there (UI parts only: frames, strokes,
  gradients — never an image asset) and the union in `packages/roblox-export/src/ui-kit-files.ts`; a
  test fails if a kit asks for an ornament `kit.ts` does not render.
- **press**: `squash`, `pulse`, `slide`, `flicker`, `none`.
- the **rarity ramp** (`RARITY_COLORS` in `kit.ts`) is derived from `inkSoft`, `primary[0]`,
  `info[0]`, the style accent and `gold[0]` — so a new library gets item rarities for free, but check
  that those five read apart from each other in the preview sheet.
- **enter**: how a window opens — `pop`, `slide`, `fade`, `none`.
- **sound**: the click a button plays — `soft`, `click`, `beep`, `pop`, `thud`, `none`. They map to
  built-in Roblox sounds in `kit.ts` (`UI_SOUNDS`), so nothing is uploaded; a test fails if a kit asks
  for a sound with no mapping.
- **textScale**: 0.8–1.25, multiplies every text size. Pixel and condensed fonts want < 1, horror /
  handwritten / serif faces want > 1.
- **the effect dials** — this is where a library gets its character:
  - `hover`: `lift` (rises, shadow grows), `glow` (outline brightens), `tint` (fill lightens),
    `outline` (accent border appears), `none`. Applied to buttons, cards and item tiles, and to the
    gamepad selection as well.
  - `clickFx`: `ripple` (expanding accent ring at the cursor), `burst` (dots thrown outwards),
    `flash` (the surface whitens), `none`.
  - `rarityFx`: how loudly an item tile shows its tier — `glow` (breathing halo on epic+),
    `sparkle` (twinkles on legendary), `shine` (slow light sweep), `none`. The rarity colour, the
    fill tint and the epic/legendary ribbon are applied whatever the value.
  - `celebrate`: what a win looks like — `confetti`, `coins`, `sparks`, `rays`, `none`. A horror,
    military or noir library must use `none` (a test enforces those three).
  - `barStyle`: `smooth` or `segmented` (a console or a field manual reads its bars in steps; the
    test requires it for pixel retro, military stencil and mission control).
  - `motion`: 0…1.4, the animation budget. It scales every duration and amplitude, **and at 0 the
    looping effects never start** — that is how a pixel console, a field manual or a case file stays
    still (a test enforces `motion ≤ 0.4` for those and `≥ 1.2` for candy / kawaii / arcade, and
    forbids a looping `rarityFx` when `motion` is 0).

## Making prompts find it

`pickUiKit(prompt, theme, genreId)` (same file) scores keywords by length, then prefers a kit that
matches the genre and the style's theme. So:

- a request like "je veux une UI vaporwave" must hit one of the `keywords` — add the French words too;
- keywords describe a **look**, never a mechanic: "quest" or "shop" would grab every RPG prompt, so
  use the look phrasing ("quest log", "journal de quêtes");
- a style family that should default to the new kit: either list its `ui` theme in `themes`, or point
  `UI_THEME_DEFAULT_KIT[theme]` at the kit (one theme has exactly one default);
- a kit with `themes: []` is keyword-only, which is right for niche looks (steampunk, luxury, kawaii).

## Checklist

1. `npx tsx scripts/sync-template.ts` (regenerates the project library and re-embeds the template).
2. `npx tsc -b tsconfig.json` clean.
3. `npx vitest run packages/core/test/uiKits.test.ts packages/roblox-export` — kit well-formedness,
   theme coverage, keyword resolution, template sync.
4. Add a keyword case to `packages/core/test/uiKits.test.ts` so the prompt → kit mapping is guarded.
5. Look at it: `npx tsx scripts/preview-ui-kits.ts --kit <id>` renders the library as a mock shop
   screen in `demo-output/ui-kits.html` (same tokens and shape language as `kit.ts`) — open it, or
   screenshot it with Chromium, before shipping a palette.
6. Build a project and compile it: `npx tsx scripts/demo-prompt.ts "<prompt with the keyword>" --out demo-output/kit` then `npx rbxtsc` inside it (validates the fonts against @rbxts/types).
7. Docs: the table in `docs/TAXONOMY.md`, the kit list in `docs/ROBLOX_PIPELINE.md`, and
   `templates/roblox-ts-project/.claude/skills/worldforge-ui/SKILL.md` if the renderer gained anything.
