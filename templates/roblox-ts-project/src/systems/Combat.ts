import { Players, ReplicatedStorage, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getRemoteEvent, Remotes } from "shared/net";
import * as PlayerData from "./PlayerData";

/**
 * Combat & weapons: server-authoritative damage. Every player gets a starter melee Tool
 * (a swing fires the `Action` remote with "melee"; the server checks cooldown, reach and
 * line of sight, then damages Humanoids in front of the player). Enemies and PvP (arena,
 * battle genres) both go through `damage()` so kill rewards, knockback and respawn are uniform.
 */
const cfg = GameConfig.combat;
const action = getRemoteEvent(Remotes.Action);
const fx = getRemoteEvent(Remotes.Fx);
const hudValue = getRemoteEvent(Remotes.HudValue);
const lastSwing = new Map<Player, number>();
const pvp = () => GameConfig.systems.includes("teams") || GameConfig.genre === "battle" || GameConfig.genre === "battle_royale" || GameConfig.genre === "fps" || GameConfig.genre === "fighting";

/** Who to credit for a kill (player) and team lookup for friendly fire. */
function teamOf(character: Model): string | undefined {
	const p = Players.GetPlayerFromCharacter(character);
	return p ? (p.GetAttribute("Team") as string | undefined) : (character.GetAttribute("Team") as string | undefined);
}

export function damage(target: Humanoid, amount: number, attacker?: Player, knockback?: Vector3): boolean {
	if (target.Health <= 0) return false;
	const model = target.Parent as Model | undefined;
	if (!model) return false;
	const victim = Players.GetPlayerFromCharacter(model);
	if (victim && attacker) {
		if (!pvp()) return false; // no PvP outside combat genres
		const ta = attacker.GetAttribute("Team") as string | undefined;
		const tv = teamOf(model);
		if (ta !== undefined && ta === tv) return false; // friendly fire off
	}
	if (attacker) {
		let tag = target.FindFirstChild("creator") as ObjectValue | undefined;
		if (!tag) {
			tag = new Instance("ObjectValue");
			tag.Name = "creator";
			tag.Parent = target;
		}
		tag.Value = attacker;
	}
	target.TakeDamage(amount);
	const root = model.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
	if (knockback && root) root.AssemblyLinearVelocity = root.AssemblyLinearVelocity.add(knockback);
	if (root) fx.FireAllClients("hit", root.Position);
	if (attacker && victim) hudValue.FireClient(victim, "attacker", "Hit by", attacker.DisplayName);
	if (target.Health <= 0 && attacker) {
		PlayerData.addCoins(attacker, cfg.killReward);
		PlayerData.addStat(attacker, "Kills", 1);
		if (GameConfig.systems.includes("progression")) PlayerData.addStat(attacker, "xp", GameConfig.progression.xpPerAction * 4);
		if (victim) PlayerData.addStat(victim, "Deaths", 1);
	}
	return true;
}

function giveWeapon(player: Player): void {
	const backpack = player.FindFirstChildOfClass("Backpack");
	if (!backpack || backpack.FindFirstChild("Melee")) return;
	const tool = new Instance("Tool");
	tool.Name = "Melee";
	tool.RequiresHandle = true;
	tool.CanBeDropped = false;
	const handle = new Instance("Part");
	handle.Name = "Handle";
	handle.Size = new Vector3(0.6, 4.2, 0.6);
	handle.Color = Color3.fromHex(GameConfig.genre === "survival" || GameConfig.genre === "horror" ? "#8a6a48" : "#c0c4cc");
	handle.Material = GameConfig.genre === "survival" ? Enum.Material.Wood : Enum.Material.Metal;
	handle.CanCollide = false;
	handle.Parent = tool;
	tool.Grip = new CFrame(0, -1.4, 0).mul(CFrame.Angles(0, 0, math.rad(90)));
	// the client fires Action("melee") on activation (see client/main.client.ts); keep a fallback here
	tool.Activated.Connect(() => swing(player));
	tool.Parent = backpack;
}

function swing(player: Player): void {
	const now = os.clock();
	if (now - (lastSwing.get(player) ?? 0) < cfg.meleeCooldown) return;
	lastSwing.set(player, now);
	const char = player.Character;
	const root = char?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
	if (!char || !root) return;
	const origin = root.Position;
	const dir = root.CFrame.LookVector;
	for (const model of Workspace.GetDescendants()) {
		if (!model.IsA("Humanoid") || model.Parent === char) continue;
		const hr = (model.Parent as Model).FindFirstChild("HumanoidRootPart") as BasePart | undefined;
		if (!hr) continue;
		const to = hr.Position.sub(origin);
		if (to.Magnitude > 9) continue;
		if (to.Unit.Dot(dir) < 0.35) continue;
		damage(model, cfg.meleeDamage, player, dir.mul(22).add(new Vector3(0, 12, 0)));
	}
}

export function start(): void {
	const enabled = GameConfig.systems.includes("combat") || GameConfig.systems.includes("weapons");
	if (!enabled) return;
	action.OnServerEvent.Connect((player, name) => {
		if (name === "melee") swing(player);
	});
	const onCharacter = (player: Player, char: Model) => {
		const hum = char.WaitForChild("Humanoid") as Humanoid;
		hum.MaxHealth = cfg.maxHealth;
		hum.Health = cfg.maxHealth;
		task.defer(() => giveWeapon(player));
		hum.Died.Connect(() => {
			task.delay(cfg.respawnSeconds, () => {
				if (player.Parent) player.LoadCharacter();
			});
		});
	};
	const setup = (player: Player) => {
		player.CharacterAdded.Connect((char) => onCharacter(player, char));
		if (player.Character) onCharacter(player, player.Character); // the world build takes a while: characters may already exist
	};
	Players.PlayerAdded.Connect(setup);
	for (const p of Players.GetPlayers()) setup(p);
	Players.CharacterAutoLoads = true;
	void ReplicatedStorage;
}
