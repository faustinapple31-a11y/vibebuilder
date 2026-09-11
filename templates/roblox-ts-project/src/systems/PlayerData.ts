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
}

const DEFAULT_PROFILE: Profile = { coins: GameConfig.currency.starting, hunger: GameConfig.survival.hungerMax, visits: 0 };
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
			return { coins: d.coins ?? DEFAULT_PROFILE.coins, hunger: d.hunger ?? DEFAULT_PROFILE.hunger, visits: d.visits ?? 0 };
		}
	}
	return { ...DEFAULT_PROFILE };
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

export function addCoins(player: Player, amount: number): void {
	const p = profiles.get(player);
	if (!p) return;
	p.coins += amount;
	replicate(player);
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
	ls.Parent = player;
	replicate(player);
}

function onLeave(player: Player): void {
	save(player);
	profiles.delete(player);
}

export function start(): void {
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
