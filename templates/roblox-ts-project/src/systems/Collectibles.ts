import { CollectionService, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getRemoteEvent, Remotes } from "shared/net";
import { addCoins, multiplierFor } from "./PlayerData";
import { feed } from "./Survival";
import { playSfx } from "./Audio";

/**
 * Turns matching world prefabs into collectibles with a ProximityPrompt.
 * Collected models fade out and respawn after a delay.
 */
const notify = getRemoteEvent(Remotes.Notify);

function makeCollectible(model: Model): void {
	if (model.FindFirstChildOfClass("ProximityPrompt")) return;
	const anchor = model.FindFirstChildWhichIsA("BasePart");
	if (!anchor) return;
	const prompt = new Instance("ProximityPrompt");
	prompt.ActionText = GameConfig.collectibles.promptText;
	prompt.ObjectText = (model.GetAttribute("Prefab") as string | undefined) ?? "Item";
	prompt.MaxActivationDistance = 12;
	prompt.RequiresLineOfSight = false;
	prompt.HoldDuration = 0.4;
	prompt.Parent = anchor;
	CollectionService.AddTag(model, "Collectible");
	prompt.Triggered.Connect((player) => {
		if (!prompt.Enabled) return;
		prompt.Enabled = false;
		const granted = addCoins(player, GameConfig.collectibles.rewardCoins);
		feed(player, multiplierFor(player, "food"));
		playSfx(player, "collect");
		notify.FireClient(player, `+${granted} ${GameConfig.currency.name}`);
		const parts = model.GetDescendants().filter((d): d is BasePart => d.IsA("BasePart"));
		const original = parts.map((p) => p.Transparency);
		for (const p of parts) p.Transparency = 1;
		task.delay(GameConfig.collectibles.respawnSeconds, () => {
			parts.forEach((p, i) => (p.Transparency = original[i]));
			prompt.Enabled = true;
		});
	});
}

export function start(): void {
	if (!GameConfig.collectibles.enabled) return;
	const world = Workspace.WaitForChild("World", 60);
	if (!world) return;
	const scan = () => {
		for (const child of world.GetDescendants()) {
			if (!child.IsA("Model")) continue;
			const prefab = child.GetAttribute("Prefab") as string | undefined;
			if (prefab !== undefined && (GameConfig.collectibles.prefabs as readonly string[]).includes(prefab)) makeCollectible(child);
		}
	};
	if (Workspace.GetAttribute("WorldReady") === true) scan();
	Workspace.GetAttributeChangedSignal("WorldReady").Connect(() => {
		if (Workspace.GetAttribute("WorldReady") === true) scan();
	});
}
