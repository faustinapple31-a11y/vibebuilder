---
name: roblox-ts-pitfalls
description: "Write TypeScript that compiles under roblox-ts (rbxtsc) for Roblox: reserved Luau identifiers, arrays (.size(), no .length / concat / splice), maps and pairs, string methods (.sub/.upper/.format), math vs Math, typeIs / classIs, task.wait, unions of literals, remotes typed as unknown, Instance creation and services, null vs undefined. Use whenever editing .ts files in a Roblox project that reports rbxtsc / Luau compile errors, or before writing new gameplay / UI code."
---

# roblox-ts pitfalls (rbxtsc)

roblox-ts compiles a *subset* of TypeScript to Luau. The compiler errors are precise — read them and apply
the matching rule below rather than casting to `any`.

## Identifiers & syntax

- Reserved Luau names cannot be identifiers: `next`, `type`, `and`, `or`, `not`, `end`, `function`, `local`,
  `nil`, `repeat`, `until`, `then`, `elseif`, `goto`, `self`, `_G`, `game` (as a variable). Rename
  (`nextStage`, `kind`, …). Same for destructured names and function parameters.
- No `null` — use `undefined`. Optional chaining and `??` are fine.
- No `typeof x === "string"` on Roblox types — use `typeIs(x, "string" | "number" | "Vector3" | "Instance" | …)`
  and `classIs(inst, "Part")` / `inst.IsA("BasePart")`.
- No `delete obj.key` for maps — use `Map` (`map.delete(k)`) or set `obj.key = undefined`.
- Labels, `with`, `eval`, getters/setters on classes, decorators, `arguments`, `instanceof` on Roblox types,
  spread of Maps, `for (const [k, v] of Object.entries(obj))` on non-record objects — avoid.
- Comparing two different string-literal unions (`genre === "obby"` when `genre` is typed as a narrower
  union) errors: type the config field as `string` (`"adventure" as string`) or widen first.

## Arrays, maps, objects

- `arr.size()` instead of `arr.length`. `arr.push(x)`, `arr.pop()`, `arr.shift()`, `arr.unshift(x)`,
  `arr.insert(i, x)`, `arr.remove(i)`, `arr.clear()`; no `splice`, `concat` (use spread `[...a, ...b]`),
  `flat`, `at`, `toSorted`. `arr.sort((a, b) => a < b)` — the comparator returns a **boolean** (a before b).
- Iterate with `for (const x of arr)` / `arr.forEach` / `arr.map`; `for (const [k, v] of pairs(obj))` for
  records, `for (const [k, v] of map)` for `Map`. Keys of `pairs(obj)` are typed as the record key — cast
  `k as string` when needed.
- `Object.keys / values / entries` need `@rbxts/object-utils`; prefer `pairs`. `JSON.parse` →
  `HttpService.JSONDecode`, `JSON.stringify` → `HttpService.JSONEncode`.
- `arr.includes(x)` is fine; `arr.indexOf(x)` returns -1 when missing.

## Strings & numbers

- `s.size()` for length; `s.sub(1, 3)` (1-based, inclusive), `s.upper()`, `s.lower()`, `s.split(",")`,
  `s.find("x")`, `s.gsub(...)`, `s.format` → `string.format("%.1f", n)`; template literals are fine.
- No `String(n)` / `Number(s)`: use `tostring(n)` / `tonumber(s)` (returns `number | undefined`).
- `math.floor`, `math.max`, `math.clamp`, `math.random`, `math.rad`, `math.huge`; `Math.*` does not exist.
  `os.clock()` (precise timer), `os.time()` (unix seconds), `tick()` is deprecated, `DateTime.now()` exists.

## Roblox runtime

- Services: `import { Players, Workspace, ReplicatedStorage, RunService, TweenService } from "@rbxts/services"`.
- Instances: `const p = new Instance("Part"); p.Parent = x;` (parent last for performance);
  `new Instance("Folder", parent)` also works. Properties are typed — `Enum.Material.Neon`, `Color3.fromRGB`,
  `Color3.fromHex("#ffaa00")`, `new Vector3()`, `CFrame.lookAt`, `new UDim2(0, 10, 0, 10)` / `UDim2.fromScale`.
- `WaitForChild("Name")` returns `Instance` — narrow with `as Part` or `.IsA(...)`. `FindFirstChild` may be
  `undefined`. `GetChildren().filter((c): c is BasePart => c.IsA("BasePart"))`.
- Yielding: `task.wait(s)`, `task.spawn(fn)`, `task.delay(s, fn)`, `task.defer(fn)`; never `while (true)` without a wait.
- Remotes: `RemoteEvent.OnServerEvent.Connect((player, ...args) => …)` gives `unknown` args — validate with
  `typeIs` before use. `OnClientEvent` args are also `unknown`.
- Attributes: `inst.SetAttribute("Key", value)` / `GetAttribute("Key") as string | undefined`.
- Errors: `error("message")`, `warn(...)`, `print(...)`; `pcall(() => …)` returns `[ok, resultOrErr]`.
- Scripts: `src/server/*.server.ts` → Script, `src/client/*.client.ts` → LocalScript, everything else →
  ModuleScript. Imports are path-based with `baseUrl: "src"` (`import { GameConfig } from "shared/config"`).
- `RunService.IsStudio()`, `IsServer()`, `IsClient()` for environment checks; DataStores fail in Studio without
  API access — wrap in `pcall` with a fallback (the template already does).

## Typing tips

- Prefer `interface` + typed `Map<string, T>` over loose records; annotate `const x: Record<string, number> = {}`.
- Narrow tuples from tables with explicit types (`const [a, b] = fn() as [number, number]`).
- `never` errors on `switch` over a union usually mean a missing `default` / non-exhaustive case.
- Casting through `unknown` is fine for Roblox properties absent from the type package
  (`(Lighting as unknown as { Technology: Enum.Technology }).Technology = …`).
