import { Players, RunService, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getRemoteEvent, Remotes } from "shared/net";
import { findZone, findZones, sortedZones } from "shared/zones";
import * as PlayerData from "./PlayerData";
import * as Progression from "./Progression";
import * as Rounds from "./Rounds";

/**
 * Genre modes with lighter mechanics: sports (ball + goals), puzzle (switch/door pairs), parkour
 * (double jump + sprint), story (chapter triggers with dialogue beats), building (place blocks on
 * your plot), abilities (dash / slam with cooldowns), rhythm (note pads), minigames (portal picks a
 * random mini-mode). Each starts only when its system id is enabled.
 */
const notify = getRemoteEvent(Remotes.Notify);
const hudValue = getRemoteEvent(Remotes.HudValue);
const action = getRemoteEvent(Remotes.Action);
const fx = getRemoteEvent(Remotes.Fx);

function worldFolder(): Instance {
	return Workspace.FindFirstChild("World") ?? Workspace;
}

// ---------------------------------------------------------------- sports
function startSports(): void {
	const cfg = GameConfig.sports;
	const center = findZone("field_center");
	const goals = findZones({ metaKind: "goal" });
	if (!center || goals.size() < 2) return;
	const ball = new Instance("Part");
	ball.Name = "Ball";
	ball.Shape = Enum.PartType.Ball;
	ball.Size = new Vector3(3, 3, 3);
	ball.Color = Color3.fromRGB(245, 245, 240);
	ball.Material = Enum.Material.SmoothPlastic;
	ball.CustomPhysicalProperties = new PhysicalProperties(0.3, 0.3, 0.8, 1, 1);
	ball.CFrame = new CFrame(center.position.add(new Vector3(0, 4, 0)));
	ball.Parent = worldFolder();
	const reset = () => {
		ball.CFrame = new CFrame(center.position.add(new Vector3(0, 4, 0)));
		ball.AssemblyLinearVelocity = new Vector3(0, 0, 0);
	};
	// kick: touching the ball pushes it
	ball.Touched.Connect((hit) => {
		const player = Players.GetPlayerFromCharacter(hit.Parent as Model);
		const root = player?.Character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
		if (!root) return;
		const dir = ball.Position.sub(root.Position).mul(new Vector3(1, 0, 1)).Unit;
		ball.AssemblyLinearVelocity = dir.mul(55).add(new Vector3(0, 18, 0));
	});
	for (const g of goals) {
		const box = new Instance("Part");
		box.Size = new Vector3(4, 8, 16);
		box.CFrame = new CFrame(g.position.add(new Vector3(0, 4, 0)));
		box.Anchored = true;
		box.CanCollide = false;
		box.Transparency = 1;
		box.Parent = g.part;
		let cooldown = 0;
		box.Touched.Connect((hit) => {
			if (hit !== ball || os.clock() < cooldown) return;
			cooldown = os.clock() + 3;
			const scoringTeam = g.meta.team === "a" ? "b" : "a"; // scoring in team A's goal = point for B
			Rounds.addScore(`team_${scoringTeam}`, 1);
			for (const p of Players.GetPlayers()) {
				notify.FireClient(p, `GOAL for team ${scoringTeam.upper()}!`);
				if ((p.GetAttribute("Team") as string | undefined) === scoringTeam) PlayerData.addCoins(p, cfg.goalReward);
			}
			fx.FireAllClients("goal", g.position);
			task.delay(2, reset);
		});
	}
	task.spawn(() => {
		for (;;) {
			task.wait(3);
			if (ball.Position.Y < center.position.Y - 40 || ball.Position.sub(center.position).Magnitude > 160) reset();
		}
	});
}

