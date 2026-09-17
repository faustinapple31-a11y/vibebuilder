import { Players, TweenService } from "@rbxts/services";
import { ShopCatalog, type RobuxItem, type ShopBundle, type ShopItem } from "shared/catalog";
import { Remotes, waitRemoteFunction, type ShopState } from "shared/net";
import { badge, body, button, coinIcon, cloverIcon, corner, gradient, itemIcon, panel, pill, pressAnimation, shadow, strike, stroke, text, theme, tooltip } from "./kit";

/**
 * Shop window (mobile-game look): paper panel with a thick outline, title with an outline, red X, then a
 * scrolling body — featured buff banner (green gradient, mascot icon, headline, price pill), one-time
 * bundle card (gold gradient, item tiles with counts, struck-through price, promo sticker), sections of
 * item tiles (upgrades) and wide cards (potions) and the Robux passes / products. Data-driven from
 * shared/catalog.ts; purchases go through the server (ShopBuy / ShopPromptRobux). Tooltips on tiles.
 */
const W = 640;
const H = 660;

export class ShopUi {
	private gui: ScreenGui;
	private window: Frame;
	private list: ScrollingFrame;
	private coins: TextLabel;
	private state: ShopState = { coins: 0, owned: [], counts: {}, buffs: {} };
	private buy = waitRemoteFunction(Remotes.ShopBuy);
	private promptRobux = waitRemoteFunction(Remotes.ShopPromptRobux);
	private cards = new Map<string, { button: TextButton; have?: TextLabel; price: number }>();
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

		// dim backdrop
		const dim = new Instance("Frame");
		dim.Size = new UDim2(1, 0, 1, 0);
		dim.BackgroundColor3 = new Color3(0, 0, 0);
		dim.BackgroundTransparency = 0.45;
		dim.BorderSizePixel = 0;
		dim.ZIndex = 1;
		dim.Parent = this.gui;

		this.window = panel(new UDim2(0, W, 0, H), new UDim2(0.5, -W / 2, 0.5, -H / 2), this.gui, { radius: 20, strokeThickness: 4, zIndex: 2 });
		this.window.Name = "Window";
		// keep it on screen on small displays
		const scale = new Instance("UIScale");
		scale.Parent = this.window;
		const fit = () => {
			const vp = this.gui.AbsoluteSize;
			scale.Scale = math.clamp(math.min(vp.X / (W + 40), vp.Y / (H + 40)), 0.55, 1);
		};
		this.gui.GetPropertyChangedSignal("AbsoluteSize").Connect(fit);
		task.defer(fit);

		// header
		text(ShopCatalog.title, new UDim2(0, 300, 0, 56), new UDim2(0, 24, 0, 10), this.window, { size: 40 });
		const coinPill = pill("0", new UDim2(0, 150, 0, 40), new UDim2(1, -232, 0, 18), this.window, "coin", { textSize: 20 });
		this.coins = coinPill.label;
		const close = button("X", new UDim2(0, 52, 0, 52), new UDim2(1, -68, 0, 12), this.window, { colors: theme.danger, size: 26, radius: 12, zIndex: 4 });
		close.MouseButton1Click.Connect(() => this.setOpen(false));

		// scrolling body
		this.list = new Instance("ScrollingFrame");
		this.list.Size = new UDim2(1, -36, 1, -92);
		this.list.Position = new UDim2(0, 18, 0, 76);
		this.list.BackgroundTransparency = 1;
		this.list.BorderSizePixel = 0;
		this.list.ScrollBarThickness = 8;
		this.list.ScrollBarImageColor3 = theme.ink;
		this.list.CanvasSize = new UDim2(0, 0, 0, 0);
		this.list.AutomaticCanvasSize = Enum.AutomaticSize.Y;
		this.list.ZIndex = 3;
		this.list.Parent = this.window;
		const layout = new Instance("UIListLayout");
		layout.Padding = new UDim(0, 12);
		layout.SortOrder = Enum.SortOrder.LayoutOrder;
		layout.Parent = this.list;
		const pad = new Instance("UIPadding");
		pad.PaddingRight = new UDim(0, 12);
		pad.PaddingBottom = new UDim(0, 12);
		pad.PaddingTop = new UDim(0, 4);
		pad.PaddingLeft = new UDim(0, 4);
		pad.Parent = this.list;

