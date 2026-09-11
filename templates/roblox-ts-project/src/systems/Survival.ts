import { Players, RunService } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getProfile, replicate } from "./PlayerData";

/** Hunger drains over time; starving players take damage. Food restores hunger. */
export function feed(player: Player, amount = GameConfig.survival.foodRestore): void {
	const p = getProfile(player);
	if (!p) return;
	p.hunger = math.min(GameConfig.survival.hungerMax, p.hunger + amount);
	replicate(player);
}

export function start(): void {
	if (!GameConfig.survival.enabled) return;
	let acc = 0;
	RunService.Heartbeat.Connect((dt) => {
		acc += dt;
		if (acc < 1) return;
		const step = acc;
		acc = 0;
		for (const player of Players.GetPlayers()) {
			const p = getProfile(player);
			if (!p) continue;
			p.hunger = math.max(0, p.hunger - GameConfig.survival.hungerDrainPerSecond * step);
			if (p.hunger <= 0) {
				const hum = player.Character?.FindFirstChildOfClass("Humanoid");
				if (hum && hum.Health > 0) hum.TakeDamage(GameConfig.survival.starvationDamagePerSecond * step);
			}
			replicate(player);
		}
	});
	Players.PlayerAdded.Connect((player) => {
		player.CharacterAdded.Connect(() => {
			const p = getProfile(player);
			if (p && p.hunger <= 0) {
				p.hunger = GameConfig.survival.hungerMax * 0.5;
				replicate(player);
			}
		});
	});
}
