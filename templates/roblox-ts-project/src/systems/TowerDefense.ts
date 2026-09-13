import { Players, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getRemoteEvent, Remotes } from "shared/net";
import { findZone, findZones, sortedZones } from "shared/zones";
import * as Enemies from "./Enemies";
import * as PlayerData from "./PlayerData";
import * as Progression from "./Progression";

/**
 * Tower defense: waves of enemies walk the generated path (`td_waypoint_N` → `td_base`), players
 * build towers on the pads (`td_pad_*`) by touching them (cost in coins); towers shoot the nearest
 * enemy in range. The base loses HP for every enemy that reaches it; the game ends when it hits 0
 * or when all waves are cleared (base_defense layout).
 */
const cfg = GameConfig.towerDefense;
const notify = getRemoteEvent(Remotes.Notify);
const hudValue = getRemoteEvent(Remotes.HudValue);
const fx = getRemoteEvent(Remotes.Fx);

interface Tower {
	part: BasePart;
	owner: Player;
	level: number;
	nextShot: number;
}
const towers: Tower[] = [];
const alive = new Set<Model>();
let baseHp = cfg.baseHp;
let wave = 0;
let running = false;

function broadcast(): void {
	for (const p of Players.GetPlayers()) {
		hudValue.FireClient(p, "wave", "Wave", `${wave} / ${cfg.waves}`);
		hudValue.FireClient(p, "base", "Base HP", `${math.max(0, baseHp)}`);
	}
}

function walkPath(model: Model, waypoints: Vector3[], basePos: Vector3): void {
	const hum = model.FindFirstChildOfClass("Humanoid")!;
	task.spawn(() => {
		for (const wp of [...waypoints, basePos]) {
			if (!model.Parent || hum.Health <= 0) return;
			hum.MoveTo(wp);
			const t0 = os.clock();
			while (model.Parent && hum.Health > 0) {
				const root = model.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
				if (!root) return;
				if (root.Position.sub(wp).mul(new Vector3(1, 0, 1)).Magnitude < 4) break;
				if (os.clock() - t0 > 20) break; // stuck → skip
				task.wait(0.25);
			}
		}
		if (model.Parent && hum.Health > 0) {
			baseHp -= 10;
			for (const p of Players.GetPlayers()) notify.FireClient(p, "The base is under attack!");
			broadcast();
			model.Destroy();
			alive.delete(model);
		}
	});
}

function buildTower(pad: BasePart, player: Player): void {
	const existing = towers.find((t) => t.part.Parent === pad.Parent && t.part.Position.sub(pad.Position).Magnitude < 3);
	const prof = PlayerData.getProfile(player);
	if (!prof) return;
	if (existing) {
		if (existing.owner !== player) return;
		const cost = cfg.towerCost * (existing.level + 1);
		if (prof.coins < cost) return notify.FireClient(player, `Upgrade costs ${cost}`);
		prof.coins -= cost;
		existing.level += 1;
		existing.part.Size = existing.part.Size.add(new Vector3(0, 2, 0));
		existing.part.CFrame = existing.part.CFrame.add(new Vector3(0, 1, 0));
		PlayerData.replicate(player);
		notify.FireClient(player, `Tower level ${existing.level}`);
		return;
	}
	if (prof.coins < cfg.towerCost) return notify.FireClient(player, `Tower costs ${cfg.towerCost} ${GameConfig.currency.name}`);
	prof.coins -= cfg.towerCost;
	PlayerData.replicate(player);
	const t = new Instance("Part");
	t.Name = "Tower";
	t.Size = new Vector3(4, 8, 4);
	t.CFrame = new CFrame(pad.Position.add(new Vector3(0, 4.5, 0)));
	t.Anchored = true;
	t.Color = Color3.fromHex(GameConfig.genre === "strategy" ? "#8a8a90" : "#4a7ad0");
	t.Material = Enum.Material.Metal;
	t.Parent = pad.Parent;
	const top = new Instance("Part");
	top.Shape = Enum.PartType.Ball;
	top.Size = new Vector3(3, 3, 3);
	top.Material = Enum.Material.Neon;
	top.Color = Color3.fromHex("#40d0ff");
	top.Anchored = true;
	top.CFrame = t.CFrame.add(new Vector3(0, 5, 0));
	top.Parent = t;
	towers.push({ part: t, owner: player, level: 1, nextShot: 0 });
	notify.FireClient(player, "Tower built");
}