		let order = 0;
		if (ShopCatalog.featured !== undefined) {
			const item = ShopCatalog.items.find((i) => i.id === ShopCatalog.featured!.itemId);
			if (item) this.featuredBanner(item, ShopCatalog.featured.headline, ShopCatalog.featured.note, order++);
		}
		for (const bundle of ShopCatalog.bundles) this.bundleCard(bundle, order++);
		for (const section of ShopCatalog.sections) {
			const items = ShopCatalog.items.filter((i) => i.section === section.id && i.id !== ShopCatalog.featured?.itemId);
			if (items.size() === 0) continue;
			this.sectionHeader(section.title, order++);
			const upgrades = items.filter((i) => !i.consumable);
			if (upgrades.size() > 0) this.tileRow(upgrades, order++);
			for (const item of items.filter((i) => i.consumable)) this.wideCard(item, order++);
		}
		if (ShopCatalog.robux.size() > 0) {
			this.sectionHeader("Robux", order++);
			for (const item of ShopCatalog.robux) this.robuxCard(item, order++);
		}
	}

	/** Rounded gradient card used by every row. */
	private card(height: number, order: number, colors: [Color3, Color3], radius = 16): Frame {
		const holder = new Instance("Frame");
		holder.Size = new UDim2(1, 0, 0, height + 6);
		holder.BackgroundTransparency = 1;
		holder.LayoutOrder = order;
		holder.ZIndex = 3;
		holder.Parent = this.list;
		const f = new Instance("Frame");
		f.Size = new UDim2(1, -6, 0, height);
		f.BackgroundColor3 = new Color3(1, 1, 1);
		f.BorderSizePixel = 0;
		f.ZIndex = 4;
		corner(f, radius);
		gradient(f, colors[0], colors[1]);
		stroke(f, theme.ink, 3);
		f.Parent = holder;
		shadow(f, 5, 0.5);
		return f;
	}

	private sectionHeader(str: string, order: number): void {
		const h = text(str.upper(), new UDim2(1, 0, 0, 36), new UDim2(0, 0, 0, 0), this.list, { size: 26, align: Enum.TextXAlignment.Center, color: theme.textDark, outline: 0 });
		h.LayoutOrder = order;
		// underline
		const line = new Instance("Frame");
		line.Size = new UDim2(0, 120, 0, 4);
		line.Position = new UDim2(0.5, -60, 1, -4);
		line.BackgroundColor3 = theme.inkSoft;
		line.BackgroundTransparency = 0.6;
		line.BorderSizePixel = 0;
		corner(line, 2);
		line.Parent = h;
	}

	/** "BOOST Your Luck!" — big green banner: mascot, headline, x1 → x2 figure, note, price pill. */
	private featuredBanner(item: ShopItem, headline: string, note: string, order: number): void {
		const f = this.card(150, order, [Color3.fromHex("#5fcf3a"), Color3.fromHex("#2f8d2c")]);
		const icon = item.effect.stat === "luck" ? cloverIcon(104, f) : itemIcon(item, 96, f);
		icon.Position = new UDim2(0, 18, 0.5, -icon.Size.Y.Offset / 2);
		icon.ZIndex = 6;
		text(headline, new UDim2(1, -320, 0, 40), new UDim2(0, 140, 0, 14), f, { size: 30, zIndex: 6 });
		const boost = item.effect.type === "buff" || item.effect.type === "multiplier" ? `x1  ➜  x${item.effect.value}` : item.description;
		text(boost, new UDim2(1, -320, 0, 44), new UDim2(0, 140, 0, 54), f, { size: 32, zIndex: 6, color: Color3.fromHex("#fff8c8") });
		body(note !== "" ? note : item.description, new UDim2(1, -320, 0, 24), new UDim2(0, 142, 0, 108), f, { size: 13, color: Color3.fromHex("#e9ffe0"), zIndex: 6 });
		const price = this.priceButton(item.price, f, new UDim2(0, 150, 0, 48), new UDim2(1, -168, 1, -66), "coin");
		price.MouseButton1Click.Connect(() => this.purchase(item.id));
		this.cards.set(item.id, { button: price, price: item.price });
	}

	/** Gold bundle card: title, description, item tiles with counts, sticker, old price struck, price. */
	private bundleCard(bundle: ShopBundle, order: number): void {
		const f = this.card(232, order, theme.gold);
		text(bundle.name.upper(), new UDim2(1, -120, 0, 44), new UDim2(0, 0, 0, 10), f, { size: 36, align: Enum.TextXAlignment.Center, color: Color3.fromHex("#fff3c4"), zIndex: 6 });
		body(bundle.description, new UDim2(1, -140, 0, 20), new UDim2(0, 0, 0, 52), f, { size: 13, align: Enum.TextXAlignment.Center, color: Color3.fromHex("#5a3a10"), zIndex: 6 });
		// tiles
		const tiles = bundle.items.map((e) => ({ entry: e, item: ShopCatalog.items.find((i) => i.id === e.itemId) })).filter((t) => t.item !== undefined);
		const tileW = 100;
		const gap = 10;
		const total = tiles.size() * tileW + (tiles.size() - 1) * gap;
		const startX = math.max(14, (W - 60 - 150 - total) / 2);
		tiles.forEach((t, k) => {
			const item = t.item!;
			const tile = new Instance("Frame");
			tile.Size = new UDim2(0, tileW, 0, 118);
			tile.Position = new UDim2(0, startX + k * (tileW + gap), 0, 80);
			tile.BackgroundColor3 = theme.tile;
			tile.BorderSizePixel = 0;
			tile.ZIndex = 6;
			corner(tile, 14);
			stroke(tile, theme.tileStroke, 3);
			tile.Parent = f;
			const head = new Instance("Frame");
			head.Size = new UDim2(1, 0, 0, 26);
			head.BackgroundColor3 = theme.tileStroke;
			head.BorderSizePixel = 0;
			head.ZIndex = 6;
			corner(head, 14);
			head.Parent = tile;
			text(item.name, new UDim2(1, -6, 1, 0), new UDim2(0, 3, 0, 0), head, { size: 15, align: Enum.TextXAlignment.Center, zIndex: 7, outline: 1.5, scaled: true });
			const ic = itemIcon(item, 54, tile);
			ic.Position = new UDim2(0.5, -27, 0, 32);
			ic.ZIndex = 7;
			text(`x${t.entry.count}`, new UDim2(1, 0, 0, 24), new UDim2(0, 0, 1, -26), tile, { size: 20, align: Enum.TextXAlignment.Center, zIndex: 7 });
			tooltip(tile, item.name, item.description, this.gui);
		});
		// sticker + prices
		const original = bundle.originalPrice ?? bundle.items.reduce((s, e) => s + (ShopCatalog.items.find((i) => i.id === e.itemId)?.price ?? 0) * e.count, 0);
		const discount = original > 0 ? math.floor((1 - bundle.price / original) * 100) : 0;
		badge(bundle.badge ?? `-${discount}%`, new UDim2(1, -128, 0, 16), f, Color3.fromHex("#ff4f7a"), -12, 26);
		if (original > bundle.price) strike(`${original}`, new UDim2(1, -136, 0, 128), f, 22);
		const price = this.priceButton(bundle.price, f, new UDim2(0, 136, 0, 48), new UDim2(1, -150, 1, -66), "coin");
		price.MouseButton1Click.Connect(() => this.purchase(`bundle:${bundle.id}`));
		this.cards.set(`bundle:${bundle.id}`, { button: price, price: bundle.price });
	}

	/** Compact tiles side by side (permanent upgrades). */
	private tileRow(items: ShopItem[], order: number): void {
		const holder = new Instance("Frame");
		holder.Size = new UDim2(1, 0, 0, 176);
		holder.BackgroundTransparency = 1;
		holder.LayoutOrder = order;
		holder.ZIndex = 3;
		holder.Parent = this.list;
		const per = math.min(3, items.size());
		const tileW = (W - 60 - (per - 1) * 12) / per;
		items.forEach((item, k) => {
			const col = k % per;
			const row = math.floor(k / per);
			const tile = new Instance("Frame");
			tile.Size = new UDim2(0, tileW, 0, 166);
			tile.Position = new UDim2(0, col * (tileW + 12), 0, row * 178);
			tile.BackgroundColor3 = theme.tile;
			tile.BorderSizePixel = 0;
			tile.ZIndex = 4;
			corner(tile, 16);
			stroke(tile, theme.tileStroke, 3);
			tile.Parent = holder;
			shadow(tile, 4, 0.5);
			const head = new Instance("Frame");
			head.Size = new UDim2(1, 0, 0, 30);
			head.BackgroundColor3 = item.color !== undefined ? Color3.fromHex(item.color) : theme.tileStroke;
			head.BorderSizePixel = 0;
			head.ZIndex = 4;
			corner(head, 16);
			head.Parent = tile;
			text(item.name, new UDim2(1, -8, 1, 0), new UDim2(0, 4, 0, 0), head, { size: 17, align: Enum.TextXAlignment.Center, zIndex: 5, outline: 2, scaled: true });
			const ic = itemIcon(item, 56, tile);
			ic.Position = new UDim2(0.5, -28, 0, 38);
			ic.ZIndex = 5;
			body(item.description, new UDim2(1, -12, 0, 30), new UDim2(0, 6, 0, 96), tile, { size: 11, align: Enum.TextXAlignment.Center, color: Color3.fromHex("#e9e2cf"), zIndex: 5 });
			const price = this.priceButton(item.price, tile, new UDim2(1, -20, 0, 36), new UDim2(0, 10, 1, -44), "coin");
			price.MouseButton1Click.Connect(() => this.purchase(item.id));
			this.cards.set(item.id, { button: price, price: item.price });
			tooltip(tile, item.name, item.description, this.gui);
		});
		if (items.size() > per) holder.Size = new UDim2(1, 0, 0, math.ceil(items.size() / per) * 178);
	}

	/** Wide card: icon, name + description, "You have: N" and price (consumables / potions). */
	private wideCard(item: ShopItem, order: number): void {
		const base = item.color !== undefined ? Color3.fromHex(item.color) : theme.primary[1];
		const f = this.card(96, order, [base.Lerp(new Color3(1, 1, 1), 0.28), base.Lerp(new Color3(0, 0, 0), 0.12)]);
		const ic = itemIcon(item, 64, f);
		ic.Position = new UDim2(0, 16, 0.5, -32);
		ic.ZIndex = 6;
		text(item.name, new UDim2(1, -300, 0, 30), new UDim2(0, 96, 0, 12), f, { size: 24, zIndex: 6 });
		body(item.description, new UDim2(1, -300, 0, 40), new UDim2(0, 97, 0, 44), f, { size: 12, color: Color3.fromHex("#f6f1e4"), zIndex: 6 });
		const have = text("You have: 0", new UDim2(0, 150, 0, 22), new UDim2(1, -170, 0, 10), f, { size: 15, align: Enum.TextXAlignment.Right, zIndex: 6, outline: 1.5 });
		const price = this.priceButton(item.price, f, new UDim2(0, 136, 0, 42), new UDim2(1, -152, 1, -54), "coin");
		price.MouseButton1Click.Connect(() => this.purchase(item.id));
		this.cards.set(item.id, { button: price, have, price: item.price });
		tooltip(f, item.name, item.description, this.gui);
	}

	private robuxCard(item: RobuxItem, order: number): void {
		const f = this.card(76, order, [Color3.fromHex("#3a4150"), Color3.fromHex("#1c2130")]);
		const ic = itemIcon(item, 48, f);
		ic.Position = new UDim2(0, 16, 0.5, -24);
		ic.ZIndex = 6;
		text(item.name, new UDim2(1, -300, 0, 28), new UDim2(0, 78, 0, 10), f, { size: 21, zIndex: 6 });
		body(item.kind === "gamepass" ? "GAME PASS · " + item.description : item.description, new UDim2(1, -300, 0, 22), new UDim2(0, 79, 0, 42), f, { size: 11, color: Color3.fromHex("#c9d0dd"), zIndex: 6 });
		const price = this.priceButton(item.priceRobux, f, new UDim2(0, 130, 0, 42), new UDim2(1, -146, 0.5, -21), "robux");
		price.MouseButton1Click.Connect(() => {
			const res = this.promptRobux.InvokeServer(item.id) as { ok: boolean; message: string };
			if (!res.ok) this.flash(price, res.message);
		});
		this.cards.set(item.id, { button: price, price: item.priceRobux });
	}

	/** Dark pill-shaped button with a coin / Robux icon and the price. */
	private priceButton(price: number, parent: GuiObject, size: UDim2, position: UDim2, icon: "coin" | "robux"): TextButton {
		const b = new Instance("TextButton");
		b.Size = size;
		b.Position = position;
		b.BackgroundColor3 = icon === "robux" ? Color3.fromHex("#151a26") : theme.pill;
		b.BorderSizePixel = 0;
		b.Text = "";
		b.AutoButtonColor = false;
		b.ZIndex = 7;
		corner(b, 12);
		stroke(b, icon === "robux" ? Color3.fromHex("#5a6478") : theme.pillStroke, 3);
		b.Parent = parent;
		const ic = icon === "coin" ? coinIcon(24, b) : (() => {
			const i = new Instance("ImageLabel");
			i.Size = new UDim2(0, 22, 0, 22);
			i.BackgroundTransparency = 1;
			i.Image = "rbxasset://textures/ui/common/robux.png";
			i.Parent = b;
			return i;
		})();
		ic.Position = new UDim2(0, 12, 0.5, -ic.Size.Y.Offset / 2);
		ic.ZIndex = 8;
		const label = text(`${price}`, new UDim2(1, -46, 1, 0), new UDim2(0, 42, 0, 0), b, { size: 22, align: Enum.TextXAlignment.Left, zIndex: 8, outline: 1.5 });
		label.Name = "Label";
		shadow(b, 3, 0.45);
		pressAnimation(b);
		return b;
	}

	private setButtonText(b: TextButton, str: string): void {
		const l = b.FindFirstChild("Label") as TextLabel | undefined;
		if (l) l.Text = str;
	}

	private flash(b: TextButton, message: string): void {
		const l = b.FindFirstChild("Label") as TextLabel | undefined;
		if (!l) return;
		const old = l.Text;
		l.Text = message.size() > 14 ? message.sub(1, 14) + "…" : message;
		l.TextScaled = true;
		TweenService.Create(b, new TweenInfo(0.12), { BackgroundColor3: Color3.fromHex("#8a2a2a") }).Play();
		task.delay(1.4, () => {
			l.TextScaled = false;
			l.Text = old;
			TweenService.Create(b, new TweenInfo(0.2), { BackgroundColor3: theme.pill }).Play();
		});
	}

	private purchase(itemId: string): void {
		const res = this.buy.InvokeServer(itemId) as { ok: boolean; message: string };
		const card = this.cards.get(itemId);
		if (card && !res.ok) this.flash(card.button, res.message);
	}

	setState(state: ShopState): void {
		this.state = state;
		this.coins.Text = `${math.floor(state.coins)}`;
		for (const item of ShopCatalog.items) {
			const card = this.cards.get(item.id);
			if (!card) continue;
			if (!item.consumable) {
				const owned = state.owned.includes(item.id);
				this.setButtonText(card.button, owned ? "Owned" : `${item.price}`);
				card.button.BackgroundColor3 = owned ? Color3.fromHex("#4b4640") : theme.pill;
			} else if (card.have) {
				card.have.Text = `You have: ${state.counts[item.id] ?? 0}`;
				const left = item.effect.stat !== undefined ? state.buffs[item.effect.stat] : undefined;
				if (left !== undefined && left > 0) card.have.Text += `  ·  ${math.floor(left / 60)}m left`;
			}
		}
		for (const bundle of ShopCatalog.bundles) {
			const card = this.cards.get(`bundle:${bundle.id}`);
			if (!card) continue;
			const owned = state.owned.includes(`bundle:${bundle.id}`);
			this.setButtonText(card.button, owned ? "Claimed" : `${bundle.price}`);
			card.button.BackgroundColor3 = owned ? Color3.fromHex("#4b4640") : theme.pill;
		}
		for (const item of ShopCatalog.robux) {
			const card = this.cards.get(item.id);
			if (card && item.kind === "gamepass" && state.owned.includes(item.id)) this.setButtonText(card.button, "Owned");
		}
	}

	setOpen(open: boolean): void {
		this.open = open;
		this.gui.Enabled = open;
		if (open) {
			const scale = this.window.FindFirstChildOfClass("UIScale");
			if (scale) {
				const target = scale.Scale;
				scale.Scale = target * 0.85;
				TweenService.Create(scale, new TweenInfo(0.22, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale: target }).Play();
			}
		}
	}

	toggle(): void {
		this.setOpen(!this.open);
	}
}
