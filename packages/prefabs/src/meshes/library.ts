import { Rng, deriveSeed, type MeshData, type StyleBible } from "@worldforge/core";
import { rockMesh, rockShapeFor } from "./rocks-mesh";

/**
 * The shared mesh library of a bake: a handful of meshes every rock prefab reuses with its own scale,
 * rotation and colour. Kept deliberately small — a Roblox client can only hold a few EditableMeshes
 * (memory budget), so variety comes from transforms, not from unique geometry.
 */
export const MESH_LIBRARY_IDS = ["rock_a", "rock_b", "pebble_a", "cliff_a", "cliff_b", "slab_a"] as const;
export type MeshLibraryId = (typeof MESH_LIBRARY_IDS)[number];
export type MeshLibrary = Record<MeshLibraryId, MeshData>;

const cache = new Map<string, MeshLibrary>();

export function buildMeshLibrary(style: StyleBible, seed: number): MeshLibrary {
  const key = `${style.id}#${seed}#${style.geometry}#${style.rock.variation}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = new Rng(deriveSeed(seed, "mesh-library"));
  const lib: MeshLibrary = {
    rock_a: rockMesh(rng, rockShapeFor(style, rng, 10, "boulder")),
    rock_b: rockMesh(rng, { ...rockShapeFor(style, rng, 10, "boulder"), frequency: 1.6 }),
    pebble_a: rockMesh(rng, rockShapeFor(style, rng, 4, "pebble")),
    cliff_a: rockMesh(rng, rockShapeFor(style, rng, 20, "cliff")),
    cliff_b: rockMesh(rng, { ...rockShapeFor(style, rng, 20, "cliff"), rough: 0.3, frequency: 1.3 }),
    slab_a: rockMesh(rng, { ...rockShapeFor(style, rng, 14, "cliff"), radius: [8, 3.5, 6], flatten: 0.8 }),
  };
  cache.set(key, lib);
  return lib;
}
