import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Download, Heart, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { getStylePreset, hexToRgb, newId, sampleHeight, type PrefabCategory, type PrefabVariant } from "@worldforge/core";
import { PREFAB_DEFINITIONS, buildPrefabVariants } from "@worldforge/prefabs";
import { prefabToRbxmx } from "@worldforge/roblox-export";
import { Button, Input, Select } from "@/components/ui";
import { settingsRepo } from "@/lib/db";
import { fs, path } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useProjects } from "@/stores/projectStore";
import { useWorld } from "@/stores/worldStore";
import { variantGeometry } from "@/features/viewer/geometry";
import { GeneratePanel } from "./GeneratePanel";
import { HeroMeshPanel } from "./HeroMeshPanel";
import { loadGlbScene, type MeshAssetRecord } from "@/lib/meshAssets";

const CATEGORIES: ("all" | PrefabCategory)[] = ["all", "vegetation", "rock", "building", "prop", "landmark", "path"];

export function AssetsView() {
  const style = useWorld((s) => s.style) ?? getStylePreset("stylized_mystical");
  const bake = useWorld((s) => s.bake);
  const project = useProjects((s) => s.current)!;
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("all");
  const [selected, setSelected] = useState<string>(PREFAB_DEFINITIONS[0]!.id);
  const [variantIdx, setVariantIdx] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [onlyFav, setOnlyFav] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hero, setHero] = useState<MeshAssetRecord | null>(null);

  useEffect(() => {
    void settingsRepo.get<string[]>("favoriteAssets", []).then(setFavorites);
  }, []);

  const defs = useMemo(
    () => PREFAB_DEFINITIONS.filter((d) => (cat === "all" || d.category === cat) && (!query || d.id.includes(query.toLowerCase()) || d.tags.some((t) => t.includes(query.toLowerCase()))) && (!onlyFav || favorites.includes(d.id))),
    [cat, query, onlyFav, favorites],
  );
  const variants = useMemo(() => (bake?.prefabs[selected] ?? buildPrefabVariants(selected, style, 1234)) as PrefabVariant[], [selected, style, bake]);
  const variant = variants[Math.min(variantIdx, variants.length - 1)];

  const toggleFav = async (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    setFavorites(next);
    await settingsRepo.set("favoriteAssets", next);
  };

  const insert = () => {
    if (!bake || !variant) return;
    const sel = useWorld.getState().selectedPlacementId;
    const near = sel ? bake.placements.find((p) => p.id === sel) : null;
    const x = (near?.position[0] ?? bake.spawn.position[0]) + 8;
    const z = (near?.position[2] ?? bake.spawn.position[2]) + 8;
    const y = sampleHeight(bake.terrain, x, z) - variant.sinkDepth;
    const placement = { id: newId("manual", 6), prefab: variant.prefab, variant: variants.indexOf(variant), category: variant.category, position: [x, y, z] as [number, number, number], rotationY: 0, scale: 1, layer: "foreground" as const, locked: true, importance: 10 };
    const prefabs = bake.prefabs[variant.prefab] ? bake.prefabs : { ...bake.prefabs, [variant.prefab]: variants };
    useWorld.setState({ bake: { ...bake, prefabs, placements: [...bake.placements, placement] } });
    useWorld.getState().select(placement.id);
    setMessage(`Inserted ${variant.id} near ${near ? "the selection" : "the spawn"} (locked). Regenerate props/vegetation keeps it.`);
  };

  const exportRbxmx = async () => {
    if (!variant) return;
    const dest = path.join(project.path, "assets", "models", `${variant.id.replace("/", "_")}.rbxmx`);
    await fs.writeText(dest, prefabToRbxmx(variant));
    setMessage(`Exported ${dest}`);
  };

  return (
    <div className="grid h-full grid-cols-[300px_1fr_320px] gap-3 p-3">
      <aside className="panel flex min-h-0 flex-col overflow-hidden">
        <div className="space-y-2 border-b border-line p-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-2.5 text-faint" />
            <Input className="pl-6" placeholder="Search prefabs…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex items-center gap-1">
            <Select value={cat} onChange={(e) => setCat(e.target.value as (typeof CATEGORIES)[number])} className="flex-1">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <button onClick={() => setOnlyFav(!onlyFav)} className={cn("flex h-7 items-center gap-1 rounded-md border px-2 text-xs", onlyFav ? "border-err/40 bg-err-soft text-err" : "border-line text-muted")}>
              <Heart size={11} /> favorites
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1">
          {defs.map((d) => (
            <button key={d.id} onClick={() => { setSelected(d.id); setVariantIdx(0); }} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-panel-2", selected === d.id && "bg-brand-soft")}>
              <span className="h-2 w-2 rounded-full" style={{ background: d.category === "vegetation" ? "#3f7f4a" : d.category === "rock" ? "#7c7f86" : d.category === "building" ? "#9a6a4a" : d.category === "landmark" ? "#7b4f8f" : "#c9a45a" }} />
              <span className="flex-1 font-medium">{d.id}</span>
              <span className="text-[10px] text-faint">{d.variants}v · ~{d.approxParts}p</span>
              <Heart size={11} className={cn(favorites.includes(d.id) ? "fill-err text-err" : "text-faint")} onClick={(e) => { e.stopPropagation(); void toggleFav(d.id); }} />
            </button>
          ))}
        </div>
      </aside>
      <div className="panel relative min-h-0 overflow-hidden bg-[#e8ecf1]">
        {hero ? <HeroPreview key={hero.id} record={hero} projectPath={project.path} /> : variant && <VariantPreview key={variant.id} variant={variant} />}
        {hero && (
          <div className="absolute left-3 top-3 rounded-md bg-panel/90 px-2 py-1 text-[11px]">
            {hero.name} · GLB preview · {hero.triangles?.toLocaleString() ?? "?"} tris
          </div>
        )}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1">
          {variants.map((v, i) => (
            <button key={v.id} onClick={() => setVariantIdx(i)} className={cn("h-6 min-w-6 rounded-md border px-1.5 text-[11px]", i === variantIdx ? "border-brand bg-brand text-white" : "border-line bg-panel")}>
              {i}
            </button>
          ))}
        </div>
      </div>
      <aside className="panel flex min-h-0 flex-col gap-3 overflow-auto p-3 text-xs">
        {variant && (
          <>
            <div>
              <div className="text-sm font-semibold">{variant.id}</div>
              <div className="text-muted">
                {variant.category} · {variant.parts.length} parts · footprint {variant.footprintRadius.toFixed(1)} · sink {variant.sinkDepth.toFixed(1)}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {variant.tags.map((t) => (
                  <span key={t} className="rounded-full bg-panel-2 px-2 py-0.5 text-[10px] text-muted">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Registry</div>
              <dl className="grid grid-cols-[90px_1fr] gap-y-0.5">
                <dt className="text-muted">style</dt>
                <dd>{style.id}</dd>
                <dt className="text-muted">biome</dt>
                <dd>any</dd>
                <dt className="text-muted">rarity</dt>
                <dd>{variant.category === "landmark" ? "unique" : "common"}</dd>
                <dt className="text-muted">bbox</dt>
                <dd className="font-mono">{variant.bounds.max.map((v, i) => (v - variant.bounds.min[i]!).toFixed(0)).join(" × ")}</dd>
                <dt className="text-muted">materials</dt>
                <dd>{[...new Set(variant.parts.map((p) => p.material))].join(", ")}</dd>
                <dt className="text-muted">source</dt>
                <dd>procedural (PartList)</dd>
                <dt className="text-muted">license</dt>
                <dd>WorldForge · CC0</dd>
              </dl>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button size="sm" variant="brand" icon={<Plus size={12} />} disabled={!bake} onClick={insert}>
                Place in world
              </Button>
              <Button size="sm" variant="outline" icon={<Download size={12} />} onClick={() => void exportRbxmx()}>
                Export .rbxmx
              </Button>
              <Button size="sm" variant="ghost" icon={<Heart size={12} className={cn(favorites.includes(variant.prefab) && "fill-err text-err")} />} onClick={() => void toggleFav(variant.prefab)}>
                {favorites.includes(variant.prefab) ? "Favorite" : "Add to favorites"}
              </Button>
            </div>
            {message && <div className="rounded-md bg-panel-2 p-2 text-[11px]">{message}</div>}
            <div className="text-[11px] text-faint">The registry is designed for large open-source / licensed libraries (rbxmx, glb, Roblox asset ids); procedural prefabs ship by default and are always available offline.</div>
          </>
        )}
        <div className="border-t border-line pt-3">
          <HeroMeshPanel selected={hero} onSelect={setHero} />
        </div>
        <div className="border-t border-line pt-3">
          <GeneratePanel />
        </div>
      </aside>
    </div>
  );
}

/** Real GLB of a hero mesh (textures included), feet on the ground disc, framed by its height. */
function HeroPreview({ record, projectPath }: { record: MeshAssetRecord; projectPath: string }) {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadGlbScene(path.join(projectPath, record.glb))
      .then((g) => alive && setScene(g))
      .catch((e) => alive && setErr((e as Error).message));
    return () => {
      alive = false;
    };
  }, [record.glb, projectPath]);
  if (err) return <div className="p-4 text-xs text-err">{err}</div>;
  if (!scene) return <div className="p-4 text-xs text-muted">Loading model…</div>;
  const fit = record.heightStuds / Math.max(0.001, record.nativeSize[1]);
  const h = record.heightStuds;
  const w = Math.max(record.nativeSize[0], record.nativeSize[2]) * fit;
  const extent = Math.max(h, w, 4);
  const dist = extent * 1.7 + 6;
  const target: [number, number, number] = [0, h * 0.45, 0];
  return (
    <Canvas camera={{ position: [dist * 0.75, target[1] + dist * 0.5, dist * 0.75], fov: 42, near: 0.5, far: 4000 }} gl={{ antialias: true }} onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; }}>
      <hemisphereLight args={["#fff6e6", "#8a97ab", 1.4]} />
      <directionalLight position={[60, 120, 40]} intensity={2.2} castShadow />
      <directionalLight position={[-40, 30, -60]} intensity={0.6} color="#b8c8ff" />
      <ambientLight intensity={0.3} />
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[Math.max(w, 6) * 1.2, 40]} />
        <meshStandardMaterial color={new THREE.Color(...hexToRgb("#5d7a55"))} />
      </mesh>
      <primitive object={scene} scale={fit} />
      <OrbitControls target={target} autoRotate autoRotateSpeed={1.2} />
    </Canvas>
  );
}

