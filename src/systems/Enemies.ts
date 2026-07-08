import type { EnemyTemplate } from "@/systems/CombatEngine";

export const ENEMIES: Record<string, EnemyTemplate> = {
  // ---------- Tutorial / Dream ----------
  // Sparring — meant to teach, not punish. She's holding back.
  goddess: {
    name: "The Goddess",
    hp: 9,
    silhouette: "goddess",
    pattern: [
      { kind: "attack", value: 1, text: "A gentle strike: 1" },
      { kind: "defend", value: 2, text: "Half-ward" },
      { kind: "attack", value: 2, text: "Stern strike: 2" },
    ],
  },

  // ---------- Floor 1: Dungeon ----------
  // Tuned for the starter deck (cards deal 1-2). You'll still take some hits
  // but a starter run is winnable.
  cryptRat: {
    name: "Crypt Rat",
    hp: 12,
    silhouette: "rat",
    pattern: [
      { kind: "attack", value: 2, text: "Bites for 2" },
      { kind: "attack", value: 1, text: "Nibbles for 1" },
      { kind: "defend", value: 1, text: "Curls up" },
    ],
  },
  boneCultist: {
    name: "Bone Cultist",
    hp: 16,
    silhouette: "skull",
    pattern: [
      { kind: "attack", value: 3, text: "Curse-knife: 3" },
      { kind: "defend", value: 2, text: "Bone wall" },
      { kind: "attack", value: 3, text: "Curse-knife: 3" },
      { kind: "buff",   value: 2, text: "Mutters and recovers 2" },
    ],
  },
  drownedKnight: {
    name: "Drowned Knight (Elite)",
    hp: 14,
    silhouette: "knight",
    pattern: [
      { kind: "attack", value: 7, text: "Rusted blade: 7" },
      { kind: "defend", value: 2, text: "Bracing stance" },
      { kind: "attack", value: 9, text: "Drowned roar: 9" },
    ],
  },
  jailerCorpse: {
    name: "Jailer Corpse (Floor 1 Boss)",
    hp: 50,
    silhouette: "key",
    pattern: [
      { kind: "attack", value: 3, text: "Keyring lash: 3" },
      { kind: "defend", value: 4, text: "Iron stance" },
      { kind: "attack", value: 1, text: "Bite: 1" },
      { kind: "attack", value: 5, text: "Whirling chain: 5" },
    ],
  },

  // ---------- Floor 2 ----------
  hallGuard: {
    name: "Castle Guard",
    hp: 26,
    silhouette: "shield",
    pattern: [
      { kind: "attack", value: 5, text: "Halberd: 5" },
      { kind: "defend", value: 5, text: "Shield brace" },
      { kind: "attack", value: 5, text: "Halberd: 5" },
    ],
  },
  inquisitor: {
    name: "Pale Inquisitor",
    hp: 32,
    silhouette: "cross",
    pattern: [
      { kind: "attack", value: 4, text: "Hex: 4" },
      { kind: "attack", value: 4, text: "Hex: 4" },
      { kind: "defend", value: 6, text: "Litany" },
      { kind: "attack", value: 7, text: "Verdict: 7" },
    ],
  },
  ironwidow: {
    name: "The Ironwidow (Elite)",
    hp: 48,
    silhouette: "spider",
    pattern: [
      { kind: "attack", value: 6, text: "Mournblade: 6" },
      { kind: "attack", value: 6, text: "Mournblade: 6" },
      { kind: "defend", value: 8, text: "Veiled stance" },
      { kind: "attack", value: 10, text: "Widow's Kiss: 10" },
    ],
  },
  steelChancellor: {
    name: "Steel Chancellor (Floor 2 Boss)",
    hp: 85,
    silhouette: "scales",
    pattern: [
      { kind: "attack", value: 7, text: "Court blade: 7" },
      { kind: "defend", value: 8, text: "Iron protocol" },
      { kind: "attack", value: 6, text: "Twin cuts: 6 (×2)" },
      { kind: "buff",   value: 6, text: "Recites a writ; heals 6" },
      { kind: "attack", value: 10, text: "Verdict of Steel: 10" },
    ],
  },

  // ---------- Floor 3: Throne Room ----------
  shadowGorgon: {
    name: "Gorgonzola's Shadow",
    hp: 40,
    silhouette: "eye",
    pattern: [
      { kind: "attack", value: 6, text: "Shadow whip: 6" },
      { kind: "attack", value: 6, text: "Shadow whip: 6" },
      { kind: "defend", value: 8, text: "Folds into dark" },
    ],
  },
  thronehound: {
    name: "Throne Hound (Elite)",
    hp: 55,
    silhouette: "hound",
    pattern: [
      { kind: "attack", value: 8, text: "Maul: 8" },
      { kind: "defend", value: 8, text: "Crouch" },
      { kind: "attack", value: 12, text: "Leap: 12" },
    ],
  },
  gorgonzola: {
    name: "Gorgonzola the Unspoken",
    hp: 130,
    silhouette: "crown",
    pattern: [
      { kind: "attack", value: 9,  text: "A name unsaid: 9" },
      { kind: "defend", value: 10, text: "Silence" },
      { kind: "attack", value: 7,  text: "Twin gestures: 7 (×2)" },
      { kind: "buff",   value: 10, text: "Drinks the room; heals 10" },
      { kind: "attack", value: 14, text: "The final word: 14" },
    ],
  },

  // ======================================================================
  // CURSED FOREST BIOME (floors 4-8)
  // Past the throne room the crypt opens onto a wood that has forgotten the
  // sun. HP and intent values climb steadily toward the Heart of Rot. By
  // floor 4 the player has felled three bosses (so +3 baseActionsPerTurn)
  // and a far deeper deck — the curve below assumes that power spike.
  // ======================================================================

  // ---------- Floor 4: The Outer Grove ----------
  sporeling: {
    name: "Sporeling",
    hp: 46,
    silhouette: "mushroom",
    pattern: [
      { kind: "attack", value: 5, text: "Spore burst: 5" },
      { kind: "attack", value: 4, text: "Caustic puff: 4" },
      { kind: "defend", value: 4, text: "Curls its cap" },
    ],
  },
  thornWisp: {
    name: "Thorn Wisp",
    hp: 48,
    silhouette: "wisp",
    pattern: [
      { kind: "attack", value: 6, text: "Witch-light: 6" },
      { kind: "defend", value: 5, text: "Flickers out of reach" },
      { kind: "attack", value: 7, text: "Searing drift: 7" },
    ],
  },
  groveStag: {
    name: "Grove Stag (Elite)",
    hp: 66,
    silhouette: "antler",
    pattern: [
      { kind: "attack", value: 8,  text: "Goring charge: 8" },
      { kind: "defend", value: 9,  text: "Lowers antlers" },
      { kind: "attack", value: 12, text: "Trampling rush: 12" },
    ],
  },
  briarKing: {
    name: "The Briar King (Floor 4 Boss)",
    hp: 145,
    silhouette: "treant",
    pattern: [
      { kind: "attack", value: 9,  text: "Thorn lash: 9" },
      { kind: "defend", value: 11, text: "Bark hide" },
      { kind: "attack", value: 8,  text: "Bramble whips: 8 (×2)" },
      { kind: "buff",   value: 9,  text: "Drinks the soil; heals 9" },
      { kind: "attack", value: 15, text: "Strangling roots: 15" },
    ],
  },

  // ---------- Floor 5: The Mushroom Hollow ----------
  myconid: {
    name: "Myconid",
    hp: 54,
    silhouette: "mushroom",
    pattern: [
      { kind: "attack", value: 6, text: "Cap-slam: 6" },
      { kind: "attack", value: 5, text: "Spore cloud: 5" },
      { kind: "defend", value: 6, text: "Hardens" },
    ],
  },
  hollowStalker: {
    name: "Hollow Stalker",
    hp: 56,
    silhouette: "spider",
    pattern: [
      { kind: "attack", value: 7, text: "Skittering bite: 7" },
      { kind: "defend", value: 6, text: "Webs over" },
      { kind: "attack", value: 8, text: "Venom lunge: 8" },
    ],
  },
  fungalBehemoth: {
    name: "Fungal Behemoth (Elite)",
    hp: 80,
    silhouette: "treant",
    pattern: [
      { kind: "attack", value: 9,  text: "Rotten swing: 9" },
      { kind: "defend", value: 10, text: "Mycelial wall" },
      { kind: "attack", value: 14, text: "Collapse: 14" },
    ],
  },
  sporeTyrant: {
    name: "The Spore Tyrant (Floor 5 Boss)",
    hp: 160,
    silhouette: "mushroom",
    pattern: [
      { kind: "attack", value: 10, text: "Bloom-burst: 10" },
      { kind: "defend", value: 12, text: "Sclerotium shell" },
      { kind: "attack", value: 8,  text: "Twin spore-lances: 8 (×2)" },
      { kind: "buff",   value: 11, text: "Feeds on rot; heals 11" },
      { kind: "attack", value: 16, text: "Fruiting detonation: 16" },
    ],
  },

  // ---------- Floor 6: The Black Mire ----------
  mireWretch: {
    name: "Mire Wretch",
    hp: 60,
    silhouette: "skull",
    pattern: [
      { kind: "attack", value: 7, text: "Drowning grasp: 7" },
      { kind: "attack", value: 6, text: "Mud-choke: 6" },
      { kind: "defend", value: 7, text: "Sinks under" },
    ],
  },
  marshWisp: {
    name: "Marsh Fire",
    hp: 58,
    silhouette: "wisp",
    pattern: [
      { kind: "attack", value: 8, text: "Marsh fire: 8" },
      { kind: "defend", value: 6, text: "Gutters low" },
      { kind: "attack", value: 9, text: "Will-o'-flare: 9" },
    ],
  },
  bogHorror: {
    name: "Bog Horror (Elite)",
    hp: 86,
    silhouette: "spider",
    pattern: [
      { kind: "attack", value: 10, text: "Bog-tendril: 10" },
      { kind: "defend", value: 11, text: "Silt carapace" },
      { kind: "attack", value: 15, text: "Engulf: 15" },
    ],
  },
  drownedDruid: {
    name: "The Drowned Druid (Floor 6 Boss)",
    hp: 175,
    silhouette: "treant",
    pattern: [
      { kind: "attack", value: 11, text: "Rotwater hex: 11" },
      { kind: "defend", value: 13, text: "Reed shroud" },
      { kind: "attack", value: 9,  text: "Twin curses: 9 (×2)" },
      { kind: "buff",   value: 12, text: "Calls the mire; heals 12" },
      { kind: "attack", value: 17, text: "Tide of the dead: 17" },
    ],
  },

  // ---------- Floor 7: The Bone Thicket ----------
  boneStag: {
    name: "Bone Stag",
    hp: 70,
    silhouette: "antler",
    pattern: [
      { kind: "attack", value: 8,  text: "Bone-gore: 8" },
      { kind: "defend", value: 7,  text: "Antler guard" },
      { kind: "attack", value: 10, text: "Skewering charge: 10" },
    ],
  },
  gravewight: {
    name: "Gravewight",
    hp: 72,
    silhouette: "skull",
    pattern: [
      { kind: "attack", value: 9, text: "Grave-chill: 9" },
      { kind: "attack", value: 7, text: "Rattling claw: 7" },
      { kind: "defend", value: 8, text: "Crumbles inward" },
    ],
  },
  ossuaryTreant: {
    name: "Ossuary Treant (Elite)",
    hp: 96,
    silhouette: "treant",
    pattern: [
      { kind: "attack", value: 11, text: "Skull-fling: 11" },
      { kind: "defend", value: 12, text: "Ribcage bark" },
      { kind: "attack", value: 16, text: "Marrow crush: 16" },
    ],
  },
  boneShepherd: {
    name: "The Bone Shepherd (Floor 7 Boss)",
    hp: 195,
    silhouette: "hound",
    pattern: [
      { kind: "attack", value: 12, text: "Crook-strike: 12" },
      { kind: "defend", value: 14, text: "Calls the herd" },
      { kind: "attack", value: 10, text: "Twin maws: 10 (×2)" },
      { kind: "buff",   value: 13, text: "Reaps the fallen; heals 13" },
      { kind: "attack", value: 18, text: "Stampede of bones: 18" },
    ],
  },

  // ---------- Floor 8: The Heart of Rot ----------
  rotThrall: {
    name: "Rot Thrall",
    hp: 80,
    silhouette: "wisp",
    pattern: [
      { kind: "attack", value: 9, text: "Rot-touch: 9" },
      { kind: "attack", value: 8, text: "Withering: 8" },
      { kind: "defend", value: 9, text: "Reforms" },
    ],
  },
  heartspawn: {
    name: "Heartspawn",
    hp: 82,
    silhouette: "mushroom",
    pattern: [
      { kind: "attack", value: 10, text: "Pustule burst: 10" },
      { kind: "defend", value: 9,  text: "Sporulates" },
      { kind: "attack", value: 11, text: "Corrupting spray: 11" },
    ],
  },
  corruptedEnt: {
    name: "Corrupted Ent (Elite)",
    hp: 108,
    silhouette: "treant",
    pattern: [
      { kind: "attack", value: 12, text: "Blighted bough: 12" },
      { kind: "defend", value: 13, text: "Heartwood shell" },
      { kind: "attack", value: 18, text: "Toppling slam: 18" },
    ],
  },
  heartOfRot: {
    name: "Sylvath, the Heart of Rot (FINAL)",
    hp: 235,
    silhouette: "rotheart",
    pattern: [
      { kind: "attack", value: 13, text: "Curse made flesh: 13" },
      { kind: "defend", value: 15, text: "Heartwood seals shut" },
      { kind: "attack", value: 10, text: "Lashing roots: 10 (×2)" },
      { kind: "buff",   value: 14, text: "Drinks the forest's death; heals 14" },
      { kind: "attack", value: 20, text: "The rot consumes all: 20" },
    ],
  },
};