// ---------------------------------------------------------------- puzzle
function startPuzzle(): void {
	const rooms = sortedZones("dungeon_room_", "index");
	const anchors = rooms.size() > 0 ? rooms : findZones({ prefix: "story_checkpoint_" });
	const spots = anchors.size() > 0 ? anchors.map((z) => z.position) : [findZones({ kind: "spawn" })[0]?.position ?? new Vector3(0, 10, 0)];
	spots.forEach((pos, i) => {
		// a switch and a door: the door blocks the corridor until the switch is pressed
		const sw = new Instance("Part");
		sw.Name = `Switch_${i + 1}`;
		sw.Size = new Vector3(3, 1, 3);
		sw.Color = Color3.fromRGB(220, 60, 60);
		sw.Material = Enum.Material.Neon;
		sw.Anchored = true;
		sw.CFrame = new CFrame(pos.add(new Vector3(6, -1, 6)));
		sw.Parent = worldFolder();
		const door = new Instance("Part");
		door.Name = `Door_${i + 1}`;
		door.Size = new Vector3(12, 10, 1.5);
		door.Color = Color3.fromRGB(90, 70, 50);
		door.Material = Enum.Material.Wood;
		door.Anchored = true;
		door.CFrame = new CFrame(pos.add(new Vector3(0, 3, -14)));
		door.Parent = worldFolder();
		let open = false;
		sw.Touched.Connect((hit) => {
			const player = Players.GetPlayerFromCharacter(hit.Parent as Model);
			if (!player || open) return;
			open = true;
			sw.Color = Color3.fromRGB(60, 220, 100);
			door.CanCollide = false;
			door.Transparency = 0.7;
			notify.FireClient(player, "A door opens somewhere…");
			PlayerData.addCoins(player, 20);
			Progression.progressQuest(player, "escape", `door_${i + 1}`, 1);
			task.delay(30, () => {
				open = false;
				sw.Color = Color3.fromRGB(220, 60, 60);
				door.CanCollide = true;
				door.Transparency = 0;
			});
		});
	});
}

// ---------------------------------------------------------------- parkour
function startParkour(): void {
	const jumps = new Map<Player, number>();
	action.OnServerEvent.Connect((player, name) => {
		const char = player.Character;
		const hum = char?.FindFirstChildOfClass("Humanoid");
		const root = char?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
		if (!hum || !root) return;
		if (name === "double_jump") {
			if ((jumps.get(player) ?? 0) >= 1) return;
			jumps.set(player, 1);
			root.AssemblyLinearVelocity = new Vector3(root.AssemblyLinearVelocity.X, 52, root.AssemblyLinearVelocity.Z);
			fx.FireAllClients("jump", root.Position);
		} else if (name === "sprint") {
			hum.WalkSpeed = 26;
			task.delay(4, () => (hum.WalkSpeed = 16));
		}
	});
	const setup = (player: Player) => {
		player.CharacterAdded.Connect((char) => {
			const hum = char.WaitForChild("Humanoid") as Humanoid;
			hum.StateChanged.Connect((_, st) => {
				if (st === Enum.HumanoidStateType.Landed) jumps.set(player, 0);
			});
		});
		task.delay(1.5, () => hudValue.FireClient(player, "parkour", "Parkour", "Space ×2 double jump · Shift sprint"));
	};
	Players.PlayerAdded.Connect(setup);
	for (const p of Players.GetPlayers()) setup(p);
}

// ---------------------------------------------------------------- story
function startStory(): void {
	const beats = sortedZones("story_checkpoint_", "index");
	beats.forEach((z, i) => {
		const trigger = new Instance("Part");
		trigger.Size = new Vector3(14, 8, 14);
		trigger.CFrame = new CFrame(z.position.add(new Vector3(0, 2, 0)));
		trigger.Anchored = true;
		trigger.CanCollide = false;
		trigger.Transparency = 1;
		trigger.Parent = z.part;
		const seen = new Set<Player>();
		trigger.Touched.Connect((hit) => {
			const player = Players.GetPlayerFromCharacter(hit.Parent as Model);
			if (!player || seen.has(player)) return;
			seen.add(player);
			PlayerData.setStat(player, "Chapter", math.max(PlayerData.getStat(player, "Chapter"), i + 1));
			hudValue.FireClient(player, "chapter", "Chapter", `${i + 1} / ${beats.size()}`);
			notify.FireClient(player, `Chapter ${i + 1}: ${i === beats.size() - 1 ? "The end… for now." : "The path continues."}`);
			Progression.grantXp(player, GameConfig.progression.xpPerAction * 3);
			Progression.progressQuest(player, "reach", z.id, 1);
		});
	});
}

