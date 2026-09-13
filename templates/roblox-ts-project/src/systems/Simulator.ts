import { Players, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getRemoteEvent, Remotes } from "shared/net";
import { findZones } from "shared/zones";
import * as PlayerData from "./PlayerData";
import * as Progression from "./Progression";

/**
 * Simulator / clicker loop: a "Collect" tool fills the backpack (click value × pet/upgrade
 * multipliers), a sell zone at the plaza turns it into coins, upgrades raise click value and
 * backpack size, rebirth resets them for a permanent multiplier. Also serves the clicker genre
 * (tap anywhere with the tool).
 */
const cfg = GameConfig.simulator;
const notify = getRemoteEvent(Remotes.Notify);
const hudValue = getRemoteEvent(Remotes.HudValue);
const action = getRemoteEvent(Remotes.Action);

function backpack(player: Player): number {
	return PlayerData.getStat(player, "backpack");
}
function backpackMax(player: Player): number {
	return cfg.backpackSize * (1 + PlayerData.getStat(player, "sim_backpack_tier"));
}
function clickValue(player: Player): number {
	return cfg.clickValue * (1 + PlayerData.getStat(player, "sim_click_tier")) * (1 + PlayerData.getStat(player, "Rebirths") * 0.5) * PlayerData.multiplierFor(player, "coins");
}

function refresh(player: Player): void {
	hudValue.FireClient(player, "backpack", "Backpack", `${math.floor(backpack(player))} / ${backpackMax(player)}`);
	hudValue.FireClient(player, "rebirths", "Rebirths", `${PlayerData.getStat(player, "Rebirths")}`);
}

function collect(player: Player): void {
	const cur = backpack(player);
	const max = backpackMax(player);
	if (cur >= max) {
		notify.FireClient(player, "Backpack full — sell at the plaza!");
		return;
	}
	PlayerData.setStat(player, "backpack", math.min(max, cur + clickValue(player)));
	refresh(player);
}

function sell(player: Player): void {
	const cur = backpack(player);
	if (cur <= 0) return;
	PlayerData.setStat(player, "backpack", 0);
	const coins = PlayerData.addCoins(player, math.floor(cur * cfg.sellMultiplier));
	notify.FireClient(player, `Sold for ${coins} ${GameConfig.currency.name}`);
	Progression.grantXp(player, GameConfig.progression.xpPerAction);
	Progression.progressQuest(player, "collect", "any", math.floor(cur));
	refresh(player);
}

function upgrade(player: Player, which: "click" | "backpack"): void {
	const key = which === "click" ? "sim_click_tier" : "sim_backpack_tier";
	const tier = PlayerData.getStat(player, key);
	const cost = cfg.upgradeCosts[tier];
	if (cost === undefined) {
		notify.FireClient(player, "Max tier reached");
		return;
	}
	const prof = PlayerData.getProfile(player);
	if (!prof || prof.coins < cost) {
		notify.FireClient(player, `Need ${cost} ${GameConfig.currency.name}`);
		return;
	}
	prof.coins -= cost;
	PlayerData.setStat(player, key, tier + 1);
	PlayerData.replicate(player);
	notify.FireClient(player, `${which === "click" ? "Click power" : "Backpack"} upgraded to tier ${tier + 1}`);
	refresh(player);
}

function rebirth(player: Player): void {
	const prof = PlayerData.getProfile(player);
	if (!prof) return;
	const cost = cfg.rebirthCost * (1 + PlayerData.getStat(player, "Rebirths"));
	if (prof.coins < cost) {
		notify.FireClient(player, `Rebirth costs ${cost} ${GameConfig.currency.name}`);
		return;
	}
	prof.coins = 0;
	PlayerData.setStat(player, "sim_click_tier", 0);
	PlayerData.setStat(player, "sim_backpack_tier", 0);
	PlayerData.setStat(player, "backpack", 0);
	PlayerData.addStat(player, "Rebirths", 1);
	PlayerData.replicate(player);
	notify.FireClient(player, `Rebirth ${PlayerData.getStat(player, "Rebirths")}! Permanent +50% per rebirth.`);
	refresh(player);
}

