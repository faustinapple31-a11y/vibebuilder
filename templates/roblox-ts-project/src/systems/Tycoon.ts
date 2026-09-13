import { Players, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getRemoteEvent, Remotes } from "shared/net";
import { sortedZones, zoneModel, type ZoneInfo } from "shared/zones";
import * as PlayerData from "./PlayerData";

/**
 * Tycoon: plots laid out by the world generator (`tycoon_plot_N` zones + plot models with a
 * ClaimButton, ButtonPad_1..4, Conveyor and Collector parts). A player claims a plot by stepping on
 * the claim button; each purchased button adds a dropper that spawns coins on the conveyor, the
 * collector pays them out. Owned tiers persist in Profile.stats (tycoon_<plot>_tier).
 */
const cfg = GameConfig.tycoon;
const notify = getRemoteEvent(Remotes.Notify);
const hudValue = getRemoteEvent(Remotes.HudValue);

interface Plot {
	zone: ZoneInfo;
	model: Model;
	owner?: Player;
	tier: number;
	droppers: BasePart[];
	pending: number;
	running: boolean;
}
const plots: Plot[] = [];

function partNamed(model: Model, name: string): BasePart | undefined {
	return model.FindFirstChild(name, true) as BasePart | undefined;
}

function billboard(part: BasePart, text: string, color: Color3): void {
	let gui = part.FindFirstChildOfClass("BillboardGui");
	if (!gui) {
		gui = new Instance("BillboardGui");
		gui.Size = new UDim2(0, 160, 0, 40);
		gui.StudsOffset = new Vector3(0, 4, 0);
		gui.AlwaysOnTop = true;
		gui.Parent = part;
		const label = new Instance("TextLabel");
		label.Name = "Label";
		label.Size = new UDim2(1, 0, 1, 0);
		label.BackgroundTransparency = 1;
		label.Font = Enum.Font.GothamBold;
		label.TextScaled = true;
		label.TextStrokeTransparency = 0.4;
		label.Parent = gui;
	}
	const label = gui.FindFirstChild("Label") as TextLabel;
	label.Text = text;
	label.TextColor3 = color;
}

function setupPlot(plot: Plot): void {
	const claim = partNamed(plot.model, "ClaimButton");
	if (claim) {
		billboard(claim, "Claim plot", Color3.fromRGB(255, 240, 160));
		claim.Touched.Connect((hit) => {
			const player = Players.GetPlayerFromCharacter(hit.Parent as Model);
			if (!player || plot.owner) return;
			if (plots.some((p) => p.owner === player)) return;
			plot.owner = player;
			plot.tier = PlayerData.getStat(player, `tycoon_${plot.zone.id}_tier`);
			billboard(claim, `${player.DisplayName}'s plot`, Color3.fromRGB(160, 255, 180));
			notify.FireClient(player, "Plot claimed! Buy your first dropper.");
			refreshButtons(plot);
			startProduction(plot);
		});
	}
	for (let i = 1; i <= 4; i++) {
		const pad = partNamed(plot.model, `ButtonPad_${i}`);
		if (!pad) continue;
		pad.Touched.Connect((hit) => {
			const player = Players.GetPlayerFromCharacter(hit.Parent as Model);
			if (!player || plot.owner !== player) return;
			if (plot.tier >= i) return; // already bought
			if (plot.tier < i - 1) return; // must buy in order
			const cost = cfg.buttonCosts[i - 1] ?? 100 * i;
			const prof = PlayerData.getProfile(player);
			if (!prof || prof.coins < cost) {
				notify.FireClient(player, `Need ${cost} ${GameConfig.currency.name}`);
				return;
			}
			prof.coins -= cost;
			plot.tier = i;
			PlayerData.setStat(player, `tycoon_${plot.zone.id}_tier`, i);
			PlayerData.replicate(player);
			notify.FireClient(player, `Dropper ${i} built!`);
			refreshButtons(plot);
			buildDropper(plot, i);
		});
	}
	const collector = partNamed(plot.model, "Collector");
	if (collector) {
		collector.Touched.Connect((hit) => {
			const player = Players.GetPlayerFromCharacter(hit.Parent as Model);
			if (!player || plot.owner !== player || plot.pending <= 0) return;
			const amount = plot.pending;
			plot.pending = 0;
			PlayerData.addCoins(player, amount);
			hudValue.FireClient(player, "tycoon", "Uncollected", "0");
		});
	}
}

