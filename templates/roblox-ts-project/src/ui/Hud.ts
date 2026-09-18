import { Players, TweenService } from "@rbxts/services";
import { GameConfig } from "shared/config";
import type { PlayerStats } from "shared/net";
import { abbreviate, body, button, coinIcon, corner, darken, floatText, gradient, lastShadow, lighten, motion, panel, pill, scaleContainer, shadow, stroke, text, theme, tweenNumber } from "./kit";
import { L } from "./strings.generated";

/**
 * HUD in the kit's mobile-game look: currency pill (coin icon, outlined number) with the hunger bar under
 * it, a right-hand value card (stage, wave, team, lap… filled by HudValue remotes), a big outlined banner,
 * a health bar, a chunky Shop button, a paper speech bubble for NPC lines, toast notifications and the
 * loading screen. Same API as before (systems call setValue / setBanner / setHealth / setStats / notify /
 * say / playSfx / setLoading / hideLoading); agents extend it with the game's own screens.
 */
export class Hud {
	private gui: ScreenGui;
	/** Full-screen frame holding the whole HUD (scaled for mobile / the UI scale setting). */
	private root: Frame;
	private coins: TextLabel;
	private hungerFill: Frame;
	private notif: Frame;
	private notifText: TextLabel;
	private loading: Frame;
	private loadingText: TextLabel;
	private loadingFill: Frame;
	private dialogue: Frame;
	private dialogueName: TextLabel;
	private dialogueText: TextLabel;
	private sfx = new Map<string, Sound>();
	private toasts: string[] = [];
	private toasting = false;
	/** last replicated values, so a change can be animated (count-up, floater, damage flash) */
	private lastCoins = 0;
	private lastHealth = 1;
	private coinPill: Frame;
	/** the drawn coin inside the pill (spun on a gain) */
	private coinArt: Frame | undefined;
	/** Generic value panel (stage, wave, team, lap…) filled by HudValue remotes. */
	private values: Frame;
	private valuesShadow: Frame | undefined;
	private valueRows = new Map<string, TextLabel>();
	private banner: TextLabel;
	private healthFill: Frame;
	/** red edge vignette flashed when the player takes damage */
	private damageFlash: Frame;
	/** Extra screen buttons stacked above the Shop button (bottom-left). */
	private screenButtons: TextButton[] = [];
	private sfxVolume = 0.6;
	/** Set by the client bootstrap to open the shop window. */
	public onShop: (() => void) | undefined;

	constructor() {
		const player = Players.LocalPlayer;
		const pg = player.WaitForChild("PlayerGui") as PlayerGui;
		this.gui = new Instance("ScreenGui");
		this.gui.Name = "WorldForgeHud";
		this.gui.ResetOnSpawn = false;
		this.gui.IgnoreGuiInset = true;
		this.gui.Parent = pg;

		// everything lives in one full-screen frame so the HUD scales with the viewport and with the
		// player's UI scale setting (kit.scaleContainer)
		const root = new Instance("Frame");
		root.Name = "Root";
		root.Size = new UDim2(1, 0, 1, 0);
		root.BackgroundTransparency = 1;
		root.Parent = this.gui;
		this.root = root;
		scaleContainer(root);

		// currency pill (top-left)
		const coinPill = pill("0", new UDim2(0, 180, 0, 46), new UDim2(0, 18, 0, 18), this.root, "coin", { textSize: 22 });
		this.coins = coinPill.label;
		this.coinPill = coinPill.frame;
		this.coinArt = coinPill.frame.FindFirstChildOfClass("Frame");
		shadow(coinPill.frame, 4, 0.5);
		const curName = body(GameConfig.currency.name.upper(), new UDim2(0, 120, 0, 14), new UDim2(0, 40, 1, -4), coinPill.frame, { size: 10, color: theme.text, zIndex: 6 });
		curName.Visible = false;

		// hunger bar under the pill (survival only)
		const barBg = panel(new UDim2(0, 180, 0, 18), new UDim2(0, 18, 0, 70), this.root, { color: theme.track, strokeThickness: math.max(1.5, theme.strokeThickness - 0.5), radius: math.min(9, theme.radius), shadow: false });
		this.hungerFill = new Instance("Frame");
		this.hungerFill.Size = new UDim2(1, 0, 1, 0);
		this.hungerFill.BackgroundColor3 = theme.good;
		this.hungerFill.BorderSizePixel = 0;
		this.hungerFill.ZIndex = 3;
		corner(this.hungerFill, math.min(9, theme.radius));
		if (theme.gradients) gradient(this.hungerFill, lighten(theme.good, 0.25), darken(theme.good, 0.2));
		this.hungerFill.Parent = barBg;
		const hl = text(L.hunger, new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), barBg, { size: 12, align: Enum.TextXAlignment.Center, zIndex: 4, outline: 1.5 });
		if (!GameConfig.survival.enabled) barBg.Visible = false;
		void hl;