// ---------------------------------------------------------------- building (sandbox)
function startBuilding(): void {
	const placed = new Map<Player, BasePart[]>();
	action.OnServerEvent.Connect((player, name, x, y, z, colorHex) => {
		if (name === "place_block" && typeIs(x, "number") && typeIs(y, "number") && typeIs(z, "number")) {
			const root = player.Character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
			if (!root || new Vector3(x, y, z).sub(root.Position).Magnitude > 40) return;
			const list = placed.get(player) ?? [];
			if (list.size() >= 200) return notify.FireClient(player, "Block limit reached (200)");
			const b = new Instance("Part");
			b.Size = new Vector3(4, 4, 4);
			b.Anchored = true;
			b.CFrame = new CFrame(math.round(x / 4) * 4, math.round(y / 4) * 4 + 2, math.round(z / 4) * 4);
			b.Color = typeIs(colorHex, "string") ? Color3.fromHex(colorHex) : Color3.fromRGB(200, 160, 100);
			b.Material = Enum.Material.WoodPlanks;
			b.SetAttribute("Owner", player.UserId);
			b.Parent = worldFolder();
			list.push(b);
			placed.set(player, list);
			Progression.progressQuest(player, "build", "block", 1);
		} else if (name === "remove_block" && typeIs(x, "number") && typeIs(y, "number") && typeIs(z, "number")) {
			const list = placed.get(player) ?? [];
			const idx = list.findIndex((b) => b.Position.sub(new Vector3(x, y, z)).Magnitude < 3);
			if (idx >= 0) {
				list[idx]!.Destroy();
				list.remove(idx);
			}
		}
	});
	const setup = (player: Player) => task.delay(1.5, () => hudValue.FireClient(player, "build", "Build", "click to place · right-click to remove"));
	Players.PlayerAdded.Connect(setup);
	for (const p of Players.GetPlayers()) setup(p);
}

// ---------------------------------------------------------------- abilities
function startAbilities(): void {
	const cooldowns = new Map<Player, Map<string, number>>();
	action.OnServerEvent.Connect((player, name) => {
		if (name !== "ability_dash" && name !== "ability_slam") return;
		const root = player.Character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
		if (!root) return;
		const cds = cooldowns.get(player) ?? new Map<string, number>();
		cooldowns.set(player, cds);
		const now = os.clock();
		if (now < (cds.get(name) ?? 0)) return;
		cds.set(name, now + (name === "ability_dash" ? 3 : 8));
		if (name === "ability_dash") {
			root.AssemblyLinearVelocity = root.CFrame.LookVector.mul(90).add(new Vector3(0, 10, 0));
			fx.FireAllClients("dash", root.Position);
		} else {
			fx.FireAllClients("slam", root.Position);
			for (const other of Workspace.GetDescendants()) {
				if (!other.IsA("Humanoid") || other.Parent === player.Character) continue;
				const oroot = (other.Parent as Model).FindFirstChild("HumanoidRootPart") as BasePart | undefined;
				if (!oroot || oroot.Position.sub(root.Position).Magnitude > 14) continue;
				const isPlayer = Players.GetPlayerFromCharacter(other.Parent as Model) !== undefined;
				if (isPlayer && Rounds.currentPhase() !== "playing" && !GameConfig.systems.includes("teams")) continue;
				other.TakeDamage(30);
				oroot.AssemblyLinearVelocity = oroot.Position.sub(root.Position).Unit.mul(40).add(new Vector3(0, 30, 0));
			}
		}
	});
	const setup = (player: Player) => task.delay(1.5, () => hudValue.FireClient(player, "abilities", "Abilities", "Q dash · F slam"));
	Players.PlayerAdded.Connect(setup);
	for (const p of Players.GetPlayers()) setup(p);
}

