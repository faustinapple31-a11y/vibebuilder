import { ShopCatalog } from "shared/catalog";
import type { ProfileStateMsg, ShopState } from "shared/net";
import { abbreviate, acquirePop, body, card, celebrate, cursorGlare, emptyIllustration, hoverable, input, itemIcon, panel, prettyName, progressBar, rarityFrame, RARITY_NAMES, resourceIcon, sectionHeader, stroke, tabs, text, textOnGradient, theme, tooltip, Window, type TabsHandle } from "./kit";
import { fmt, L } from "./strings.generated";

/**
 * Inventory screen: the resources of the profile (crafting / farming / mining / survival items) as a
 * grid of tiles with counts, the shop consumables the player still holds, the permanently owned
 * upgrades and the buffs currently running (with their remaining time). Everything comes from the
 * replicated profile (ProfileState) and the shop state, so it is always the server's truth.
 */
const TILE = 96;
const PER_ROW = 5;

export class Inventory {
	private win: Window;
	private tabs: TabsHandle;
	private search: TextBox;
	/** 0 = all, 1 = resources, 2 = shop items, 3 = upgrades */
	private tab = 0;
	private filter = "";
	private profile: ProfileStateMsg = { coins: 0, inventory: {}, owned: [], stats: {}, quests: {} };
	private shop: ShopState = { coins: 0, owned: [], counts: {}, buffs: {} };
	/** last counts, so a tile that just grew can pop with its gain */
	private lastCounts = new Map<string, number>();
	/** longest seen duration per buff, to draw its countdown */
	private buffMax = new Map<string, number>();

