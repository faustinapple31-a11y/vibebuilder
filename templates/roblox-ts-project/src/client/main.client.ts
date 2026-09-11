import { Workspace } from "@rbxts/services";
import { Remotes, waitRemoteEvent, type PlayerStats } from "shared/net";
import { Hud } from "ui/Hud";

/** Client bootstrap: HUD + world loading overlay. */
const hud = new Hud();
waitRemoteEvent(Remotes.StatsChanged).OnClientEvent.Connect((stats) => hud.setStats(stats as PlayerStats));
waitRemoteEvent(Remotes.Notify).OnClientEvent.Connect((text) => hud.notify(text as string));
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
