import { interpretPrompt } from "@worldforge/agents";
const prompts = [
  "crée moi une map pour mon jeu de survie apocalyspe zombie , avec un village ou les maison ont des intérieurs, une foret avec au milieu un avion de ligne crashé, tout doit etre beau et detaillé",
  "un obby cartoon avec 20 stages dans les nuages",
  "tycoon de restaurant dans une ville moderne",
  "jeu de course futuriste cyberpunk la nuit",
  "simulateur de pets sur une ile tropicale",
  "battle royale militaire sur une base",
  "roleplay brookhaven quartier résidentiel moderne avec des maisons",
  "tower defense médiéval avec un château",
  "horreur dans un manoir gothique hanté avec un cimetière",
  "rpg fantasy avec un royaume, un dragon et des donjons",
  "colonie spatiale sur mars avec une fusée",
  "aventure dans une jungle avec un temple perdu et une pyramide",
  "mine de minerai style voxel",
  "jeu de foot dans un stade",
  "ville western avec un saloon et un château d'eau",
  "monde sous-marin avec des coraux et une épave",
];
for (const p of prompts) {
  const r = interpretPrompt(p, 1);
  const s = r.spec;
  console.log(`${p.slice(0, 48).padEnd(50)} → genre=${r.game.genre.padEnd(14)} style=${s.stylePreset.padEnd(17)} layout=${s.layout.archetype.padEnd(13)} settle=${(s.settlements[0]?.type ?? "-").padEnd(16)} biomes=${s.biomes.map((b) => b.id).join(",").padEnd(36)} lm=${s.landmarks.map((l) => l.type).join(",")} sys=${r.game.systems.length}`);
}