		// health bar (top-left, under the hunger bar or the pill)
		const healthBg = panel(new UDim2(0, 180, 0, 14), new UDim2(0, 18, 0, GameConfig.survival.enabled ? 94 : 70), this.root, { color: theme.track, strokeThickness: math.max(1.5, theme.strokeThickness - 0.5), radius: math.min(7, theme.radius), shadow: false });
		this.healthFill = new Instance("Frame");
		this.healthFill.Size = new UDim2(1, 0, 1, 0);
		this.healthFill.BackgroundColor3 = theme.good;
		this.healthFill.BorderSizePixel = 0;
		this.healthFill.ZIndex = 3;
		corner(this.healthFill, math.min(7, theme.radius));
		this.healthFill.Parent = healthBg;

		// damage vignette: a red frame over the whole screen, transparent until a hit
		this.damageFlash = new Instance("Frame");
		this.damageFlash.Size = new UDim2(1, 0, 1, 0);
		this.damageFlash.BackgroundColor3 = theme.bad;
		this.damageFlash.BackgroundTransparency = 1;
		this.damageFlash.BorderSizePixel = 0;
		this.damageFlash.ZIndex = 9;
		gradient(this.damageFlash, theme.bad, darken(theme.bad, 0.5), 90);
		this.damageFlash.Parent = this.gui;

		// right-hand value card + big centre banner
		this.values = panel(new UDim2(0, 250, 0, 12), new UDim2(1, -268, 0, 18), this.root, { color: theme.pill, transparency: math.max(0.05, theme.panelTransparency), strokeColor: theme.pillStroke, strokeThickness: math.max(1.5, theme.strokeThickness - 0.5), radius: math.min(12, theme.radius) });
		this.values.Visible = false;
		this.valuesShadow = lastShadow(this.root);
		if (this.valuesShadow) this.valuesShadow.Visible = false;
		this.banner = text("", new UDim2(0, 720, 0, 60), new UDim2(0.5, -360, 0, 26), this.root, { size: 40, align: Enum.TextXAlignment.Center, color: theme.highlight, outline: math.max(2, theme.textOutline + 1), zIndex: 5 });
		this.banner.Visible = false;

		// shop button (bottom-left)
		const shopBtn = button(L.shop, new UDim2(0, 150, 0, 54), new UDim2(0, 18, 1, -76), this.root, { size: 24, radius: 14, icon: (p) => coinIcon(26, p) });
		shopBtn.MouseButton1Click.Connect(() => this.onShop?.());

		// NPC dialogue bubble (bottom-centre): paper panel with a name tag
		this.dialogue = panel(new UDim2(0, 560, 0, 96), new UDim2(0.5, -280, 1, -140), this.root, { radius: 16, strokeThickness: 3.5 });
		this.dialogue.Visible = false;
		const tag = new Instance("Frame");
		tag.Size = new UDim2(0, 200, 0, 30);
		tag.Position = new UDim2(0, 16, 0, -16);
		tag.BackgroundColor3 = theme.primary[1];
		tag.BorderSizePixel = 0;
		tag.ZIndex = 4;
		corner(tag, 10);
		gradient(tag, theme.primary[0], theme.primary[1]);
		stroke(tag, theme.ink, 3);
		tag.Parent = this.dialogue;
		this.dialogueName = text("", new UDim2(1, -12, 1, 0), new UDim2(0, 6, 0, 0), tag, { size: 18, align: Enum.TextXAlignment.Center, zIndex: 5, outline: 2 });
		this.dialogueText = body("", new UDim2(1, -32, 1, -36), new UDim2(0, 16, 0, 24), this.dialogue, { size: 17, valign: Enum.TextYAlignment.Top, zIndex: 4 });