	constructor() {
		this.win = new Window("Inventory", L.inventory, { width: 620, height: 600, displayOrder: 6 });
		// tabs + search live above the scrolling body, so the body only holds the current category
		this.win.body.Size = new UDim2(1, -36, 1, -140);
		this.win.body.Position = new UDim2(0, 18, 0, 124);
		this.search = input(L.search, new UDim2(0, 210, 0, 34), new UDim2(1, -228, 0, 80), this.win.window, (value) => {
			this.filter = value.lower();
			if (this.win.open) this.render();
		});
		this.tabs = tabs([L.all, L.resources, L.items, L.upgrades], new UDim2(0, 350, 0, 34), new UDim2(0, 20, 0, 80), this.win.window, (index) => {
			this.tab = index;
			if (this.win.open) this.render();
		});
		this.win.onOpen = () => this.render();
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

	setProfile(state: ProfileStateMsg): void {
		this.profile = state;
		this.win.setCoins(state.coins);
		this.refreshTabCounts();
		if (this.win.open) this.render();
	}

	/** "Resources 12" — how much each category holds, on the tab itself. */
	private refreshTabCounts(): void {
		let resources = 0;
		for (const [id, count] of pairs(this.profile.inventory)) {
			if ((count as number) > 0 && !ShopCatalog.items.some((i) => i.id === (id as string))) resources += 1;
		}
		let items = 0;
		for (const [, count] of pairs(this.shop.counts)) if ((count as number) > 0) items += 1;
		const upgrades = this.profile.owned.filter((id) => id.sub(1, 7) !== "bundle:").size();
		const labels = [`${L.all}`, `${L.resources} ${resources}`, `${L.items} ${items}`, `${L.upgrades} ${upgrades}`];
		this.tabs.buttons.forEach((b, i) => {
			const label = b.FindFirstChild("Label") as TextLabel | undefined;
			if (label) label.Text = labels[i]!;
		});
	}

	setShopState(state: ShopState): void {
		this.shop = state;
		this.refreshTabCounts();
		if (this.win.open) this.render();
	}

	/** Search box + the active tab decide what a category shows. */
	private shows(category: number, id: string, name: string): boolean {
		if (this.tab !== 0 && this.tab !== category) return false;
		if (this.filter === "") return true;
		return id.lower().find(this.filter, 1, true)[0] !== undefined || name.lower().find(this.filter, 1, true)[0] !== undefined;
	}

	private render(): void {
		this.win.clearBody();
		this.win.setCoins(this.profile.coins);
		let order = 0;

		// ---- resources: everything in Profile.inventory that is not a shop consumable
		const resources: { id: string; count: number }[] = [];
		for (const [id, count] of pairs(this.profile.inventory)) {
			const key = id as string;
			if (count <= 0) continue;
			if (ShopCatalog.items.some((i) => i.id === key)) continue;
			if (!this.shows(1, key, prettyName(key))) continue;
			resources.push({ id: key, count: count as number });
		}
		resources.sort((a, b) => a.id < b.id);
		if (this.tab === 0 || this.tab === 1) sectionHeader(L.resources, this.win.body, order++);
		if (resources.size() === 0 && (this.tab === 0 || this.tab === 1)) {
			const empty = card(104, order++, this.win.body);
			const crate = emptyIllustration(64, empty);
			crate.Position = new UDim2(0.5, -32, 0, 6);
			body(L.emptyBackpack, new UDim2(1, -24, 0, 30), new UDim2(0, 12, 1, -34), empty, { size: 15, align: Enum.TextXAlignment.Center, zIndex: 5 });
		} else if (resources.size() > 0) {
			this.tileGrid(resources.map((r) => ({ id: r.id, count: r.count, consumable: false })), order++);
		}

		// ---- shop consumables still owned
		const consumables: { id: string; count: number; consumable: boolean }[] = [];
		for (const [id, count] of pairs(this.shop.counts)) {
			if ((count as number) <= 0) continue;
			const key = id as string;
			const item = ShopCatalog.items.find((i) => i.id === key);
			if (!this.shows(2, key, item?.name ?? prettyName(key))) continue;
			consumables.push({ id: key, count: count as number, consumable: true });
		}
		if (consumables.size() > 0) {
			sectionHeader(L.consumables, this.win.body, order++);
			this.tileGrid(consumables, order++);
		}

		// ---- permanent upgrades / passes
		const owned = this.profile.owned.filter((id) => {
			if (id.sub(1, 7) === "bundle:") return false;
			const item = ShopCatalog.items.find((i) => i.id === id) ?? ShopCatalog.robux.find((i) => i.id === id);
			return this.shows(3, id, item?.name ?? prettyName(id));
		});
		if (owned.size() > 0) {
			sectionHeader(L.upgrades, this.win.body, order++);
			for (const id of owned) {
				const item = ShopCatalog.items.find((i) => i.id === id) ?? ShopCatalog.robux.find((i) => i.id === id);
				const row = card(62, order++, this.win.body, theme.primary);
				const icon = item ? itemIcon(item, 40, row) : resourceIcon(id, 40, row);
				icon.Position = new UDim2(0, 12, 0.5, -20);
				text(item?.name ?? prettyName(id), new UDim2(1, -180, 0, 30), new UDim2(0, 62, 0, 8), row, { size: 22, color: textOnGradient(theme.primary), zIndex: 6 });
				body(item?.description ?? L.owned, new UDim2(1, -180, 0, 20), new UDim2(0, 62, 0, 36), row, { size: 13, color: textOnGradient(theme.primary), zIndex: 6 });
				const tag = panel(new UDim2(0, 96, 0, 34), new UDim2(1, -110, 0.5, -17), row, { color: theme.pill, strokeColor: theme.pillStroke, radius: 10, shadow: false, zIndex: 6 });
				text(L.owned.upper(), new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), tag, { size: 15, align: Enum.TextXAlignment.Center, zIndex: 7, outline: 1.5 });
			}
		}

		// ---- running buffs
		const buffs: { stat: string; seconds: number }[] = [];
		for (const [stat, seconds] of pairs(this.shop.buffs)) if ((seconds as number) > 0) buffs.push({ stat: stat as string, seconds: seconds as number });
		if (buffs.size() > 0) {
			sectionHeader(L.activeBuffs, this.win.body, order++);
			for (const buff of buffs) {
				const row = card(56, order++, this.win.body, theme.info);
				const icon = resourceIcon(buff.stat, 34, row);
				icon.Position = new UDim2(0, 12, 0.5, -17);
				text(prettyName(buff.stat), new UDim2(1, -200, 1, 0), new UDim2(0, 56, 0, 0), row, { size: 20, color: textOnGradient(theme.info), zIndex: 6 });
				const mm = math.floor(buff.seconds / 60);
				const ss = math.floor(buff.seconds % 60);
				text(fmt(L.timeLeft, { time: `${mm}:${string.format("%02d", ss)}` }), new UDim2(0, 140, 0, 26), new UDim2(1, -152, 0, 6), row, { size: 17, align: Enum.TextXAlignment.Right, color: textOnGradient(theme.info), zIndex: 6 });
				// how much of the buff is left: the longest duration seen is its full bar
				const longest = math.max(this.buffMax.get(buff.stat) ?? 0, buff.seconds);
				this.buffMax.set(buff.stat, longest);
				const bar = progressBar(new UDim2(0, 130, 0, 8), new UDim2(1, -146, 0, 36), row, theme.gold, 7, false);
				bar.set(buff.seconds / math.max(1, longest));
				bar.label.Text = "";
			}
		}
	}

