/** NPC roster — generated from design/game.spec.json by WorldForge (editable). */
export const NpcConfig = {
	npcs: [
		{ id: "elder", name: "Elder Maren", role: "quest_giver", location: "village", dialogue: ["The mushrooms glow brighter every night… something stirs in the old ruins.", "Bring me twenty glowing caps and I will tell you about the giant tree."] },
		{ id: "merchant", name: "Tobin the Trader", role: "merchant", location: "village", dialogue: ["Potions, charms, lanterns — take a look at the shop!", "Luck potions are on sale tonight."] },
		{ id: "villager", name: "Pip", role: "villager", location: "village", dialogue: ["Don't wander past the stone walls after dark.", "I saw lights dancing over the lake!"] },
	] as { id: string; name: string; role: string; location?: string; dialogue: string[] }[],
} as const;
