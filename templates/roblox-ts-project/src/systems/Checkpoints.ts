import { Players, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getRemoteEvent, Remotes } from "shared/net";
import { findZones, sortedZones, type ZoneInfo } from "shared/zones";
import * as PlayerData from "./PlayerData";

/**
 * Checkpoints: obby stages (`obby_stage_N`), story checkpoints (`story_checkpoint_N`) and race
 * gates share one mechanism — touching the zone's pad records the stage, respawns happen at the
 * last checkpoint, kill bricks (parts named "KillBrick") reset the character. Stage is persisted
 * in Profile.stats.Stage and mirrored to leaderstats.
 */
const hudValue = getRemoteEvent(Remotes.HudValue);
const notify = getRemoteEvent(Remotes.Notify);
const stagesById = new Map<string, number>();
let stages: ZoneInfo[] = [];
let finishIndex = 0;

function stageOf(player: Player): number {
	return PlayerData.getStat(player, "Stage");
}

function spawnCFrame(player: Player): CFrame | undefined {
	const s = stageOf(player);
	const z = stages[s - 1];
	if (!z) return undefined;
	return new CFrame(z.position.add(new Vector3(0, 4, 0)));
}

function reach(player: Player, index: number): void {
	const cur = stageOf(player);
	if (index <= cur) return;
	PlayerData.setStat(player, "Stage", index);
	hudValue.FireClient(player, "stage", "Stage", `${index} / ${stages.size()}`);
	if (index === finishIndex) {
		PlayerData.addCoins(player, GameConfig.obby.finishReward);
		PlayerData.addStat(player, "Wins", 1);
		notify.FireClient(player, `Finish! +${GameConfig.obby.finishReward} ${GameConfig.currency.name}`);
	} else {
		PlayerData.addCoins(player, GameConfig.obby.stageReward);
		notify.FireClient(player, `Checkpoint ${index}`);
	}
	if (GameConfig.systems.includes("progression")) PlayerData.addStat(player, "xp", GameConfig.progression.xpPerAction * 2);
}

function hookPads(): void {
	const prefix = stages[0]?.id.sub(1, 5) === "story" ? "story_checkpoint_" : "obby_stage_";
	stages = sortedZones(prefix, prefix === "obby_stage_" ? "stage" : "index");
	if (stages.size() === 0) stages = sortedZones("race_cp_", "index");
	finishIndex = stages.size();
	stages.forEach((z, i) => {
		stagesById.set(z.id, i + 1);
		// touch volume above the marker (the pad is part of the layout model; the marker sits 2 studs above the platform)
		const pad = new Instance("Part");
		pad.Name = `${z.id}_touch`;
		pad.Size = new Vector3(math.max(8, z.radius * 1.2), 6, math.max(8, z.radius * 1.2));
		pad.CFrame = new CFrame(z.position.add(new Vector3(0, 1, 0)));
		pad.Anchored = true;
		pad.CanCollide = false;
		pad.Transparency = 1;
		pad.Parent = z.part;
		pad.Touched.Connect((hit) => {
			const player = Players.GetPlayerFromCharacter(hit.Parent as Model);
			if (player) reach(player, i + 1);
		});
	});
}

function hookKillBricks(): void {
	const world = Workspace.FindFirstChild("World");
	if (!world) return;
	const hook = (part: BasePart) => {
		part.Touched.Connect((hit) => {
			const hum = (hit.Parent as Model | undefined)?.FindFirstChildOfClass("Humanoid");
			if (hum && hum.Health > 0) hum.Health = 0;
		});
	};
	for (const d of world.GetDescendants()) if (d.IsA("BasePart") && d.Name === "KillBrick") hook(d);
	world.DescendantAdded.Connect((d) => {
		if (d.IsA("BasePart") && d.Name === "KillBrick") hook(d);
	});
}

export function start(): void {
	if (!GameConfig.systems.includes("checkpoints") && !GameConfig.systems.includes("obby")) return;
	task.spawn(() => {
		while (Workspace.GetAttribute("WorldReady") !== true) task.wait(1);
		stages = findZones({ prefix: "obby_stage_" }).size() > 0 ? sortedZones("obby_stage_", "stage") : sortedZones("story_checkpoint_", "index");
		hookPads();
		hookKillBricks();
		print(`[WorldForge] ${stages.size()} checkpoints`);
	});
	const setup = (player: Player) => {
		player.CharacterAdded.Connect((char) => {
			task.defer(() => {
				const cf = spawnCFrame(player);
				if (cf) char.PivotTo(cf);
				hudValue.FireClient(player, "stage", "Stage", `${stageOf(player)} / ${stages.size()}`);
			});
			const hum = char.WaitForChild("Humanoid") as Humanoid;
			hum.Died.Connect(() => task.delay(2, () => player.Parent && player.LoadCharacter()));
		});
	};
	Players.PlayerAdded.Connect(setup);
	for (const p of Players.GetPlayers()) setup(p);
}
