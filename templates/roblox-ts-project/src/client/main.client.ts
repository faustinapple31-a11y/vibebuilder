import { Players, RunService, UserInputService, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { Remotes, waitRemoteEvent, type PlayerStats, type RoundStateMsg, type ShopState } from "shared/net";
import { Hud } from "ui/Hud";
import { AudioConfig } from "shared/audio";
import { ShopUi } from "ui/ShopUi";
import { startWeather } from "client/Weather";
import { startMeshRender } from "client/MeshRender";

/** Client bootstrap: HUD, shop window, NPC dialogue, SFX, world loading overlay. */
const hud = new Hud();
const shop = new ShopUi();
hud.onShop = () => shop.toggle();
startWeather();
startMeshRender();
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
waitRemoteEvent(Remotes.HudValue).OnClientEvent.Connect((key, label, value) => hud.setValue(key as string, label as string, value as string));
waitRemoteEvent(Remotes.RoundState).OnClientEvent.Connect((msg) => {
	const m = msg as RoundStateMsg;
	const mm = math.floor(m.secondsLeft / 60);
	const ss = m.secondsLeft % 60;
	const timer = m.secondsLeft > 0 ? `  ${mm}:${string.format("%02d", ss)}` : "";
	hud.setBanner(`${m.message}${timer}`);
	if (m.scores) {
		const parts: string[] = [];
		for (const [k, v] of pairs(m.scores)) if ((k as string).sub(1, 5) === "team_") parts.push(`${(k as string).sub(6).upper()} ${v}`);
		if (parts.size() > 0) hud.setValue("score", "Score", parts.join("  ·  "));
	}
});
waitRemoteEvent(Remotes.Fx).OnClientEvent.Connect((kindRaw, position) => {
	// lightweight client effects: a short-lived neon sphere at the hit point
	const kind = kindRaw as string;
	if (!typeIs(position, "Vector3")) return;
	const p = new Instance("Part");
	p.Shape = Enum.PartType.Ball;
	p.Size = new Vector3(1.2, 1.2, 1.2);
	p.Material = Enum.Material.Neon;
	p.Color = kind === "hit" ? Color3.fromRGB(255, 120, 60) : kind === "goal" ? Color3.fromRGB(120, 255, 120) : Color3.fromRGB(120, 200, 255);
	p.Anchored = true;
	p.CanCollide = false;
	p.CFrame = new CFrame(position);
	p.Parent = Workspace;
	task.delay(0.25, () => p.Destroy());
});

// ---- hotkeys: V vehicle, P hatch, Q/F abilities, Shift sprint, R rebirth, double jump (parkour)
const action = waitRemoteEvent(Remotes.Action);
let jumpCount = 0;
UserInputService.InputBegan.Connect((input, processed) => {
	if (processed) return;
	if (input.KeyCode === Enum.KeyCode.V) action.FireServer("spawn_vehicle");
	else if (input.KeyCode === Enum.KeyCode.P) action.FireServer("hatch");
	else if (input.KeyCode === Enum.KeyCode.Q) action.FireServer("ability_dash");
	else if (input.KeyCode === Enum.KeyCode.F) action.FireServer("ability_slam");
	else if (input.KeyCode === Enum.KeyCode.LeftShift) action.FireServer("sprint");
	else if (input.KeyCode === Enum.KeyCode.R) action.FireServer("rebirth");
	else if (input.KeyCode === Enum.KeyCode.Space && GameConfig.systems.includes("parkour")) {
		jumpCount += 1;
		if (jumpCount === 2) action.FireServer("double_jump");
	}
});
UserInputService.InputEnded.Connect((input) => {
	if (input.KeyCode === Enum.KeyCode.Space) task.delay(0.9, () => (jumpCount = 0));
});
// sandbox building: click to place / right-click to remove a block at the mouse hit
if (GameConfig.systems.includes("building")) {
	const mouse = Players.LocalPlayer.GetMouse();
	mouse.Button1Down.Connect(() => {
		const hit = mouse.Hit;
		if (hit) action.FireServer("place_block", hit.Position.X, hit.Position.Y, hit.Position.Z, "#c8a060");
	});
	mouse.Button2Down.Connect(() => {
		const t = mouse.Target;
		if (t && t.GetAttribute("Owner") === Players.LocalPlayer.UserId) action.FireServer("remove_block", t.Position.X, t.Position.Y, t.Position.Z);
	});
}

// ---- health bar + camera mode
const player = Players.LocalPlayer;
player.CharacterAdded.Connect((char) => {
	const hum = char.WaitForChild("Humanoid") as Humanoid;
	hud.setHealth(1);
	hum.HealthChanged.Connect((h) => hud.setHealth(h / hum.MaxHealth));
	if (GameConfig.camera === "first_person") {
		player.CameraMode = Enum.CameraMode.LockFirstPerson;
	} else if (GameConfig.camera === "top_down") {
		const cam = Workspace.CurrentCamera!;
		cam.CameraType = Enum.CameraType.Scriptable;
		RunService.RenderStepped.Connect(() => {
			const root = char.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
			if (root) cam.CFrame = CFrame.lookAt(root.Position.add(new Vector3(0, 70, 34)), root.Position);
		});
	}
});
if (player.Character) hud.setHealth(1);

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
