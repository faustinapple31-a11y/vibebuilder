import { GameConfig } from "shared/config";
import { body, button, card, prettyName, text, theme, Window } from "./kit";

/**
 * Main menu / pause menu: the game title, a Resume button that closes it and one entry per other
 * screen the game enables (shop, inventory, quests, crafting, leaderboard, teams, settings). Opened
 * from the HUD's Menu button or the M key — never on its own, so it does not interrupt a spawn.
 */
export class Menu {
	private win: Window;
	private entries: { label: string; open: () => void }[] = [];
	private built = false;

	constructor() {
		this.win = new Window("Menu", GameConfig.name, { width: 520, height: 470, displayOrder: 8, coinPill: false });
		this.win.onOpen = () => {
			if (!this.built) this.build();
		};
	}

	isOpen(): boolean {
		return this.win.open;
	}

	toggle(): void {
		this.win.toggle();
	}

	setOpen(value: boolean): void {
		this.win.setOpen(value);
	}

	/** Registers a screen in the menu (the client bootstrap adds the ones the game enables). */
	addEntry(label: string, open: () => void): void {
		this.entries.push({ label, open });
		this.built = false;
	}

	private build(): void {
		this.built = true;
		this.win.clearBody();
		let order = 0;
		const hero = card(96, order++, this.win.body, theme.primary);
		text(GameConfig.name, new UDim2(1, -24, 0, 46), new UDim2(0, 12, 0, 12), hero, { size: 34, align: Enum.TextXAlignment.Center, zIndex: 6, scaled: true });
		body(`${prettyName(GameConfig.genre)} · ${prettyName(GameConfig.layout)}`, new UDim2(1, -24, 0, 22), new UDim2(0, 12, 0, 60), hero, { size: 14, align: Enum.TextXAlignment.Center, color: theme.text, zIndex: 6 });

		const playRow = card(66, order++, this.win.body, [theme.paperDark, theme.paperDark]);
		const play = button("Resume", new UDim2(1, -32, 0, 50), new UDim2(0, 16, 0.5, -25), playRow, { size: 26, radius: 14, zIndex: 6 });
		play.MouseButton1Click.Connect(() => this.win.setOpen(false));

		for (const entry of this.entries) {
			const row = card(58, order++, this.win.body, [theme.paperDark, theme.paperDark]);
			const b = button(entry.label, new UDim2(1, -32, 0, 44), new UDim2(0, 16, 0.5, -22), row, { colors: theme.info, size: 21, radius: 12, zIndex: 6 });
			b.MouseButton1Click.Connect(() => {
				this.win.setOpen(false);
				entry.open();
			});
		}
	}
}
