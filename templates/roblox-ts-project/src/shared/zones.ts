import { Workspace } from "@rbxts/services";

/**
 * Zone markers written by WorldBuilder under World/Zones: invisible anchored parts named after the
 * zone id with attributes Kind / Radius and the gameplay `meta` (stage, plot, team, index…).
 * Every gameplay system finds its anchors through these helpers instead of hard-coded positions.
 */
export interface ZoneInfo {
	id: string;
	kind: string;
	radius: number;
	position: Vector3;
	part: BasePart;
	meta: Record<string, string | number>;
}

function folder(): Folder | undefined {
	const world = Workspace.FindFirstChild("World");
	return world?.FindFirstChild("Zones") as Folder | undefined;
}

export function waitForZones(timeout = 120): Folder | undefined {
	const t0 = os.clock();
	while (os.clock() - t0 < timeout) {
		if (Workspace.GetAttribute("WorldReady") === true) {
			const f = folder();
			if (f) return f;
		}
		task.wait(0.5);
	}
	return folder();
}

export function zoneInfo(part: BasePart): ZoneInfo {
	const meta: Record<string, string | number> = {};
	for (const [k, v] of pairs(part.GetAttributes())) {
		if (k === "Kind" || k === "Radius") continue;
		if (typeIs(v, "string") || typeIs(v, "number")) meta[k as string] = v;
	}
	return { id: part.Name, kind: (part.GetAttribute("Kind") as string | undefined) ?? "", radius: (part.GetAttribute("Radius") as number | undefined) ?? 8, position: part.Position, part, meta };
}

/** All zones, optionally filtered by kind and/or id prefix (e.g. "obby_stage_"). */
export function findZones(filter: { kind?: string; prefix?: string; metaKind?: string } = {}): ZoneInfo[] {
	const f = folder();
	if (!f) return [];
	const out: ZoneInfo[] = [];
	for (const child of f.GetChildren()) {
		if (!child.IsA("BasePart")) continue;
		const z = zoneInfo(child);
		if (filter.kind !== undefined && z.kind !== filter.kind) continue;
		if (filter.prefix !== undefined && child.Name.sub(1, filter.prefix.size()) !== filter.prefix) continue;
		if (filter.metaKind !== undefined && z.meta.kind !== filter.metaKind) continue;
		out.push(z);
	}
	return out;
}

export function findZone(id: string): ZoneInfo | undefined {
	const f = folder();
	const part = f?.FindFirstChild(id);
	return part && part.IsA("BasePart") ? zoneInfo(part) : undefined;
}

/** Zones sorted by a numeric meta key (stage, index, plot…). */
export function sortedZones(prefix: string, key = "index"): ZoneInfo[] {
	const zones = findZones({ prefix });
	zones.sort((a, b) => (tonumber(a.meta[key]) ?? 0) < (tonumber(b.meta[key]) ?? 0));
	return zones;
}

/** The layout structure model placed at a zone (obby platform, plot, gate…), if any. */
export function zoneModel(z: ZoneInfo): Model | undefined {
	const world = Workspace.FindFirstChild("World");
	if (!world) return undefined;
	let best: Model | undefined;
	let bestD = math.huge;
	for (const d of world.GetDescendants()) {
		if (!d.IsA("Model") || d.GetAttribute("Zone") !== z.id) continue;
		const dist = d.GetPivot().Position.sub(z.position).Magnitude;
		if (dist < bestD) {
			bestD = dist;
			best = d;
		}
	}
	return best;
}

export function spawnPoint(z: ZoneInfo, up = 4): CFrame {
	return new CFrame(z.position.add(new Vector3(0, up, 0)));
}