function giveTool(player: Player): void {
	const bp = player.FindFirstChildOfClass("Backpack");
	if (!bp || bp.FindFirstChild("Collect")) return;
	const tool = new Instance("Tool");
	tool.Name = "Collect";
	tool.RequiresHandle = true;
	tool.CanBeDropped = false;
	const handle = new Instance("Part");
	handle.Name = "Handle";
	handle.Size = new Vector3(1, 1, 3);
	handle.Color = Color3.fromHex("#ffd040");
	handle.Material = Enum.Material.Neon;
	handle.CanCollide = false;
	handle.Parent = tool;
	tool.Activated.Connect(() => collect(player));
	tool.Parent = bp;
}

function makePad(position: Vector3, name: string, color: Color3, label: string, onTouch: (p: Player) => void): void {
	const pad = new Instance("Part");
	pad.Name = name;
	pad.Size = new Vector3(10, 1, 10);
	pad.CFrame = new CFrame(position.add(new Vector3(0, 0.5, 0)));
	pad.Anchored = true;
	pad.Color = color;
	pad.Material = Enum.Material.Neon;
	pad.Parent = Workspace.FindFirstChild("World") ?? Workspace;
	const gui = new Instance("BillboardGui");
	gui.Size = new UDim2(0, 200, 0, 50);
	gui.StudsOffset = new Vector3(0, 5, 0);
	gui.AlwaysOnTop = true;
	gui.Parent = pad;
	const text = new Instance("TextLabel");
	text.Size = new UDim2(1, 0, 1, 0);
	text.BackgroundTransparency = 1;
	text.Font = Enum.Font.GothamBold;
	text.TextScaled = true;
	text.TextColor3 = Color3.fromRGB(255, 255, 255);
	text.TextStrokeTransparency = 0.3;
	text.Text = label;
	text.Parent = gui;
	const debounce = new Map<Player, number>();
	pad.Touched.Connect((hit) => {
		const player = Players.GetPlayerFromCharacter(hit.Parent as Model);
		if (!player) return;
		const now = os.clock();
		if (now - (debounce.get(player) ?? 0) < 1) return;
		debounce.set(player, now);
		onTouch(player);
	});
}

export function start(): void {
	const enabled = GameConfig.systems.includes("simulator_loop") || GameConfig.systems.includes("clicker");
	if (!enabled) return;
	task.spawn(() => {
		while (Workspace.GetAttribute("WorldReady") !== true) task.wait(1);
		const plaza = findZones({ metaKind: "plaza" })[0] ?? findZones({ kind: "settlement" })[0] ?? findZones({ kind: "spawn" })[0];
		const c = plaza ? plaza.position : new Vector3(0, 10, 0);
		const params = new RaycastParams();
		const ground = (x: number, z: number) => Workspace.Raycast(new Vector3(x, c.Y + 60, z), new Vector3(0, -200, 0), params)?.Position.Y ?? c.Y;
		makePad(new Vector3(c.X + 14, ground(c.X + 14, c.Z + 8), c.Z + 8), "SellPad", Color3.fromRGB(80, 220, 120), "SELL", sell);
		makePad(new Vector3(c.X - 14, ground(c.X - 14, c.Z + 8), c.Z + 8), "UpgradeClickPad", Color3.fromRGB(80, 160, 255), "Upgrade click", (p) => upgrade(p, "click"));
		makePad(new Vector3(c.X - 14, ground(c.X - 14, c.Z - 8), c.Z - 8), "UpgradeBackpackPad", Color3.fromRGB(200, 120, 255), "Upgrade backpack", (p) => upgrade(p, "backpack"));
		makePad(new Vector3(c.X + 14, ground(c.X + 14, c.Z - 8), c.Z - 8), "RebirthPad", Color3.fromRGB(255, 140, 60), "REBIRTH", rebirth);
	});
	action.OnServerEvent.Connect((player, name, which) => {
		if (name === "collect") collect(player);
		else if (name === "sell") sell(player);
		else if (name === "upgrade" && (which === "click" || which === "backpack")) upgrade(player, which);
		else if (name === "rebirth") rebirth(player);
	});
	const setup = (player: Player) => {
		player.CharacterAdded.Connect(() => task.defer(() => giveTool(player)));
		if (player.Character) task.defer(() => giveTool(player));
		task.delay(1, () => refresh(player));
	};
	Players.PlayerAdded.Connect(setup);
	for (const p of Players.GetPlayers()) setup(p);
}