/** Pick an enemy for a given floor + node kind. */
export function pickEnemyForNode(floor: number, kind: "combat" | "elite" | "boss"): EnemyTemplate {
  const pool = {
    1: { combat: ["cryptRat", "boneCultist"],   elite: ["drownedKnight"], boss: ["jailerCorpse"] },
    2: { combat: ["hallGuard", "inquisitor"],   elite: ["ironwidow"],     boss: ["steelChancellor"] },
    3: { combat: ["shadowGorgon"],              elite: ["thronehound"],   boss: ["gorgonzola"] },
    // Cursed-forest biome
    4: { combat: ["sporeling", "thornWisp"],    elite: ["groveStag"],     boss: ["briarKing"] },
    5: { combat: ["myconid", "hollowStalker"],  elite: ["fungalBehemoth"], boss: ["sporeTyrant"] },
    6: { combat: ["mireWretch", "marshWisp"],   elite: ["bogHorror"],     boss: ["drownedDruid"] },
    7: { combat: ["boneStag", "gravewight"],    elite: ["ossuaryTreant"], boss: ["boneShepherd"] },
    8: { combat: ["rotThrall", "heartspawn"],   elite: ["corruptedEnt"],  boss: ["heartOfRot"] },
  } as const;
  type FloorKey = keyof typeof pool;
  const f = pool[Math.min(8, Math.max(1, floor)) as FloorKey];
  const ids = f[kind];
  const id = ids[Math.floor(Math.random() * ids.length)];
  return ENEMIES[id];
}
