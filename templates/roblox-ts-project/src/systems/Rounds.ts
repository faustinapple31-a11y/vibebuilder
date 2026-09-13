import { Players, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getRemoteEvent, Remotes, type RoundStateMsg } from "shared/net";
import { findZone, findZones } from "shared/zones";
import * as PlayerData from "./PlayerData";
import * as Progression from "./Progression";

/**
 * Rounds, teams, matchmaking, capture points and sports matches share one loop:
 *   lobby (wait for players) → intermission → playing (teleport to arena / team spawns, timer,
 *   scoring) → ending (winner, rewards) → back to the lobby.
 * Scoring sources: kills (Combat), capture point held (`arena_center`), goals (Sports), survival
 * time (last player standing when the genre is battle royale / horror).
 */
const cfg = GameConfig.rounds;
const roundState = getRemoteEvent(Remotes.RoundState);
const notify = getRemoteEvent(Remotes.Notify);
const hudValue = getRemoteEvent(Remotes.HudValue);

export const scores = new Map<string, number>();
let phase: RoundStateMsg["phase"] = "lobby";
let secondsLeft = 0;
const participants = new Set<Player>();
const teamsEnabled = () => GameConfig.systems.includes("teams") || GameConfig.systems.includes("sports") || GameConfig.systems.includes("capture_points");

export function currentPhase(): RoundStateMsg["phase"] {
	return phase;
}

export function addScore(key: string, n = 1): void {
	scores.set(key, (scores.get(key) ?? 0) + n);
}

function broadcast(message: string): void {
	const s: Record<string, number> = {};
	for (const [k, v] of scores) s[k] = v;
	const msg: RoundStateMsg = { phase, secondsLeft, message, scores: s };
	roundState.FireAllClients(msg);
}

function assignTeams(): void {
	const players = Players.GetPlayers();
	players.sort(() => math.random() < 0.5);
	players.forEach((p, i) => {
		const team = cfg.teams[i % cfg.teams.size()] ?? "a";
		p.SetAttribute("Team", team);
		hudValue.FireClient(p, "team", "Team", team.upper());
	});
}

function teleportAll(): void {
	const spawnsA = [...findZones({ metaKind: "team_spawn" }), ...findZones({ prefix: "arena_spawn_" })];
	const lobby = findZone("lobby") ?? findZones({ kind: "spawn" })[0];
	for (const p of Players.GetPlayers()) {
		participants.add(p);
		const char = p.Character;
		if (!char) continue;
		const team = (p.GetAttribute("Team") as string | undefined) ?? "a";
		const spawn = spawnsA.find((z) => z.meta.team === team) ?? spawnsA[0];
		const target = spawn ? spawn.position : lobby ? lobby.position : char.GetPivot().Position;
		char.PivotTo(new CFrame(target.add(new Vector3(math.random(-6, 6), 4, math.random(-6, 6)))));
		const hum = char.FindFirstChildOfClass("Humanoid");
		if (hum) hum.Health = hum.MaxHealth;
	}
}

function returnToLobby(): void {
	const lobby = findZone("lobby") ?? findZone("plaza") ?? findZones({ kind: "spawn" })[0];
	if (!lobby) return;
	for (const p of Players.GetPlayers()) p.Character?.PivotTo(new CFrame(lobby.position.add(new Vector3(math.random(-8, 8), 4, math.random(-8, 8)))));
}

function alivePlayers(): Player[] {
	return Players.GetPlayers().filter((p) => {
		const hum = p.Character?.FindFirstChildOfClass("Humanoid");
		return participants.has(p) && hum !== undefined && hum.Health > 0;
	});
}

function winner(): string {
	if (teamsEnabled()) {
		let best = "";
		let bestS = -1;
		for (const t of cfg.teams) {
			const s = scores.get(`team_${t}`) ?? 0;
			if (s > bestS) {
				bestS = s;
				best = t;
			}
		}
		return best ? `Team ${best.upper()}` : "Nobody";
	}
	const lastMan = GameConfig.genre === "battle_royale" || GameConfig.genre === "horror";
	if (lastMan) {
		const alive = alivePlayers();
		if (alive.size() === 1) return alive[0]!.DisplayName;
	}
	let best: Player | undefined;
	let bestS = -1;
	for (const p of Players.GetPlayers()) {
		const s = scores.get(`p${p.UserId}`) ?? 0;
		if (s > bestS) {
			bestS = s;
			best = p;
		}
	}
	return best ? best.DisplayName : "Nobody";
}