function VariantPreview({ variant }: { variant: PrefabVariant }) {
  const geo = useMemo(() => variantGeometry(variant, 0), [variant]);
  const { min, max } = variant.bounds;
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 4);
  const dist = extent * 1.7 + 6;
  const r = Math.max(variant.footprintRadius, extent * 0.5, 4);
  const target: [number, number, number] = [(min[0] + max[0]) / 2, Math.max(0, min[1]) + (max[1] - Math.max(0, min[1])) * 0.45, (min[2] + max[2]) / 2];
  return (
    <Canvas camera={{ position: [target[0] + dist * 0.75, target[1] + dist * 0.5, target[2] + dist * 0.75], fov: 42, near: 0.5, far: 4000 }} gl={{ antialias: true }} onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; }}>
      <hemisphereLight args={["#fff6e6", "#8a97ab", 1.6]} />
      <directionalLight position={[60, 120, 40]} intensity={2.4} castShadow />
      <directionalLight position={[-40, 30, -60]} intensity={0.7} color="#b8c8ff" />
      <ambientLight intensity={0.35} />
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[r * 1.8, 40]} />
        <meshStandardMaterial color={new THREE.Color(...hexToRgb("#5d7a55"))} />
      </mesh>
      {geo.opaque && (
        <mesh geometry={geo.opaque} castShadow receiveShadow>
          <meshStandardMaterial vertexColors flatShading roughness={0.9} />
        </mesh>
      )}
      {geo.emissive && (
        <mesh geometry={geo.emissive}>
          <meshBasicMaterial vertexColors toneMapped={false} />
        </mesh>
      )}
      <OrbitControls target={target} autoRotate autoRotateSpeed={1.2} />
    </Canvas>
  );
}
