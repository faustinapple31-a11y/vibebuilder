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
- **readability is tested**: `packages/core/test/uiKits.test.ts` requires 4.5:1 on `paper`,
  `paperDark`, `pill` and `tile` and 3.5:1 on the `primary` / `gold` / `danger` / `info` gradient
  bottoms, measured against the label the renderer actually picks (`bestTextOn`, mirrored at runtime
  by `textOn()`), plus a visible panel outline (1.8:1 for `panelEdge`) and 3:1 for `gold[0]` on
  `pill`. A gradient bottom that is too light is the usual failure — darken it (a light `gold[1]`
  gets dark type automatically, but it still has to clear 3.5:1 with *one* of the two text colours).
- **shape**: start from `base` and override. `gradients: false` gives flat kits, `bevel: false` removes
  the button band, `shadow: 0` a flat look, `textOutline: 0` type without the sticker stroke,
  `panelTransparency` > 0 makes glass. `radius: 0` + `strokeThickness: 4` reads as a pixel console.
- **font / fontBody**: must exist in Roblox's `Enum.Font` (the test checks against the real list).
  Safe picks: FredokaOne, LuckiestGuy, GothamBlack, Gotham, Michroma, Jura, Arcade, Code, Creepster,
  SpecialElite, Fondamento, Merriweather, Bodoni, Antique, PatrickHand, Kalam, Nunito.
- **ornament**: `none`, `rivets`, `scanlines`, `brackets`, `filigree`, `stripes`, `glow`, `grain`,
  `notch` — drawn by `ornament()` in `kit.ts` on panels large enough to carry it. A new ornament means
  one more branch there (UI parts only: frames, strokes, gradients — never an image asset).
- **press**: `squash`, `pulse`, `slide`, `flicker`, `none`.

## Making prompts find it

`pickUiKit(prompt, theme, genreId)` (same file) scores keywords by length, then prefers a kit that
matches the genre and the style's theme. So:

- a request like "je veux une UI vaporwave" must hit one of the `keywords` — add the French words too;
- a style family that should default to the new kit: either list its `ui` theme in `themes`, or point
  `UI_THEME_DEFAULT_KIT[theme]` at the kit (one theme has exactly one default);
- a kit with `themes: []` is keyword-only, which is right for niche looks (steampunk, luxury, kawaii).

## Checklist

1. `npx tsx scripts/sync-template.ts` (regenerates the project library and re-embeds the template).
2. `npx tsc -b tsconfig.json` clean.
3. `npx vitest run packages/core/test/uiKits.test.ts packages/roblox-export` — kit well-formedness,
   theme coverage, keyword resolution, template sync.
4. Add a keyword case to `packages/core/test/uiKits.test.ts` so the prompt → kit mapping is guarded.
5. Build a project and compile it: `npx tsx scripts/demo-prompt.ts "<prompt with the keyword>" --out demo-output/kit` then `npx rbxtsc` inside it (validates the fonts against @rbxts/types).
6. Docs: the table in `TAXONOMY.md`, the kit list in `ROBLOX_PIPELINE.md`, and
   `templates/roblox-ts-project/.claude/skills/worldforge-ui/SKILL.md` if the renderer gained anything.
