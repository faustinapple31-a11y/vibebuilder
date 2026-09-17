import { MarketplaceService, Players } from "@rbxts/services";
import { ShopCatalog, type RobuxItem, type ShopEffect, type ShopItem } from "shared/catalog";
import { getRemoteEvent, getRemoteFunction, Remotes, type ShopState } from "shared/net";
import * as PlayerData from "./PlayerData";

/**
 * Shop server: coins purchases are validated here (never trust the client), Robux items go through
 * MarketplaceService (game passes: ownership check; developer products: ProcessReceipt with idempotent
 * receipt handling). Effects are applied to the profile: permanent multipliers, timed buffs, coin grants.
 */
const shopChanged = getRemoteEvent(Remotes.ShopState);
const notify = getRemoteEvent(Remotes.Notify);
const buy = getRemoteFunction(Remotes.ShopBuy);
const promptRobux = getRemoteFunction(Remotes.ShopPromptRobux);
const processed = new Set<string>();

function itemById(id: string): ShopItem | undefined {
	return ShopCatalog.items.find((i) => i.id === id);
}
function robuxById(id: string): RobuxItem | undefined {
	return ShopCatalog.robux.find((i) => i.id === id);
}

export function stateFor(player: Player): ShopState {
	const p = PlayerData.getProfile(player);
	const owned: string[] = [];
	const counts: Record<string, number> = {};
	const buffs: Record<string, number> = {};
	if (p) {
		for (const id of p.owned) owned.push(id);
		for (const [id, n] of pairs(p.inventory)) counts[id as string] = n as number;
		const now = os.time();
		for (const [stat, b] of pairs(p.buffs)) {
			const bb = b as { value: number; until: number };
			if (bb.until > now) buffs[stat as string] = bb.until - now;
		}
	}
	return { coins: p?.coins ?? 0, owned, counts, buffs };
}

export function replicate(player: Player): void {
	shopChanged.FireClient(player, stateFor(player));
}

/** Applies an effect to the player's profile. */
export function applyEffect(player: Player, itemId: string, effect: ShopEffect, consumable: boolean): void {
	const p = PlayerData.getProfile(player);
	if (!p) return;
	switch (effect.type) {
		case "multiplier": {
			const stat = effect.stat ?? "coins";
			p.multipliers[stat] = math.max(p.multipliers[stat] ?? 1, effect.value);
			if (!consumable && !p.owned.includes(itemId)) p.owned.push(itemId);
			break;
		}
		case "buff": {
			const stat = effect.stat ?? "luck";
			const now = os.time();
			const cur = p.buffs[stat];
			const base = cur && cur.until > now ? cur.until : now;
			p.buffs[stat] = { value: effect.value, until: base + effect.durationSeconds };
			break;
		}
		case "grant_coins":
			p.coins += effect.value;
			break;
		case "grant_item": {
			const item = effect.item ?? itemId;
			p.inventory[item] = (p.inventory[item] ?? 0) + math.max(1, math.floor(effect.value));
			break;
		}
		case "cosmetic":
			if (!p.owned.includes(itemId)) p.owned.push(itemId);
			break;
	}
	if (consumable) p.inventory[itemId] = (p.inventory[itemId] ?? 0) + 1;
	PlayerData.replicate(player);
	replicate(player);
}

function purchaseBundle(player: Player, bundleId: string): { ok: boolean; message: string } {
	const bundle = ShopCatalog.bundles.find((b) => b.id === bundleId);
	const p = PlayerData.getProfile(player);
	if (!bundle || !p) return { ok: false, message: "unknown pack" };
	const key = `bundle:${bundle.id}`;
	if (p.owned.includes(key)) return { ok: false, message: "already claimed" };
	if (p.coins < bundle.price) return { ok: false, message: `Need $ ${bundle.price}` };
	p.coins -= bundle.price;
	p.owned.push(key);
	for (const entry of bundle.items) {
		const item = itemById(entry.itemId);
		if (!item) continue;
		if (!item.consumable) {
			if (!p.owned.includes(item.id)) applyEffect(player, item.id, item.effect, false);
			continue;
		}
		for (let i = 0; i < entry.count; i++) applyEffect(player, item.id, item.effect, true);
	}
	notify.FireClient(player, `${bundle.name} claimed!`);
	replicate(player);
	return { ok: true, message: `Claimed ${bundle.name}` };
}

