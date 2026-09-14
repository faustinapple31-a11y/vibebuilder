---
name: worldforge-ui
description: "Build or restyle the Roblox UI of a WorldForge project (src/ui, src/client): HUD values and banners, shop window, menus, dialogs, leaderboards, mobile-friendly layouts, theme derived from worlds/main/style.bible.json (ui.theme, ui.accent, palette). Use when asked for a HUD, menu, shop screen, popup, settings, loading screen, or to make the UI match the game style. Instances-based UI only (no Roact/Fusion); pairs with ui-ux-pro-max / design skills when installed."
---

# WorldForge — UI

UI is built from Instances in TypeScript (`src/ui/*.ts`), mounted by `src/client/main.client.ts`.
No external UI framework: keep it that way so the design / QA agents and Roblox's own tooling stay simple.

## Existing pieces

- `Hud` (`src/ui/Hud.ts`): `setStats(stats)` (coins, hunger, health…), `setValue(key, label, value)`
  (generic value panel fed by the `HudValue` remote: stage, round timer, wave, backpack…), `setBanner(text)`
  (round / phase banner from `RoundState`), `setHealth(fraction)`, `notify(text)` (toast), `say(name, text)`
  (NPC dialogue), `playSfx(id)`, `setLoading(stage, done, total)` / `hideLoading()` (world build overlay),
  `onShop` callback (B key / shop button). Hunger bar only shows when `survival_stats` is enabled.
- `ShopUi` (`src/ui/ShopUi.ts`): sections from `src/shared/catalog.ts` (`ShopCatalog`), coin items via
  `ShopBuy`, gamepasses / dev products via `ShopPromptRobux` (MarketplaceService prompt on the server).
- Client hotkeys and effects live in `src/client/main.client.ts`; the weather layer in `src/client/Weather.ts`.

## Theme

Read `worlds/main/style.bible.json`: `ui.theme` is one of `stylized, minimal, fantasy, sci-fi, cartoon, horror,
modern, retro, military, candy`; `ui.accent` is the accent color; `palette.glow` / `palette.primary` /
`palette.secondary` give the rest. Map the theme to shape language:

| theme | corners | font | frame look |
|---|---|---|---|
| stylized / fantasy | UICorner 10–14, UIStroke 2 warm | GothamBold / Antique | dark translucent panel, gold-ish accent |
| cartoon / candy | UICorner 16–24, thick UIStroke | FredokaOne / GothamBlack | saturated fills, white text with stroke |
| sci-fi / modern / minimal | UICorner 4–8 | Gotham / GothamMedium | flat, high contrast, thin accent line |
| horror | UICorner 0–4 | Creepster / SpecialElite | near-black panels, desaturated red accent |
| retro / military | UICorner 0–2 | Arcade / Code | pixel / stencil feel, olive or neon |

Always: `TextScaled` with `UITextSizeConstraint` (min 12 / max 28), `AutomaticSize` where content varies,
`UIPadding`, `ZIndexBehavior.Sibling`, `ResetOnSpawn = false` on the ScreenGui, `IgnoreGuiInset = true`
only for full-screen overlays. Never hard-code pixel positions for gameplay-critical UI.

## Mobile & accessibility

- Layout with `UDim2.fromScale` + `UIAspectRatioConstraint`; test at 16:9 and 4:3 (`GuiService:GetScreenResolution()`).
- Touch: buttons ≥ 44×44 px; keep the bottom-right free for the jump button; hotkeys need on-screen buttons
  (`UserInputService.TouchEnabled`).
- Readability: text ≥ 14 px equivalent, stroke or panel behind text over the 3D world, colorblind-safe
  team colors (blue / orange rather than red / green only).
- Feedback: every purchase / pickup / checkpoint gets a toast (`Hud.notify`) and an SFX (`PlaySfx`).

## Screens the GameSpec may request (`design/game.spec.json` → `ui.screens`)

hud, inventory, shop, settings, quests, gamepass_shop, loading, menu, leaderboard, crafting, teams, round_status,
minimap. Implement each as a class in `src/ui/`, mounted
once from `main.client.ts`, toggled by a HUD button and a hotkey, closed with Escape / the X button.

## Checklist before finishing

1. `npx rbxtsc` clean.
2. Every screen opens and closes; nothing overlaps the Roblox top bar (respect `GuiService` inset).
3. Colors come from the StyleBible, not hard-coded defaults.
4. Text is filtered when player-authored (`TextService:FilterStringAsync` on the server).
5. Summarize which screens changed and their hotkeys.
