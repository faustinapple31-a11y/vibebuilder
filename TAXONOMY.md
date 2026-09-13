# Taxonomie universelle — tous les genres × tous les styles

WorldForge décrit **chaque style visuel** et **chaque genre de jeu** sous forme de données
(`packages/core/src/taxonomy/`). Le générateur de monde, les kits de prefabs, le template roblox-ts,
l'interpréteur local et les prompts des agents lisent ces tables : ajouter un style ou un genre est
d'abord une modification de données, validée par les schémas et par les tests.

## 1. Styles (`STYLE_FAMILIES`, 34 familles)

| Groupe | Styles |
|---|---|
| fantasy | stylized_mystical, fantasy, dark_fantasy, elven |
| historical | medieval, viking, ancient_egypt, ancient_greece, feudal_japan, wild_west, pirate, steampunk |
| modern | modern_suburban, modern_city, industrial, military |
| future | sci_fi, cyberpunk, space_station, alien_planet |
| apocalyptic | post_apocalyptic, wasteland |
| nature | realistic, tropical, jungle, desert, winter, swamp |
| themed | cartoon, horror_gothic, underwater, candy, low_poly_minimal, voxel |

Chaque famille définit : palette (15 couleurs), matériaux Roblox, géométrie (chunky / smooth /
blocky / angular / rounded), **kit d'architecture** (générateur de bâtiments), **kit de végétation**,
**kits de props**, **surface des routes**, biomes préférés, landmarks signature, type de
peuplement, éclairage (heure, mood, ambient, exposition, saturation), brouillard, thème UI, ambiance
audio et **mots-clés FR/EN** pour l'interpréteur. `styleFamilyToBible()` en dérive une StyleBible
complète ; les 10 looks historiques gardent leurs valeurs affinées à la main (`style-presets.ts`).

## 2. Kits (`packages/prefabs/src/kits/`)

- **Bâtiments** (`buildings.ts`) — un générateur paramétrique `house()` pour 26 kits
  (`medieval_cottage`, `timber_frame`, `stone_hut`, `elven`, `ruined`, `desert_adobe`, `nordic`,
  `cyber_block`, `modern_house`, `apartment_block`, `skyscraper`, `scifi_module`, `shack`, `japanese`,
  `western_facade`, `industrial_shed`, `igloo`, `tropical_hut`, `gothic`, `greek_temple`, `egyptian`,
  `victorian`, `bunker`, `candy`, `voxel`, `brick_rowhouse`). Toits gable / pyramide / plat + parapet /
  shed / pagode / dôme / turf / stepped, fenêtres carrées / arches / bandeaux / hublots / meurtrières,
  colombages, rondins, néons, antennes, portique, enseigne, pilotis, colonnes, murs talutés, vitrine,
  dégâts (toit effondré, mur manquant, planches, gravats, lierre). **Intérieurs praticables** : vraie
  ouverture de porte, dalles, escaliers entre étages avec trémie, mobilier par famille (médiéval,
  moderne, sci-fi, cabane, japonais, bureau, temple), lumière intérieure. Prefabs : `house`,
  `house_large`, `shop_building`, `apartment_block`, `skyscraper`.
- **Props** (`props-modern.ts`, `props-future.ts`, `props-themed.ts`) — ~100 prefabs répartis en 30
  kits (`PROP_KIT_PREFABS`) : urbain, banlieue, apocalypse, industriel, militaire, sci-fi, cyber,
  espace, western, pirate, japonais, égypte, grec, tropical, arctique, candy, sous-marin, jungle,
  horreur, sport, fête foraine, aire de jeu (+ village/forêt/ruines/camp/mine/ferme/docks/cimetière).
- **Végétation** (`vegetation-kits.ts`) — jungle_tree, baobab, acacia, alien_tree, bamboo,
  cherry_tree, burnt_tree, candy_tree, coral, seaweed, snow_pine, cypress ; `VEGETATION_KIT_SPECIES`
  donne le mélange d'espèces de chaque kit (temperate, conifer, mushroom, dead, tropical, jungle,
  desert, arctic, alien, candy, coral, bamboo, savanna, cherry, none).
