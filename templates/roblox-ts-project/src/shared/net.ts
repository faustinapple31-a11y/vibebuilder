import { ReplicatedStorage } from "@rbxts/services";

/**
 * Typed remotes. The server creates them under ReplicatedStorage.Remotes; the client waits for them.
 */
export interface PlayerStats {
	coins: number;
	hunger: number;
}

/** Quest progress replicated to the client (Progression): counter + completion. */
export interface QuestProgress {
	progress: number;
	done: boolean;
}

/**
 * Replicated profile: what the inventory / quests / crafting / settings screens read. Sent by
 * PlayerData on every change (same moment as StatsChanged).
 */
export interface ProfileStateMsg {
	coins: number;
	/** item id → count (survival / farming / mining / crafting resources). */
	inventory: Record<string, number>;
	/** permanently owned shop upgrades and passes. */
	owned: string[];
	/** persisted numbers (stage, wins, xp, level, rebirths, setting_*…). */
	stats: Record<string, number>;
	/** quest id → progress (only when the quests system is enabled). */
	quests: Record<string, QuestProgress>;
}

/** Replicated shop state: owned upgrades, consumable counts, active buffs (seconds left). */
export interface ShopState {
	coins: number;
	owned: string[];
	counts: Record<string, number>;
	buffs: Record<string, number>;
}

const FOLDER = "Remotes";

function folder(): Folder {
	let f = ReplicatedStorage.FindFirstChild(FOLDER) as Folder | undefined;
	if (!f) {
		f = new Instance("Folder");
		f.Name = FOLDER;
		f.Parent = ReplicatedStorage;
	}
	return f;
}

export function getRemoteEvent(name: string): RemoteEvent {
	const f = folder();
	let r = f.FindFirstChild(name) as RemoteEvent | undefined;
	if (!r) {
		r = new Instance("RemoteEvent");
		r.Name = name;
		r.Parent = f;
	}
	return r;
}

export function waitRemoteEvent(name: string): RemoteEvent {
	const f = ReplicatedStorage.WaitForChild(FOLDER) as Folder;
	return f.WaitForChild(name) as RemoteEvent;
}

export function getRemoteFunction(name: string): RemoteFunction {
	const f = folder();
	let r = f.FindFirstChild(name) as RemoteFunction | undefined;
	if (!r) {
		r = new Instance("RemoteFunction");
		r.Name = name;
		r.Parent = f;
	}
	return r;
}

export function waitRemoteFunction(name: string): RemoteFunction {
	const f = ReplicatedStorage.WaitForChild(FOLDER) as Folder;
	return f.WaitForChild(name) as RemoteFunction;
}

export const Remotes = {
	StatsChanged: "StatsChanged",
	Notify: "Notify",
	WorldProgress: "WorldProgress",
	ShopState: "ShopState",
	/** Full profile replication for the inventory / quests / crafting screens (ProfileStateMsg). */
	ProfileState: "ProfileState",
	ShopBuy: "ShopBuy",
	ShopPromptRobux: "ShopPromptRobux",
	NpcTalk: "NpcTalk",
	PlaySfx: "PlaySfx",
	/** Generic HUD values (stage, round timer, team, health, wave…): (key, label, value) */
	HudValue: "HudValue",
	/** Generic client → server action: (name, ...args) — validated per system. */
	Action: "Action",
	/** Round state broadcast: { phase, secondsLeft, message } */
	RoundState: "RoundState",
	/** Client-side effects: (kind, position) */
	Fx: "Fx",
} as const;

export interface RoundStateMsg {
	phase: "lobby" | "intermission" | "playing" | "ending";
	secondsLeft: number;
	message: string;
	scores?: Record<string, number>;
}
