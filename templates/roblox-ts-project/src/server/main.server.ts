import { Workspace } from "@rbxts/services";
import { buildWorld, loadBake } from "world/WorldBuilder";
import * as PlayerData from "systems/PlayerData";
import * as Survival from "systems/Survival";
import * as Collectibles from "systems/Collectibles";
import { getRemoteEvent, Remotes } from "shared/net";

/**
 * Server bootstrap: build the world (unless prebaked into the place), then start gameplay systems.
 */
const progress = getRemoteEvent(Remotes.WorldProgress);
PlayerData.start();

const prebaked = Workspace.GetAttribute("WorldPrebaked") === true;
if (!prebaked) {
	const bake = loadBake();
	print(`[WorldForge] building world "${bake.meta.specName}" ${bake.meta.version} (${bake.placementCount} placements)`);
	const report = buildWorld(bake, {
		onProgress: (stage, done, total) => progress.FireAllClients(stage, done, total),
	});
	print(`[WorldForge] world ready: ${report.placements} placements, ${report.terrainChunks} terrain chunks in ${string.format("%.1f", report.seconds)}s`);
} else {
	Workspace.SetAttribute("WorldReady", true);
}

Survival.start();
Collectibles.start();
