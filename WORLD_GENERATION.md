# WorldForge AI — World Generation

Le générateur de monde est le cœur artistique du produit. Il raisonne comme un level designer :
composition, profondeur (foreground / midground / background), landmarks, view corridors, variation contrôlée.

Packages concernés : `@worldforge/core` (schémas), `@worldforge/world-gen` (pipeline), `@worldforge/prefabs`
(géométrie procédurale), `@worldforge/quality` (critic).

---

## 1. Représentations intermédiaires

### 1.1 WorldSpec (produite par l'IA ou par l'interpréteur local)

Source de vérité éditable, versionnée. Validée par Zod (`packages/core/src/schemas/world-spec.ts`).

```jsonc
{
  "id": "main",
  "name": "Moonlit Forest Village",
  "seed": 1337,
  "theme": "mysterious_forest",
  "stylePreset": "stylized_mystical",
  "size": { "width": 1024, "depth": 1024 },
  "terrain": {
    "baseHeight": 40, "relief": 0.6, "roughness": 0.45, "erosion": 0.5,
    "features": [
      { "type": "mountains", "placement": "edge", "edges": ["north", "west"], "intensity": 0.9 },
      { "type": "hills", "intensity": 0.5 },
      { "type": "valley", "center": [0.5, 0.55], "radius": 0.28 }
    ]
  },
  "biomes": [
    { "id": "dark_forest", "weight": 0.5, "vegetation": "dense" },
    { "id": "mushroom_grove", "weight": 0.2, "vegetation": "medium" },
    { "id": "meadow", "weight": 0.3, "vegetation": "sparse" }
  ],
  "rivers": [{ "id": "river_1", "from": "north", "to": "south-east", "width": 14, "meander": 0.6 }],
  "lakes": [],
  "landmarks": [
    { "id": "giant_tree", "type": "giant_tree", "role": "focal", "preferredZone": "hill" },
    { "id": "old_ruins", "type": "ruins", "role": "secondary", "preferredZone": "forest_edge" }
  ],
  "settlements": [
    { "id": "village", "type": "abandoned_village", "buildings": 7, "layout": "organic", "near": "river_1" }
  ],
  "roads": [{ "id": "main_path", "type": "stone_path", "connects": ["spawn", "village", "giant_tree"] }],
  "vegetation": { "density": 0.7, "clustering": 0.6, "species": ["pine", "round_tree", "dead_tree", "giant_mushroom", "bush", "fern", "grass"] },
  "props": { "density": 0.5, "sets": ["village", "forest", "ruins"] },
  "lighting": { "timeOfDay": 20.5, "mood": "moonlit", "brightness": 0.6 },
  "atmosphere": { "fogDensity": 0.45, "fogColor": "#7d8aa3", "haze": 0.6 },
  "colorPalette": { "primary": "#3e5a45", "secondary": "#6d7a8c", "accent": "#7b4f8f", "ground": "#4a3b2c", "stone": "#7c7f86", "wood": "#5c3a2a" },
  "cameraComposition": { "spawnFacing": "giant_tree", "spawnZone": "meadow" },
  "locks": { "terrain": false, "buildings": false, "landmarks": false, "vegetation": false, "lighting": false, "props": false },
  "gameplayHints": ["survival", "exploration"]
}
```

### 1.2 StyleBible (art direction procédurale)

Produite par le preset choisi ou par l'analyse d'une image de référence. Consommée par le générateur et les prefabs.

```jsonc
{
  "id": "stylized_mystical",
  "geometry": "chunky_low_poly",
  "palette": { ... },                  // couleurs nommées
  "materials": { "trunk": "Wood", "canopy": "Grass", "rock": "Slate", "wall": "WoodPlanks", "roof": "Slate", "path": "Cobblestone" },
  "tree": { "style": "chunky_fantasy", "scale": [1.0, 1.8], "rotationJitterDeg": 25, "canopyLayers": [2, 4], "trunkTaper": 0.7 },
  "mushroom": { "scaleMultiplier": [2, 6], "capColors": ["#7b4f8f", "#8a3f5f", "#5f4b8b"], "glow": 0.35 },
  "rock": { "variation": "high", "clusterChance": 0.6 },
  "architecture": { "style": "medieval_cottage", "roofPitch": 0.9, "weathering": 0.7, "scaleVariance": 0.25 },
  "vegetationDensity": 0.72,
  "propDensity": 0.5,
  "lighting": { "ambient": "#5d6b85", "outdoorAmbient": "#6b7690", "sunColor": "#cfd6e6", "brightness": 1.2, "shadowSoftness": 0.7 },
  "fog": { "start": 60, "end": 520, "color": "#7d8aa3", "atmosphereDensity": 0.42, "haze": 0.7, "glare": 0.1 },
  "biomeTransition": 0.35,
  "scaleRules": { "landmarkMultiplier": 3.5, "foregroundDetail": 1.0 }
}
```