function refreshButtons(plot: Plot): void {
	for (let i = 1; i <= 4; i++) {
		const pad = partNamed(plot.model, `ButtonPad_${i}`);
		if (!pad) continue;
		const cost = cfg.buttonCosts[i - 1] ?? 100 * i;
		if (plot.tier >= i) billboard(pad, `Dropper ${i} ✓`, Color3.fromRGB(160, 255, 180));
		else if (plot.tier === i - 1) billboard(pad, `Dropper ${i}: ${cost}`, Color3.fromRGB(255, 240, 160));
		else billboard(pad, "Locked", Color3.fromRGB(180, 180, 180));
	}
	for (let i = 1; i <= plot.tier; i++) if (!plot.droppers[i - 1]) buildDropper(plot, i);
}

function buildDropper(plot: Plot, index: number): void {
	const conveyor = partNamed(plot.model, "Conveyor");
	if (!conveyor) return;
	const d = new Instance("Part");
	d.Name = `Dropper_${index}`;
	d.Size = new Vector3(3, 3, 3);
	d.Color = Color3.fromRGB(80 + index * 30, 80, 200 - index * 30);
	d.Material = Enum.Material.Metal;
	d.Anchored = true;
	d.CFrame = conveyor.CFrame.mul(new CFrame(0, 4, -conveyor.Size.Z / 2 + 3 + (index - 1) * 5));
	d.Parent = plot.model;
	plot.droppers[index - 1] = d;
}

function startProduction(plot: Plot): void {
	if (plot.running) return;
	plot.running = true;
	task.spawn(() => {
		while (plot.owner && plot.owner.Parent) {
			task.wait(cfg.dropInterval);
			const n = plot.droppers.filter((d) => d !== undefined).size();
			if (n === 0) continue;
			const conveyor = partNamed(plot.model, "Conveyor");
			const collector = partNamed(plot.model, "Collector");
			for (let i = 0; i < n; i++) {
				// visual coin sliding along the conveyor, then value accrues
				const drop = plot.droppers[i]!;
				const coin = new Instance("Part");
				coin.Shape = Enum.PartType.Cylinder;
				coin.Size = new Vector3(0.4, 1.6, 1.6);
				coin.Color = Color3.fromRGB(255, 210, 60);
				coin.Material = Enum.Material.Neon;
				coin.Anchored = true;
				coin.CanCollide = false;
				coin.CFrame = drop.CFrame.mul(new CFrame(0, -2, 0)).mul(CFrame.Angles(0, 0, math.rad(90)));
				coin.Parent = plot.model;
				const target = collector ? collector.Position.add(new Vector3(0, 3, 0)) : coin.Position;
				task.spawn(() => {
					const from = coin.Position;
					for (let t = 0; t <= 1; t += 0.05) {
						coin.Position = from.Lerp(target, t);
						task.wait(0.05);
					}
					coin.Destroy();
				});
				void conveyor;
			}
			plot.pending += n * cfg.dropValue * (1 + plot.tier * 0.5) + cfg.baseIncome;
			hudValue.FireClient(plot.owner, "tycoon", "Uncollected", `${math.floor(plot.pending)}`);
		}
		plot.running = false;
	});
}

export function start(): void {
	if (!GameConfig.systems.includes("tycoon")) return;
	task.spawn(() => {
		while (Workspace.GetAttribute("WorldReady") !== true) task.wait(1);
		for (const zone of sortedZones("tycoon_plot_", "plot")) {
			const model = zoneModel(zone);
			if (!model) continue;
			const plot: Plot = { zone, model, tier: 0, droppers: [], pending: 0, running: false };
			plots.push(plot);
			setupPlot(plot);
		}
		print(`[WorldForge] ${plots.size()} tycoon plots`);
	});
	Players.PlayerRemoving.Connect((player) => {
		for (const plot of plots) {
			if (plot.owner !== player) continue;
			plot.owner = undefined;
			plot.tier = 0;
			for (const d of plot.droppers) d?.Destroy();
			plot.droppers = [];
			const claim = partNamed(plot.model, "ClaimButton");
			if (claim) billboard(claim, "Claim plot", Color3.fromRGB(255, 240, 160));
			refreshButtons(plot);
		}
	});
}