function towerLoop(): void {
	task.spawn(() => {
		while (running) {
			task.wait(0.1);
			const now = os.clock();
			for (const t of towers) {
				if (now < t.nextShot) continue;
				let target: Model | undefined;
				let bestD = cfg.towerRange * (1 + t.level * 0.15);
				for (const m of alive) {
					const root = m.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
					if (!root) continue;
					const d = root.Position.sub(t.part.Position).Magnitude;
					if (d < bestD) {
						bestD = d;
						target = m;
					}
				}
				if (!target) continue;
				t.nextShot = now + 1 / cfg.towerRate;
				const hum = target.FindFirstChildOfClass("Humanoid");
				if (!hum) continue;
				hum.TakeDamage(cfg.towerDamage * t.level);
				fx.FireAllClients("shot", t.part.Position.add(new Vector3(0, 6, 0)), (target.FindFirstChild("HumanoidRootPart") as BasePart).Position);
				if (hum.Health <= 0) {
					PlayerData.addCoins(t.owner, GameConfig.enemies.reward);
					Progression.grantXp(t.owner, GameConfig.progression.xpPerAction);
				}
			}
		}
	});
}

function waves(): void {
	const wps = sortedZones("td_waypoint_", "index").map((z) => z.position);
	const spawn = findZone("td_spawn") ?? findZones({ metaKind: "enemy_spawn" })[0];
	const base = findZone("td_base");
	if (!spawn || !base) {
		print("[WorldForge] tower defense: no td_spawn/td_base zones (layout base_defense expected)");
		return;
	}
	running = true;
	towerLoop();
	task.spawn(() => {
		for (wave = 1; wave <= cfg.waves && baseHp > 0; wave++) {
			broadcast();
			for (const p of Players.GetPlayers()) notify.FireClient(p, `Wave ${wave} incoming!`);
			const n = cfg.enemiesPerWave + wave * 2;
			for (let i = 0; i < n; i++) {
				const m = Enemies.spawnAt(spawn.position, { health: GameConfig.enemies.health * (1 + wave * 0.25), speed: GameConfig.enemies.speed * 0.8, name: `${GameConfig.enemies.name} ${wave}` });
				alive.add(m);
				m.FindFirstChildOfClass("Humanoid")!.Died.Connect(() => {
					alive.delete(m);
					task.delay(2, () => m.Destroy());
				});
				walkPath(m, wps, base.position);
				task.wait(1.4);
			}
			while (alive.size() > 0 && baseHp > 0) task.wait(1);
			for (const p of Players.GetPlayers()) {
				PlayerData.addCoins(p, 40 + wave * 10);
				Progression.progressQuest(p, "survive", "wave", 1);
			}
			task.wait(6);
		}
		running = false;
		for (const p of Players.GetPlayers()) {
			notify.FireClient(p, baseHp > 0 ? "All waves cleared — victory!" : "The base has fallen…");
			if (baseHp > 0) PlayerData.addStat(p, "Wins", 1);
		}
		// restart after a pause
		task.wait(15);
		baseHp = cfg.baseHp;
		for (const t of towers) t.part.Destroy();
		towers.clear();
		waves();
	});
}

export function start(): void {
	if (!GameConfig.systems.includes("tower_defense")) return;
	task.spawn(() => {
		while (Workspace.GetAttribute("WorldReady") !== true) task.wait(1);
		task.wait(3);
		for (const pad of findZones({ metaKind: "tower_pad" })) {
			const touch = new Instance("Part");
			touch.Size = new Vector3(8, 4, 8);
			touch.CFrame = new CFrame(pad.position.add(new Vector3(0, 1, 0)));
			touch.Anchored = true;
			touch.CanCollide = false;
			touch.Transparency = 1;
			touch.Parent = pad.part;
			const debounce = new Map<Player, number>();
			touch.Touched.Connect((hit) => {
				const player = Players.GetPlayerFromCharacter(hit.Parent as Model);
				if (!player) return;
				const now = os.clock();
				if (now - (debounce.get(player) ?? 0) < 1.5) return;
				debounce.set(player, now);
				buildTower(touch, player);
			});
		}
		waves();
	});
}
