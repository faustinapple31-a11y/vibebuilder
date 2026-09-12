/**
 * Animations — generated from design/game.spec.json by WorldForge (editable).
 * Catalog ids are Roblox-owned R15 animations (usable in any experience); `custom` entries are procedural
 * keyframe animations built at runtime by shared/anim/keyframes.ts.
 */
export interface AnimKeyframe {
	t: number;
	joints: Record<string, [number, number, number]>;
}

export interface AnimSpec {
	id: string;
	name: string;
	loop: boolean;
	priority: "Idle" | "Movement" | "Action";
	durationSeconds: number;
	keyframes: AnimKeyframe[];
}

export const AnimationConfig = {
	npcIdle: "rbxassetid://507766666",
	npcWalk: "rbxassetid://507777826",
	greet: "rbxassetid://507770239",
	emotes: [
		{ id: "wave", name: "Wave", animationId: "rbxassetid://507770239" },
		{ id: "cheer", name: "Cheer", animationId: "rbxassetid://507770677" },
		{ id: "dance", name: "Dance", animationId: "rbxassetid://507771019" },
		{ id: "laugh", name: "Laugh", animationId: "rbxassetid://507770818" },
		{ id: "point", name: "Point", animationId: "rbxassetid://507770453" },
	] as { id: string; name: string; animationId: string }[],
	custom: [
		{
			id: "lantern_raise",
			name: "Raise lantern",
			loop: false,
			priority: "Action",
			durationSeconds: 1.6,
			keyframes: [
				{ t: 0, joints: { RightShoulder: [0, 0, 0] } },
				{ t: 0.4, joints: { RightShoulder: [0, 0, 150], Neck: [10, 0, 0] } },
				{ t: 0.7, joints: { RightShoulder: [0, 0, 150], Neck: [10, 0, 0] } },
				{ t: 1, joints: { RightShoulder: [0, 0, 0], Neck: [0, 0, 0] } },
			],
		},
	] as AnimSpec[],
} as const;
