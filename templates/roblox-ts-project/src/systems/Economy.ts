import { Players, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getRemoteEvent, Remotes } from "shared/net";
import { RecipeConfig } from "shared/recipes";
import { findZones, sortedZones } from "shared/zones";
import * as PlayerData from "./PlayerData";
import * as Progression from "./Progression";

/**
 * Resource economies: farming (plots, seeds, growth, harvest), mining (ore nodes, pickaxe hits),
 * crafting (recipes from shared/recipes.ts), pets (eggs, follower, multiplier), housing & jobs
 * (roleplay: claim a house, work at a job pad for cash), trading (offer/accept through Action).
 * All persist through Profile.inventory / Profile.stats.
 */
const notify = getRemoteEvent(Remotes.Notify);
const hudValue = getRemoteEvent(Remotes.HudValue);
const action = getRemoteEvent(Remotes.Action);
const fx = getRemoteEvent(Remotes.Fx);

function worldFolder(): Instance {
	return Workspace.FindFirstChild("World") ?? Workspace;
}

function label(part: BasePart, text: string, color = Color3.fromRGB(255, 255, 255)): void {
	let gui = part.FindFirstChildOfClass("BillboardGui");
	if (!gui) {
		gui = new Instance("BillboardGui");
		gui.Size = new UDim2(0, 150, 0, 36);
		gui.StudsOffset = new Vector3(0, 3.5, 0);
		gui.AlwaysOnTop = true;
		gui.Parent = part;
		const l = new Instance("TextLabel");
		l.Name = "Label";
		l.Size = new UDim2(1, 0, 1, 0);
		l.BackgroundTransparency = 1;
		l.Font = Enum.Font.GothamBold;
		l.TextScaled = true;
		l.TextStrokeTransparency = 0.4;
		l.Parent = gui;
	}
	const l = gui.FindFirstChild("Label") as TextLabel;
	l.Text = text;
	l.TextColor3 = color;
}

function prompt(part: BasePart, text: string, onTrigger: (p: Player) => void, hold = 0): ProximityPrompt {
	const pp = new Instance("ProximityPrompt");
	pp.ActionText = text;
	pp.HoldDuration = hold;
	pp.MaxActivationDistance = 12;
	pp.RequiresLineOfSight = false;
	pp.Parent = part;
	pp.Triggered.Connect(onTrigger);
	return pp;
}

function groundY(x: number, z: number, fallback: number): number {
	const hit = Workspace.Raycast(new Vector3(x, fallback + 80, z), new Vector3(0, -300, 0));
	return hit ? hit.Position.Y : fallback;
}

