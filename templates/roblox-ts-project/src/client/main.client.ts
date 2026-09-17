import { Players, RunService, SoundService, UserInputService, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { Remotes, waitRemoteEvent, type PlayerStats, type ProfileStateMsg, type RoundStateMsg, type ShopState } from "shared/net";
import { Hud } from "ui/Hud";
import { AudioConfig } from "shared/audio";
import { ShopUi } from "ui/ShopUi";
import { Inventory } from "ui/Inventory";
import { Quests } from "ui/Quests";
import { Crafting } from "ui/Crafting";
import { Leaderboard } from "ui/Leaderboard";
import { Teams } from "ui/Teams";
import { RoundStatus } from "ui/RoundStatus";
import { Settings, uiScaleFactor, type SettingsValues } from "ui/Settings";
import { setUiScale, setUiSoundVolume } from "ui/kit";
import { Minimap } from "ui/Minimap";
import { Menu } from "ui/Menu";
import { L } from "ui/strings.generated";
import { startWeather } from "client/Weather";
import { startMeshRender } from "client/MeshRender";

/**
 * Client bootstrap: HUD, the screens GameConfig.ui.screens enables (shop, inventory, quests, crafting,
 * leaderboard, teams, round status, minimap, settings, menu), NPC dialogue, SFX, loading overlay.
 * Every screen is built on the kit's Window, gets a HUD button (the only way in on touch) and a
 * desktop hotkey.
 */
const screens = GameConfig.ui.screens;
const enabled = (id: string) => screens.includes(id);

const hud = new Hud();
const shop = new ShopUi();
hud.onShop = () => shop.toggle();
const inventory = enabled("inventory") ? new Inventory() : undefined;
const quests = enabled("quests") ? new Quests() : undefined;
const crafting = enabled("crafting") ? new Crafting() : undefined;
const leaderboard = enabled("leaderboard") ? new Leaderboard() : undefined;
const teams = enabled("teams") ? new Teams() : undefined;
const roundStatus = enabled("round_status") ? new RoundStatus() : undefined;
const settings = enabled("settings") ? new Settings() : undefined;
const minimap = enabled("minimap") ? new Minimap() : undefined;
const menu = enabled("menu") ? new Menu() : undefined;

// HUD buttons + menu entries for every enabled screen
if (inventory) {
	hud.addButton(L.backpack, () => inventory.toggle());
	menu?.addEntry(L.backpack, () => inventory.toggle());
}
if (quests) {
	hud.addButton(L.quests, () => quests.toggle());
	menu?.addEntry(L.quests, () => quests.toggle());
}
if (crafting) {
	hud.addButton(L.craft, () => crafting.toggle());
	menu?.addEntry(L.craft, () => crafting.toggle());
}
if (leaderboard) {
	hud.addButton(L.ranking, () => leaderboard.toggle());
	menu?.addEntry(L.ranking, () => leaderboard.toggle());
}
if (teams) {
	hud.addButton(L.teams, () => teams.toggle());
	menu?.addEntry(L.teams, () => teams.toggle());
}
if (settings) {
	hud.addButton(L.settings, () => settings.toggle());
	menu?.addEntry(L.settings, () => settings.toggle());
}
menu?.addEntry(L.shop, () => shop.toggle());
if (menu) hud.addButton(L.menu, () => menu.toggle());

// settings are applied locally and persisted server-side (PlayerData `setting_*`)
let shakeEnabled = true;
function applySettings(values: SettingsValues): void {
	hud.setSfxVolume(values.sfx);
	setUiSoundVolume(values.sfx);
	setUiScale(uiScaleFactor(values.uiscale));
	shakeEnabled = values.shake;
	minimap?.setEnabled(values.minimap);
	// music / ambience are the looped sounds the Audio system parents to SoundService
	for (const sound of SoundService.GetDescendants()) {
		if (sound.IsA("Sound") && sound.Looped) sound.Volume = AudioConfig.musicVolume * values.music;
	}
}
if (settings) {
	settings.onChange = applySettings;
	applySettings(settings.current());
} else {
	minimap?.setEnabled(true);
}
roundStatus?.setEnabled(true);

startWeather();
startMeshRender();
UserInputService.InputBegan.Connect((input, processed) => {
	if (processed) return;
	if (input.KeyCode === Enum.KeyCode.B) shop.toggle();
	else if (input.KeyCode === Enum.KeyCode.I) inventory?.toggle();
	else if (input.KeyCode === Enum.KeyCode.J) quests?.toggle();
	else if (input.KeyCode === Enum.KeyCode.C) crafting?.toggle();
	else if (input.KeyCode === Enum.KeyCode.L) leaderboard?.toggle();
	else if (input.KeyCode === Enum.KeyCode.T) teams?.toggle();
	else if (input.KeyCode === Enum.KeyCode.O) settings?.toggle();
	else if (input.KeyCode === Enum.KeyCode.M) menu?.toggle();
});
waitRemoteEvent(Remotes.ProfileState).OnClientEvent.Connect((state) => {
	const profile = state as ProfileStateMsg;
	inventory?.setProfile(profile);
	quests?.setProfile(profile);
	crafting?.setProfile(profile);
	settings?.setProfile(profile);
});
waitRemoteEvent(Remotes.StatsChanged).OnClientEvent.Connect((stats) => hud.setStats(stats as PlayerStats));
waitRemoteEvent(Remotes.Notify).OnClientEvent.Connect((text) => hud.notify(text as string));
waitRemoteEvent(Remotes.ShopState).OnClientEvent.Connect((state) => {
	shop.setState(state as ShopState);
	inventory?.setShopState(state as ShopState);
});
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
	roundStatus?.setRoundState(m);
	teams?.setRoundState(m);
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
	// short camera shake when the effect lands near the player (Settings → Camera shake).
	// Humanoid.CameraOffset is the shake the default camera script keeps: no CFrame fight.
	const humanoid = Players.LocalPlayer.Character?.FindFirstChildOfClass("Humanoid");
	if (!shakeEnabled || !humanoid) return;
	const root = Players.LocalPlayer.Character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
	const distance = root ? root.Position.sub(position).Magnitude : 999;
	if (distance > 80) return;
	const strength = (1 - distance / 80) * (kind === "hit" ? 0.8 : 0.4);
	task.spawn(() => {
		const base = humanoid.CameraOffset;
		for (let i = 0; i < 8; i++) {
			if (!humanoid.Parent) return;
			const decay = strength * (1 - i / 8);
			humanoid.CameraOffset = base.add(new Vector3((math.random() - 0.5) * decay, (math.random() - 0.5) * decay, 0));
			task.wait(0.03);
		}
		if (humanoid.Parent) humanoid.CameraOffset = base;
	});
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