	/** Rows of square tiles: icon, count badge, name under it. */
	private tileGrid(entries: { id: string; count: number; consumable: boolean }[], order: number): void {
		const rows = math.ceil(entries.size() / PER_ROW);
		const holder = new Instance("Frame");
		holder.Size = new UDim2(1, 0, 0, rows * (TILE + 34) + 6);
		holder.BackgroundTransparency = 1;
		holder.LayoutOrder = order;
		holder.ZIndex = 3;
		holder.Parent = this.win.body;
		entries.forEach((entry, index) => {
			const col = index % PER_ROW;
			const row = math.floor(index / PER_ROW);
			const item = ShopCatalog.items.find((i) => i.id === entry.id);
			const tile = new Instance("Frame");
			tile.Size = new UDim2(0, TILE, 0, TILE);
			tile.Position = new UDim2(0, col * (TILE + 14) + 4, 0, row * (TILE + 34));
			tile.BackgroundColor3 = theme.tile;
			tile.BorderSizePixel = 0;
			tile.ZIndex = 4;
			const c = new Instance("UICorner");
			c.CornerRadius = new UDim(0, 14);
			c.Parent = tile;
			stroke(tile, theme.tileStroke, 3);
			tile.Parent = holder;
			// rarity from the shop price (or the stack size for a raw resource): the library's ramp
			const price = item?.price ?? 0;
			const tier = price >= 250 ? 4 : price >= 100 ? 3 : price >= 40 ? 2 : price > 0 ? 1 : entry.count >= 50 ? 2 : entry.count >= 10 ? 1 : 0;
			const rarity = rarityFrame(tile, tier);
			hoverable(tile);
			cursorGlare(tile);
			const icon = item ? itemIcon(item, 52, tile) : resourceIcon(entry.id, 52, tile);
			icon.Position = new UDim2(0.5, -26, 0, 14);
			icon.ZIndex = 6;
			const count = panel(new UDim2(0, 40, 0, 26), new UDim2(1, -44, 1, -30), tile, { color: theme.pill, strokeColor: theme.pillStroke, radius: 9, shadow: false, zIndex: 7 });
			text(abbreviate(entry.count), new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), count, { size: 16, align: Enum.TextXAlignment.Center, zIndex: 8, outline: 1.5 });
			// the tile pops when the stack grew since the last render
			const before = this.lastCounts.get(entry.id);
			if (before !== undefined && entry.count > before) {
				acquirePop(tile, `+${abbreviate(entry.count - before)}`);
				// a legendary drop deserves the library's celebration, not just a pop
				if (tier >= 4) celebrate(this.win.window, new UDim2(0.5, 0, 0.45, 0));
			}
			this.lastCounts.set(entry.id, entry.count);
			const name = item?.name ?? prettyName(entry.id);
			// the name under the tile takes the rarity colour from "rare" up
			body(name, new UDim2(0, TILE + 10, 0, 28), new UDim2(0, col * (TILE + 14) - 1, 0, row * (TILE + 34) + TILE + 2), holder, { size: 13, align: Enum.TextXAlignment.Center, valign: Enum.TextYAlignment.Top, color: tier >= 2 ? rarity : undefined, zIndex: 5 });
			tooltip(tile, `${name}  ·  ${RARITY_NAMES[tier]}`, item?.description ?? (entry.consumable ? L.consumable : L.resource), this.win.gui);
		});
	}
}
