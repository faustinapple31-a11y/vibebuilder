import { AssetService, ReplicatedStorage, RunService } from "@rbxts/services";
import { base64ToBuffer, readF32 } from "./decode";
import type { MeshDataJSON } from "./types";

/**
 * Procedural meshes → MeshParts. Order of preference:
 *  1. an uploaded mesh asset id (Open Cloud) → `Content.fromUri("rbxassetid://…")`,
 *  2. an EditableMesh built from the baked triangle soup (`AssetService:CreateMeshPartAsync`),
 *  3. nothing (the caller spawns the primitive fallback).
 * Templates are cached per key and cloned; building yields (CreateMeshPartAsync), so callers run in
 * a thread that may yield (the world build loop does).
 *
 * Replication: an EditableMesh created on the server does not render on clients (only its MeshPart
 * shell replicates). The server therefore publishes every mesh's triangle data under
 * `ReplicatedStorage.WorldAssets.Meshes/<key>` and tags its MeshParts with the `WfMesh` attribute; the
 * client (`client/MeshRender.ts`) rebuilds the same meshes locally and `ApplyMesh`es them.
 */
const templates = new Map<string, MeshPart | false>();
/**
 * The EditableMesh objects behind the templates. They are never parented, so without a live reference the
 * garbage collector destroys them and every MeshPart clone referencing them turns into a checkerboard.
 */
const keepAlive: EditableMesh[] = [];
/** Studs per material tile for the planar UVs. */
const TILE = 8;

function buildEditable(data: MeshDataJSON): MeshPart | undefined {
	// FixedSize: the mesh reserves only what it holds — dynamic meshes reserve so much that a client can
	// only hold a handful before CreateEditableMesh returns nil / replicated meshes stop rendering
	const [okCreate, em] = pcall(() => AssetService.CreateEditableMesh({ FixedSize: true }));
	if (!okCreate) {
		warn(`WorldForge: EditableMesh unavailable (${em})`);
		return undefined;
	}
	const mesh = em as EditableMesh | undefined;
	if (!mesh) {
		warn("WorldForge: EditableMesh budget exhausted");
		return undefined;
	}
	const buf = base64ToBuffer(data.trianglesB64);
	const triangles = data.triangleCount;
	const [okFill, err] = pcall(() => {
		for (let t = 0; t < triangles; t++) {
			const o = t * 9;
			const a = new Vector3(readF32(buf, o), readF32(buf, o + 1), readF32(buf, o + 2));
			const b = new Vector3(readF32(buf, o + 3), readF32(buf, o + 4), readF32(buf, o + 5));
			const c = new Vector3(readF32(buf, o + 6), readF32(buf, o + 7), readF32(buf, o + 8));
			// flat shading: one normal per face, applied to its three (unshared) vertices
			const n = b.sub(a).Cross(c.sub(a));
			const normal = n.Magnitude > 1e-6 ? n.Unit : new Vector3(0, 1, 0);
			const va = mesh.AddVertex(a);
			const vb = mesh.AddVertex(b);
			const vc = mesh.AddVertex(c);
			const face = mesh.AddTriangle(va, vb, vc);
			const nid = mesh.AddNormal(normal);
			mesh.SetFaceNormals(face, [nid, nid, nid]);
			// planar UVs on the face's dominant axis (materials need UVs; 1 tile = TILE studs)
			const ax = math.abs(normal.X);
			const ay = math.abs(normal.Y);
			const az = math.abs(normal.Z);
			const uv = (v: Vector3) => (ay >= ax && ay >= az ? new Vector2(v.X, v.Z) : ax >= az ? new Vector2(v.Z, v.Y) : new Vector2(v.X, v.Y)).div(TILE);
			mesh.SetFaceUVs(face, [mesh.AddUV(uv(a)), mesh.AddUV(uv(b)), mesh.AddUV(uv(c))]);
		}
	});
	if (!okFill) {
		warn(`WorldForge: mesh build failed (${err})`);
		return undefined;
	}
	const [okPart, part] = pcall(() => AssetService.CreateMeshPartAsync(Content.fromObject(mesh), { CollisionFidelity: Enum.CollisionFidelity.Hull, RenderFidelity: Enum.RenderFidelity.Precise }));
	if (!okPart) {
		warn(`WorldForge: CreateMeshPartAsync failed (${part})`);
		return undefined;
	}
	keepAlive.push(mesh);
	return part as MeshPart;
}

function buildFromAsset(assetId: number): MeshPart | undefined {
	const [ok, part] = pcall(() => AssetService.CreateMeshPartAsync(Content.fromUri(`rbxassetid://${assetId}`), { CollisionFidelity: Enum.CollisionFidelity.Hull }));
	if (!ok) {
		warn(`WorldForge: mesh asset ${assetId} failed (${part})`);
		return undefined;
	}
	return part as MeshPart;
}

/** Folder the server publishes mesh data into (StringValue per key: Value = triangles, attributes = counts / asset id). */
export function meshDataFolder(create: boolean): Folder | undefined {
	const assets = ReplicatedStorage.FindFirstChild("WorldAssets") as Folder | undefined;
	if (!assets) return undefined;
	let f = assets.FindFirstChild("Meshes") as Folder | undefined;
	if (!f && create) {
		f = new Instance("Folder");
		f.Name = "Meshes";
		f.Parent = assets;
	}
	return f;
}

function publish(key: string, data: MeshDataJSON): void {
	const f = meshDataFolder(true);
	if (!f || f.FindFirstChild(key)) return;
	const sv = new Instance("StringValue");
	sv.Name = key;
	sv.Value = data.trianglesB64;
	sv.SetAttribute("TriangleCount", data.triangleCount);
	if (data.assetId !== undefined) sv.SetAttribute("AssetId", data.assetId);
	sv.Parent = f;
}

/** Mesh data back from a published StringValue. */
export function meshDataFromValue(sv: StringValue): MeshDataJSON {
	const assetId = sv.GetAttribute("AssetId");
	return { trianglesB64: sv.Value, triangleCount: (sv.GetAttribute("TriangleCount") as number | undefined) ?? 0, bounds: { min: [0, 0, 0], max: [0, 0, 0] }, assetId: typeIs(assetId, "number") ? assetId : undefined };
}

/** Template MeshPart for a mesh (cached), or undefined when meshes cannot be built on this client. */
const inflight = new Set<string>();
export function meshTemplate(key: string, data: MeshDataJSON): MeshPart | undefined {
	// building yields: callers arriving while a key is in flight wait for that build instead of duplicating it
	for (;;) {
		const hit = templates.get(key);
		if (hit !== undefined) return hit === false ? undefined : hit;
		if (!inflight.has(key)) break;
		task.wait(0.05);
	}
	inflight.add(key);
	const part = (data.assetId !== undefined && data.assetId > 0 ? buildFromAsset(data.assetId) : undefined) ?? buildEditable(data);
	inflight.delete(key);
	if (!part) {
		templates.set(key, false);
		return undefined;
	}
	part.Name = "Mesh";
	part.Anchored = true;
	part.Parent = undefined;
	templates.set(key, part);
	if (RunService.IsServer()) publish(key, data);
	return part;
}

/** Number of mesh templates built so far (diagnostics). */
export function meshTemplateCount(): number {
	let n = 0;
	for (const [, v] of templates) if (v !== false) n++;
	return n;
}
