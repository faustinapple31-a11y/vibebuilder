import { ShopCatalog } from "shared/catalog";
import type { ProfileStateMsg, ShopState } from "shared/net";
import { body, card, itemIcon, panel, prettyName, resourceIcon, sectionHeader, stroke, text, theme, tooltip, Window } from "./kit";

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
	private profile: ProfileStateMsg = { coins: 0, inventory: {}, owned: [], stats: {}, quests: {} };
	private shop: ShopState = { coins: 0, owned: [], counts: {}, buffs: {} };

	constructor() {
		this.win = new Window("Inventory", "Inventory", { width: 620, height: 600, displayOrder: 6 });
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
		if (this.win.open) this.render();
	}

	setShopState(state: ShopState): void {
		this.shop = state;
		if (this.win.open) this.render();
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
			resources.push({ id: key, count: count as number });
		}
		resources.sort((a, b) => a.id < b.id);
		sectionHeader("Resources", this.win.body, order++);
		if (resources.size() === 0) {
			const empty = card(56, order++, this.win.body);
			body("Nothing yet — gather, farm or mine to fill the backpack.", new UDim2(1, -24, 1, 0), new UDim2(0, 12, 0, 0), empty, { size: 15, align: Enum.TextXAlignment.Center, zIndex: 5 });
		} else {
			this.tileGrid(resources.map((r) => ({ id: r.id, count: r.count, consumable: false })), order++);
		}

		// ---- shop consumables still owned
		const consumables: { id: string; count: number; consumable: boolean }[] = [];
		for (const [id, count] of pairs(this.shop.counts)) {
			if ((count as number) <= 0) continue;
			consumables.push({ id: id as string, count: count as number, consumable: true });
		}
		if (consumables.size() > 0) {
			sectionHeader("Consumables", this.win.body, order++);
			this.tileGrid(consumables, order++);
		}

		// ---- permanent upgrades / passes
		const owned = this.profile.owned.filter((id) => id.sub(1, 7) !== "bundle:");
		if (owned.size() > 0) {
			sectionHeader("Upgrades", this.win.body, order++);
			for (const id of owned) {
				const item = ShopCatalog.items.find((i) => i.id === id) ?? ShopCatalog.robux.find((i) => i.id === id);
				const row = card(62, order++, this.win.body, theme.primary);
				const icon = item ? itemIcon(item, 40, row) : resourceIcon(id, 40, row);
				icon.Position = new UDim2(0, 12, 0.5, -20);
				text(item?.name ?? prettyName(id), new UDim2(1, -180, 0, 30), new UDim2(0, 62, 0, 8), row, { size: 22, zIndex: 6 });
				body(item?.description ?? "Owned", new UDim2(1, -180, 0, 20), new UDim2(0, 62, 0, 36), row, { size: 13, color: theme.text, zIndex: 6 });
				const tag = panel(new UDim2(0, 96, 0, 34), new UDim2(1, -110, 0.5, -17), row, { color: theme.pill, strokeColor: theme.pillStroke, radius: 10, shadow: false, zIndex: 6 });
				text("OWNED", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), tag, { size: 15, align: Enum.TextXAlignment.Center, zIndex: 7, outline: 1.5 });
			}
		}

		// ---- running buffs
		const buffs: { stat: string; seconds: number }[] = [];
		for (const [stat, seconds] of pairs(this.shop.buffs)) if ((seconds as number) > 0) buffs.push({ stat: stat as string, seconds: seconds as number });
		if (buffs.size() > 0) {
			sectionHeader("Active buffs", this.win.body, order++);
			for (const buff of buffs) {
				const row = card(52, order++, this.win.body, theme.info);
				const icon = resourceIcon(buff.stat, 34, row);
				icon.Position = new UDim2(0, 12, 0.5, -17);
				text(prettyName(buff.stat), new UDim2(1, -200, 1, 0), new UDim2(0, 56, 0, 0), row, { size: 20, zIndex: 6 });
				const mm = math.floor(buff.seconds / 60);
				const ss = math.floor(buff.seconds % 60);
				text(`${mm}:${string.format("%02d", ss)} left`, new UDim2(0, 140, 1, 0), new UDim2(1, -152, 0, 0), row, { size: 18, align: Enum.TextXAlignment.Right, zIndex: 6 });
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
			const icon = item ? itemIcon(item, 52, tile) : resourceIcon(entry.id, 52, tile);
			icon.Position = new UDim2(0.5, -26, 0, 14);
			icon.ZIndex = 6;
			const count = panel(new UDim2(0, 40, 0, 26), new UDim2(1, -44, 1, -30), tile, { color: theme.pill, strokeColor: theme.pillStroke, radius: 9, shadow: false, zIndex: 7 });
			text(`${math.floor(entry.count)}`, new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), count, { size: 16, align: Enum.TextXAlignment.Center, zIndex: 8, outline: 1.5 });
			const name = item?.name ?? prettyName(entry.id);
			body(name, new UDim2(0, TILE + 10, 0, 28), new UDim2(0, col * (TILE + 14) - 1, 0, row * (TILE + 34) + TILE + 2), holder, { size: 13, align: Enum.TextXAlignment.Center, valign: Enum.TextYAlignment.Top, zIndex: 5 });
			tooltip(tile, name, item?.description ?? (entry.consumable ? "Consumable" : "Resource"), this.win.gui);
		});
	}
}
