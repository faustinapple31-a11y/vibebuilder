import { base64ToF32, type MeshData, type WorldBake } from "@worldforge/core";

/**
 * Procedural meshes as real Roblox mesh assets. The Open Cloud Assets API takes `.fbx` for "Model"
 * assets (the file is imported like a Studio mesh import: a Model holding a MeshPart per FBX mesh), and
 * Studio resolves the MeshId behind it (`game:GetObjects("rbxassetid://<model>")`). The ids live in
 * `design/meshes.manifest.json` keyed by content hash; `applyMeshAssetIds` stamps them into a bake so the
 * runtime builds the parts with `CreateMeshPartAsync(rbxassetid)` instead of an EditableMesh — no client
 * mesh budget, real replication, no per-client rebuild.
 */
export interface MeshAssetEntry {
  key: string;
  triangles: number;
  /** Open Cloud "Model" asset (the FBX import) */
  modelAssetId: number;
  /** the mesh asset inside it — what MeshPart.MeshId / CreateMeshPartAsync need (0 until resolved in Studio) */
  meshId: number;
}

export interface MeshAssetManifest {
  version: 1;
  entries: Record<string, MeshAssetEntry>;
}

export const MESH_MANIFEST_PATH = "design/meshes.manifest.json";

/** FNV-1a of the triangle payload, 12 hex chars: the identity of a mesh across bakes / variants. */
export function meshHash(data: MeshData): string {
  let h1 = 2166136261;
  let h2 = 0x9747b28c;
  const s = data.trianglesB64;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h2 >>> 13);
  }
  return ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")).slice(0, 12);
}

/** Every distinct mesh of a bake (library meshes are shared by reference across variants → one entry each). */
export function uniqueMeshes(bake: WorldBake): { hash: string; key: string; data: MeshData }[] {
  const seen = new Map<string, { hash: string; key: string; data: MeshData }>();
  for (const variants of Object.values(bake.prefabs)) {
    for (const v of variants) {
      if (!v.meshes) continue;
      for (const [key, data] of Object.entries(v.meshes)) {
        const hash = meshHash(data);
        if (!seen.has(hash)) seen.set(hash, { hash, key, data });
      }
    }
  }
  return [...seen.values()];
}

/** A copy of the bake whose meshes carry the manifest's mesh asset ids (unchanged when nothing matches). */
export function applyMeshAssetIds(bake: WorldBake, manifest: MeshAssetManifest | null): WorldBake {
  if (!manifest || Object.keys(manifest.entries).length === 0) return bake;
  let changed = false;
  const prefabs: WorldBake["prefabs"] = {};
  for (const [id, variants] of Object.entries(bake.prefabs)) {
    prefabs[id] = variants.map((v) => {
      if (!v.meshes) return v;
      const meshes: Record<string, MeshData> = {};
      let touched = false;
      for (const [key, data] of Object.entries(v.meshes)) {
        const entry = manifest.entries[meshHash(data)];
        if (entry && entry.meshId > 0 && data.assetId !== entry.meshId) {
          meshes[key] = { ...data, assetId: entry.meshId };
          touched = true;
        } else meshes[key] = data;
      }
      if (!touched) return v;
      changed = true;
      return { ...v, meshes };
    });
  }
  return changed ? { ...bake, prefabs } : bake;
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(5).replace(/\.?0+$/, ""));

/**
 * ASCII FBX 7.4 of a triangle soup (flat normals, planar UVs on each face's dominant axis, 1 tile = 8
 * studs). The structure mirrors Blender's exporter (Documents / templates): the Roblox importer rejects a
 * bare Objects/Connections file with "no mesh content".
 */
