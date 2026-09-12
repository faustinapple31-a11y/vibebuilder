import { Players, TweenService } from "@rbxts/services";
import { ShopCatalog, type RobuxItem, type ShopItem } from "shared/catalog";
import { Remotes, waitRemoteFunction, type ShopState } from "shared/net";

/**
 * Shop window built from Instances: header + close, section headers, item cards (icon, name, description,
 * price button → "Owned" / "You have: N"), and a Robux section (game passes & developer products).
 * Data-driven from shared/catalog.ts; purchases go through the server (ShopBuy / ShopPromptRobux).
 */
const PANEL = Color3.fromHex("#2b2f3a");
const PANEL_2 = Color3.fromHex("#3a3f4d");
const TEXT = Color3.fromHex("#f4f1e8");
const MUTED = Color3.fromHex("#b9bcc7");
const GREEN = Color3.fromHex("#4a9a4a");
const GOLD = Color3.fromHex("#c9a24a");
const ROBUX = Color3.fromHex("#1f2430");

function corner(parent: GuiObject, radius = 10): void {
	const c = new Instance("UICorner");
	c.CornerRadius = new UDim(0, radius);
	c.Parent = parent;
}

function stroke(parent: GuiObject, color: Color3, thickness = 2, transparency = 0): void {
	const s = new Instance("UIStroke");
	s.Color = color;
	s.Thickness = thickness;
	s.Transparency = transparency;
	s.Parent = parent;
}

function label(text: string, size: number, color: Color3, bold = false): TextLabel {
	const l = new Instance("TextLabel");
	l.BackgroundTransparency = 1;
	l.Text = text;
	l.TextSize = size;
	l.TextColor3 = color;
	l.Font = bold ? Enum.Font.GothamBlack : Enum.Font.GothamMedium;
	l.TextXAlignment = Enum.TextXAlignment.Left;
	l.TextWrapped = true;
	l.RichText = true;
	return l;
}

function tint(hex: string | undefined, fallback: Color3): Color3 {
	return hex !== undefined ? Color3.fromHex(hex) : fallback;
}

export class ShopUi {
	private gui: ScreenGui;
	private window: Frame;
	private list: ScrollingFrame;
	private coinsLabel: TextLabel;
	private state: ShopState = { coins: 0, owned: [], counts: {}, buffs: {} };
	private buy = waitRemoteFunction(Remotes.ShopBuy);
	private promptRobux = waitRemoteFunction(Remotes.ShopPromptRobux);
	private cards = new Map<string, { button: TextButton; have: TextLabel }>();
	public open = false;

	constructor() {
		const pg = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
		this.gui = new Instance("ScreenGui");
		this.gui.Name = "WorldForgeShop";
		this.gui.ResetOnSpawn = false;
		this.gui.IgnoreGuiInset = true;
		this.gui.DisplayOrder = 5;
		this.gui.Enabled = false;
		this.gui.Parent = pg;

		this.window = new Instance("Frame");
		this.window.Size = new UDim2(0, 520, 0, 560);
		this.window.Position = new UDim2(0.5, -260, 0.5, -280);
		this.window.BackgroundColor3 = PANEL;
		this.window.BorderSizePixel = 0;
		corner(this.window, 16);
		stroke(this.window, Color3.fromHex("#5a6070"), 2);
		this.window.Parent = this.gui;

		// header
		const header = new Instance("Frame");
		header.Size = new UDim2(1, 0, 0, 56);
		header.BackgroundColor3 = PANEL_2;
		header.BorderSizePixel = 0;
		corner(header, 16);
		header.Parent = this.window;
		const title = label(ShopCatalog.title, 30, TEXT, true);
		title.Size = new UDim2(1, -140, 1, 0);
		title.Position = new UDim2(0, 18, 0, 0);
		title.Parent = header;
		this.coinsLabel = label("0", 18, GOLD, true);
		this.coinsLabel.Size = new UDim2(0, 120, 1, 0);
		this.coinsLabel.Position = new UDim2(1, -200, 0, 0);
		this.coinsLabel.TextXAlignment = Enum.TextXAlignment.Right;
		this.coinsLabel.Parent = header;
		const close = new Instance("TextButton");
		close.Size = new UDim2(0, 40, 0, 40);
		close.Position = new UDim2(1, -50, 0, 8);
		close.BackgroundColor3 = Color3.fromHex("#d94a4a");
		close.Text = "X";
		close.TextSize = 22;
		close.Font = Enum.Font.GothamBlack;
		close.TextColor3 = TEXT;
		corner(close, 10);
		stroke(close, Color3.fromHex("#8a2a2a"), 2);
		close.Parent = header;
		close.MouseButton1Click.Connect(() => this.setOpen(false));

		// scrolling body
		this.list = new Instance("ScrollingFrame");
		this.list.Size = new UDim2(1, -24, 1, -72);
		this.list.Position = new UDim2(0, 12, 0, 64);
		this.list.BackgroundTransparency = 1;
		this.list.BorderSizePixel = 0;
		this.list.ScrollBarThickness = 6;
		this.list.CanvasSize = new UDim2(0, 0, 0, 0);
		this.list.AutomaticCanvasSize = Enum.AutomaticSize.Y;
		this.list.Parent = this.window;
		const layout = new Instance("UIListLayout");
		layout.Padding = new UDim(0, 8);
		layout.SortOrder = Enum.SortOrder.LayoutOrder;
		layout.Parent = this.list;

		let order = 0;
		for (const section of ShopCatalog.sections) {
			const items = ShopCatalog.items.filter((i) => i.section === section.id);
			if (items.size() === 0) continue;
			this.sectionHeader(section.title, order++);
			const upgrades = items.filter((i) => !i.consumable);
			if (upgrades.size() > 0) this.upgradeRow(upgrades, order++);
			for (const item of items.filter((i) => i.consumable)) this.consumableCard(item, order++);
		}
		if (ShopCatalog.robux.size() > 0) {
			this.sectionHeader("Robux", order++);
			for (const item of ShopCatalog.robux) this.robuxCard(item, order++);
		}
	}

