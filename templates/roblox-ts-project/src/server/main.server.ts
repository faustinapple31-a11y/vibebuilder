import { Workspace } from "@rbxts/services";
import { buildWorld, loadBake } from "world/WorldBuilder";
import * as PlayerData from "systems/PlayerData";
import * as Survival from "systems/Survival";
import * as Collectibles from "systems/Collectibles";
import * as Shop from "systems/Shop";
import * as Npcs from "systems/Npcs";
import * as Audio from "systems/Audio";
import * as Combat from "systems/Combat";
import * as Enemies from "systems/Enemies";
import * as Checkpoints from "systems/Checkpoints";
import * as Progression from "systems/Progression";
import * as Tycoon from "systems/Tycoon";
import * as Simulator from "systems/Simulator";
import * as Rounds from "systems/Rounds";
import * as Racing from "systems/Racing";
import * as TowerDefense from "systems/TowerDefense";
import * as Economy from "systems/Economy";
import * as Modes from "systems/Modes";
import * as Doors from "systems/Doors";
import { GameConfig } from "shared/config";
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

// core systems (always) + genre systems (only when listed in GameConfig.systems)
Survival.start();
Collectibles.start();
Shop.start();
Npcs.start();
Audio.start();
Progression.start();
Combat.start();
Enemies.start();
Checkpoints.start();
Tycoon.start();
Simulator.start();
Rounds.start();
Racing.start();
TowerDefense.start();
Economy.start();
Modes.start();
Doors.start();
print(`[WorldForge] genre ${GameConfig.genre} — systems: ${GameConfig.systems.join(", ")}`);
