/** Crafting recipes — generated from design/game.spec.json by WorldForge (editable). */
export interface RecipeDef {
	id: string;
	name: string;
	inputs: Record<string, number>;
	output: string;
	count: number;
}

export const RecipeConfig = {
	recipes: [
		{ id: "bandage", name: "Bandage", inputs: { cloth: 2 }, output: "bandage", count: 1 },
		{ id: "torch", name: "Torch", inputs: { scrap: 1, cloth: 1 }, output: "torch", count: 1 },
	] as RecipeDef[],
} as const;
