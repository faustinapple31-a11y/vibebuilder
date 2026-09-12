import { Players, TweenService } from "@rbxts/services";
import { GameConfig } from "shared/config";
import type { PlayerStats } from "shared/net";

/**
 * Minimal stylized HUD built from Instances: currency counter, hunger bar, notifications, loading overlay.
 * Agents replace/extend this with the game's UI screens.
 */
const ACCENT = Color3.fromHex("#b48cff");
const PANEL = Color3.fromHex("#141824");
const TEXT = Color3.fromHex("#e8ecf6");

export class Hud {
	private gui: ScreenGui;
	private coins: TextLabel;
	private hungerFill: Frame;
	private notif: TextLabel;
	private loading: Frame;
	private loadingText: TextLabel;
	private dialogue: Frame;
	private dialogueName: TextLabel;
	private dialogueText: TextLabel;
	private sfx = new Map<string, Sound>();
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

		const panel = this.frame(new UDim2(0, 220, 0, 74), new UDim2(0, 16, 0, 16), PANEL, 0.25);
		panel.Parent = this.gui;
		this.coins = this.label(`0 ${GameConfig.currency.name}`, new UDim2(1, -16, 0, 30), new UDim2(0, 12, 0, 6), 20);
		this.coins.TextColor3 = ACCENT;
		this.coins.Parent = panel;
		const barBg = this.frame(new UDim2(1, -24, 0, 12), new UDim2(0, 12, 0, 48), Color3.fromHex("#2a3042"), 0);
		barBg.Parent = panel;
		this.hungerFill = this.frame(new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), Color3.fromHex("#7fd07a"), 0);
		this.hungerFill.Parent = barBg;
		const hl = this.label("Hunger", new UDim2(0, 100, 0, 14), new UDim2(0, 12, 0, 34), 12);
		hl.TextColor3 = Color3.fromHex("#9aa3b8");
		hl.Parent = panel;

		// shop button (bottom-left)
		const shopBtn = new Instance("TextButton");
		shopBtn.Size = new UDim2(0, 120, 0, 44);
		shopBtn.Position = new UDim2(0, 16, 1, -64);
		shopBtn.BackgroundColor3 = ACCENT;
		shopBtn.Text = "🛒  Shop";
		shopBtn.TextSize = 18;
		shopBtn.Font = Enum.Font.GothamBlack;
		shopBtn.TextColor3 = Color3.fromHex("#141824");
		const sc = new Instance("UICorner");
		sc.CornerRadius = new UDim(0, 12);
		sc.Parent = shopBtn;
		shopBtn.Parent = this.gui;
		shopBtn.MouseButton1Click.Connect(() => this.onShop?.());

		// NPC dialogue bubble (bottom-centre)
		this.dialogue = this.frame(new UDim2(0, 520, 0, 90), new UDim2(0.5, -260, 1, -130), PANEL, 0.15);
		this.dialogue.Visible = false;
		this.dialogue.Parent = this.gui;
		this.dialogueName = this.label("", new UDim2(1, -24, 0, 22), new UDim2(0, 12, 0, 8), 16);
		this.dialogueName.TextColor3 = ACCENT;
		this.dialogueName.Parent = this.dialogue;
		this.dialogueText = this.label("", new UDim2(1, -24, 0, 52), new UDim2(0, 12, 0, 32), 15);
		this.dialogueText.TextWrapped = true;
		this.dialogueText.TextYAlignment = Enum.TextYAlignment.Top;
		this.dialogueText.Parent = this.dialogue;

		this.notif = this.label("", new UDim2(0, 320, 0, 32), new UDim2(0.5, -160, 0, 24), 18);
		this.notif.TextTransparency = 1;
		this.notif.Parent = this.gui;

		this.loading = this.frame(new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), Color3.fromHex("#0b0e16"), 0);
		this.loading.ZIndex = 10;
		this.loading.Parent = this.gui;
		const title = this.label(GameConfig.name, new UDim2(1, 0, 0, 48), new UDim2(0, 0, 0.42, 0), 34);
		title.TextColor3 = ACCENT;
		title.TextXAlignment = Enum.TextXAlignment.Center;
		title.ZIndex = 11;
		title.Parent = this.loading;
		this.loadingText = this.label("Shaping the world…", new UDim2(1, 0, 0, 24), new UDim2(0, 0, 0.42, 56), 16);
		this.loadingText.TextColor3 = Color3.fromHex("#9aa3b8");
		this.loadingText.TextXAlignment = Enum.TextXAlignment.Center;
		this.loadingText.ZIndex = 11;
		this.loadingText.Parent = this.loading;
	}

	private frame(size: UDim2, pos: UDim2, color: Color3, transparency: number): Frame {
		const f = new Instance("Frame");
		f.Size = size;
		f.Position = pos;
		f.BackgroundColor3 = color;
		f.BackgroundTransparency = transparency;
		f.BorderSizePixel = 0;
		const corner = new Instance("UICorner");
		corner.CornerRadius = new UDim(0, 10);
		corner.Parent = f;
		return f;
	}

	private label(text: string, size: UDim2, pos: UDim2, textSize: number): TextLabel {
		const l = new Instance("TextLabel");
		l.Text = text;
		l.Size = size;
		l.Position = pos;
		l.BackgroundTransparency = 1;
		l.TextColor3 = TEXT;
		l.TextSize = textSize;
		l.Font = Enum.Font.GothamBold;
		l.TextXAlignment = Enum.TextXAlignment.Left;
		return l;
	}

	setStats(stats: PlayerStats): void {
		this.coins.Text = `${math.floor(stats.coins)} ${GameConfig.currency.name}`;
		const t = math.clamp(stats.hunger / GameConfig.survival.hungerMax, 0, 1);
		TweenService.Create(this.hungerFill, new TweenInfo(0.25), { Size: new UDim2(t, 0, 1, 0) }).Play();
		this.hungerFill.BackgroundColor3 = t < 0.25 ? Color3.fromHex("#e05a5a") : Color3.fromHex("#7fd07a");
	}

	notify(text: string): void {
		this.notif.Text = text;
		this.notif.TextXAlignment = Enum.TextXAlignment.Center;
		this.notif.TextTransparency = 0;
		TweenService.Create(this.notif, new TweenInfo(1.6, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { TextTransparency: 1 }).Play();
	}

	/** NPC line: shows the bubble for a few seconds. */
	say(name: string, text: string): void {
		this.dialogueName.Text = name;
		this.dialogueText.Text = text;
		this.dialogue.Visible = true;
		task.delay(5, () => {
			if (this.dialogueText.Text === text) this.dialogue.Visible = false;
		});
	}

	/** Plays a short sound (cached per id). */
	playSfx(id: string): void {
		let s = this.sfx.get(id);
		if (!s) {
			s = new Instance("Sound");
			s.SoundId = id;
			s.Volume = 0.6;
			s.Parent = this.gui;
			this.sfx.set(id, s);
		}
		s.Play();
	}

	setLoading(stage: string, done: number, total: number): void {
		this.loadingText.Text = `${stage} ${math.floor((done / math.max(1, total)) * 100)}%`;
	}

	hideLoading(): void {
		TweenService.Create(this.loading, new TweenInfo(0.8), { BackgroundTransparency: 1 }).Play();
		for (const d of this.loading.GetDescendants()) {
			if (d.IsA("TextLabel")) TweenService.Create(d, new TweenInfo(0.8), { TextTransparency: 1 }).Play();
		}
		task.delay(0.9, () => (this.loading.Visible = false));
	}
}