### 1.3 WorldBake (sortie du générateur, déterministe)

```ts
interface WorldBake {
  meta: { specId: string; seed: number; version: string; generatedAt: string; generatorVersion: string };
  terrain: {
    cellSize: 4;                    // studs par cellule
    width: number; depth: number;   // cellules
    heights: Float32Array;          // hauteur (studs) par cellule
    materials: Uint8Array;          // index matériau Roblox par cellule
    waterLevel: Float32Array | null;// hauteur d'eau (NaN si pas d'eau)
    origin: [number, number];       // offset monde
  };
  prefabs: Record<string, PrefabVariant[]>;   // prefabId → variantes (PartList)
  placements: Placement[];          // { prefab, variant, position, rotationY, scale, layer, biome, locked, lod }
  zones: Zone[];                    // village, clearing, grove… (polygones) pour l'édition et le critic
  paths: PathPolyline[];            // routes, rivières
  landmarks: LandmarkPlacement[];   // avec corridors de vue calculés
  lighting: RobloxLightingSettings;
  spawn: { position: [number, number, number]; lookAt: [number, number, number] };
  stats: BakeStats;                 // compteurs par catégorie, variance, couverture, budgets
}
```

### 1.4 PartList (format universel d'asset low-poly)

Un prefab est une liste de primitives (`box | sphere | cylinder | wedge | cornerWedge`) avec CFrame relatif,
taille, couleur, matériau, transparence, éventuelles lumières et **effets de particules** (`fireflies`, `spores`,
`embers`, `smoke`, `sparkle`, `mist` → `ParticleEmitter` Roblox avec textures intégrées `rbxasset://`). Le même PartList est :
- rendu dans le viewer Three.js (BufferGeometry fusionnée + InstancedMesh par variante, motes émissifs pour les effets),
- instancié dans Roblox (Parts natives, groupées dans un Model, clonées à partir d'un cache),
- exporté en `.rbxmx` pour l'asset browser et l'insertion dans Studio.

Conventions vérifiées dans Studio par raycast : rotation Euler XYZ = `CFrame.Angles` (Rx·Ry·Rz), `WedgePart` haut en +Z,
`CornerWedgePart` sommet au coin (+X, −Z). Les couleurs `Neon` sont atténuées (`NEON_COLOR_SCALE`) côté Roblox pour
que la teinte survive au bloom.

**Construction connectée.** Le `PartListBuilder` place les primitives *entre deux points* (`segment`, `beam`, `chain`,
`transform`) : troncs = chaînes de cylindres coniques, branches et racines partent d'un point du tronc, grappes de
feuillage posées sur la pointe des branches, racines finissant sous le sol, cônes de conifères = vraies pyramides de
4 `CornerWedgePart`. Aucune pièce n'est positionnée par une formule séparée de sa rotation : c'est ce qui éliminait
les parts décalées ou flottantes des premières versions. Chaque variante expose `baseRadius` (rayon des pièces qui
touchent le sol) et `bounds` exacts (coins tournés).

Le "chunky low-poly" du style cible se marie naturellement avec les primitives Roblox.

**Hero meshes.** Une variante peut référencer un mesh externe haute qualité (`PrefabVariant.source`) : GLB local
pour le viewer, asset Roblox `Model` pour le runtime, `nativeSize` pour l'ajuster aux `bounds`. Ces prefabs sont
fournis au générateur via `GenerateOptions.customPrefabs` et repris d'un bake à l'autre ; leurs placements sont
verrouillés et survivent aux régénérations (y compris complètes).

---

## 2. Pipeline

```
seed
 ↓ 1. Rng déterministe (xoshiro128**)
heightmap de base
 ↓ 2. fBm simplex avec domain warping (grandes formes) + curves (relief/plateaux/vallées)
grandes formes de terrain
 ↓ 3. features de la spec : montagnes en bordure (ridged noise masqué), collines, vallée centrale, falaises, plateaux,
      **île** (terre dans le rayon, océan + plages autour) et **côte** (océan le long d'un bord) — masque océan à
      littoral bruité, plateau côtier puis fond qui descend ; la bordure relevée est supprimée au-dessus de l'océan
bruit secondaire
 ↓ 4. détail (petites bosses, roughness), jamais seul : masqué par la pente
passe d'érosion
 ↓ 5. érosion thermique (talus) puis **érosion hydraulique** (gouttes : transport de sédiments, ravines et
      cônes de déjection, budget d'érosion par cellule, delta lissé pour des chenaux lisibles à 4 studs)
masques de biomes
 ↓ 6. hauteur + humidité + distance à l'eau + weights de la spec → biome par cellule + matériaux. Le champ
      d'humidité est **centré sur le climat du monde** (`climateMoisture` : moyenne pondérée des bandes
      d'humidité des biomes demandés — un désert tombe vers 0.2, une jungle vers 0.8) et remonté près de
      l'eau (berges, oasis). Le score « winner-takes-all » n'a aucun sens des proportions : un biais par
      biome est **calibré** en quelques passes jusqu'à ce que les parts obtenues rejoignent les weights de
      la spec (une spec désert 55/30/15 sortait 96/3/1, donc verte)
rivières & lacs
 ↓ 7. source haute → A* descendant → lit creusé + berges + eau ; lacs par remplissage de bassins ; **océan** : toute
      cellule sous le niveau de la mer (`terrain.seaLevel`, défaut baseHeight − 6) est inondée ; distance à l'eau par
      transformée de distance (chamfer) sur les cellules d'eau → bande de plage (sable, neige en style arctique)
sites & aplanissement
 ↓ 8. sélection du site de village (score de planéité intégral) + aplanissement progressif
routes
 ↓ 9. A* (coût = pente² + eau + bâtiments) entre spawn/village/landmarks, lissage Chaikin, marquage cellules
landmarks
 ↓ 10. placement par rôle (focal sur colline, secondaires en périphérie) + view corridors (raycast heightmap)
bâtiments
 ↓ 11. layout organique autour d'une place, orientation vers le centre/route, contrainte de pente, non-chevauchement
habillage (dressing)
 ↓ 11b. `pipeline/dressing.ts` — **enceinte** en anneau autour du peuplement principal avec **tours de porte** là où
       les routes la traversent (kit de mur du style : pierre crénelée, palissade, sacs de sable, ferraille, bambou,
       adobe, marbre, clôture énergétique, piquets, glace ; sol nivelé sous chaque segment), **champs** cultivés
       (set farm / biome farmland / ferme), **ponton** avec barques depuis un port ou tout peuplement au bord de l'eau
       (rayon vers l'eau la plus proche), **cimetière** derrière l'église (ou en lisière), **parvis** des landmarks
       (disque pavé + lumières + bancs du kit), **marquages** des rues asphalte/béton (bandes, passages piétons,
       bordures). Ids `dress_*` : jamais élagués par le budget, restaurés avec la couche bâtiments.
relief 3D (voxels)
 ↓ 11c. `pipeline/relief.ts` — opérations voxel (`terrain.ops`, appliquées par le runtime après les colonnes :
       FillBall / FillBlock / FillCylinder, Air pour creuser) : **grottes** derrière chaque landmark `cave`
       (tunnel qui monte dans la pente + salle, cristaux / champignons / coffre / torche en placements
       `fixed`, zone `cave`), **surplombs** rocheux sur les pentes raides, **arches** naturelles sur les
       falaises et côtes, **lac de lave** dans les cratères de volcan.
végétation
 ↓ 12. Poisson-disk par biome, clusters/clairières (bruit), évitement routes/bâtiments/eau/pentes, variation espèce/échelle/rotation
props
 ↓ 13. sets contextuels : village (lanternes, caisses, tonneaux, clôtures, bancs), forêt (troncs, pierres, champignons), ruines (débris, colonnes)
détail proche & horizon
 ↓ 13b. `pipeline/detail.ts` (ids `detail_*`) — les deux bandes qu'un scatter large laisse vides :
       **bas-côtés** des routes (touffes, fleurs, fougères, cailloux, troncs, runs de clôture — chaque étape
       précédente s'écarte de la route, donc les accotements sortaient nus), **parvis du spawn** (couronne de
       couvre-sol et de lanternes sur le bord de la clairière + deux arbres qui cadrent la vue vers le
       landmark focal), **rive** (cailloux au ras de l'eau, roseaux, bois flotté, rochers qui percent la
       surface juste au large), **horizon** (bouquets d'arbres et d'aiguilles rocheuses surdimensionnés dans
       la bande de bordure ; pour une île, dont la bordure est de la haute mer, des **sea stacks** posés sur
       le fond peu profond au large de la côte). Le détail proche a plus d'`importance` que le sous-bois
       lointain : quand le budget élague, il élague ce dont personne n'est à côté
optimisation
 ↓ 13b. éclairage : Lighting + Atmosphere + effets, **couleurs de terrain** teintées par la palette
       (`Terrain:SetMaterialColor`, `environment.terrainTint`), **nuages** (`Clouds`, couverture par mood),
       **météo** (pluie, neige, cendres, poussière, pétales, spores, lucioles, braises, bulles, feuilles, tempête de
       sable — style + mood, rendue côté client autour de la caméra), ligne de neige par style, ciel sans astres
       pour l'espace
 ↓ 14. budgets par catégorie, tri par importance visuelle, LOD, groupement par variante
WorldBake
```

Chaque étape est une fonction pure `(context) => context` dans `packages/world-gen/src/pipeline/`.
Les locks de la WorldSpec (`locks.terrain`, …) court-circuitent les étapes correspondantes en réutilisant
les données du bake précédent (régénération partielle).

---

## 3. Contraintes de level design (imposées, pas suggérées)

| Règle | Implémentation |
|---|---|
| Une route ne traverse pas une falaise | coût A* infini si pente > `maxRoadSlope` |
| Une maison n'est pas sur une pente impossible | site rejeté si pente locale > `maxBuildingSlope`, sinon terrain aplani sous l'empreinte + socle |
| Un village est relativement plat | site choisi par minimum de variance de hauteur dans une fenêtre, puis aplani (blend gaussien) |
| Une rivière a un lit cohérent | tracé descendant monotone (A* avec coût de montée), lit creusé, berges adoucies |
| Les arbres évitent les chemins | distance min aux polylignes de route (SDF rasterisé) |
| Pas de végétation dans les bâtiments | exclusion par bounding box + marge |
| Les landmarks sont visibles | view corridors : raycast heightmap depuis spawn/village/routes ; repositionnement si occlusion |
| Pas d'objets flottants | rochers, props, chemins et sous-bois sont **inclinés sur la normale du terrain** (`Placement.up`, sérialisé, appliqué par le viewer et le runtime Roblox) ; arbres inclinés à 30 % ; bâtiments/landmarks sur terrain aplani ; sinon Y = min du terrain sous le disque `baseRadius` (plafonné) − `sinkDepth` |
| Pas de répétition évidente | ≥ 8 variantes par espèce, jitter échelle/rotation/teinte, pas de grille (Poisson-disk + bruit de cluster) |
| Pas de terrain plat | garde-fou : si variance de hauteur < seuil, ajout de relief secondaire |
| Falaises lisibles | strates : sur les pentes > 0,55 les hauteurs sont terrassées (pas de 6–10 studs, ondulés par du bruit) et mélangées selon la pente → falaises stratifiées stylisées, plats intacts |
| Sol varié | matériaux : sous-bois terre/mousse (bruit fin), éboulis sur pentes moyennes, berges sable/boue, basalte/rock/slate sur les falaises, accotements de terre le long des routes, place du village pavée (cobblestone + anneau de terre battue) |
| Terrain Roblox fidèle | voxels calibrés (biais d'une demi-voxel, échantillonnage au centre) + snap runtime par raycast — voir ROBLOX_PIPELINE §5 |

---

## 4. Composition : foreground / midground / background

- **Background** : montagnes en bordure (ridged noise, silhouettes larges), forêt dense de grands arbres
  simplifiés (LOD bas) en anneau extérieur, brume épaisse.
- **Midground** : village, landmarks secondaires, rivière, lisières de forêt, murs/ruines.
- **Foreground** : autour des routes et du spawn : herbes, fleurs, petits champignons, pierres, lanternes.

Le générateur assigne à chaque placement un `layer` (`foreground|midground|background`) via `layerFor`
(`context.ts`) : près d'une route ou du spawn, **ou dans un peuplement / une zone de gameplay** (le joueur y
est, qu'une route y arrive ou non) → foreground ; dans la bande de bordure → background ; sinon midground.
Toutes les étapes l'appellent — une maison sur une rue est du premier plan, un arbre de lisière une
silhouette. Le critic vérifie que chaque couche est peuplée.

La bordure relevée n'est pas une lèvre régulière : une modulation à grande longueur d'onde (~800 studs) la
découpe en **sommets** (≈1.55×) et **cols** (≈0.5×), donc la ligne d'horizon a une forme et l'œil y lit la
distance — y compris dans un monde volontairement plat (ville, banlieue, ferme).

---

## 5. Landmark system

Types : `giant_tree`, `ruins`, `tower`, `castle`, `statue`, `windmill`, `temple`, `portal`, `mountain_peak`, `volcano`.

Rôles : `focal` (un seul, visible depuis le spawn et le village), `secondary` (visibles depuis les routes),
`hidden` (découverte, cachés derrière un relief).

Algorithme :
1. Candidats : cellules satisfaisant `preferredZone` (hill, ridge, forest_edge, riverbank, plateau, clearing).
2. Score = visibilité (depuis spawn/village/routes via raycast heightmap) × isolation (distance aux autres landmarks) × cohérence de zone.
3. Meilleur candidat retenu, corridors de vue enregistrés (`landmark.viewCorridors`).
4. Le tracé des routes est ajusté pour passer dans un corridor (le joueur voit le landmark en marchant).

---

## 6. Prefabs procéduraux (`@worldforge/prefabs`)

Chaque prefab est `(rng, style, params) => PartList` et produit N variantes au bake.

| Catégorie | Prefabs |
|---|---|
| Végétation | `pine_tree` (cônes empilés), `round_tree` (grappes sur branches), `dead_tree` (tronc noueux, coudes), `willow`, `birch`, `giant_mushroom` (chapeau étagé, anneau lumineux, spores), `small_mushroom`, `bush`, `fern`, `grass`, `flower`, `log`, `cactus`, `palm` |
| Rochers | `boulder`, `rock_cluster`, `stone`, `cliff_block`, `crystal_cluster` (éclats Neon + lumière + sparkle) |
| Architecture | `cottage` (bardeaux, volets, porche, lanterne, cheminée + fumée), `ruin_wall`, `ruin_arch`, `watchtower` (brasero, drapeau), `well`, `bridge` (arc, garde-corps, lanternes), `fence`, `stone_path_slab` |
| Props | `lantern_post`, `crate`, `barrel`, `bench`, `signpost`, `campfire` (braises + fumée), `cart_wheel`, `gravestone`, `wisp`, `tent`, `hay_bale`, `cart`, `firefly_swarm`, `mist_patch`, `stone_wall` (anneau de murets autour du village, trous aux routes), `market_stall` (étals sur la place, villages habités), `lantern_string` (guirlandes de lanternes en travers des rues), `crop_plot` (potagers près des maisons habitées), `waterfall` (opt-in `props.sets: waterfalls`) |
| Bord de l'eau | `reeds` (roseaux sur les berges), `lily_pad` (nénuphars au niveau de l'eau, jamais inclinés), `flower_patch` (massifs de fleurs dans les prairies/clairières) |
| Eau | couleur, transparence, réflexion et vagues de `Workspace.Terrain` réglées par bake (`lighting.terrain`), nuit vs jour |
| Landmarks | `giant_tree` (racines contreforts, branches + lanternes suspendues, spores), `ancient_ruins` (colonnes, linteaux, fûts tombés, cristal flottant, brume), `tower`, `portal` (runes, disque, sparkle), `statue`, `windmill`, `temple` (braseros) |

Ambiance nocturne : lanternes tous les ~55 studs le long des routes hors village, nuées de lucioles dans les clairières
et près du spawn, nappes de brume dans les zones humides, feux follets autour des ruines et du cimetière.

Règles de style (StyleBible) : taper des troncs, nombre de couches de canopée, jitter, palettes par espèce,
matériaux, pitch des toits, weathering (planches manquantes, murs cassés).

---

## 6b. Kits par style et archétypes de layout

La StyleBible porte désormais `kits` (`vegetation`, `props[]`, `road`, `biomes`, `landmarks`,
`settlement`) et `architecture.style` couvre 26 kits de bâtiments (`house`/`house_large`/
`shop_building`/`apartment_block`/`skyscraper` sont générés avec le kit du style, intérieurs compris).
`pipeline/kitProps.ts` place les props de chaque kit selon leurs tags (lumières et véhicules le long
des rues, murs tangents aux maisons, statues sur la plaza, dispersion dans les biomes qui conviennent,
props de rivage). Les peuplements `town` / `city_district` / `base` utilisent une **grille** de rues
carvées (asphalte, béton, métal…) dimensionnée au nombre de bâtiments. `pipeline/layout.ts` pose
l'archétype de gameplay (`spec.layout`) et ses zones — ces structures ne sont ni élaguées par le
budget ni recollées au sol (plateformes d'obby flottantes). Voir [TAXONOMY.md](TAXONOMY.md).

### 6c. Landmarks sur l'eau et portes qui s'ouvrent

Les landmarks marqués `water` (galion pirate) cherchent une position **sur l'eau** (eau tout autour de
l'empreinte, terre à moins de 50 studs, visible depuis les peuplements) et flottent à leur ligne de
flottaison (`sinkDepth`) ; sans eau ils s'échouent sur la terre comme avant. Les zones `coast`, `flat`
et `outskirts` des landmarks sont maintenant scorées. Chaque bâtiment à intérieur a une porte fermée
nommée `Door` (charnière −X) que le système `Doors` du template ouvre au ProximityPrompt.

### 6d. Meshes 3D procéduraux

Les rochers (`boulder`, `rock_cluster`, `cliff_block`) sont de vrais meshes : icosphères déplacées par
un bruit 3D, ombrage plat, forme selon le style (`rock.variation`, `geometry`), base aplatie. Une
**bibliothèque de 6 meshes** par bake (`meshes/library.ts` : rock_a, pebble_a, cliff_a/b, canopy_a/b — les couronnes des arbres ronds, bouleaux et buissons sont des grappes de blobs) est
réutilisée par tous les rochers avec échelle non uniforme, rotation et couleur propres — un client Roblox
ne peut tenir qu'une poignée d'`EditableMesh` en mémoire. Les parts de forme `mesh` portent la clé,
`PrefabVariant.meshes` les triangles (base64) ; le viewer les affiche, l'export écrit `assets/meshes/<clé>_<hash>.obj`
et `.fbx` (un par mesh distinct). Runtime sans upload : le serveur construit des `MeshPart` (EditableMesh
`FixedSize` → `CreateMeshPartAsync`, collision Hull, UV planaires) et publie les triangles ; les clients
reconstruisent les mêmes meshes localement et les appliquent (`ApplyMesh`) car un EditableMesh créé côté
serveur ne se rend pas sur les clients. **Publication** (Assets → « Procedural meshes » → Publish) : chaque
FBX est uploadé en asset « Model » Open Cloud, Studio résout le `MeshId` du modèle
(`design/meshes.manifest.json`, `packages/roblox-export/src/mesh-assets.ts`), l'export tamponne
`MeshData.assetId` et le runtime crée alors les parts avec `CreateMeshPartAsync(rbxassetid)` — réplication
normale, plus de budget client ni de reconstruction.

### 6g. Sol en parts pour tous les mondes (`pipeline/ground.ts`)

Le sol de **tous** les mondes est construit en parts (pas de terrain voxel, sauf `terrain.groundMode: "voxels"`
dans la spec) : la heightmap est quantifiée en terrasses de `GROUND_STEP` (8 studs) — filtre majoritaire
5×5, régions < 24 cellules fusionnées, fond marin aplati — puis chaque plateau connexe devient un prefab
`ground_block` : dalle plate (contours par marching squares, simplifiés + arrondis, triangulés par ear
clipping avec trous → paires de wedges via `PartListBuilder.triangleSlab`) posée sur des bandes de murs
(1 à 3 boîtes par arête là où le niveau voisin est plus bas), lèvre verte sur les grandes pelouses. Couleur
et matériau = matériau de terrain dominant de la région (`lighting.terrainColors`), murs terre / pierre.
Les routes deviennent des rubans de parts (`road_strip`), les passages d'un niveau à l'autre reçoivent un
`stairs` (coût A* : un seul step autorisé), `flattenArea` pose un pad au niveau le plus proche, l'eau
devient des blocs `fill` Water (rectangles gloutons) ; `terrain.mode = "parts"` dans la bake, le runtime
n'écrit que ces blocs et snappe les objets sur le dossier `World.Ground`. Le viewer affiche les mêmes parts.
Détails : chaque arête du contour connaît le niveau de la cellule d'en face (les murs sont exacts, même sur
les bandes fines) ; les berges sont relevées au-dessus de l'eau ; les hauteurs sont échantillonnées au plus
proche (jamais interpolées à travers une marche) ; une plaque sombre sous le monde cache les coutures ;
pierres d'éboulis au pied des grands murs, plaques de mesh « falaise » sur les murs rocheux, joints ronds
sur les rubans de route, pads de sites au niveau dominant du disque.

### 6f. Archipel « mesa » (sol en parts)

Feature de terrain `archipelago` (`pipeline/archipelago.ts`) : une île principale près du centre et des
satellites à distance de pont, chacune un empilement de plateaux plats (terrasses) aux parois verticales.
Les blocs sont ceux du sol en parts générique (6g) ; la heightmap reste la référence de placement. Ensuite
`pipeline/islands.ts` relie les îles par un arbre couvrant de `plank_bridge` (7 longueurs, inclinés si les
plateaux diffèrent), pose un `stairs` par terrasse et des chemins de sable des atterrissages vers les
routes ; `flattenArea` est neutralisée, le spawn exige un plateau entier et reçoit une `spawn_plaza`
(rose des vents + panneau flottant `PartBillboard`). Végétation clairsemée (palmiers), pas de relief 3D.

### 6e. Textures PBR procédurales

`packages/textures` : bruit tuilable (réseau périodique, cellules de Worley), 14 programmes (herbe,
herbe feuillue, terre, boue, roche, ardoise, sable, neige, pavés, planches, briques, métal, glace, lave)
→ cartes couleur / normale / rugosité dérivées de la palette du style, encodées en PNG. Onglet Assets →
« Custom textures » : génération locale, aperçu, upload Open Cloud (images) ; `design/textures.manifest.json`
+ `src/shared/textures.ts` ; une fois uploadés, les jeux deviennent des `MaterialVariant` (+ `TerrainDetail`)
construits dans la place par Rojo (`assets/materials/WorldForge_<id>.model.json` + propriétés
`<Material>Name` de `MaterialService` dans `default.project.json` — ces propriétés ne sont pas scriptables
au runtime) et remplacent les matériaux de base sur le terrain et les parts. Le viewer applique un shader
de splat 4 canaux avec normal maps, double échantillonnage anti-répétition et variation macro.

## 7. Analyse d'image → StyleBible

L'outil "Analyser une image" envoie l'image à l'agent vision (Claude Code lit les images ; providers image
optionnels) avec un prompt structuré demandant une `StyleBible` JSON validée par schéma. Sans agent, un
analyseur local extrait la palette dominante (k-means sur pixels) et propose un preset proche.