	private sectionHeader(text: string, order: number): void {
		const h = label(text, 24, TEXT, true);
		h.Size = new UDim2(1, 0, 0, 34);
		h.TextXAlignment = Enum.TextXAlignment.Center;
		h.LayoutOrder = order;
		h.Parent = this.list;
	}

	/** Compact tier cards side by side (permanent upgrades). */
	private upgradeRow(items: ShopItem[], order: number): void {
		const row = new Instance("Frame");
		row.Size = new UDim2(1, 0, 0, 96);
		row.BackgroundTransparency = 1;
		row.LayoutOrder = order;
		row.Parent = this.list;
		const grid = new Instance("UIGridLayout");
		grid.CellSize = new UDim2(1 / math.min(3, items.size()), -8, 1, 0);
		grid.CellPadding = new UDim2(0, 8, 0, 8);
		grid.Parent = row;
		for (const item of items) {
			const card = new Instance("Frame");
			card.BackgroundColor3 = tint(item.color, Color3.fromHex("#5b4a8f"));
			card.BorderSizePixel = 0;
			corner(card, 10);
			stroke(card, Color3.fromHex("#1c1a24"), 2, 0.4);
			card.Parent = row;
			const name = label(item.name, 16, TEXT, true);
			name.Size = new UDim2(1, -12, 0, 22);
			name.Position = new UDim2(0, 8, 0, 4);
			name.TextXAlignment = Enum.TextXAlignment.Center;
			name.Parent = card;
			const desc = label(item.description, 11, TEXT);
			desc.Size = new UDim2(1, -12, 0, 32);
			desc.Position = new UDim2(0, 8, 0, 26);
			desc.TextXAlignment = Enum.TextXAlignment.Center;
			desc.Parent = card;
			const btn = this.priceButton(`${item.price}`, card, new UDim2(1, -24, 0, 26), new UDim2(0, 12, 1, -32));
			btn.MouseButton1Click.Connect(() => this.purchase(item.id));
			const have = label("", 10, TEXT);
			have.Size = new UDim2(0, 0, 0, 0);
			this.cards.set(item.id, { button: btn, have });
		}
	}

	/** Wide card: icon, name + description, "You have: N" and price button (consumables / potions). */
	private consumableCard(item: ShopItem, order: number): void {
		const card = new Instance("Frame");
		card.Size = new UDim2(1, 0, 0, 84);
		card.BackgroundColor3 = tint(item.color, GREEN);
		card.BorderSizePixel = 0;
		card.LayoutOrder = order;
		corner(card, 10);
		stroke(card, Color3.fromHex("#1c1a24"), 2, 0.4);
		card.Parent = this.list;
		const icon = new Instance(item.iconAssetId !== undefined ? "ImageLabel" : "TextLabel") as ImageLabel | TextLabel;
		icon.Size = new UDim2(0, 64, 0, 64);
		icon.Position = new UDim2(0, 10, 0, 10);
		icon.BackgroundColor3 = Color3.fromHex("#1c1a24");
		icon.BackgroundTransparency = 0.5;
		corner(icon, 12);
		if (icon.IsA("ImageLabel")) icon.Image = `rbxassetid://${item.iconAssetId}`;
		else {
			icon.Text = "🧪";
			icon.TextSize = 34;
			icon.Font = Enum.Font.GothamBlack;
			icon.TextColor3 = TEXT;
		}
		icon.Parent = card;
		const name = label(item.name, 20, TEXT, true);
		name.Size = new UDim2(1, -220, 0, 26);
		name.Position = new UDim2(0, 84, 0, 8);
		name.Parent = card;
		const desc = label(item.description, 12, TEXT);
		desc.Size = new UDim2(1, -220, 0, 44);
		desc.Position = new UDim2(0, 84, 0, 34);
		desc.Parent = card;
		const have = label("You have: 0", 12, TEXT);
		have.Size = new UDim2(0, 120, 0, 18);
		have.Position = new UDim2(1, -132, 0, 8);
		have.TextXAlignment = Enum.TextXAlignment.Right;
		have.Parent = card;
		const btn = this.priceButton(`${item.price}`, card, new UDim2(0, 110, 0, 34), new UDim2(1, -122, 0, 36));
		btn.MouseButton1Click.Connect(() => this.purchase(item.id));
		this.cards.set(item.id, { button: btn, have });
	}