export function meshToFbx(data: MeshData, name: string): string {
  const tris = base64ToF32(data.trianglesB64);
  const safe = name.replace(/[^a-z0-9_]+/gi, "_");
  const verts: number[] = [];
  const idx: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const TILE = 8;
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const a = [tris[i]!, tris[i + 1]!, tris[i + 2]!];
    const b = [tris[i + 3]!, tris[i + 4]!, tris[i + 5]!];
    const c = [tris[i + 6]!, tris[i + 7]!, tris[i + 8]!];
    const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    let n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const len = Math.hypot(n[0]!, n[1]!, n[2]!);
    n = len > 1e-9 ? [n[0]! / len, n[1]! / len, n[2]! / len] : [0, 1, 0];
    const ax = Math.abs(n[0]!);
    const ay = Math.abs(n[1]!);
    const az = Math.abs(n[2]!);
    const base = verts.length / 3;
    for (const p of [a, b, c]) {
      verts.push(p[0]!, p[1]!, p[2]!);
      normals.push(n[0]!, n[1]!, n[2]!);
      const uv = ay >= ax && ay >= az ? [p[0]!, p[2]!] : ax >= az ? [p[2]!, p[1]!] : [p[0]!, p[1]!];
      uvs.push(uv[0]! / TILE, uv[1]! / TILE);
    }
    idx.push(base, base + 1, -(base + 2) - 1);
  }
  const arr = (vals: number[]) => vals.map(fmt).join(",");
  return `; FBX 7.4.0 project file
; ----------------------------------------------------

FBXHeaderExtension:  {
	FBXHeaderVersion: 1003
	FBXVersion: 7400
	CreationTimeStamp:  {
		Version: 1000
		Year: 2026
		Month: 1
		Day: 1
		Hour: 0
		Minute: 0
		Second: 0
		Millisecond: 0
	}
	Creator: "WorldForge"
	SceneInfo: "SceneInfo::GlobalInfo", "UserData" {
		Type: "UserData"
		Version: 100
		MetaData:  {
			Version: 100
			Title: ""
			Subject: ""
			Author: ""
			Keywords: ""
			Revision: ""
			Comment: ""
		}
		Properties70:  {
			P: "DocumentUrl", "KString", "Url", "", "${safe}.fbx"
			P: "SrcDocumentUrl", "KString", "Url", "", "${safe}.fbx"
			P: "Original", "Compound", "", ""
			P: "Original|ApplicationVendor", "KString", "", "", "WorldForge"
			P: "Original|ApplicationName", "KString", "", "", "WorldForge"
			P: "Original|ApplicationVersion", "KString", "", "", "1"
			P: "Original|DateTime_GMT", "DateTime", "", "", "01/01/2026 00:00:00.000"
			P: "Original|FileName", "KString", "", "", "${safe}.fbx"
			P: "LastSaved", "Compound", "", ""
			P: "LastSaved|ApplicationVendor", "KString", "", "", "WorldForge"
			P: "LastSaved|ApplicationName", "KString", "", "", "WorldForge"
			P: "LastSaved|ApplicationVersion", "KString", "", "", "1"
			P: "LastSaved|DateTime_GMT", "DateTime", "", "", "01/01/2026 00:00:00.000"
		}
	}
}
GlobalSettings:  {
	Version: 1000
	Properties70:  {
		P: "UpAxis", "int", "Integer", "",1
		P: "UpAxisSign", "int", "Integer", "",1
		P: "FrontAxis", "int", "Integer", "",2
		P: "FrontAxisSign", "int", "Integer", "",1
		P: "CoordAxis", "int", "Integer", "",0
		P: "CoordAxisSign", "int", "Integer", "",1
		P: "OriginalUpAxis", "int", "Integer", "",-1
		P: "OriginalUpAxisSign", "int", "Integer", "",1
		P: "UnitScaleFactor", "double", "Number", "",1
		P: "OriginalUnitScaleFactor", "double", "Number", "",1
		P: "AmbientColor", "ColorRGB", "Color", "",0,0,0
		P: "DefaultCamera", "KString", "", "", "Producer Perspective"
		P: "TimeMode", "enum", "", "",11
		P: "TimeSpanStart", "KTime", "Time", "",0
		P: "TimeSpanStop", "KTime", "Time", "",46186158000
		P: "CustomFrameRate", "double", "Number", "",24
	}
}

; Documents Description
;------------------------------------------------------------------

Documents:  {
	Count: 1
	Document: 1234567, "", "Scene" {
		Properties70:  {
			P: "SourceObject", "object", "", ""
			P: "ActiveAnimStackName", "KString", "", "", ""
		}
		RootNode: 0
	}
}

; Document References
;------------------------------------------------------------------

References:  {
}

; Object definitions
;------------------------------------------------------------------

Definitions:  {
	Version: 100
	Count: 3
	ObjectType: "GlobalSettings" {
		Count: 1
	}
	ObjectType: "Geometry" {
		Count: 1
		PropertyTemplate: "FbxMesh" {
			Properties70:  {
				P: "Color", "ColorRGB", "Color", "",0.8,0.8,0.8
				P: "BBoxMin", "Vector3D", "Vector", "",0,0,0
				P: "BBoxMax", "Vector3D", "Vector", "",0,0,0
				P: "Primary Visibility", "bool", "", "",1
				P: "Casts Shadows", "bool", "", "",1
				P: "Receive Shadows", "bool", "", "",1
			}
		}
	}
	ObjectType: "Model" {
		Count: 1
		PropertyTemplate: "FbxNode" {
			Properties70:  {
				P: "QuaternionInterpolate", "enum", "", "",0
				P: "RotationOffset", "Vector3D", "Vector", "",0,0,0
				P: "RotationPivot", "Vector3D", "Vector", "",0,0,0
				P: "ScalingOffset", "Vector3D", "Vector", "",0,0,0
				P: "ScalingPivot", "Vector3D", "Vector", "",0,0,0
				P: "TranslationActive", "bool", "", "",0
				P: "TranslationMin", "Vector3D", "Vector", "",0,0,0
				P: "TranslationMax", "Vector3D", "Vector", "",0,0,0
				P: "TranslationMinX", "bool", "", "",0
				P: "TranslationMinY", "bool", "", "",0
				P: "TranslationMinZ", "bool", "", "",0
				P: "TranslationMaxX", "bool", "", "",0
				P: "TranslationMaxY", "bool", "", "",0
				P: "TranslationMaxZ", "bool", "", "",0
				P: "RotationOrder", "enum", "", "",0
				P: "RotationSpaceForLimitOnly", "bool", "", "",0
				P: "RotationStiffnessX", "double", "Number", "",0
				P: "RotationStiffnessY", "double", "Number", "",0
				P: "RotationStiffnessZ", "double", "Number", "",0
				P: "AxisLen", "double", "Number", "",10
				P: "PreRotation", "Vector3D", "Vector", "",0,0,0
				P: "PostRotation", "Vector3D", "Vector", "",0,0,0
				P: "RotationActive", "bool", "", "",0
				P: "RotationMin", "Vector3D", "Vector", "",0,0,0
				P: "RotationMax", "Vector3D", "Vector", "",0,0,0
				P: "RotationMinX", "bool", "", "",0
				P: "RotationMinY", "bool", "", "",0
				P: "RotationMinZ", "bool", "", "",0
				P: "RotationMaxX", "bool", "", "",0
				P: "RotationMaxY", "bool", "", "",0
				P: "RotationMaxZ", "bool", "", "",0
				P: "InheritType", "enum", "", "",0
				P: "ScalingActive", "bool", "", "",0
				P: "ScalingMin", "Vector3D", "Vector", "",0,0,0
				P: "ScalingMax", "Vector3D", "Vector", "",1,1,1
				P: "ScalingMinX", "bool", "", "",0
				P: "ScalingMinY", "bool", "", "",0
				P: "ScalingMinZ", "bool", "", "",0
				P: "ScalingMaxX", "bool", "", "",0
				P: "ScalingMaxY", "bool", "", "",0
				P: "ScalingMaxZ", "bool", "", "",0
				P: "GeometricTranslation", "Vector3D", "Vector", "",0,0,0
				P: "GeometricRotation", "Vector3D", "Vector", "",0,0,0
				P: "GeometricScaling", "Vector3D", "Vector", "",1,1,1
				P: "MinDampRangeX", "double", "Number", "",0
				P: "MinDampRangeY", "double", "Number", "",0
				P: "MinDampRangeZ", "double", "Number", "",0
				P: "MaxDampRangeX", "double", "Number", "",0
				P: "MaxDampRangeY", "double", "Number", "",0
				P: "MaxDampRangeZ", "double", "Number", "",0
				P: "MinDampStrengthX", "double", "Number", "",0
				P: "MinDampStrengthY", "double", "Number", "",0
				P: "MinDampStrengthZ", "double", "Number", "",0
				P: "MaxDampStrengthX", "double", "Number", "",0
				P: "MaxDampStrengthY", "double", "Number", "",0
				P: "MaxDampStrengthZ", "double", "Number", "",0
				P: "PreferedAngleX", "double", "Number", "",0
				P: "PreferedAngleY", "double", "Number", "",0
				P: "PreferedAngleZ", "double", "Number", "",0
				P: "LookAtProperty", "object", "", ""
				P: "UpVectorProperty", "object", "", ""
				P: "Show", "bool", "", "",1
				P: "NegativePercentShapeSupport", "bool", "", "",1
				P: "DefaultAttributeIndex", "int", "Integer", "",-1
				P: "Freeze", "bool", "", "",0
				P: "LODBox", "bool", "", "",0
				P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0
				P: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
				P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
				P: "Visibility", "Visibility", "", "A",1
				P: "Visibility Inheritance", "Visibility Inheritance", "", "",1
			}
		}
	}
}

; Object properties
;------------------------------------------------------------------

Objects:  {
	Geometry: 1000, "Geometry::${safe}", "Mesh" {
		Vertices: *${verts.length} {
			a: ${arr(verts)}
		}
		PolygonVertexIndex: *${idx.length} {
			a: ${arr(idx)}
		}
		Edges: *0 {
			a:
		}
		GeometryVersion: 124
		LayerElementNormal: 0 {
			Version: 101
			Name: ""
			MappingInformationType: "ByPolygonVertex"
			ReferenceInformationType: "Direct"
			Normals: *${normals.length} {
				a: ${arr(normals)}
			}
		}
		LayerElementUV: 0 {
			Version: 101
			Name: "UVMap"
			MappingInformationType: "ByPolygonVertex"
			ReferenceInformationType: "Direct"
			UV: *${uvs.length} {
				a: ${arr(uvs)}
			}
		}
		Layer: 0 {
			Version: 100
			LayerElement:  {
				Type: "LayerElementNormal"
				TypedIndex: 0
			}
			LayerElement:  {
				Type: "LayerElementUV"
				TypedIndex: 0
			}
		}
	}
	Model: 2000, "Model::${safe}", "Mesh" {
		Version: 232
		Properties70:  {
			P: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
			P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
			P: "DefaultAttributeIndex", "int", "Integer", "",0
			P: "InheritType", "enum", "", "",1
		}
		MultiLayer: 0
		MultiTake: 0
		Shading: Y
		Culling: "CullingOff"
	}
}

; Object connections
;------------------------------------------------------------------

Connections:  {

	;Model::${safe}, Model::RootNode
	C: "OO",2000,0

	;Geometry::${safe}, Model::${safe}
	C: "OO",1000,2000
}
`;
}

/** Luau (Studio, Edit or Server datamodel) resolving `modelId=meshId` pairs for uploaded models. */
export function meshIdResolverLuau(modelIds: number[]): string {
  return `local out = {}
for _, id in ipairs({${modelIds.join(", ")}}) do
  local ok, objs = pcall(function() return game:GetObjects("rbxassetid://" .. id) end)
  if ok then
    for _, o in ipairs(objs) do
      local mp = o:IsA("MeshPart") and o or o:FindFirstChildWhichIsA("MeshPart", true)
      local mesh = mp and tostring(mp.MeshId):match("%d+")
      if mesh then table.insert(out, id .. "=" .. mesh) break end
    end
  end
end
return table.concat(out, ",")`;
}
