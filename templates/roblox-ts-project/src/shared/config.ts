/** Gameplay constants. Agents extend this file; keep values data-driven. */
export const GameConfig = {
	name: "__PROJECT_NAME__",
	currency: { id: "coins", name: "Coins", starting: 0 },
	survival: {
		enabled: true,
		hungerMax: 100,
		hungerDrainPerSecond: 0.35,
		starvationDamagePerSecond: 2,
		foodRestore: 30,
	},
	collectibles: {
		enabled: true,
		/** Prefab names (attribute "Prefab") that can be collected. */
		prefabs: ["small_mushroom"],
		rewardCoins: 5,
		respawnSeconds: 90,
		promptText: "Pick mushroom",
	},
	dataStore: { name: "WorldForgePlayerData_v1", autosaveSeconds: 120 },
	/** Genre + enabled gameplay systems (ids from the WorldForge taxonomy); systems start only when listed. */
	genre: "adventure" as string,
	systems: ["player_data", "currency", "collectibles", "survival_stats", "npcs", "shop", "leaderboards"] as string[],
	/** Extra leaderstats mirrored from Profile.stats. */
	leaderstats: [] as string[],
	camera: "third_person" as "third_person" | "first_person" | "top_down" | "free",
	layout: "settlement" as string,
	combat: { maxHealth: 100, meleeDamage: 25, meleeCooldown: 0.6, respawnSeconds: 4, killReward: 25 },
	enemies: { kind: "enemy" as string, name: "Raider", count: 8, health: 80, damage: 12, speed: 14, chaseRange: 60, respawnSeconds: 25, reward: 15 },
	rounds: { intermissionSeconds: 15, roundSeconds: 120, minPlayers: 1, teams: ["a", "b"] as string[], winReward: 100 },
	obby: { stageReward: 10, finishReward: 250 },
	tycoon: { claimCost: 0, buttonCosts: [50, 150, 400, 1000] as number[], dropValue: 3, dropInterval: 2, baseIncome: 1 },
	simulator: { clickValue: 1, backpackSize: 50, sellMultiplier: 1, rebirthCost: 5000, upgradeCosts: [100, 300, 900, 2700] as number[] },
	racing: { laps: 3, checkpointReward: 5, lapReward: 60 },
	towerDefense: { waves: 10, baseHp: 100, enemiesPerWave: 6, towerCost: 100, towerDamage: 20, towerRange: 30, towerRate: 1 },
	farming: { growSeconds: 45, seedCost: 10, cropValue: 30, plots: 6 },
	mining: { nodes: 24, hitsPerNode: 4, respawnSeconds: 40, oreValue: 12 },
	pets: { eggCost: 250, followDistance: 6, multipliers: [1.1, 1.25, 1.5, 2] as number[] },
	progression: { xpPerLevel: 100, xpPerAction: 5 },
	dayNight: { dayLengthSeconds: 600, startHour: 12, nightEnemyMultiplier: 1.5 },
	sports: { matchSeconds: 180, goalReward: 20 },
	puzzle: { rooms: 4 },
} as const;
