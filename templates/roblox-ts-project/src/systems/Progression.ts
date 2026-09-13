import { DataStoreService, Lighting, Players, RunService, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getRemoteEvent, Remotes } from "shared/net";
import { QuestConfig } from "shared/quests";
import * as PlayerData from "./PlayerData";

/**
 * Small systems that many genres share:
 *  - Progression: XP → levels (Profile.stats.xp / Level), HUD value, level-up notify.
 *  - DayNight: clock cycle on Lighting, `Workspace.IsNight` attribute (enemies get bolder at night).
 *  - Quests: objective counters driven by other systems (`progressQuest(player, type, target, n)`).
 *  - Leaderboards: OrderedDataStore top list broadcast to the HUD every minute.
 */
const hudValue = getRemoteEvent(Remotes.HudValue);
const notify = getRemoteEvent(Remotes.Notify);

// ---------------------------------------------------------------- progression
export function grantXp(player: Player, amount: number): void {
	if (!GameConfig.systems.includes("progression")) return;
	const xp = PlayerData.addStat(player, "xp", amount);
	const level = math.floor(xp / GameConfig.progression.xpPerLevel) + 1;
	if (level !== PlayerData.getStat(player, "Level")) {
		PlayerData.setStat(player, "Level", level);
		notify.FireClient(player, `Level ${level}!`);
	}
	hudValue.FireClient(player, "level", "Level", `${level}  (${xp % GameConfig.progression.xpPerLevel}/${GameConfig.progression.xpPerLevel} xp)`);
}

function startProgression(): void {
	const setup = (player: Player) => {
		task.delay(1, () => {
			const xp = PlayerData.getStat(player, "xp");
			const level = math.floor(xp / GameConfig.progression.xpPerLevel) + 1;
			PlayerData.setStat(player, "Level", level);
			hudValue.FireClient(player, "level", "Level", `${level}`);
		});
	};
	Players.PlayerAdded.Connect(setup);
	for (const p of Players.GetPlayers()) setup(p);
	// XP trickle for time played
	task.spawn(() => {
		for (;;) {
			task.wait(60);
			for (const p of Players.GetPlayers()) grantXp(p, GameConfig.progression.xpPerAction);
		}
	});
}

// ---------------------------------------------------------------- day / night
function startDayNight(): void {
	const len = GameConfig.dayNight.dayLengthSeconds;
	let t = ((GameConfig.dayNight.startHour / 24) * len) % len;
	RunService.Heartbeat.Connect((dt) => {
		t = (t + dt) % len;
		const hour = (t / len) * 24;
		Lighting.ClockTime = hour;
		const night = hour < 5.5 || hour > 19.5;
		if (Workspace.GetAttribute("IsNight") !== night) {
			Workspace.SetAttribute("IsNight", night);
			for (const p of Players.GetPlayers()) notify.FireClient(p, night ? "Night falls…" : "The sun rises.");
		}
	});
}

// ---------------------------------------------------------------- quests
const questProgress = new Map<Player, Map<string, number>>();

export function progressQuest(player: Player, objectiveType: string, target: string, n = 1): void {
	if (!GameConfig.systems.includes("quests")) return;
	let map = questProgress.get(player);
	if (!map) {
		map = new Map();
		questProgress.set(player, map);
	}
	for (const q of QuestConfig.quests) {
		if (q.objective.type !== objectiveType) continue;
		if (q.objective.target !== "any" && q.objective.target !== target) continue;
		if (PlayerData.getStat(player, `quest_${q.id}`) === 1) continue;
		const cur = (map.get(q.id) ?? 0) + n;
		map.set(q.id, cur);
		if (cur >= q.objective.count) {
			PlayerData.setStat(player, `quest_${q.id}`, 1);
			PlayerData.addCoins(player, q.reward.amount);
			notify.FireClient(player, `Quest complete: ${q.title} (+${q.reward.amount} ${GameConfig.currency.name})`);
			grantXp(player, GameConfig.progression.xpPerAction * 6);
		} else {
			hudValue.FireClient(player, `quest_${q.id}`, q.title, `${cur} / ${q.objective.count}`);
		}
	}
}

function startQuests(): void {
	const setup = (player: Player) => {
		task.delay(2, () => {
			for (const q of QuestConfig.quests) if (PlayerData.getStat(player, `quest_${q.id}`) !== 1) hudValue.FireClient(player, `quest_${q.id}`, q.title, `0 / ${q.objective.count}`);
		});
	};
	Players.PlayerAdded.Connect(setup);
	for (const p of Players.GetPlayers()) setup(p);
	Players.PlayerRemoving.Connect((p) => questProgress.delete(p));
}

// ---------------------------------------------------------------- leaderboards
function startLeaderboards(): void {
	const [ok, store] = pcall(() => DataStoreService.GetOrderedDataStore(`${GameConfig.dataStore.name}_lb`));
	if (!ok) return;
	const lb = store as OrderedDataStore;
	const key = GameConfig.leaderstats[0] ?? GameConfig.currency.name;
	task.spawn(() => {
		for (;;) {
			task.wait(60);
			if (RunService.IsStudio()) continue;
			for (const p of Players.GetPlayers()) {
				const value = key === GameConfig.currency.name ? (PlayerData.getProfile(p)?.coins ?? 0) : PlayerData.getStat(p, key);
				pcall(() => lb.SetAsync(`u${p.UserId}`, math.floor(value)));
			}
			const [okPages, pages] = pcall(() => lb.GetSortedAsync(false, 10));
			if (!okPages) continue;
			const rows = (pages as DataStorePages).GetCurrentPage() as { key: string; value: number }[];
			const text = rows.map((r, i) => `${i + 1}. ${r.key.sub(2)} — ${r.value}`).join("\n");
			for (const p of Players.GetPlayers()) hudValue.FireClient(p, "leaderboard", `Top ${key}`, text);
		}
	});
}

export function start(): void {
	if (GameConfig.systems.includes("progression")) startProgression();
	if (GameConfig.systems.includes("day_night")) startDayNight();
	if (GameConfig.systems.includes("quests")) startQuests();
	if (GameConfig.systems.includes("leaderboards")) startLeaderboards();
}