// ---------------------------------------------------------------- farming
function startFarming(): void {
	const cfg = GameConfig.farming;
	const plots = sortedZones("tycoon_plot_", "plot");
	const anchor = plots[0] ?? findZones({ kind: "settlement" })[0] ?? findZones({ kind: "spawn" })[0];
	const c = anchor ? anchor.position : new Vector3(0, 10, 0);
	for (let i = 0; i < cfg.plots; i++) {
		const x = c.X + (i % 3) * 9 - 9 + (plots[0] ? 0 : 24);
		const z = c.Z + math.floor(i / 3) * 9 - 5 + (plots[0] ? 0 : 20);
		const y = groundY(x, z, c.Y);
		const soil = new Instance("Part");
		soil.Name = `FarmPlot_${i + 1}`;
		soil.Size = new Vector3(7, 1, 7);
		soil.CFrame = new CFrame(x, y + 0.3, z);
		soil.Anchored = true;
		soil.Color = Color3.fromRGB(80, 55, 35);
		soil.Material = Enum.Material.Ground;
		soil.Parent = worldFolder();
		let state: { owner: Player; planted: number; crop?: Part } | undefined;
		label(soil, "Empty plot — plant (seed)", Color3.fromRGB(220, 220, 200));
		prompt(soil, "Plant / Harvest", (player) => {
			if (!state) {
				const prof = PlayerData.getProfile(player);
				if (!prof) return;
				if (prof.coins < cfg.seedCost && !PlayerData.hasItem(player, "seed_carrot")) return notify.FireClient(player, `Seeds cost ${cfg.seedCost}`);
				if (PlayerData.hasItem(player, "seed_carrot")) PlayerData.addItem(player, "seed_carrot", -1);
				else {
					prof.coins -= cfg.seedCost;
					PlayerData.replicate(player);
				}
				const crop = new Instance("Part");
				crop.Shape = Enum.PartType.Ball;
				crop.Size = new Vector3(1, 1, 1);
				crop.Color = Color3.fromRGB(90, 200, 80);
				crop.Material = Enum.Material.Grass;
				crop.Anchored = true;
				crop.CanCollide = false;
				crop.CFrame = soil.CFrame.add(new Vector3(0, 1, 0));
				crop.Parent = soil;
				state = { owner: player, planted: os.clock(), crop };
				label(soil, `${player.DisplayName}: growing…`, Color3.fromRGB(180, 255, 180));
				task.spawn(() => {
					const grow = cfg.growSeconds / PlayerData.multiplierFor(player, "growth");
					for (let t = 0; t < grow && state?.crop === crop; t += 2) {
						const s = 1 + (t / grow) * 3;
						crop.Size = new Vector3(s, s, s);
						crop.CFrame = soil.CFrame.add(new Vector3(0, 0.5 + s / 2, 0));
						task.wait(2);
					}
					if (state?.crop === crop) {
						crop.Color = Color3.fromRGB(255, 150, 40);
						label(soil, "Ready to harvest!", Color3.fromRGB(255, 220, 120));
					}
				});
				return;
			}
			if (state.owner !== player) return;
			const grow = cfg.growSeconds / PlayerData.multiplierFor(player, "growth");
			if (os.clock() - state.planted < grow) return notify.FireClient(player, `Still growing (${math.ceil(grow - (os.clock() - state.planted))}s)`);
			state.crop?.Destroy();
			state = undefined;
			PlayerData.addItem(player, "carrot", 1);
			const coins = PlayerData.addCoins(player, cfg.cropValue);
			notify.FireClient(player, `Harvested! +${coins} ${GameConfig.currency.name}`);
			Progression.grantXp(player, GameConfig.progression.xpPerAction);
			Progression.progressQuest(player, "collect", "carrot", 1);
			label(soil, "Empty plot — plant (seed)", Color3.fromRGB(220, 220, 200));
		});
	}
}

// ---------------------------------------------------------------- mining
function startMining(): void {
	const cfg = GameConfig.mining;
	const rocks: BasePart[] = [];
	for (const d of worldFolder().GetDescendants()) {
		if (d.IsA("Model") && (d.GetAttribute("Prefab") === "boulder" || d.GetAttribute("Prefab") === "rock_cluster" || d.GetAttribute("Prefab") === "cliff_block")) {
			const p = d.PrimaryPart ?? d.FindFirstChildWhichIsA("BasePart");
			if (p) rocks.push(p);
		}
	}
	rocks.sort(() => math.random() < 0.5);
	const nodes = rocks.filter((_, i) => i < cfg.nodes);
	for (const rock of nodes) {
		const gold = math.random() < 0.2;
		const ore = new Instance("Part");
		ore.Name = gold ? "Ore_gold" : "Ore_iron";
		ore.Size = new Vector3(2.2, 2.2, 2.2);
		ore.Color = gold ? Color3.fromRGB(255, 200, 60) : Color3.fromRGB(150, 130, 120);
		ore.Material = gold ? Enum.Material.Neon : Enum.Material.Slate;
		ore.Anchored = true;
		ore.CanCollide = false;
		ore.CFrame = rock.CFrame.mul(new CFrame(0, rock.Size.Y / 2 + 0.6, 0)).mul(CFrame.Angles(math.rad(35), math.rad(20), 0));
		ore.Parent = rock;
		let hits = 0;
		label(ore, gold ? "Gold ore" : "Iron ore");
		const pp = prompt(ore, "Mine", (player) => {
			if (!ore.Parent) return;
			const power = 1 + PlayerData.getStat(player, "pickaxe_tier");
			hits += power;
			fx.FireAllClients("hit", ore.Position);
			label(ore, `${gold ? "Gold" : "Iron"} ore ${math.min(hits, cfg.hitsPerNode)}/${cfg.hitsPerNode}`);
			if (hits >= cfg.hitsPerNode) {
				hits = 0;
				const item = gold ? "ore_gold" : "ore_iron";
				PlayerData.addItem(player, item, 1);
				const coins = PlayerData.addCoins(player, cfg.oreValue * (gold ? 4 : 1));
				notify.FireClient(player, `+1 ${gold ? "gold" : "iron"} ore (+${coins} ${GameConfig.currency.name})`);
				Progression.grantXp(player, GameConfig.progression.xpPerAction);
				Progression.progressQuest(player, "collect", item, 1);
				ore.Transparency = 1;
				pp.Enabled = false;
				task.delay(cfg.respawnSeconds, () => {
					ore.Transparency = 0;
					pp.Enabled = true;
					label(ore, gold ? "Gold ore" : "Iron ore");
				});
			}
		});
	}
	// pickaxe upgrade through Action("upgrade_pickaxe")
	action.OnServerEvent.Connect((player, name) => {
		if (name !== "upgrade_pickaxe") return;
		const tier = PlayerData.getStat(player, "pickaxe_tier");
		const cost = 150 * (tier + 1) * (tier + 1);
		const prof = PlayerData.getProfile(player);
		if (!prof || prof.coins < cost) return notify.FireClient(player, `Pickaxe upgrade costs ${cost}`);
		prof.coins -= cost;
		PlayerData.setStat(player, "pickaxe_tier", tier + 1);
		PlayerData.replicate(player);
		notify.FireClient(player, `Pickaxe tier ${tier + 1}`);
	});
	print(`[WorldForge] ${nodes.size()} ore nodes`);
}

