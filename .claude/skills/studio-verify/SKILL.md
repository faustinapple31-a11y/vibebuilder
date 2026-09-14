---
name: studio-verify
description: "Verify WorldForge output live: run the desktop app headlessly (tauri dev + WebView2 remote debugging on port 9222), drive it over CDP (%TEMP%/wf-cdp/cdp.mjs eval|shot|click|type), open a project, deploy to Roblox Studio through the built-in StudioMCP bridge, run Luau probes (run_lua.mjs, execute_luau in Edit/Server/Client data models), toggle play mode, take screenshots, and read the console. Use when asked to check a feature in Studio, take a screenshot of a generated world, play-test a genre, or debug a runtime issue in the real app."
---

# Verify in the app and in Roblox Studio

## Start the app (background task)

```bash
npx tsx scripts/sync-template.ts   # if templates/ changed
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 npm run tauri:dev -w @worldforge/desktop > "$TEMP/wf-cdp/tauri-dev.log" 2>&1
```
Run it with `run_in_background`; the Rust build takes 1–4 min. Port 1420 already busy = a previous Vite is
alive (kill it). Dev builds expose the stores on `window.__wf` (`useProjects`, `useRoblox`, `useGame`,
`useAgents`, `toolbox`, `tauri`) and the viewer camera on `window.__wfCamera` (fly mode).

## Drive it over CDP (`%TEMP%\wf-cdp\`)

- `node "$TEMP/wf-cdp/cdp.mjs" eval "<js>"` — evaluate in the webview (returns the value).
- `node "$TEMP/wf-cdp/cdp.mjs" shot out.png` — screenshot of the app; `click "<text>"`, `type "<text>"`.
- `bash "$TEMP/wf-cdp/open_project.sh"` — opens the demo project from Home (`window.__wf.useProjects.getState().current`).
- After many HMR reloads the webview can hit WebGL / OOM errors → `location.reload()`, then re-open the project.
- Every `sync-template` triggers a full Vite reload → `window.__wf` disappears until the project is re-opened.

## Studio (built-in MCP bridge)

Studio ships `StudioMCP.exe` next to `RobloxStudioBeta.exe` (Assistant → Manage MCP Servers). Only one
MCP client at a time (kill stale `studio_mcp_*` processes if "Unable to reach Roblox Studio"). The app launches
Studio detached; a place must be open; right after `connectMcp` the studio list can be empty for a few seconds
(retry `refreshStudios`).

- Deploy: Roblox tab → *Sync to Studio* (scripts replaced as instances — `require()` caches module instances,
  so sources are never just overwritten) → *Push world* (bake in 17-ish JSON chunks) → the server builds it
  (`[WorldForge] world ready…`).
- Luau probes: `node "$TEMP/wf-cdp/run_lua.mjs" file.lua [Edit|Server|Client]` → runs through
  `useRoblox.getState().runLuau(code, datamodel)`. `execute_luau` runs in the Assistant *plugin* VM: `require()`
  of game modules gives separate instances — use `ServerStorage.WorldForgeDev` (`grantCoins`, `grantItem`,
  `profile`) or the real remotes (`ReplicatedStorage.Remotes.ShopBuy:InvokeServer(id)` from the Client VM).
- Play mode: `useRoblox.getState().setPlaying(true|false)`; the world takes ~60 s to build in play — poll a
  Server-VM probe on `Workspace:GetAttribute("WorldReady")`.
- Screenshots: `captureViaMcp` / `screen_capture` — move the camera first with Luau
  (`workspace.CurrentCamera.CFrame = CFrame.lookAt(from, to)`), wait ~2.5 s. A blank white capture means the
  viewport is undocked / obscured → fall back to numeric Luau probes (part counts, positions, raycasts).
- Console: `get_console_output` / `useRoblox.getState().logs` — look for `[WorldForge]` lines and red errors.

## Known Studio facts

- `WedgePart` high at +Z / low at −Z; `CornerWedgePart` apex above (+X, −Z); Euler XYZ = `CFrame.Angles`.
- Smooth terrain surface renders 2 studs above `voxelBottom + occupancy × 4` (TerrainBuilder compensates); the
  WorldBuilder raycast-snaps models to the rendered ground.
- `Terrain.Decoration` no longer exists (0.738+); `Lighting.Technology` is NotScriptable in play mode (pcall).
- GPU hang (`DXGI_ERROR_DEVICE_HUNG`) with `Future` lighting + hundreds of PointLights → keep ShadowMap.
- `InsertService:LoadAsset` on an unpublished local place returns "not authorized" — hero-mesh spawning needs a
  place tied to the creator's account.
- Fonts lack `⬡` / `🪙` glyphs — use `$`, `R$`, `💰`, `👑`.

## What to verify after a generation change

1. Server console: placements / terrain chunks / doors / checkpoints lines, no red errors.
2. Spawn: on ground, facing the focal landmark; walk into a house (door opens with E).
3. Style: terrain colors, clouds, weather particles (`Lighting:GetAttribute("WeatherKind")`), walls + gates,
   pier, fields, road markings where the style calls for them.
4. Genre loop from the `worldforge-qa` checklist (in the generated project's skills).
