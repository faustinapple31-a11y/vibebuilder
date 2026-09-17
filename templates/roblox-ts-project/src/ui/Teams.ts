import { Players } from "@rbxts/services";
import { GameConfig } from "shared/config";
import type { RoundStateMsg } from "shared/net";
import { body, card, panel, progressBar, text, theme, Window } from "./kit";

/**
 * Teams screen: one column per team of GameConfig.rounds.teams with its score (from the RoundState
 * broadcast) and its roster — the players are tagged by the Rounds system with a "Team" attribute, so
 * the rosters follow the server without another remote. Solo modes fall back to a player ranking.
 */
const COLORS: [Color3, Color3][] = [
	[Color3.fromHex("#7fd0ff"), Color3.fromHex("#2f7fd0")],
	[Color3.fromHex("#ff9a7a"), Color3.fromHex("#d04f2f")],
	[Color3.fromHex("#a8e063"), Color3.fromHex("#4d8f2c")],
	[Color3.fromHex("#e0a8ff"), Color3.fromHex("#8f4dd0")],
];

export class Teams {
	private win: Window;
	private state: RoundStateMsg = { phase: "lobby", secondsLeft: 0, message: "", scores: {} };
	private ticking = false;

	constructor() {
		this.win = new Window("Teams", "Teams", { width: 620, height: 520, displayOrder: 6, coinPill: false });
		this.win.onOpen = () => {
			this.render();
			this.startTicking();
		};
	}

	isOpen(): boolean {
		return this.win.open;
	}

	toggle(): void {
		this.win.toggle();
		if (this.win.open) this.startTicking();
	}

	setRoundState(state: RoundStateMsg): void {
		this.state = state;
		if (this.win.open) this.render();
	}

	private startTicking(): void {
		if (this.ticking) return;
		this.ticking = true;
		task.spawn(() => {
			while (this.win.open) {
				task.wait(2);
				if (this.win.open) this.render();
			}
			this.ticking = false;
		});
	}

	private render(): void {
		this.win.clearBody();
		const teams = GameConfig.rounds.teams;
		const scores = this.state.scores ?? {};
		let order = 0;
		const phase = card(44, order++, this.win.body, [theme.paperDark, theme.paperDark]);
		body(this.state.message !== "" ? this.state.message : `Phase: ${this.state.phase}`, new UDim2(1, -24, 1, 0), new UDim2(0, 12, 0, 0), phase, { size: 15, align: Enum.TextXAlignment.Center, zIndex: 6 });

		if (teams.size() === 0) {
			const solo = card(60, order++, this.win.body);
			body("This mode is solo — see the leaderboard for the ranking.", new UDim2(1, -24, 1, 0), new UDim2(0, 12, 0, 0), solo, { size: 15, align: Enum.TextXAlignment.Center, zIndex: 5 });
			return;
		}

		// rosters by the "Team" attribute the Rounds system sets
		const rosters = new Map<string, Player[]>();
		for (const team of teams) rosters.set(team, []);
		for (const p of Players.GetPlayers()) {
			const team = (p.GetAttribute("Team") as string | undefined) ?? "";
			const list = rosters.get(team);
			if (list) list.push(p);
		}
		let best = 0;
		for (const team of teams) best = math.max(best, scores[`team_${team}`] ?? 0);

		teams.forEach((team, index) => {
			const roster = rosters.get(team) ?? [];
			const score = scores[`team_${team}`] ?? 0;
			const colors = COLORS[index % COLORS.size()]!;
			const height = 74 + roster.size() * 26;
			const row = card(height, order++, this.win.body, colors);
			text(`Team ${team.upper()}`, new UDim2(0, 260, 0, 32), new UDim2(0, 16, 0, 10), row, { size: 26, zIndex: 6 });
			const scorePill = panel(new UDim2(0, 110, 0, 36), new UDim2(1, -126, 0, 10), row, { color: theme.pill, strokeColor: theme.pillStroke, radius: 10, shadow: false, zIndex: 6 });
			text(`${score}`, new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), scorePill, { size: 20, align: Enum.TextXAlignment.Center, zIndex: 7, outline: 1.5 });
			const bar = progressBar(new UDim2(1, -32, 0, 14), new UDim2(0, 16, 0, 50), row, colors, 6);
			bar.set(best > 0 ? score / best : 0);
			roster.forEach((p, i) => {
				const isLocal = p === Players.LocalPlayer;
				body(`${isLocal ? "▸ " : ""}${p.DisplayName}`, new UDim2(1, -32, 0, 22), new UDim2(0, 20, 0, 70 + i * 26), row, { size: 15, color: isLocal ? theme.text : theme.textDark, zIndex: 6 });
			});
			if (roster.size() === 0) body("Waiting for players…", new UDim2(1, -32, 0, 22), new UDim2(0, 20, 0, 70), row, { size: 14, zIndex: 6 });
		});
	}
}
