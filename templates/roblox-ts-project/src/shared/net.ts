import { ReplicatedStorage } from "@rbxts/services";

/**
 * Typed remotes. The server creates them under ReplicatedStorage.Remotes; the client waits for them.
 */
export interface PlayerStats {
	coins: number;
	hunger: number;
}

const FOLDER = "Remotes";

function folder(): Folder {
	let f = ReplicatedStorage.FindFirstChild(FOLDER) as Folder | undefined;
	if (!f) {
		f = new Instance("Folder");
		f.Name = FOLDER;
		f.Parent = ReplicatedStorage;
	}
	return f;
}

export function getRemoteEvent(name: string): RemoteEvent {
	const f = folder();
	let r = f.FindFirstChild(name) as RemoteEvent | undefined;
	if (!r) {
		r = new Instance("RemoteEvent");
		r.Name = name;
		r.Parent = f;
	}
	return r;
}

export function waitRemoteEvent(name: string): RemoteEvent {
	const f = ReplicatedStorage.WaitForChild(FOLDER) as Folder;
	return f.WaitForChild(name) as RemoteEvent;
}

export const Remotes = {
	StatsChanged: "StatsChanged",
	Notify: "Notify",
	WorldProgress: "WorldProgress",
} as const;
