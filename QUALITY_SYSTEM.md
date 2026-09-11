# WorldForge AI — Quality System

Deux niveaux de qualité : **technique** (ça compile, ça tourne, pas d'erreurs) et **artistique** (ça ressemble
à une map Roblox premium stylisée, composée par un level designer).

Package : `@worldforge/quality` + rôle QA de `@worldforge/agents` + commandes Rust `capture.rs`, `studio.rs`.

---

## 1. Validation technique (avant build et avant publication)

| Vérification | Source |
|---|---|
| WorldSpec / GameSpec / manifests valides | Zod |
| Budgets d'instances respectés | `bake.stats` vs `PerformanceBudget` |
| Pas d'objets flottants / enterrés | hauteur terrain vs `placement.position.y` (tolérance `sinkDepth`) |
| Pas de chevauchement bâtiments | AABB 2D |
| Pas de végétation dans les bâtiments | AABB + marge |
| Routes praticables | pente max le long des polylignes |
| Erreurs TypeScript | sortie `rbxtsc` parsée (`file(line,col): error TSxxxx`) |
| Erreurs Luau runtime | logs Studio parsés |
| Taille du build | `.rbxl` |
| Références assets | manifest ↔ fichiers |
| Clé/ids Roblox | Open Cloud `GET universe/place` |

## 2. Visual Quality Critic

Le critic combine :
1. **Métriques du bake** (déterministes, sans IA) :
   - Composition : présence foreground/midground/background, point focal, corridors de vue valides.
   - Terrain : variance de hauteur, ratio de pentes, présence de features de la spec.
   - Végétation : densité vs cible, indice de répétition (variantes utilisées / disponibles), clustering (Ripley K simplifié), clairières.
   - Architecture : nombre de bâtiments, variance d'échelle/rotation, distance au centre, présence d'un landmark de village.
   - Cohérence assets : palette (distance moyenne des couleurs à la palette du StyleBible), matériaux.
   - Atmosphère : fog/lighting cohérents avec `mood`.
   - Variété : entropie des espèces, tailles.
   - Performance : parts totales, densité max locale, LOD.
2. **Vision agent** (optionnel) : screenshot Studio (ou capture du viewer) + rubrique → JSON `{ scores, problems, fixes }` via Claude Code / Gemini CLI.

Sortie :

```json
{
  "score": 82,
  "scores": { "composition": 8, "lighting": 7, "terrain": 9, "vegetation": 7, "architecture": 8, "assetConsistency": 9, "atmosphere": 9, "variety": 7, "performance": 9 },
  "problems": [
    { "id": "vegetation_repetitive", "severity": "medium", "message": "vegetation too repetitive (variants used 5/12)", "layer": "vegetation" },
    { "id": "village_no_landmark", "severity": "high", "message": "village lacks landmark", "layer": "landmarks" }
  ],
  "fixes": [
    { "type": "spec_patch", "path": "vegetation.species", "op": "add", "value": "dead_tree" },
    { "type": "regenerate", "layers": ["vegetation"] },
    { "type": "spec_patch", "path": "landmarks", "op": "add", "value": { "id": "village_well", "type": "well", "role": "secondary", "preferredZone": "village" } }
  ]
}
```

Les `fixes` de type `spec_patch` + `regenerate` sont appliqués automatiquement (avec les locks respectés)
lorsque le mode auto-fix est activé ; sinon proposés dans l'UI.

## 3. QA Loop

```
GENERATE → BUILD → LAUNCH STUDIO → RUN → OBSERVE (logs + screenshot) → CRITIQUE → FIX → BUILD → RETEST
```

Paramètres : `maxIterations` (3 / 5 / 10), `autoFix`, `useVision`, `stopOnScore` (ex. ≥ 85).

Étapes détaillées :
1. `rbxtsc` → si erreurs TS : envoi au rôle Gameplay/UI avec le diff des erreurs → correction → rebuild.
2. `rojo build` → `.rbxl`.
3. Ouverture Studio (fichier) ; avec MCP : `run_code` pour lancer le play-test et récupérer l'output ; sans MCP :
   tail du log Studio pendant N secondes après que l'utilisateur presse Play.
4. Erreurs Luau extraites → agent Code (fix) ; anomalies de composition → critic (fix spec) ; screenshot → agent Vision.
5. Application des correctifs, itération suivante.
6. Rapport final : itérations, score initial/final, problèmes résolus/restants.

## 4. Performance

Budget par défaut (monde 1024×1024) :

| Catégorie | Max instances | Max parts |
|---|---|---|
| Végétation | 2 200 | 14 000 |
| Rochers | 450 | 1 800 |
| Bâtiments | 40 | 3 000 |
| Props | 500 | 2 500 |
| Landmarks | 6 | 1 200 |
| **Total** | | **≤ 30 000** |

Mesures : LOD par distance (`full/simple/silhouette`), `StreamingEnabled`, prefabs clonés depuis un cache,
collisions désactivées sur le feuillage, `CastShadow=false` sur les petits props, pas de textures > 1024,
pas de MeshParts > 10k triangles lors de l'import d'assets externes.

## 5. Critères de la démo "Moonlit Forest Village"

Le critic doit valider, sans exception :
- aucune répétition évidente (≥ 8 variantes par espèce utilisées, jitter d'échelle ≥ 25 %)
- aucune grille visible (Poisson-disk + bruit de cluster, corrélation spatiale testée)
- pas de terrain plat (écart-type de hauteur ≥ 8 studs hors village)
- pas d'objets flottants (Δy ≤ 0.5 stud)
- pas de maisons identiques (variantes + échelle + rotation + weathering)
- palette cohérente (distance moyenne à la palette ≤ seuil)
- pas de végétation dans les bâtiments (AABB)
- chemins cohérents (pente ≤ 35°, pas de traversée de falaise)
- bâtiments sur pente ≤ 12° (après aplanissement)
