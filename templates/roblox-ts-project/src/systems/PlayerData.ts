import { DataStoreService, Players, RunService } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getRemoteEvent, Remotes, type PlayerStats } from "shared/net";

/**
 * Persistent player profile (DataStore) + leaderstats + stat replication.
 * Studio without API access falls back to in-memory profiles.
 */
export interface Profile {
	coins: number;
	hunger: number;
	visits: number;
	/** Shop: permanently owned upgrades / passes. */
	owned: string[];
	/** Shop: consumable counts and items. */
	inventory: Record<string, number>;
	/** Permanent stat multipliers (coins, food…). */
	multipliers: Record<string, number>;
	/** Timed buffs: stat → { value, until (os.time) }. */
	buffs: Record<string, { value: number; until: number }>;
	/** Generic persisted numbers used by the genre systems (stage, wins, xp, level, rebirths, wave…). */
	stats: Record<string, number>;
}

const DEFAULT_PROFILE: Profile = { coins: GameConfig.currency.starting, hunger: GameConfig.survival.hungerMax, visits: 0, owned: [], inventory: {}, multipliers: {}, buffs: {}, stats: {} };

function fresh(): Profile {
	return { ...DEFAULT_PROFILE, owned: [], inventory: {}, multipliers: {}, buffs: {}, stats: {} };
}

/** Read a persisted stat (0 when unset). */
export function getStat(player: Player, key: string): number {
	return profiles.get(player)?.stats[key] ?? 0;
}

/** Set a persisted stat and mirror it to leaderstats when the config lists it. */
export function setStat(player: Player, key: string, value: number): void {
	const p = profiles.get(player);
	if (!p) return;
	p.stats[key] = value;
	const ls = player.FindFirstChild("leaderstats");
	const v = ls?.FindFirstChild(key) as IntValue | undefined;
	if (v) v.Value = math.floor(value);
}

export function addStat(player: Player, key: string, delta: number): number {
	const nextValue = getStat(player, key) + delta;
	setStat(player, key, nextValue);
	return nextValue;
}

/** Items in the inventory (survival / rpg / farming / mining). */
export function addItem(player: Player, item: string, count = 1): number {
	const p = profiles.get(player);
	if (!p) return 0;
	p.inventory[item] = math.max(0, (p.inventory[item] ?? 0) + count);
	replicate(player);
	return p.inventory[item]!;
}

export function hasItem(player: Player, item: string, count = 1): boolean {
	return (profiles.get(player)?.inventory[item] ?? 0) >= count;
}

/** Effective multiplier for a stat: permanent × active timed buff. */
export function multiplierFor(player: Player, stat: string): number {
	const p = profiles.get(player);
	if (!p) return 1;
	let m = p.multipliers[stat] ?? 1;
	const b = p.buffs[stat];
	if (b && b.until > os.time()) m *= b.value;
	return m;
}
const profiles = new Map<Player, Profile>();
const store = (() => {
	const [ok, ds] = pcall(() => DataStoreService.GetDataStore(GameConfig.dataStore.name));
	return ok ? (ds as DataStore) : undefined;
})();
const statsChanged = getRemoteEvent(Remotes.StatsChanged);

function keyFor(player: Player): string {
	return `player_${player.UserId}`;
}

function load(player: Player): Profile {
	if (store && !RunService.IsStudio()) {
		const [ok, data] = pcall(() => store.GetAsync(keyFor(player)));
		if (ok && typeIs(data, "table")) {
			const d = data as Partial<Profile>;
			return { coins: d.coins ?? DEFAULT_PROFILE.coins, hunger: d.hunger ?? DEFAULT_PROFILE.hunger, visits: d.visits ?? 0, owned: d.owned ?? [], inventory: d.inventory ?? {}, multipliers: d.multipliers ?? {}, buffs: d.buffs ?? {}, stats: d.stats ?? {} };
		}
	}
	return fresh();
}

export function save(player: Player): void {
	const p = profiles.get(player);
	if (!p || !store || RunService.IsStudio()) return;
	pcall(() => store.SetAsync(keyFor(player), p));
}

export function getProfile(player: Player): Profile | undefined {
	return profiles.get(player);
}

export function replicate(player: Player): void {
	const p = profiles.get(player);
	if (!p) return;
	const stats: PlayerStats = { coins: p.coins, hunger: p.hunger };
	statsChanged.FireClient(player, stats);
	const ls = player.FindFirstChild("leaderstats");
	const coins = ls?.FindFirstChild(GameConfig.currency.name) as IntValue | undefined;
	if (coins) coins.Value = math.floor(p.coins);
}

/** Adds coins with the player's coin multipliers applied (upgrades, VIP, luck buffs). Returns the amount granted. */
export function addCoins(player: Player, amount: number, raw = false): number {
	const p = profiles.get(player);
	if (!p) return 0;
	const granted = raw ? amount : math.floor(amount * multiplierFor(player, "coins") * multiplierFor(player, "luck"));
	p.coins += granted;
	replicate(player);
	return granted;
}

function onJoin(player: Player): void {
	const profile = load(player);
	profile.visits += 1;
	profiles.set(player, profile);
	const ls = new Instance("Folder");
	ls.Name = "leaderstats";
	const coins = new Instance("IntValue");
	coins.Name = GameConfig.currency.name;
	coins.Value = math.floor(profile.coins);
	coins.Parent = ls;
	for (const key of GameConfig.leaderstats) {
		const v = new Instance("IntValue");
		v.Name = key;
		v.Value = math.floor(profile.stats[key] ?? 0);
		v.Parent = ls;
	}
	ls.Parent = player;
	replicate(player);
}

function onLeave(player: Player): void {
	save(player);
	profiles.delete(player);
}

/** Extra Studio-only QA commands other systems register (`Doors` → "toggleDoor", …). */
const devCommands = new Map<string, (a: unknown, b: unknown, c?: unknown) => unknown>();
export function registerDevCommand(command: string, handler: (a: unknown, b: unknown, c?: unknown) => unknown): void {
	devCommands.set(command, handler);
}

/** Studio-only QA hook: `ServerStorage.WorldForgeDev:Invoke("grantCoins", player, amount)` from the app's play-test / Luau console. */
function installDevHook(): void {
	if (!RunService.IsStudio()) return;
	const hook = new Instance("BindableFunction");
	hook.Name = "WorldForgeDev";
	hook.OnInvoke = (command: unknown, player: unknown, amount: unknown, extra?: unknown) => {
		const custom = typeIs(command, "string") ? devCommands.get(command) : undefined;
		if (custom) return custom(player, amount, extra);
		const p = player as Player;
		if (command === "grantCoins") return addCoins(p, tonumber(amount) ?? 0, true);
		if (command === "grantItem" && typeIs(amount, "string")) return addItem(p, amount, tonumber(extra) ?? 1);
		if (command === "profile") return profiles.get(p);
		return undefined;
	};
	hook.Parent = game.GetService("ServerStorage");
}

export function start(): void {
	installDevHook();
	Players.PlayerAdded.Connect(onJoin);
	Players.PlayerRemoving.Connect(onLeave);
	for (const p of Players.GetPlayers()) onJoin(p);
	game.BindToClose(() => {
		for (const p of Players.GetPlayers()) save(p);
	});
	task.spawn(() => {
		for (;;) {
			task.wait(GameConfig.dataStore.autosaveSeconds);
			for (const p of Players.GetPlayers()) save(p);
		}
	});
}