- **Landmarks** (`landmarks-kits.ts`) — crashed_plane, radio_tower, skyscraper(_ruin), water_tower,
  pyramid, colosseum, torii_gate, lighthouse, pirate_ship, rocket, ufo, dome_base, crystal_spire,
  ferris_wheel, stadium, fountain, obelisk, waterfall_cliff, gas_station, church (nef praticable),
  barn.

Tous les prefabs passent le test de connectivité (`packages/prefabs/test/connectivity.test.ts`) pour
les 34 styles : aucune pièce flottante ou décalée.

## 3. Genres (`GENRES`, 28)

survival, adventure, rpg, dungeon_crawler, obby, parkour, tycoon, simulator, clicker, pet_collecting,
horror, roleplay, hangout, battle, battle_royale, fps, tower_defense, racing, sports, fighting, puzzle,
story, sandbox, farming, mining, minigames, strategy, rhythm.

Chaque genre définit ses **systèmes** (ids de `GAMEPLAY_SYSTEMS`, tous implémentés dans le template),
son **archétype de layout**, ses écrans UI, sa monnaie, sa monétisation par défaut, sa caméra, ses
styles de prédilection, s'il a des ennemis, sa structure multijoueur et son modèle de progression.

## 4. Archétypes de layout (`worldSpec.layout.archetype`)

Posés sur le terrain par `packages/world-gen/src/pipeline/layout.ts`, ils créent des structures
(variantes de prefabs générées à la volée) et des **zones de gameplay** (`World/Zones`, attributs
`Kind = gameplay` + méta `stage`, `plot`, `index`, `team`, `kind`) que les systèmes du template lisent :

| Archétype | Structures | Zones |
|---|---|---|
| obby_course | plateformes d'étape + pas intermédiaires (poutres, obstacles, KillBrick) | `obby_stage_N` |
| arena | enceinte, couverts, pads d'équipe, point de capture | `arena_spawn_a/b`, `arena_center` |
| race_track | boucle asphaltée, portiques de checkpoint, ligne de départ | `race_start`, `race_cp_N` |
| tycoon_plots | hub + parcelles (ClaimButton, ButtonPad_1..4, Conveyor, Collector) | `tycoon_hub`, `tycoon_plot_N` |
| lobby_portals | plaza + portails de minijeux | `lobby`, `lobby_portal_N`, `lobby_board` |
| base_defense | chemin des vagues, pads de tours, base | `td_spawn`, `td_waypoint_N`, `td_pad_*`, `td_base` |
| sports_field | terrain, buts, tribunes | `field_center`, `goal_home/away`, `team_spawn_a/b` |
| hangout_plaza | plaza, scène, fontaine | `plaza`, `plaza_stage` |
| dungeon | salles enchaînées + couloirs + salle du boss | `dungeon_room_N`, `dungeon_boss` |
| linear_story | jalons le long de la route principale | `story_checkpoint_N` |
| settlement / open_world / city_grid | village organique ou grille urbaine avec rues | — |

## 5. Systèmes du template (`templates/roblox-ts-project/src/systems/`)

Combat & armes, ennemis IA (pathfinding, rôdeurs, zombies/monstres/gardes), checkpoints/obby,
progression/XP, jour-nuit, quêtes, leaderboards, tycoon, simulator/clicker (backpack, vente,
upgrades, rebirth), rounds/équipes/matchmaking/points de capture, véhicules & course, tower defense,
farming, mining, crafting, pets, housing & jobs, trading, sport, puzzle, parkour, story, sandbox
building, abilities, rhythm, minigames. Ils démarrent uniquement si leur id figure dans
`GameConfig.systems` (généré depuis `design/game.spec.json`).

## 6. Interpréteur local et agents

`interpretPrompt()` (packages/agents) : mots-clés → genre + famille de style (score par longueur de
mot, bonus quand l'id est nommé, mots courts à frontière de mot) → biomes, landmarks (avion crashé,
pyramide, phare, fusée…), peuplement (village, ville en grille, base, port, ferme), routes, espèces,
kits de props, éclairage, layout et GameSpec (systèmes, monnaie, PNJ ennemis, quêtes, items).
Les rôles *design* et *world* des agents reçoivent le catalogue complet dans leur prompt.

`npx tsx scripts/demo-prompt.ts "<prompt>" --build` génère et compile un projet complet à partir de
n'importe quel prompt.
