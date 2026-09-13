import { PathfindingService, Players, RunService, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { findZones } from "shared/zones";
import * as Combat from "./Combat";
import * as PlayerData from "./PlayerData";

/**
 * Enemy AI (zombies, monsters, raiders, guards): R15 rigs spawned in the wild (away from the spawn
 * and settlements, or at TD/arena anchors), wandering until a player comes within chase range,
 * then pathfinding toward them and attacking on contact. Kills pay coins/XP; enemies respawn.
 */
const cfg = GameConfig.enemies;
interface Enemy {
	model: Model;
	humanoid: Humanoid;
	root: BasePart;
	home: Vector3;
	lastAttack: number;
	nextPath: number;
}
const enemies: Enemy[] = [];
let folder: Folder;

function rig(name: string, position: Vector3): Model {
	const desc = new Instance("HumanoidDescription");
	const model = Players.CreateHumanoidModelFromDescription(desc, Enum.HumanoidRigType.R15);
	model.Name = name;
	const hum = model.FindFirstChildOfClass("Humanoid")!;
	hum.MaxHealth = cfg.health;
	hum.Health = cfg.health;
	hum.WalkSpeed = cfg.speed;
	hum.DisplayName = name;
	hum.NameDisplayDistance = 60;
	// colour the rig by kind: zombies green-grey, monsters dark, raiders/guards neutral
	const kind = cfg.kind;
	const col = kind === "zombie" ? Color3.fromRGB(110, 140, 100) : kind === "monster" ? Color3.fromRGB(40, 30, 50) : kind === "guard" ? Color3.fromRGB(90, 100, 120) : Color3.fromRGB(120, 90, 70);
	for (const d of model.GetDescendants()) {
		if (d.IsA("BasePart")) {
			d.Color = col;
			d.Material = kind === "zombie" ? Enum.Material.Slate : Enum.Material.SmoothPlastic;
			d.Anchored = false;
		}
	}
	if (kind === "zombie" || kind === "monster") {
		const eye = new Instance("PointLight");
		eye.Color = kind === "zombie" ? Color3.fromRGB(160, 255, 120) : Color3.fromRGB(255, 60, 60);
		eye.Range = 8;
		eye.Brightness = 1.5;
		eye.Parent = model.FindFirstChild("Head");
	}
	model.SetAttribute("Enemy", kind);
	model.PivotTo(new CFrame(position.add(new Vector3(0, 4, 0))));
	model.Parent = folder;
	return model;
}

function groundAt(x: number, z: number): number | undefined {
	const params = new RaycastParams();
	params.FilterType = Enum.RaycastFilterType.Exclude;
	params.FilterDescendantsInstances = [folder];
	const hit = Workspace.Raycast(new Vector3(x, 400, z), new Vector3(0, -800, 0), params);
	return hit ? hit.Position.Y : undefined;
}

function spawnPositions(): Vector3[] {
	const out: Vector3[] = [];
	// explicit anchors first (tower defense spawn, arena, dungeon rooms)
	for (const z of findZones({ metaKind: "enemy_spawn" })) out.push(z.position);
	for (const z of findZones({ prefix: "dungeon_room" })) out.push(z.position);
	if (out.size() > 0) return out;
	// otherwise: ring around the map spawn, outside settlements
	const spawn = Workspace.FindFirstChild("World")?.FindFirstChildOfClass("SpawnLocation");
	const c = spawn ? spawn.Position : new Vector3(0, 0, 0);
	const settlements = findZones({ kind: "settlement" });
	const rnd = new Random(7);
	for (let i = 0; i < cfg.count * 3 && out.size() < cfg.count; i++) {
		const a = rnd.NextNumber(0, math.pi * 2);
		const r = rnd.NextNumber(90, 260);
		const x = c.X + math.cos(a) * r;
		const z = c.Z + math.sin(a) * r;
		if (settlements.some((s) => new Vector3(x, 0, z).sub(new Vector3(s.position.X, 0, s.position.Z)).Magnitude < s.radius * 1.2)) continue;
		const y = groundAt(x, z);
		if (y === undefined) continue;
		out.push(new Vector3(x, y, z));
	}
	return out;
}

function nearestPlayer(from: Vector3, maxDist: number): Player | undefined {
	let best: Player | undefined;
	let bestD = maxDist;
	for (const p of Players.GetPlayers()) {
		const root = p.Character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
		const hum = p.Character?.FindFirstChildOfClass("Humanoid");
		if (!root || !hum || hum.Health <= 0) continue;
		const d = root.Position.sub(from).Magnitude;
		if (d < bestD) {
			bestD = d;
			best = p;
		}
	}
	return best;
}

function think(e: Enemy, now: number): void {
	if (e.humanoid.Health <= 0) return;
	const night = Workspace.GetAttribute("IsNight") === true;
	const range = cfg.chaseRange * (night ? GameConfig.dayNight.nightEnemyMultiplier : 1);
	const target = nearestPlayer(e.root.Position, range);
	if (target) {
		const troot = target.Character!.FindFirstChild("HumanoidRootPart") as BasePart;
		const dist = troot.Position.sub(e.root.Position).Magnitude;
		if (dist < 5) {
			e.humanoid.MoveTo(e.root.Position);
			if (now - e.lastAttack > 1.2) {
				e.lastAttack = now;
				const hum = target.Character!.FindFirstChildOfClass("Humanoid")!;
				hum.TakeDamage(cfg.damage);
			}
			return;
		}
		if (now >= e.nextPath) {
			e.nextPath = now + 0.6;
			// direct move when close / clear, pathfinding otherwise
			if (dist < 25) e.humanoid.MoveTo(troot.Position);
			else {
				const path = PathfindingService.CreatePath({ AgentRadius: 2.5, AgentHeight: 5, AgentCanJump: true });
				const [ok] = pcall(() => path.ComputeAsync(e.root.Position, troot.Position));
				if (ok && path.Status === Enum.PathStatus.Success) {
					const wps = path.GetWaypoints();
					const wp = wps[math.min(2, wps.size() - 1)];
					if (wp) {
						if (wp.Action === Enum.PathWaypointAction.Jump) e.humanoid.Jump = true;
						e.humanoid.MoveTo(wp.Position);
					}
				} else e.humanoid.MoveTo(troot.Position);
			}
		}
		return;
	}
	// wander around home
	if (now >= e.nextPath) {
		e.nextPath = now + math.random(3, 7);
		const a = math.random() * math.pi * 2;
		const r = math.random(6, 22);
		e.humanoid.MoveTo(e.home.add(new Vector3(math.cos(a) * r, 0, math.sin(a) * r)));
	}
}

function spawnOne(home: Vector3): void {
	const model = rig(cfg.name, home);
	const humanoid = model.FindFirstChildOfClass("Humanoid")!;
	const root = model.FindFirstChild("HumanoidRootPart") as BasePart;
	const e: Enemy = { model, humanoid, root, home, lastAttack: 0, nextPath: 0 };
	enemies.push(e);
	humanoid.Died.Connect(() => {
		// reward the last attacker through Combat (already credited); drop a coin burst then respawn
		task.delay(3, () => model.Destroy());
		task.delay(cfg.respawnSeconds, () => {
			const i = enemies.indexOf(e);
			if (i >= 0) enemies.remove(i);
			spawnOne(home);
		});
	});
}

/** Spawn extra enemies at a position (tower defense waves, dungeon rooms). Returns the model. */
export function spawnAt(position: Vector3, opts: { health?: number; speed?: number; name?: string } = {}): Model {
	const model = rig(opts.name ?? cfg.name, position);
	const humanoid = model.FindFirstChildOfClass("Humanoid")!;
	if (opts.health) {
		humanoid.MaxHealth = opts.health;
		humanoid.Health = opts.health;
	}
	if (opts.speed) humanoid.WalkSpeed = opts.speed;
	return model;
}

export function start(): void {
	if (!GameConfig.systems.includes("enemies")) return;
	folder = new Instance("Folder");
	folder.Name = "Enemies";
	folder.Parent = Workspace;
	task.spawn(() => {
		while (Workspace.GetAttribute("WorldReady") !== true) task.wait(1);
		task.wait(2);
		// tower defense / rounds drive their own spawning
		if (GameConfig.systems.includes("tower_defense")) return;
		const spots = spawnPositions();
		for (let i = 0; i < math.min(cfg.count, spots.size()); i++) spawnOne(spots[i]!);
		print(`[WorldForge] ${enemies.size()} ${cfg.name}(s) spawned`);
	});
	let acc = 0;
	RunService.Heartbeat.Connect((dt) => {
		acc += dt;
		if (acc < 0.2) return;
		acc = 0;
		const now = os.clock();
		for (const e of enemies) if (e.model.Parent) think(e, now);
	});
	void Combat;
	void PlayerData;
}