	private robuxCard(item: RobuxItem, order: number): void {
		const card = new Instance("Frame");
		card.Size = new UDim2(1, 0, 0, 62);
		card.BackgroundColor3 = ROBUX;
		card.BorderSizePixel = 0;
		card.LayoutOrder = order;
		corner(card, 10);
		stroke(card, Color3.fromHex("#3a4050"), 1.5);
		card.Parent = this.list;
		const badge = label(item.kind === "gamepass" ? "👑" : "💰", 26, TEXT);
		badge.Size = new UDim2(0, 44, 1, 0);
		badge.Position = new UDim2(0, 10, 0, 0);
		badge.TextXAlignment = Enum.TextXAlignment.Center;
		badge.Parent = card;
		const name = label(item.name, 16, TEXT, true);
		name.Size = new UDim2(1, -200, 0, 24);
		name.Position = new UDim2(0, 60, 0, 8);
		name.Parent = card;
		const kind = label(item.kind === "gamepass" ? "GAMEPASS" : "DEV PRODUCT", 10, MUTED);
		kind.Size = new UDim2(1, -200, 0, 16);
		kind.Position = new UDim2(0, 60, 0, 34);
		kind.Parent = card;
		const btn = this.priceButton(`R$ ${item.priceRobux}`, card, new UDim2(0, 96, 0, 32), new UDim2(1, -108, 0, 15));
		btn.BackgroundColor3 = Color3.fromHex("#0b0e16");
		btn.MouseButton1Click.Connect(() => {
			const res = this.promptRobux.InvokeServer(item.id) as { ok: boolean; message: string };
			if (!res.ok) this.flash(btn, res.message);
		});
		this.cards.set(item.id, { button: btn, have: label("", 10, TEXT) });
	}

	private priceButton(text: string, parent: GuiObject, size: UDim2, position: UDim2): TextButton {
		const b = new Instance("TextButton");
		b.Size = size;
		b.Position = position;
		b.BackgroundColor3 = Color3.fromHex("#141824");
		b.Text = text.sub(1, 2) === "R$" ? text : `$ ${text}`;
		b.TextSize = 16;
		b.Font = Enum.Font.GothamBlack;
		b.TextColor3 = TEXT;
		b.AutoButtonColor = true;
		corner(b, 8);
		stroke(b, Color3.fromHex("#e8ecf6"), 1.5, 0.6);
		b.Parent = parent;
		return b;
	}

	private flash(button: TextButton, message: string): void {
		const old = button.Text;
		button.Text = message.size() > 14 ? message.sub(1, 14) + "…" : message;
		button.TextScaled = true;
		task.delay(1.6, () => (button.TextScaled = false));
		task.delay(1.6, () => (button.Text = old));
	}

	private purchase(itemId: string): void {
		const res = this.buy.InvokeServer(itemId) as { ok: boolean; message: string };
		const card = this.cards.get(itemId);
		if (card && !res.ok) this.flash(card.button, res.message);
	}

	setState(state: ShopState): void {
		this.state = state;
		this.coinsLabel.Text = `$ ${math.floor(state.coins)}`;
		for (const item of ShopCatalog.items) {
			const card = this.cards.get(item.id);
			if (!card) continue;
			if (!item.consumable) {
				const owned = state.owned.includes(item.id);
				card.button.Text = owned ? "Owned" : `$ ${item.price}`;
				card.button.BackgroundColor3 = owned ? Color3.fromHex("#2a3042") : Color3.fromHex("#141824");
			} else {
				card.have.Text = `You have: ${state.counts[item.id] ?? 0}`;
				const left = item.effect.stat !== undefined ? state.buffs[item.effect.stat] : undefined;
				if (left !== undefined && left > 0) card.have.Text += ` · ${math.floor(left / 60)}m left`;
			}
		}
		for (const item of ShopCatalog.robux) {
			const card = this.cards.get(item.id);
			if (card && item.kind === "gamepass" && state.owned.includes(item.id)) card.button.Text = "Owned";
		}
	}

	setOpen(open: boolean): void {
		this.open = open;
		this.gui.Enabled = open;
		if (open) {
			this.window.Position = new UDim2(0.5, -260, 0.5, -300);
			TweenService.Create(this.window, new TweenInfo(0.18, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Position: new UDim2(0.5, -260, 0.5, -280) }).Play();
		}
	}

	toggle(): void {
		this.setOpen(!this.open);
	}
}