function rewardWinners(name: string): void {
	for (const p of Players.GetPlayers()) {
		const team = (p.GetAttribute("Team") as string | undefined) ?? "";
		const won = name === p.DisplayName || (team && name === `Team ${team.upper()}`);
		if (won) {
			PlayerData.addCoins(p, cfg.winReward);
			PlayerData.addStat(p, "Wins", 1);
			Progression.grantXp(p, GameConfig.progression.xpPerAction * 10);
			Progression.progressQuest(p, "win_rounds", "any", 1);
		} else PlayerData.addCoins(p, math.floor(cfg.winReward * 0.25));
	}
}

function capturePointLoop(): void {
	const center = findZone("arena_center");
	if (!center || !teamsEnabled()) return;
	task.spawn(() => {
		while (phase === "playing") {
			task.wait(1);
			const counts = new Map<string, number>();
			for (const p of Players.GetPlayers()) {
				const root = p.Character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
				if (!root || root.Position.sub(center.position).Magnitude > 14) continue;
				const t = (p.GetAttribute("Team") as string | undefined) ?? "a";
				counts.set(t, (counts.get(t) ?? 0) + 1);
			}
			let holder: string | undefined;
			for (const [t, n] of counts) if (n > 0 && (holder === undefined || n > (counts.get(holder) ?? 0))) holder = t;
			if (holder !== undefined && counts.size() === 1) addScore(`team_${holder}`, 1);
		}
	});
}

function loop(): void {
	task.spawn(() => {
		for (;;) {
			// lobby
			phase = "lobby";
			scores.clear();
			participants.clear();
			while (Players.GetPlayers().size() < cfg.minPlayers) {
				secondsLeft = 0;
				broadcast(`Waiting for players (${Players.GetPlayers().size()}/${cfg.minPlayers})`);
				task.wait(2);
			}
			// intermission
			phase = "intermission";
			for (let s = cfg.intermissionSeconds; s > 0; s--) {
				secondsLeft = s;
				broadcast("Next round in");
				task.wait(1);
			}
			// playing
			phase = "playing";
			if (teamsEnabled()) assignTeams();
			teleportAll();
			capturePointLoop();
			for (let s = cfg.roundSeconds; s > 0; s--) {
				secondsLeft = s;
				broadcast("Round in progress");
				task.wait(1);
				const lastMan = GameConfig.genre === "battle_royale" || GameConfig.genre === "horror";
				if (lastMan && participants.size() > 1 && alivePlayers().size() <= 1) break;
			}
			// ending
			phase = "ending";
			const name = winner();
			secondsLeft = 6;
			broadcast(`${name} wins!`);
			rewardWinners(name);
			for (const p of Players.GetPlayers()) notify.FireClient(p, `${name} wins the round!`);
			task.wait(6);
			returnToLobby();
		}
	});
}

export function start(): void {
	const enabled = GameConfig.systems.includes("rounds") || GameConfig.systems.includes("matchmaking");
	if (!enabled) return;
	task.spawn(() => {
		while (Workspace.GetAttribute("WorldReady") !== true) task.wait(1);
		loop();
	});
	// kills score points during a round
	const onCharacter = (char: Model) => {
		const hum = char.WaitForChild("Humanoid") as Humanoid;
		hum.Died.Connect(() => {
			if (phase !== "playing") return;
			// the last attacker is tagged by Combat ("creator" ObjectValue); credit the player and their team
			const tag = hum.FindFirstChild("creator") as ObjectValue | undefined;
			const killer = tag?.Value as Player | undefined;
			if (killer) {
				addScore(`p${killer.UserId}`, 1);
				const t = killer.GetAttribute("Team") as string | undefined;
				if (t) addScore(`team_${t}`, 1);
			}
		});
	};
	const setup = (player: Player) => {
		player.CharacterAdded.Connect(onCharacter);
		if (player.Character) onCharacter(player.Character);
	};
	Players.PlayerAdded.Connect(setup);
	for (const p of Players.GetPlayers()) setup(p);
}