---

## 8. Régénération partielle & locks

`regenerate(spec, previousBake, { layers: ['vegetation'] })` :
- réutilise `terrain`, `paths`, `landmarks`, `buildings` du bake précédent,
- ré-exécute seulement `vegetation` (avec le même seed dérivé `seed ^ hash('vegetation')` ou un nouveau),
- respecte `placement.locked === true` (conservés tels quels),
- produit une nouvelle version (`v0.N+1`) avec `parentVersion`.

Le "KEEP THIS AREA" verrouille tous les placements dans un polygone/cercle (`zoneLocks`).

---

## 9. Performance

- Budgets par défaut (1024×1024) : végétation ≤ 3 200, rochers ≤ 450, props ≤ 500, bâtiments ≤ 40, total Parts ≤ 48 000
  (estimation plein détail ; le fond est instancié en LOD 1 : ≈ 38 000 parts réels pour la démo).
- Prefabs mis en cache dans `ReplicatedStorage.WorldAssets.Prefabs` et clonés (Instances partagées).
- LOD : `full` (< 250 studs), `simple` (canopée 1 bloc, pas de détails), `silhouette` (> 600 studs, 1-2 blocs).
- `StreamingEnabled = true`, `StreamingMinRadius/TargetRadius` selon la taille du monde.
- `CanCollide = false`, `CanQuery = false`, `CanTouch = false` sur le feuillage et petits props ; `Anchored = true` partout.
- Terrain : voxels 4 studs, bande écrite par `WriteVoxels`, socle rempli par `FillBlock`.