		// toast notification (top-centre, slides in)
		this.notif = panel(new UDim2(0, 360, 0, 44), new UDim2(0.5, -180, 0, -60), this.root, { color: theme.pill, strokeColor: theme.primary[1], strokeThickness: theme.strokeThickness, radius: math.min(12, theme.radius), zIndex: 6 });
		this.notif.Visible = false;
		this.notifText = text("", new UDim2(1, -16, 1, 0), new UDim2(0, 8, 0, 0), this.notif, { size: 18, align: Enum.TextXAlignment.Center, zIndex: 7, outline: 1.5 });

		// loading screen: gradient backdrop, title sticker, progress bar
		this.loading = new Instance("Frame");
		this.loading.Size = new UDim2(1, 0, 1, 0);
		this.loading.BackgroundColor3 = theme.primary[1];
		this.loading.BorderSizePixel = 0;
		this.loading.ZIndex = 10;
		gradient(this.loading, theme.primary[0].Lerp(new Color3(1, 1, 1), 0.2), theme.primary[1].Lerp(new Color3(0, 0, 0), 0.35));
		this.loading.Parent = this.gui; // the loading overlay covers the screen: never scaled
		const titleCard = panel(new UDim2(0, 560, 0, 150), new UDim2(0.5, -280, 0.5, -110), this.loading, { radius: 22, strokeThickness: 4, zIndex: 11 });
		text(GameConfig.name, new UDim2(1, -24, 0, 70), new UDim2(0, 12, 0, 14), titleCard, { size: 44, align: Enum.TextXAlignment.Center, zIndex: 12, outline: 3.5, scaled: true });
		this.loadingText = body(L.shapingWorld, new UDim2(1, -24, 0, 22), new UDim2(0, 12, 0, 86), titleCard, { size: 15, align: Enum.TextXAlignment.Center, zIndex: 12 });
		const barHolder = new Instance("Frame");
		barHolder.Size = new UDim2(1, -48, 0, 18);
		barHolder.Position = new UDim2(0, 24, 0, 116);
		barHolder.BackgroundColor3 = theme.track;
		barHolder.BorderSizePixel = 0;
		barHolder.ZIndex = 12;
		corner(barHolder, 9);
		stroke(barHolder, theme.ink, 2.5);
		barHolder.Parent = titleCard;
		this.loadingFill = new Instance("Frame");
		this.loadingFill.Size = new UDim2(0, 0, 1, 0);
		this.loadingFill.BackgroundColor3 = theme.gold[0];
		this.loadingFill.BorderSizePixel = 0;
		this.loadingFill.ZIndex = 13;
		corner(this.loadingFill, 9);
		gradient(this.loadingFill, theme.gold[0], theme.gold[1]);
		this.loadingFill.Parent = barHolder;
		// a highlight sweeping the bar, so a long world build does not look frozen
		if (motion() > 0) {
			const beam = new Instance("Frame");
			beam.Size = new UDim2(0, 22, 1, 0);
			beam.BackgroundColor3 = new Color3(1, 1, 1);
			beam.BackgroundTransparency = 0.7;
			beam.BorderSizePixel = 0;
			beam.ZIndex = 14;
			beam.Parent = barHolder;
			task.spawn(() => {
				while (beam.Parent && this.loading.Visible) {
					beam.Position = new UDim2(0, -24, 0, 0);
					TweenService.Create(beam, new TweenInfo(1.1 / math.max(0.4, motion())), { Position: new UDim2(1, 6, 0, 0) }).Play();
					task.wait(1.5 / math.max(0.4, motion()));
				}
			});
		}
	}

	/**
	 * Adds a button for one of the game's screens (inventory, quests, crafting, leaderboard, teams,
	 * settings, menu). They stack above the Shop button, stay ≥ 44 px high for touch and are the only
	 * way to reach the screens on mobile (the hotkeys are the desktop shortcut).
	 */
	addButton(label: string, onClick: () => void, icon?: (parent: GuiObject) => GuiObject): TextButton {
		const index = this.screenButtons.size();
		// one column above the Shop button, wrapping into a second column after four entries
		const column = math.floor(index / 4);
		const row = index % 4;
		const b = button(label, new UDim2(0, 150, 0, 48), new UDim2(0, 18 + column * 160, 1, -76 - (row + 1) * 56), this.root, { colors: theme.info, size: 20, radius: 12, icon });
		b.MouseButton1Click.Connect(onClick);
		this.screenButtons.push(b);
		return b;
	}

	/** SFX volume (0…1) from the settings screen. */
	setSfxVolume(volume: number): void {
		this.sfxVolume = math.clamp(volume, 0, 1);
		for (const [, sound] of this.sfx) sound.Volume = this.sfxVolume;
	}

	/** Add / update a row in the right-hand value panel (empty value removes the row). */
	setValue(key: string, label: string, value: string): void {
		let row = this.valueRows.get(key);
		if (value === "") {
			row?.Destroy();
			this.valueRows.delete(key);
			this.relayoutValues();
			return;
		}
		if (!row) {
			row = text("", new UDim2(1, -20, 0, 26), new UDim2(0, 10, 0, 6 + this.valueRows.size() * 28), this.values, { size: 17, align: Enum.TextXAlignment.Right, rich: true, zIndex: 4, outline: 1.5 });
			this.valueRows.set(key, row);
			this.relayoutValues();
		}
		row.Text = `<font color="#${theme.text.ToHex()}">${label}</font>   <font color="#${theme.highlight.ToHex()}">${value}</font>`;
	}

	private relayoutValues(): void {
		let i = 0;
		for (const [, row] of this.valueRows) row.Position = new UDim2(0, 10, 0, 6 + i++ * 28);
		this.values.Size = new UDim2(0, 250, 0, 12 + this.valueRows.size() * 28);
		this.values.Visible = this.valueRows.size() > 0;
		if (this.valuesShadow) {
			this.valuesShadow.Size = this.values.Size;
			this.valuesShadow.Visible = this.values.Visible;
		}
	}

	/** Big centred banner (round timer, winner, wave). Empty text hides it. */
	setBanner(str: string): void {
		this.banner.Text = str;
		this.banner.Visible = str !== "";
	}

	setHealth(fraction: number): void {
		const value = math.clamp(fraction, 0, 1);
		// a hit flashes the screen edge red and shakes the bar a little
		if (value < this.lastHealth - 0.01 && motion() > 0) {
			this.damageFlash.BackgroundTransparency = 0.72;
			TweenService.Create(this.damageFlash, new TweenInfo(0.45), { BackgroundTransparency: 1 }).Play();
			floatText(`${math.floor((value - this.lastHealth) * 100)}`, this.healthFill.Parent as GuiObject, theme.bad, new UDim2(0, 60, 0, -18));
		}
		this.lastHealth = value;
		TweenService.Create(this.healthFill, new TweenInfo(0.2), { Size: new UDim2(value, 0, 1, 0) }).Play();
		this.healthFill.BackgroundColor3 = value > 0.5 ? theme.good : value > 0.25 ? theme.warn : theme.bad;
	}

	setStats(stats: PlayerStats): void {
		const coins = math.floor(stats.coins);
		const gained = coins - this.lastCoins;
		// the counter rolls up to the new value, and a gain floats out of the pill
		tweenNumber(this.coins, this.lastCoins, coins, (v) => abbreviate(v));
		if (gained > 0 && this.lastCoins > 0) {
			floatText(`+${abbreviate(gained)}`, this.coinPill, theme.gold[0], new UDim2(0, 54, 0, -4));
			if (this.coinArt) {
				const spin = this.coinArt;
				TweenService.Create(spin, new TweenInfo(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Rotation: spin.Rotation + 360 }).Play();
			}
			if (motion() > 0) {
				const pop = new Instance("UIScale");
				pop.Parent = this.coinPill;
				TweenService.Create(pop, new TweenInfo(0.1, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale: 1.07 }).Play();
				task.delay(0.12, () => TweenService.Create(pop, new TweenInfo(0.14), { Scale: 1 }).Play());
				task.delay(0.4, () => pop.Destroy());
			}
		} else if (gained < 0) {
			floatText(`-${abbreviate(math.abs(gained))}`, this.coinPill, theme.bad, new UDim2(0, 54, 0, -4));
		}
		this.lastCoins = coins;
		const t = math.clamp(stats.hunger / GameConfig.survival.hungerMax, 0, 1);
		TweenService.Create(this.hungerFill, new TweenInfo(0.25), { Size: new UDim2(t, 0, 1, 0) }).Play();
	}

	/**
	 * Toast notifications are queued: a burst of pickups shows one after the other instead of the
	 * last one replacing the rest (the server fires several in the same frame all the time).
	 */
	notify(str: string): void {
		this.toasts.push(str);
		if (this.toasts.size() > 6) this.toasts.remove(0); // a huge burst: keep the newest
		if (!this.toasting) this.drainToasts();
	}

	private drainToasts(): void {
		this.toasting = true;
		task.spawn(() => {
			while (this.toasts.size() > 0) {
				const str = this.toasts.remove(0)!;
				this.notifText.Text = str;
				this.notif.Visible = true;
				if (motion() > 0) {
					const pop = new Instance("UIScale");
					pop.Parent = this.notif;
					pop.Scale = 0.92;
					TweenService.Create(pop, new TweenInfo(0.18, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale: 1 }).Play();
					task.delay(0.5, () => pop.Destroy());
				}
				this.notif.Position = new UDim2(0.5, -180, 0, -60);
				TweenService.Create(this.notif, new TweenInfo(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Position: new UDim2(0.5, -180, 0, 92) }).Play();
				// a queued toast passes quicker so a burst does not block the HUD for ten seconds
				task.wait(this.toasts.size() > 0 ? 1.1 : 2.2);
				TweenService.Create(this.notif, new TweenInfo(0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { Position: new UDim2(0.5, -180, 0, -60) }).Play();
				task.wait(0.28);
			}
			this.notif.Visible = false;
			this.toasting = false;
		});
	}

	/** NPC line: shows the bubble for a few seconds. */
	say(name: string, str: string): void {
		this.dialogueName.Text = name;
		this.dialogueText.Text = str;
		this.dialogue.Visible = true;
		task.delay(5, () => {
			if (this.dialogueText.Text === str) this.dialogue.Visible = false;
		});
	}

	/** Plays a short sound (cached per id). */
	playSfx(id: string): void {
		let s = this.sfx.get(id);
		if (!s) {
			s = new Instance("Sound");
			s.SoundId = id;
			s.Volume = this.sfxVolume;
			s.Parent = this.gui;
			this.sfx.set(id, s);
		}
		s.Play();
	}

	setLoading(stage: string, done: number, total: number): void {
		const f = done / math.max(1, total);
		this.loadingText.Text = `${stage} ${math.floor(f * 100)}%`;
		TweenService.Create(this.loadingFill, new TweenInfo(0.2), { Size: new UDim2(math.clamp(f, 0, 1), 0, 1, 0) }).Play();
	}

	hideLoading(): void {
		TweenService.Create(this.loading, new TweenInfo(0.6), { BackgroundTransparency: 1 }).Play();
		for (const d of this.loading.GetDescendants()) {
			if (d.IsA("GuiObject")) TweenService.Create(d, new TweenInfo(0.6), { BackgroundTransparency: 1 }).Play();
			if (d.IsA("TextLabel")) TweenService.Create(d, new TweenInfo(0.6), { TextTransparency: 1 }).Play();
			if (d.IsA("UIStroke")) TweenService.Create(d, new TweenInfo(0.6), { Transparency: 1 }).Play();
		}
		task.delay(0.7, () => (this.loading.Visible = false));
	}
}
