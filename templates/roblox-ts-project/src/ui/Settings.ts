import { Remotes, waitRemoteEvent, type ProfileStateMsg } from "shared/net";
import { body, card, sectionHeader, slider, text, theme, toggle, Window } from "./kit";

/** Settings the client applies locally and the server persists in the profile (`setting_<key>`). */
export interface SettingsValues {
	/** 0…1 */
	music: number;
	/** 0…1 */
	sfx: number;
	minimap: boolean;
	shake: boolean;
}

export const DEFAULT_SETTINGS: SettingsValues = { music: 0.6, sfx: 0.7, minimap: true, shake: true };

/**
 * Settings screen: music and SFX volume sliders, minimap and screen-shake switches. Values are applied
 * immediately through the callbacks the client bootstrap installs and sent to the server
 * (`set_setting`), which stores them in the profile — so they come back on the next visit.
 */
export class Settings {
	private win: Window;
	private action = waitRemoteEvent(Remotes.Action);
	private values: SettingsValues = { ...DEFAULT_SETTINGS };
	private built = false;
	/** Installed by the client bootstrap: apply a value locally (volumes, minimap, camera shake). */
	public onChange: ((values: SettingsValues) => void) | undefined;

	constructor() {
		this.win = new Window("Settings", "Settings", { width: 540, height: 460, displayOrder: 7, coinPill: false });
	}

	isOpen(): boolean {
		return this.win.open;
	}

	toggle(): void {
		if (!this.built) this.build();
		this.win.toggle();
	}

	current(): SettingsValues {
		return this.values;
	}

	/** Loads the persisted values from the replicated profile (percent stats). */
	setProfile(state: ProfileStateMsg): void {
		const read = (key: string, fallback: number) => {
			const v = state.stats[`setting_${key}`];
			return v === undefined ? fallback : v / 100;
		};
		this.values = {
			music: read("music", DEFAULT_SETTINGS.music),
			sfx: read("sfx", DEFAULT_SETTINGS.sfx),
			minimap: read("minimap", DEFAULT_SETTINGS.minimap ? 1 : 0) >= 0.5,
			shake: read("shake", DEFAULT_SETTINGS.shake ? 1 : 0) >= 0.5,
		};
		this.onChange?.(this.values);
		if (this.built) {
			// rebuild so the controls show the stored values
			this.built = false;
			this.win.clearBody();
			if (this.win.open) this.build();
		}
	}

	private push(key: string, value: number): void {
		this.action.FireServer("set_setting", key, math.floor(math.clamp(value, 0, 1) * 100));
		this.onChange?.(this.values);
	}

	private build(): void {
		this.built = true;
		this.win.clearBody();
		let order = 0;
		sectionHeader("Audio", this.win.body, order++);
		this.sliderRow("Music", this.values.music, order++, (v) => {
			this.values.music = v;
			this.push("music", v);
		});
		this.sliderRow("Sound effects", this.values.sfx, order++, (v) => {
			this.values.sfx = v;
			this.push("sfx", v);
		});
		sectionHeader("Display", this.win.body, order++);
		this.toggleRow("Minimap", this.values.minimap, order++, (v) => {
			this.values.minimap = v;
			this.push("minimap", v ? 1 : 0);
		});
		this.toggleRow("Camera shake", this.values.shake, order++, (v) => {
			this.values.shake = v;
			this.push("shake", v ? 1 : 0);
		});
		const note = card(52, order++, this.win.body, [theme.paperDark, theme.paperDark]);
		body("Settings are saved with your profile and restored when you rejoin.", new UDim2(1, -24, 1, 0), new UDim2(0, 12, 0, 0), note, { size: 13, align: Enum.TextXAlignment.Center, zIndex: 6 });
	}

	private sliderRow(label: string, value: number, order: number, onChange: (v: number) => void): void {
		const row = card(64, order, this.win.body);
		text(label, new UDim2(0, 190, 1, 0), new UDim2(0, 16, 0, 0), row, { size: 20, color: theme.textDark, outline: 0, zIndex: 6 });
		slider(value, new UDim2(0, 220, 0, 16), new UDim2(0, 210, 0.5, -8), row, onChange);
	}

	private toggleRow(label: string, value: boolean, order: number, onChange: (v: boolean) => void): void {
		const row = card(64, order, this.win.body);
		text(label, new UDim2(0, 240, 1, 0), new UDim2(0, 16, 0, 0), row, { size: 20, color: theme.textDark, outline: 0, zIndex: 6 });
		toggle(value, new UDim2(0, 86, 0, 38), new UDim2(1, -104, 0.5, -19), row, onChange);
	}
}
