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
audio, **environnement** (`weather` + intensité, `clouds`, `snowLine`, `walls`, `terrainTint`) et
**mots-clés FR/EN** pour l'interpréteur.

| Environnement | Valeurs |
|---|---|
| `weather` | none, rain, snow, ash, dust, petals, spores, fireflies, embers, bubbles, leaves, sandstorm (le mood `stormy` force pluie/neige, `eerie` des spores, la nuit des lucioles dans les styles tempérés) |
| `walls` (enceinte du peuplement) | none, stone_crenellated, palisade, sandbags, scrap, bamboo, adobe, marble, energy_fence, picket, ice |
| `clouds` | couverture 0..1 (`Lighting.Clouds`) |
| `snowLine` | altitude normalisée de la neige (0.2 hiver, 0.9 défaut, >1 jamais) |
| `terrainTint` | 0 = couleurs Roblox, 1 = palette (`Terrain:SetMaterialColor`) | `styleFamilyToBible()` en dérive une StyleBible
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

Les **écrans** (`screens` → `GameSpec.ui.screens` → `GameConfig.ui.screens`) sont tous implémentés dans
le template et montés par le client uniquement quand le genre les déclare : `hud` / `loading`,
`shop` / `gamepass_shop`, `inventory`, `quests`, `crafting`, `leaderboard`, `teams`, `round_status`,
`settings`, `minimap`, `menu` (voir ROBLOX_PIPELINE.md pour la source de données et la touche de chacun).
`round_status` et `teams` suivent les systèmes `rounds` / `teams`, `minimap` les genres à grande carte ;
`settings` et `menu` sont universels.

## 3bis. Librairies UI (`gameSpec.ui.kit`)

`packages/core/src/taxonomy/ui-kits.ts` décrit **26 librairies UI** prêtes à l'emploi. Une librairie est
un design system complet : jetons de couleur (papier, encre, texte, dégradés primary / gold / danger /
info, pastilles, tuiles), **langage de forme** (rayon des coins, épaisseur du contour, dégradés oui/non,
ombre portée, biseau des boutons, contour du texte, transparence des panneaux), polices Roblox,
**ornement** dessiné sur chaque panneau, **retour des boutons**, **animation d'ouverture** des fenêtres,
**échelle de texte** (les polices décoratives ont besoin de plus de place), et les **effets** :
`hover` (lift / glow / tint / outline), `clickFx` (ripple / burst / flash), `rarityFx` (glow / sparkle
/ shine sur les tuiles d'objets) et `motion` (budget d'animation 0…1,4 ; à 0 rien ne boucle). Tous les écrans (HUD, shop,
inventaire, quêtes, craft, classement, équipes, manche, réglages, minimap, menu) lisent la librairie
sélectionnée : changer de look = un champ.