// ---------------------------------------------------------------- crafting
function startCrafting(): void {
	action.OnServerEvent.Connect((player, name, recipeId) => {
		if (name !== "craft" || !typeIs(recipeId, "string")) return;
		const recipe = RecipeConfig.recipes.find((r) => r.id === recipeId);
		if (!recipe) return;
		for (const [item, n] of pairs(recipe.inputs)) if (!PlayerData.hasItem(player, item as string, n as number)) return notify.FireClient(player, `Missing ${n} × ${item}`);
		for (const [item, n] of pairs(recipe.inputs)) PlayerData.addItem(player, item as string, -(n as number));
		PlayerData.addItem(player, recipe.output, recipe.count);
		notify.FireClient(player, `Crafted ${recipe.count} × ${recipe.output}`);
		Progression.grantXp(player, GameConfig.progression.xpPerAction * 2);
		Progression.progressQuest(player, "craft", recipe.output, 1);
	});
}

// ---------------------------------------------------------------- pets
function startPets(): void {
	const cfg = GameConfig.pets;
	const followers = new Map<Player, BasePart>();
	const spawnFollower = (player: Player, tier: number) => {
		followers.get(player)?.Destroy();
		const pet = new Instance("Part");
		pet.Name = `${player.Name}_pet`;
		pet.Shape = Enum.PartType.Ball;
		pet.Size = new Vector3(2.4, 2.4, 2.4);
		pet.Color = [Color3.fromRGB(240, 200, 120), Color3.fromRGB(120, 200, 240), Color3.fromRGB(200, 120, 240), Color3.fromRGB(255, 220, 80)][tier - 1] ?? Color3.fromRGB(240, 200, 120);
		pet.Material = tier >= 3 ? Enum.Material.Neon : Enum.Material.SmoothPlastic;
		pet.CanCollide = false;
		pet.Anchored = true;
		pet.Parent = Workspace;
		const gui = new Instance("BillboardGui");
		gui.Size = new UDim2(0, 120, 0, 30);
		gui.StudsOffset = new Vector3(0, 2.2, 0);
		gui.Parent = pet;
		const l = new Instance("TextLabel");
		l.Size = new UDim2(1, 0, 1, 0);
		l.BackgroundTransparency = 1;
		l.TextScaled = true;
		l.Font = Enum.Font.GothamBold;
		l.TextColor3 = Color3.fromRGB(255, 255, 255);
		l.TextStrokeTransparency = 0.3;
		l.Text = ["Common", "Rare", "Epic", "Legendary"][tier - 1] ?? "Pet";
		l.Parent = gui;
		followers.set(player, pet);
		const prof = PlayerData.getProfile(player);
		if (prof) prof.multipliers.coins = math.max(prof.multipliers.coins ?? 1, cfg.multipliers[tier - 1] ?? 1);
		task.spawn(() => {
			let t = 0;
			while (pet.Parent && player.Parent) {
				const root = player.Character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
				if (root) {
					t += 0.05;
					const target = root.CFrame.mul(new CFrame(-cfg.followDistance * 0.6, 1 + math.sin(t * 3) * 0.5, cfg.followDistance * 0.5)).Position;
					pet.CFrame = new CFrame(pet.Position.Lerp(target, 0.15), root.Position);
				}
				task.wait(0.05);
			}
		});
	};
	const hatch = (player: Player) => {
		const prof = PlayerData.getProfile(player);
		if (!prof || prof.coins < cfg.eggCost) return notify.FireClient(player, `Egg costs ${cfg.eggCost} ${GameConfig.currency.name}`);
		prof.coins -= cfg.eggCost;
		const roll = math.random() * PlayerData.multiplierFor(player, "luck");
		const tier = roll > 0.97 ? 4 : roll > 0.85 ? 3 : roll > 0.55 ? 2 : 1;
		const best = math.max(PlayerData.getStat(player, "best_pet"), tier);
		PlayerData.setStat(player, "best_pet", best);
		PlayerData.addStat(player, "Pets", 1);
		PlayerData.replicate(player);
		notify.FireClient(player, `Hatched a ${["Common", "Rare", "Epic", "Legendary"][tier - 1]} pet!`);
		spawnFollower(player, best);
		Progression.progressQuest(player, "collect", "pet", 1);
	};
	action.OnServerEvent.Connect((player, name) => {
		if (name === "hatch") hatch(player);
	});
	const onCharacter = (player: Player) => task.delay(1, () => {
		const best = PlayerData.getStat(player, "best_pet");
		if (best > 0) spawnFollower(player, best);
		hudValue.FireClient(player, "pets", "Pets", "press E near the egg stand · P to hatch");
	});
	const setup = (player: Player) => {
		player.CharacterAdded.Connect(() => onCharacter(player));
		if (player.Character) onCharacter(player);
	};
	Players.PlayerAdded.Connect(setup);
	for (const p of Players.GetPlayers()) setup(p);
	Players.PlayerRemoving.Connect((p) => followers.get(p)?.Destroy());
	// egg stand at the plaza
	const plaza = findZones({ metaKind: "plaza" })[0] ?? findZones({ kind: "settlement" })[0] ?? findZones({ kind: "spawn" })[0];
	if (plaza) {
		const stand = new Instance("Part");
		stand.Name = "EggStand";
		stand.Size = new Vector3(4, 5, 4);
		stand.Color = Color3.fromRGB(255, 230, 160);
		stand.Material = Enum.Material.SmoothPlastic;
		stand.Anchored = true;
		const y = groundY(plaza.position.X + 18, plaza.position.Z - 12, plaza.position.Y);
		stand.CFrame = new CFrame(plaza.position.X + 18, y + 2.5, plaza.position.Z - 12);
		stand.Parent = worldFolder();
		label(stand, `Egg — ${cfg.eggCost} ${GameConfig.currency.name}`);
		prompt(stand, "Hatch egg", hatch);
	}
}