// ---------------------------------------------------------------- rhythm
function startRhythm(): void {
	const stage = findZone("plaza_stage") ?? findZones({ metaKind: "plaza" })[0] ?? findZones({ kind: "spawn" })[0];
	if (!stage) return;
	const pads: BasePart[] = [];
	const cols = [Color3.fromRGB(255, 80, 80), Color3.fromRGB(80, 200, 255), Color3.fromRGB(255, 220, 80), Color3.fromRGB(120, 255, 120)];
	for (let i = 0; i < 4; i++) {
		const pad = new Instance("Part");
		pad.Name = `NotePad_${i + 1}`;
		pad.Size = new Vector3(5, 0.6, 5);
		pad.Color = cols[i]!;
		pad.Material = Enum.Material.SmoothPlastic;
		pad.Anchored = true;
		pad.CFrame = new CFrame(stage.position.add(new Vector3(-9 + i * 6, 1, 12)));
		pad.Parent = worldFolder();
		pads.push(pad);
	}
	let active = -1;
	task.spawn(() => {
		for (;;) {
			active = math.random(0, 3);
			pads.forEach((p, i) => (p.Material = i === active ? Enum.Material.Neon : Enum.Material.SmoothPlastic));
			task.wait(0.9);
		}
	});
	pads.forEach((pad, i) => {
		let cd = 0;
		pad.Touched.Connect((hit) => {
			const player = Players.GetPlayerFromCharacter(hit.Parent as Model);
			if (!player || os.clock() < cd) return;
			cd = os.clock() + 0.5;
			if (i === active) {
				const s = PlayerData.addStat(player, "Score", 10);
				hudValue.FireClient(player, "rhythm", "Score", `${s}`);
				PlayerData.addCoins(player, 1);
				fx.FireAllClients("hit", pad.Position);
			} else {
				hudValue.FireClient(player, "rhythm", "Score", `${PlayerData.getStat(player, "Score")} (miss)`);
			}
		});
	});
}

// ---------------------------------------------------------------- minigames (lobby portals)
function startMinigames(): void {
	const portals = sortedZones("lobby_portal_", "index");
	const modes = ["Sword race", "King of the hill", "Hide and seek", "Coin rush", "Lava floor", "Tag"];
	portals.forEach((z, i) => {
		const mode = modes[i % modes.size()]!;
		const gui = new Instance("BillboardGui");
		gui.Size = new UDim2(0, 220, 0, 50);
		gui.StudsOffset = new Vector3(0, 12, 0);
		gui.AlwaysOnTop = true;
		gui.Parent = z.part;
		const l = new Instance("TextLabel");
		l.Size = new UDim2(1, 0, 1, 0);
		l.BackgroundTransparency = 1;
		l.Font = Enum.Font.GothamBold;
		l.TextScaled = true;
		l.TextColor3 = Color3.fromRGB(255, 255, 255);
		l.TextStrokeTransparency = 0.3;
		l.Text = mode;
		l.Parent = gui;
		const trigger = new Instance("Part");
		trigger.Size = new Vector3(10, 12, 4);
		trigger.CFrame = new CFrame(z.position.add(new Vector3(0, 5, 0)));
		trigger.Anchored = true;
		trigger.CanCollide = false;
		trigger.Transparency = 1;
		trigger.Parent = z.part;
		const cd = new Map<Player, number>();
		trigger.Touched.Connect((hit) => {
			const player = Players.GetPlayerFromCharacter(hit.Parent as Model);
			if (!player || os.clock() < (cd.get(player) ?? 0)) return;
			cd.set(player, os.clock() + 5);
			notify.FireClient(player, `${mode}: joined the queue — next round starts soon`);
			hudValue.FireClient(player, "minigame", "Minigame", mode);
		});
	});
}

export function start(): void {
	task.spawn(() => {
		while (Workspace.GetAttribute("WorldReady") !== true) task.wait(1);
		task.wait(2);
		if (GameConfig.systems.includes("sports")) startSports();
		if (GameConfig.systems.includes("puzzle")) startPuzzle();
		if (GameConfig.systems.includes("story")) startStory();
		if (GameConfig.systems.includes("rhythm")) startRhythm();
		if (GameConfig.systems.includes("minigames")) startMinigames();
	});
	if (GameConfig.systems.includes("parkour")) startParkour();
	if (GameConfig.systems.includes("building")) startBuilding();
	if (GameConfig.systems.includes("abilities")) startAbilities();
	void RunService;
}