| id | nom | look | ornement / press | défaut pour |
|---|---|---|---|---|
| `paper_cartoon` | Paper Cartoon | The mobile-game look: cream paper panels, thick ink outline, drop shadow, rounded bold type. | none / squash | cartoon, stylized |
| `candy_pop` | Candy Pop | Bubbly sweet-shop UI: very round pink panels, fat outlines, bouncing buttons. | none / pulse | candy |
| `neon_cyber` | Neon Cyber | Dark glass panels with neon outlines, glow and flickering buttons — cyberpunk / night city. | glow / flicker | sci-fi |
| `holo_hud` | Holo HUD | Angular hologram HUD: translucent frames, corner brackets, hairline strokes, no gradients. | brackets / slide | sci-fi |
| `grim_horror` | Grim Horror | Near-black panels, dried-blood accents, speckled grain and no animation — horror and backrooms. | grain / none | horror |
| `pixel_retro` | Pixel Retro | 8-bit console UI: square corners, hard 4px borders, hard offset shadow, pixel type, no gradients. | none / none | retro |
| `arcade_synth` | Arcade Synth | 80s arcade cabinet: magenta / cyan gradients, CRT scanlines, chrome outlined type. | scanlines / pulse | retro |
| `clean_modern` | Clean Modern | Flat app UI: white cards, thin accent line, soft shadow, no outline on the type. | none / slide | modern, minimal |
| `glass_soft` | Soft Glass | Frosted translucent panels, hairline strokes, very round corners — calm and minimal. | none / slide | minimal |
| `parchment_fantasy` | Parchment & Gold | Quest-log fantasy UI: parchment panels, gold filigree edges, serif type. | filigree / squash | fantasy |
| `stone_rune` | Stone & Rune | Carved stone slabs with notched corners and rune-blue accents — dungeons and dwarven halls. | notch / squash | fantasy |
| `military_stencil` | Military Stencil | Field-manual UI: olive panels, stencil caps, hazard stripes, sharp corners. | stripes / none | military |
| `steampunk_brass` | Steampunk Brass | Riveted brass plates on leather, copper gradients, victorian serif type. | rivets / squash | mots-clés |
| `wood_nature` | Wood & Leaf | Cozy carved-wood panels with leaf-green buttons and handwritten labels — camps and villages. | notch / squash | mots-clés |
| `luxury_gold` | Black & Gold | VIP / casino UI: matte black panels, thin gold filigree, restrained serif type. | filigree / slide | mots-clés |
| `kawaii_pastel` | Kawaii Pastel | Soft pastel bubbles with sticker edges and a cute bounce — anime and cafe games. | none / pulse | mots-clés |
| `western_saloon` | Western Saloon | Wanted-poster UI: sun-bleached paper, burnt wood frame, stitched edge and a rope-brown palette. | stitch / squash | mots-clés |
| `vapor_wave` | Vapor Wave | Sunset gradients, chrome type and a perspective grid — 90s mall aesthetic. | grid / pulse | mots-clés |
| `y2k_bubble` | Y2K Bubble | Early-2000s software: glossy blue bubbles, chrome rims, soda-bubble corners. | bubbles / pulse | mots-clés |
| `frost_ice` | Frost & Ice | Frozen glass plates with pale blue light and a frosted stitch of ice on the edge. | stitch / slide | mots-clés |
| `sand_temple` | Sand Temple | Carved sandstone tablets with turquoise inlays and notched corners — deserts and tombs. | notch / squash | mots-clés |
| `deep_sea` | Deep Sea | Submarine portholes: deep teal glass, bio-luminescent accents and rising bubbles. | bubbles / slide | mots-clés |
| `noir_detective` | Noir Detective | Black-and-white case file: newsprint paper, hard ink rules, film grain, no colour but one red stamp. | grain / none | mots-clés |
| `sport_jersey` | Sport Jersey | Stadium scoreboard: jersey stripes, chevrons, bold condensed caps on a deep field green. | chevrons / slide | mots-clés |
| `graffiti_street` | Graffiti Street | Spray-can street UI: concrete panels, tag-green and hot-pink sprays, taped corners. | stitch / squash | mots-clés |
| `mission_control` | Mission Control | Space-agency console: off-white panels, orange safety accents, technical mono type and corner brackets. | brackets / slide | mots-clés |

Les librairies sont livrées **dans chaque projet** (`src/ui/kits.generated.ts`, généré depuis cette
table par `scripts/sync-template.ts`), donc basculer de l'une à l'autre ne demande aucun fichier
supplémentaire — juste `GameConfig.ui.kit` (sélecteur dans l'onglet *Game → UI library & screens* de
l'app, ou champ `ui.kit` du GameSpec).

**Choix automatique** — `pickUiKit(prompt, theme, genre)` :

1. un mot-clé explicite dans le prompt gagne (« je veux un **UI retro** », « interface **néon
   cyberpunk** », « ui **luxe or** », « **kawaii pastel** ») — mots-clés anglais *et* français, le plus
   long l'emporte, avec un bonus si le genre ou le thème correspond ;
2. sinon le genre départage les librairies du thème de la famille de style ;
3. sinon le défaut du thème (`UI_THEME_DEFAULT_KIT`) — chaque `ui` de famille de style a le sien, donc
   **tout style × tout genre** tombe toujours sur une librairie complète (test
   `packages/core/test/uiKits.test.ts`).

**Langue** — `packages/core/src/taxonomy/ui-strings.ts` porte tous les libellés de l'UI en **5 langues**
(en, fr, es, pt, de) ; `detectLocale(prompt)` devine la langue du prompt (« je veux un jeu… » → `fr`),
`gameSpec.ui.locale` la fixe et `src/ui/strings.generated.ts` est livré dans le projet. Les écrans
lisent `L.<clé>` : traduire ne demande jamais de toucher un écran, et un test vérifie que chaque langue
couvre toutes les clés avec leurs placeholders.

Ajouter une librairie : skill `add-ui-kit`.

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
