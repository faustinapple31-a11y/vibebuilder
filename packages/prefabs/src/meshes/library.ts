import { Rng, deriveSeed, type MeshData, type StyleBible } from "@worldforge/core";
import { canopyClusterMesh, rockMesh, rockShapeFor } from "./rocks-mesh";

/**
 * The shared mesh library of a bake: a handful of meshes every rock prefab reuses with its own scale,
 * rotation and colour. Kept deliberately small — a Roblox client can only hold a few EditableMeshes
 * (memory budget), so variety comes from transforms, not from unique geometry.
 */
export const MESH_LIBRARY_IDS = ["rock_a", "pebble_a", "cliff_a", "cliff_b", "canopy_a", "canopy_b"] as const;
export type MeshLibraryId = (typeof MESH_LIBRARY_IDS)[number];
export type MeshLibrary = Record<MeshLibraryId, MeshData>;

const cache = new Map<string, MeshLibrary>();

export function buildMeshLibrary(style: StyleBible, seed: number): MeshLibrary {
  const key = `${style.id}#${seed}#${style.geometry}#${style.rock.variation}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = new Rng(deriveSeed(seed, "mesh-library"));
  const chunky = style.geometry === "chunky_low_poly" || style.geometry === "angular" || style.geometry === "blocky";
  const lib: MeshLibrary = {
    rock_a: rockMesh(rng, rockShapeFor(style, rng, 10, "boulder")),
    pebble_a: rockMesh(rng, rockShapeFor(style, rng, 4, "pebble")),
    cliff_a: rockMesh(rng, rockShapeFor(style, rng, 20, "cliff")),
    cliff_b: rockMesh(rng, { ...rockShapeFor(style, rng, 20, "cliff"), rough: 0.3, frequency: 1.3 }),
    // tree crowns: clustered blobs, rougher and lower-poly for the chunky styles
    canopy_a: canopyClusterMesh(rng, 4, chunky ? 0.22 : 0.12, chunky ? 1 : 2),
    canopy_b: canopyClusterMesh(rng, 3, chunky ? 0.26 : 0.14, chunky ? 1 : 2),
  };
  cache.set(key, lib);
  return lib;
}
