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
} as const;
