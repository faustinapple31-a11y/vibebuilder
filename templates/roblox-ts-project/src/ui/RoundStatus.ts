import { Players } from "@rbxts/services";
import { GameConfig } from "shared/config";
import type { RoundStateMsg } from "shared/net";
import { body, panel, progressBar, scaleContainer, text, theme, type BarHandle } from "./kit";

/**
 * Round status panel (not a modal): a compact card under the HUD banner with the phase, a countdown
 * bar and the live scores — team scores when the mode has teams, otherwise the top players. Fed by the
 * RoundState broadcast of the Rounds system; hidden while no round is running.
 */
const W = 300;

export class RoundStatus {
	private gui: ScreenGui;
	private card: Frame;
	private phase: TextLabel;
	private timer: TextLabel;
	private bar: BarHandle;
	private rows = new Map<string, TextLabel>();
	private rowsHolder: Frame;
	private longestPhase = math.max(1, GameConfig.rounds.roundSeconds);

	constructor() {
		const pg = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
		this.gui = new Instance("ScreenGui");
		this.gui.Name = "WorldForgeRoundStatus";
		this.gui.ResetOnSpawn = false;
		this.gui.IgnoreGuiInset = true;
		this.gui.DisplayOrder = 3;
		this.gui.Parent = pg;

		this.card = panel(new UDim2(0, W, 0, 108), new UDim2(0.5, -W / 2, 0, 96), this.gui, { color: theme.pill, transparency: math.max(0.05, theme.panelTransparency), strokeColor: theme.primary[1], strokeThickness: theme.strokeThickness, radius: math.min(14, theme.radius), zIndex: 3 });
		this.card.Visible = false;
		this.phase = text("", new UDim2(1, -20, 0, 26), new UDim2(0, 10, 0, 8), this.card, { size: 20, align: Enum.TextXAlignment.Center, zIndex: 5, outline: 2 });
		this.timer = text("", new UDim2(1, -20, 0, 22), new UDim2(0, 10, 0, 32), this.card, { size: 16, align: Enum.TextXAlignment.Center, color: theme.highlight, zIndex: 5, outline: math.min(2, theme.textOutline) });
		this.bar = progressBar(new UDim2(1, -28, 0, 12), new UDim2(0, 14, 0, 56), this.card, theme.primary, 5);
		this.rowsHolder = new Instance("Frame");
		this.rowsHolder.Size = new UDim2(1, -28, 0, 40);
		this.rowsHolder.Position = new UDim2(0, 14, 0, 72);
		this.rowsHolder.BackgroundTransparency = 1;
		this.rowsHolder.ZIndex = 4;
		this.rowsHolder.Parent = this.card;
		scaleContainer(this.card);
	}

	setEnabled(value: boolean): void {
		this.gui.Enabled = value;
	}

	setRoundState(state: RoundStateMsg): void {
		const running = state.phase !== "lobby" || state.message !== "";
		this.card.Visible = running;
		if (!running) return;
		this.phase.Text = state.message !== "" ? state.message : state.phase.upper();
		if (state.secondsLeft > 0) {
			const mm = math.floor(state.secondsLeft / 60);
			const ss = state.secondsLeft % 60;
			this.timer.Text = `${mm}:${string.format("%02d", ss)}`;
			const total = state.phase === "intermission" ? math.max(1, GameConfig.rounds.intermissionSeconds) : this.longestPhase;
			this.bar.set(state.secondsLeft / total);
		} else {
			this.timer.Text = "";
			this.bar.set(0);
		}
		this.renderScores(state);
	}

	/** Team scores (team_<id>) or, in solo modes, the players present in the scores table. */
	private renderScores(state: RoundStateMsg): void {
		const scores = state.scores ?? {};
		const entries: { key: string; label: string; value: number }[] = [];
		for (const team of GameConfig.rounds.teams) {
			const v = scores[`team_${team}`];
			if (v !== undefined) entries.push({ key: `team_${team}`, label: `Team ${team.upper()}`, value: v });
		}
		if (entries.size() === 0) {
			for (const p of Players.GetPlayers()) {
				const v = scores[`p${p.UserId}`];
				if (v !== undefined) entries.push({ key: `p${p.UserId}`, label: p.DisplayName, value: v });
			}
			entries.sort((a, b) => a.value > b.value);
		}
		// drop the rows that are gone
		for (const [key, label] of this.rows) {
			if (!entries.some((e) => e.key === key)) {
				label.Destroy();
				this.rows.delete(key);
			}
		}
		entries.forEach((entry, index) => {
			if (index >= 4) return;
			let row = this.rows.get(entry.key);
			if (!row) {
				row = body("", new UDim2(1, 0, 0, 20), new UDim2(0, 0, 0, index * 20), this.rowsHolder, { size: 15, color: theme.text, rich: true, zIndex: 5 });
				this.rows.set(entry.key, row);
			}
			row.Position = new UDim2(0, 0, 0, index * 20);
			row.Text = `${entry.label}   <font color="#${theme.highlight.ToHex()}">${entry.value}</font>`;
		});
		const shown = math.min(entries.size(), 4);
		this.rowsHolder.Size = new UDim2(1, -28, 0, shown * 20);
		this.card.Size = new UDim2(0, W, 0, 76 + shown * 20);
	}
}
