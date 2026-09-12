import { Players, Workspace } from "@rbxts/services";
import { loadAnimation } from "shared/anim/keyframes";
import { AnimationConfig } from "shared/animations";
import { NpcConfig } from "shared/npcs";
import { getRemoteEvent, Remotes } from "shared/net";

/**
 * Villager NPCs: real R15 avatars (HumanoidDescription), idle / walk animations, a wander loop between
 * spots around their home zone, and a "Talk" prompt that plays the greet emote and sends a dialogue line.
 */
const talk = getRemoteEvent(Remotes.NpcTalk);

interface NpcRuntime {
	model: Model;
	humanoid: Humanoid;
	idle: AnimationTrack;
	walk: AnimationTrack;
	greet: AnimationTrack;
	home: Vector3;
	busy: boolean;
}

function describe(seed: number): HumanoidDescription {
	const d = new Instance("HumanoidDescription");
	const skins = [Color3.fromRGB(240, 200, 170), Color3.fromRGB(200, 150, 120), Color3.fromRGB(150, 100, 70), Color3.fromRGB(230, 180, 150)];
	const skin = skins[seed % skins.size()];
	d.HeadColor = skin;
	d.TorsoColor = skin;
	d.LeftArmColor = skin;
	d.RightArmColor = skin;
	d.LeftLegColor = skin;
	d.RightLegColor = skin;
	return d;
}

function groundAt(x: number, z: number, fallbackY: number): number {
	const params = new RaycastParams();
	params.FilterType = Enum.RaycastFilterType.Include;
	params.FilterDescendantsInstances = [Workspace.Terrain];
	const hit = Workspace.Raycast(new Vector3(x, fallbackY + 120, z), new Vector3(0, -400, 0), params);
	return hit ? hit.Position.Y : fallbackY;
}

function spawnNpc(def: (typeof NpcConfig.npcs)[number], index: number, position: Vector3, folder: Folder): NpcRuntime | undefined {
	const [ok, model] = pcall(() => Players.CreateHumanoidModelFromDescription(describe(index), Enum.HumanoidRigType.R15));
	if (!ok) {
		warn(`WorldForge: cannot create NPC rig: ${model}`);
		return undefined;
	}
	const m = model as Model;
	m.Name = def.name;
	const humanoid = m.FindFirstChildOfClass("Humanoid")!;
	humanoid.DisplayName = def.name;
	humanoid.WalkSpeed = 8;
	humanoid.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff;
	const y = groundAt(position.X, position.Z, position.Y);
	m.PivotTo(new CFrame(position.X, y + 3, position.Z));
	m.SetAttribute("Role", def.role);
	m.Parent = folder;
	const idle = loadAnimation(humanoid, AnimationConfig.npcIdle);
	const walk = loadAnimation(humanoid, AnimationConfig.npcWalk);
	const greet = loadAnimation(humanoid, AnimationConfig.greet);
	idle.Looped = true;
	walk.Looped = true;
	idle.Play();
	const npc: NpcRuntime = { model: m, humanoid, idle, walk, greet, home: new Vector3(position.X, y, position.Z), busy: false };

	// talk prompt
	const root = m.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
	if (root) {
		const prompt = new Instance("ProximityPrompt");
		prompt.ActionText = "Talk";
		prompt.ObjectText = def.name;
		prompt.MaxActivationDistance = 10;
		prompt.RequiresLineOfSight = false;
		prompt.Parent = root;
		prompt.Triggered.Connect((player) => {
			npc.busy = true;
			const line = def.dialogue.size() > 0 ? def.dialogue[math.random(0, def.dialogue.size() - 1)] : `Hello, ${player.DisplayName}!`;
			// face the player, greet, speak
			const pr = player.Character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
			if (pr) m.PivotTo(CFrame.lookAt(root.Position, new Vector3(pr.Position.X, root.Position.Y, pr.Position.Z)));
			npc.walk.Stop();
			npc.greet.Play();
			talk.FireClient(player, def.name, line);
			task.delay(3, () => (npc.busy = false));
		});
	}
	return npc;
}

function wander(npc: NpcRuntime): void {
	task.spawn(() => {
		for (;;) {
			task.wait(math.random(4, 9));
			if (npc.busy || !npc.model.Parent) {
				if (!npc.model.Parent) break;
				continue;
			}
			const a = math.random() * math.pi * 2;
			const r = 6 + math.random() * 14;
			const target = new Vector3(npc.home.X + math.cos(a) * r, npc.home.Y, npc.home.Z + math.sin(a) * r);
			npc.walk.Play();
			npc.humanoid.MoveTo(target);
			npc.humanoid.MoveToFinished.Wait();
			npc.walk.Stop();
		}
	});
}

export function start(): void {
	if (NpcConfig.npcs.size() === 0) return;
	const spawnAll = () => {
		const world = Workspace.FindFirstChild("World") as Folder | undefined;
		if (!world) return;
		const folder = new Instance("Folder");
		folder.Name = "Npcs";
		folder.Parent = world;
		const spawn = (world.FindFirstChildOfClass("SpawnLocation") as SpawnLocation | undefined)?.Position ?? new Vector3(0, 50, 0);
		const zones = (world.FindFirstChild("Zones") as Folder | undefined)?.GetChildren() ?? [];
		NpcConfig.npcs.forEach((def, i) => {
			// villagers live around the settlement zone when one exists, otherwise near the spawn
			const zone = zones.find((z) => z.IsA("BasePart") && z.Name === def.location) as BasePart | undefined;
			const village = zones.find((z) => z.IsA("BasePart") && (z.GetAttribute("Kind") as string | undefined) === "settlement") as BasePart | undefined;
			const base = zone?.Position ?? village?.Position ?? spawn;
			const a = (i / math.max(1, NpcConfig.npcs.size())) * math.pi * 2;
			const pos = new Vector3(base.X + math.cos(a) * 14, base.Y, base.Z + math.sin(a) * 14);
			const npc = spawnNpc(def, i, pos, folder);
			if (npc) wander(npc);
		});
	};
	if (Workspace.GetAttribute("WorldReady") === true) spawnAll();
	else Workspace.GetAttributeChangedSignal("WorldReady").Once(() => spawnAll());
}
