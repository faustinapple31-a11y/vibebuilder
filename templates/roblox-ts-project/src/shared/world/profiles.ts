/**
 * How a world is represented on a device. A profile never changes what exists: it says how far the small details are
 * built around the camera, how far trees keep their shape, and how much is streamed. Mirrors packages/core/src/capacity.ts.
 */
export type DetailProfile = "performance" | "balanced" | "high" | "maximum";

export interface ViewSettings {
	/** Every detail (window frames, flowers, lights) up to this distance, studs. */
	detail: number;
	/** Ground cover (tufts, pebbles) up to this distance. */
	cover: number;
	/** Main shapes (crowns, roofs) up to this distance. */
	shape: number;
	/** Two-part silhouettes of the tall trees up to this distance. */
	silhouette: number;
	shadows: boolean;
	/** Seconds per frame spent building. */
	budget: number;
}

export const VIEW: Record<DetailProfile, ViewSettings> = {
	performance: { detail: 110, cover: 90, shape: 320, silhouette: 620, shadows: false, budget: 0.002 },
	balanced: { detail: 220, cover: 170, shape: 560, silhouette: 1100, shadows: false, budget: 0.004 },
	high: { detail: 360, cover: 260, shape: 900, silhouette: 1800, shadows: true, budget: 0.006 },
	maximum: { detail: 600, cover: 420, shape: 1400, silhouette: 2800, shadows: true, budget: 0.008 },
};

export function isProfile(v: unknown): v is DetailProfile {
	return v === "performance" || v === "balanced" || v === "high" || v === "maximum";
}