// ---------------------------------------------------------------- housing & jobs (roleplay)
function startHousing(): void {
	const houses: { model: Model; door: BasePart; owner?: Player }[] = [];
	for (const d of worldFolder().GetDescendants()) {
		const prefabName = d.IsA("Model") ? (d.GetAttribute("Prefab") as string | undefined) ?? "" : "";
		if (!d.IsA("Model") || prefabName.sub(1, 5) !== "house") continue;
		const part = d.PrimaryPart ?? d.FindFirstChildWhichIsA("BasePart");
		if (!part) continue;
		const door = new Instance("Part");
		door.Size = new Vector3(2, 2, 2);
		door.Transparency = 1;
		door.CanCollide = false;
		door.Anchored = true;
		door.CFrame = d.GetPivot().mul(new CFrame(0, 4, -10));
		door.Parent = d;
		const h = { model: d, door, owner: undefined as Player | undefined };
		houses.push(h);
		label(door, "House for sale — 500", Color3.fromRGB(255, 240, 160));
		prompt(door, "Buy / enter house", (player) => {
			if (h.owner === player) return notify.FireClient(player, "Welcome home!");
			if (h.owner) return notify.FireClient(player, `${h.owner.DisplayName}'s house`);
			if (houses.some((x) => x.owner === player)) return notify.FireClient(player, "You already own a house");
			const prof = PlayerData.getProfile(player);
			if (!prof || prof.coins < 500) return notify.FireClient(player, "House costs 500");
			prof.coins -= 500;
			PlayerData.replicate(player);
			h.owner = player;
			label(door, `${player.DisplayName}'s house`, Color3.fromRGB(160, 255, 180));
			Progression.progressQuest(player, "build", "house", 1);
		});
	}
	Players.PlayerRemoving.Connect((p) => {
		for (const h of houses) if (h.owner === p) {
			h.owner = undefined;
			label(h.door, "House for sale — 500", Color3.fromRGB(255, 240, 160));
		}
	});
	// jobs: pads near shops / plaza pay cash while standing (work timer)
	const jobs = ["Cashier", "Delivery", "Mechanic", "Chef"];
	const plaza = findZones({ metaKind: "plaza" })[0] ?? findZones({ kind: "settlement" })[0];
	if (plaza) {
		jobs.forEach((job, i) => {
			const a = (i / jobs.size()) * math.pi * 2;
			const x = plaza.position.X + math.cos(a) * 16;
			const z = plaza.position.Z + math.sin(a) * 16;
			const pad = new Instance("Part");
			pad.Name = `Job_${job}`;
			pad.Size = new Vector3(6, 0.6, 6);
			pad.CFrame = new CFrame(x, groundY(x, z, plaza.position.Y) + 0.3, z);
			pad.Anchored = true;
			pad.Color = Color3.fromRGB(80, 150, 255);
			pad.Material = Enum.Material.Neon;
			pad.Parent = worldFolder();
			label(pad, `${job} job — stand to work`);
			task.spawn(() => {
				for (;;) {
					task.wait(5);
					for (const p of Players.GetPlayers()) {
						const root = p.Character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
						if (root && root.Position.sub(pad.Position).Magnitude < 5) {
							const paid = PlayerData.addCoins(p, 5 + i * 2);
							hudValue.FireClient(p, "job", "Working as", `${job} (+${paid})`);
							Progression.grantXp(p, 1);
						}
					}
				}
			});
		});
	}
	print(`[WorldForge] ${houses.size()} houses for sale`);
}

