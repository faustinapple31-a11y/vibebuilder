/**
 * Shop & monetization catalog — generated from design/game.spec.json by WorldForge (editable).
 * Coins items are bought with the in-game currency; Robux items reference game passes / developer
 * products created through Open Cloud (ids filled in by the app after creation).
 */
export type ShopEffectType = "multiplier" | "buff" | "grant_coins" | "grant_item" | "cosmetic";

export interface ShopEffect {
	type: ShopEffectType;
	stat?: string;
	value: number;
	durationSeconds: number;
	item?: string;
}

export interface ShopItem {
	id: string;
	name: string;
	description: string;
	section: string;
	price: number;
	consumable: boolean;
	effect: ShopEffect;
	iconAssetId?: number;
	color?: string;
}

export interface RobuxItem {
	id: string;
	name: string;
	description: string;
	priceRobux: number;
	/** Game pass id or developer product id on Roblox (0 = not created yet). */
	robloxId: number;
	kind: "gamepass" | "product";
	iconAssetId?: number;
	effect?: ShopEffect;
}

/** One-time discounted pack of catalog items (owned as "bundle:<id>"). */
export interface ShopBundle {
	id: string;
	name: string;
	description: string;
	items: { itemId: string; count: number }[];
	price: number;
	originalPrice?: number;
	badge?: string;
}

export const ShopCatalog = {
	title: "Shop",
	sections: [{"id":"upgrades","title":"Upgrades"},{"id":"potions","title":"Potions"}] as { id: string; title: string }[],
	items: [
		{ id: "x2_coins", name: "x2 Coins", description: "Permanently DOUBLE all the coins you earn!", section: "upgrades", price: 250, consumable: false, effect: { type: "multiplier", stat: "coins", value: 2, durationSeconds: 0 }, color: "#c9a24a" },
		{ id: "x2_food", name: "x2 Food", description: "Permanently DOUBLE the food you collect!", section: "upgrades", price: 180, consumable: false, effect: { type: "multiplier", stat: "food", value: 2, durationSeconds: 0 }, color: "#d9743a" },
		{ id: "fast_hands", name: "Fast Hands", description: "Collect twice as fast!", section: "upgrades", price: 320, consumable: false, effect: { type: "multiplier", stat: "speed", value: 2, durationSeconds: 0 }, color: "#5b4a8f" },
		{ id: "luck_boost", name: "Luck Boost", description: "Doubles ALL your luck for 15 minutes — rarer finds and drops.", section: "potions", price: 32, consumable: true, effect: { type: "buff", stat: "luck", value: 2, durationSeconds: 900 }, color: "#4a9a4a" },
		{ id: "ultra_luck", name: "Ultra Luck Boost", description: "Quadruples ALL your luck (x4) for 10 minutes — the strongest luck surge.", section: "potions", price: 60, consumable: true, effect: { type: "buff", stat: "luck", value: 4, durationSeconds: 600 }, color: "#8a3fbf" },
	] as ShopItem[],
	robux: [
		{ id: "vip", name: "VIP", description: "VIP tag, +25% coins and a golden lantern.", priceRobux: 199, robloxId: 0, kind: "gamepass", effect: { type: "multiplier", stat: "coins", value: 1.25, durationSeconds: 0 } },
		{ id: "coins_1000", name: "1,000 coins", description: "A pouch of 1,000 coins.", priceRobux: 99, robloxId: 0, kind: "product", effect: { type: "grant_coins", value: 1000, durationSeconds: 0 } },
		{ id: "gem_pack", name: "Gem pack", description: "A pack of rare gems.", priceRobux: 49, robloxId: 0, kind: "product", effect: { type: "grant_coins", value: 400, durationSeconds: 0 } },
	] as RobuxItem[],
	bundles: [{"id":"starter","name":"Starter Pack","description":"One-time offer — everything you need to start strong!","items":[{"itemId":"x2_coins","count":1},{"itemId":"fast_hands","count":1},{"itemId":"luck_boost","count":3},{"itemId":"ultra_luck","count":1}],"price":99,"badge":"-85%"}] as ShopBundle[],
	featured: {"itemId":"luck_boost","headline":"BOOST Your Luck!","note":"Lasts for 15 minutes, stackable"} as { itemId: string; headline: string; note: string } | undefined,
} as const;