function purchase(player: Player, itemId: unknown): { ok: boolean; message: string } {
	if (!typeIs(itemId, "string")) return { ok: false, message: "bad item" };
	if (itemId.sub(1, 7) === "bundle:") return purchaseBundle(player, itemId.sub(8));
	const item = itemById(itemId);
	const p = PlayerData.getProfile(player);
	if (!item || !p) return { ok: false, message: "unknown item" };
	if (!item.consumable && p.owned.includes(item.id)) return { ok: false, message: "already owned" };
	if (p.coins < item.price) return { ok: false, message: `Need $ ${item.price}` };
	p.coins -= item.price;
	applyEffect(player, item.id, item.effect, item.consumable);
	notify.FireClient(player, `Bought ${item.name}!`);
	return { ok: true, message: `Bought ${item.name}` };
}

/** Client asks to prompt a Robux purchase; the server chooses the right MarketplaceService prompt. */
function prompt(player: Player, itemId: unknown): { ok: boolean; message: string } {
	if (!typeIs(itemId, "string")) return { ok: false, message: "bad item" };
	const item = robuxById(itemId);
	if (!item) return { ok: false, message: "unknown item" };
	if (item.robloxId <= 0) return { ok: false, message: `${item.name} is not published on Roblox yet (create it in WorldForge → Game → Monetization)` };
	if (item.kind === "gamepass") MarketplaceService.PromptGamePassPurchase(player, item.robloxId);
	else MarketplaceService.PromptProductPurchase(player, item.robloxId);
	return { ok: true, message: "prompted" };
}

/** Grants owned game passes on join (and re-checks after a purchase prompt closes). */
export function syncGamePasses(player: Player): void {
	const p = PlayerData.getProfile(player);
	if (!p) return;
	for (const item of ShopCatalog.robux) {
		if (item.kind !== "gamepass" || item.robloxId <= 0 || p.owned.includes(item.id)) continue;
		const [ok, owns] = pcall(() => MarketplaceService.UserOwnsGamePassAsync(player.UserId as unknown as User, item.robloxId));
		if (ok && owns) {
			if (item.effect) applyEffect(player, item.id, item.effect, false);
			else p.owned.push(item.id);
		}
	}
	replicate(player);
}

export function start(): void {
	buy.OnServerInvoke = (player, itemId) => purchase(player, itemId);
	promptRobux.OnServerInvoke = (player, itemId) => prompt(player, itemId);

	MarketplaceService.PromptGamePassPurchaseFinished.Connect((player, passId, purchased) => {
		if (!purchased) return;
		const item = ShopCatalog.robux.find((i) => i.kind === "gamepass" && i.robloxId === passId);
		if (item) {
			if (item.effect) applyEffect(player, item.id, item.effect, false);
			notify.FireClient(player, `Thanks for buying ${item.name}!`);
		}
		replicate(player);
	});

	MarketplaceService.ProcessReceipt = (receipt) => {
		const key = `${receipt.PlayerId}_${receipt.PurchaseId}`;
		if (processed.has(key)) return Enum.ProductPurchaseDecision.PurchaseGranted;
		const player = Players.GetPlayerByUserId(receipt.PlayerId);
		const item = ShopCatalog.robux.find((i) => i.kind === "product" && i.robloxId === receipt.ProductId);
		if (!player || !item) return Enum.ProductPurchaseDecision.NotProcessedYet;
		if (item.effect) applyEffect(player, item.id, item.effect, true);
		processed.add(key);
		PlayerData.save(player);
		notify.FireClient(player, `Thanks for buying ${item.name}!`);
		return Enum.ProductPurchaseDecision.PurchaseGranted;
	};

	Players.PlayerAdded.Connect((player) => {
		task.defer(() => {
			syncGamePasses(player);
			replicate(player);
		});
	});
	for (const player of Players.GetPlayers()) task.defer(() => syncGamePasses(player));
}
