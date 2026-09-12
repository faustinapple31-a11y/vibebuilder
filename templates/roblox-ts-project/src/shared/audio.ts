/**
 * Audio wiring — generated from design/game.spec.json by WorldForge (editable).
 * Ids are `rbxassetid://…` (uploaded through Open Cloud from the app, or free Creator Store audio);
 * the defaults are Roblox built-in `rbxasset://sounds/*` files that always exist.
 */
export const AudioConfig = {
	ambientMusic: "",
	musicVolume: 0.35,
	zoneAmbience: [] as { zone: string; soundId: string; volume: number }[],
	sfx: {
		collect: "rbxasset://sounds/electronicpingshort.wav",
		purchase: "rbxasset://sounds/button.wav",
		error: "rbxasset://sounds/uuhhh.mp3",
		notify: "rbxasset://sounds/clickfast.wav",
	} as { collect?: string; purchase?: string; error?: string; notify?: string },
} as const;
