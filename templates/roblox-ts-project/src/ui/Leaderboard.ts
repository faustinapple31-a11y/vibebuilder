import { Players } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { body, card, coinIcon, panel, text, theme, Window } from "./kit";

/**
 * Leaderboard screen: the players of the server ranked by a leaderstat (the genre's main stat when the
 * config declares one — Stage, Wins, Kills, Level, Rebirths — otherwise the currency). Reads the
 * `leaderstats` folders Roblox replicates, so it never needs a remote; refreshed while it is open.
 */
const MEDALS: [Color3, Color3][] = [
	[Color3.fromHex("#ffe07a"), Color3.fromHex("#d49a1f")],
	[Color3.fromHex("#e6e6ee"), Color3.fromHex("#9aa0b0")],
	[Color3.fromHex("#e0a86a"), Color3.fromHex("#a46a2a")],
];

export class Leaderboard {
	private win: Window;
	private statName: string;
	private ticking = false;

	constructor() {
		this.statName = GameConfig.leaderstats[0] ?? GameConfig.currency.name;
		this.win = new Window("Leaderboard", "Leaderboard", { width: 560, height: 560, displayOrder: 6, coinPill: false });
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

	/** Re-reads leaderstats every second while the window stays open. */
	private startTicking(): void {
		if (this.ticking) return;
		this.ticking = true;
		task.spawn(() => {
			while (this.win.open) {
				task.wait(1);
				if (this.win.open) this.render();
			}
			this.ticking = false;
		});
	}

	private valueOf(player: Player): number {
		const ls = player.FindFirstChild("leaderstats");
		const v = ls?.FindFirstChild(this.statName) as IntValue | undefined;
		return v ? v.Value : 0;
	}

	private render(): void {
		this.win.clearBody();
		const rows = Players.GetPlayers().map((p) => ({ player: p, value: this.valueOf(p) }));
		rows.sort((a, b) => a.value > b.value);
		const header = card(40, 0, this.win.body, [theme.paperDark, theme.paperDark]);
		body(`Ranked by ${this.statName}`, new UDim2(1, -24, 1, 0), new UDim2(0, 12, 0, 0), header, { size: 14, align: Enum.TextXAlignment.Center, zIndex: 6 });
		rows.forEach((entry, index) => {
			const medal = MEDALS[index];
			const row = card(58, index + 1, this.win.body, medal ?? [theme.tile, theme.tile]);
			const rank = panel(new UDim2(0, 44, 0, 38), new UDim2(0, 12, 0.5, -19), row, { color: theme.pill, strokeColor: theme.pillStroke, radius: 10, shadow: false, zIndex: 6 });
			text(`${index + 1}`, new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), rank, { size: 20, align: Enum.TextXAlignment.Center, zIndex: 7, outline: 1.5 });
			const isLocal = entry.player === Players.LocalPlayer;
			text(entry.player.DisplayName, new UDim2(1, -230, 1, 0), new UDim2(0, 68, 0, 0), row, { size: 21, color: isLocal ? Color3.fromHex("#ffffff") : medal !== undefined ? theme.textDark : theme.text, zIndex: 6 });
			const value = panel(new UDim2(0, 118, 0, 38), new UDim2(1, -132, 0.5, -19), row, { color: theme.pill, strokeColor: theme.pillStroke, radius: 10, shadow: false, zIndex: 6 });
			if (this.statName === GameConfig.currency.name) {
				const ic = coinIcon(22, value);
				ic.Position = new UDim2(0, 8, 0.5, -11);
				ic.ZIndex = 8;
				text(`${entry.value}`, new UDim2(1, -40, 1, 0), new UDim2(0, 36, 0, 0), value, { size: 18, zIndex: 8, outline: 1.5 });
			} else {
				text(`${entry.value}`, new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), value, { size: 18, align: Enum.TextXAlignment.Center, zIndex: 8, outline: 1.5 });
			}
		});
	}
}
