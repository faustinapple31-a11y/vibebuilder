/** Quest definitions — generated from design/game.spec.json by WorldForge (editable). */
export interface QuestDef {
	id: string;
	title: string;
	description: string;
	objective: { type: string; target: string; count: number };
	reward: { currency: string; amount: number };
}

export const QuestConfig = {
	quests: [
		{ id: "first_light", title: "First Light", description: "Collect 5 items.", objective: { type: "collect", target: "any", count: 5 }, reward: { currency: "coins", amount: 50 } },
	] as QuestDef[],
} as const;