// ---------------------------------------------------------------- trading
function startTrading(): void {
	const offers = new Map<Player, { to: Player; item: string; count: number }>();
	action.OnServerEvent.Connect((player, name, targetName, item, count) => {
		if (name === "trade_offer" && typeIs(targetName, "string") && typeIs(item, "string") && typeIs(count, "number")) {
			const target = Players.FindFirstChild(targetName) as Player | undefined;
			if (!target || !PlayerData.hasItem(player, item, count)) return;
			offers.set(player, { to: target, item, count });
			notify.FireClient(target, `${player.DisplayName} offers ${count} × ${item} (accept with /accept in chat)`);
		} else if (name === "trade_accept") {
			for (const [from, offer] of offers) {
				if (offer.to !== player) continue;
				if (!PlayerData.hasItem(from, offer.item, offer.count)) continue;
				PlayerData.addItem(from, offer.item, -offer.count);
				PlayerData.addItem(player, offer.item, offer.count);
				offers.delete(from);
				notify.FireClient(from, "Trade completed");
				notify.FireClient(player, `Received ${offer.count} × ${offer.item}`);
			}
		}
	});
}

export function start(): void {
	task.spawn(() => {
		while (Workspace.GetAttribute("WorldReady") !== true) task.wait(1);
		task.wait(2);
		if (GameConfig.systems.includes("farming")) startFarming();
		if (GameConfig.systems.includes("mining")) startMining();
		if (GameConfig.systems.includes("pets")) startPets();
		if (GameConfig.systems.includes("housing") || GameConfig.systems.includes("jobs")) startHousing();
	});
	if (GameConfig.systems.includes("crafting")) startCrafting();
	if (GameConfig.systems.includes("trading")) startTrading();
}
