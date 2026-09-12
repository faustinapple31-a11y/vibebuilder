import { UserInputService, Workspace } from "@rbxts/services";
import { Remotes, waitRemoteEvent, type PlayerStats, type ShopState } from "shared/net";
import { Hud } from "ui/Hud";
import { AudioConfig } from "shared/audio";
import { ShopUi } from "ui/ShopUi";

/** Client bootstrap: HUD, shop window, NPC dialogue, SFX, world loading overlay. */
const hud = new Hud();
const shop = new ShopUi();
hud.onShop = () => shop.toggle();
UserInputService.InputBegan.Connect((input, processed) => {
	if (!processed && input.KeyCode === Enum.KeyCode.B) shop.toggle();
});
waitRemoteEvent(Remotes.StatsChanged).OnClientEvent.Connect((stats) => hud.setStats(stats as PlayerStats));
waitRemoteEvent(Remotes.Notify).OnClientEvent.Connect((text) => hud.notify(text as string));
waitRemoteEvent(Remotes.ShopState).OnClientEvent.Connect((state) => shop.setState(state as ShopState));
waitRemoteEvent(Remotes.NpcTalk).OnClientEvent.Connect((name, text) => hud.say(name as string, text as string));
// accepts a resolved sound id or an AudioConfig.sfx key ("collect", "purchase", …)
waitRemoteEvent(Remotes.PlaySfx).OnClientEvent.Connect((id) => {
	const key = id as string;
	const sfx = AudioConfig.sfx as Record<string, string | undefined>;
	hud.playSfx(sfx[key] ?? key);
});
waitRemoteEvent(Remotes.WorldProgress).OnClientEvent.Connect((stage, done, total) => hud.setLoading(stage as string, done as number, total as number));

const ready = () => hud.hideLoading();
if (Workspace.GetAttribute("WorldReady") === true) ready();
else {
	const conn = Workspace.GetAttributeChangedSignal("WorldReady").Connect(() => {
		if (Workspace.GetAttribute("WorldReady") === true) {
			conn.Disconnect();
			ready();
		}
	});
	task.delay(45, ready);
}
