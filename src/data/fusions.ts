import type { FusionRecipe } from "@/types/cards";

/**
 * Vampire-Survivors-style fusions. Recipes are predefined.
 * The Forge node checks the player's deck and offers any recipes
 * for which BOTH ingredients are currently in their deck.
 *
 * Order of `ingredients` is not significant — the Forge checks both orderings.
 */
export const FUSIONS: FusionRecipe[] = [
  { id: "f_inferno_blade",       ingredients: ["sorc_fireball",        "warr_sword_stance"],   result: "fuse_inferno_blade" },
  { id: "f_aegis_bulwark",       ingredients: ["warr_block",           "sorc_mage_armor"],     result: "fuse_aegis_bulwark" },
  { id: "f_arcane_berserker",    ingredients: ["barb_wild_swing",      "sorc_magic_missile"],  result: "fuse_arcane_berserker" },
  { id: "f_tempered_frostflame", ingredients: ["sorc_frost_bolt",      "bm_flame_sword"],      result: "fuse_tempered_frostflame" },
  { id: "f_storm_whirl",         ingredients: ["sorc_chain_lightning", "warr_whirlwind"],      result: "fuse_storm_whirl" },
  { id: "f_sanctified_ward",     ingredients: ["warr_recover",         "sorc_mage_armor"],     result: "fuse_sanctified_ward" },
  { id: "f_world_breaker",       ingredients: ["warr_heavy_strike",    "sorc_meteor"],         result: "fuse_world_breaker" },
  { id: "f_mirror_aegis",        ingredients: ["warr_shield_wall",     "sorc_prismatic_ward"], result: "fuse_mirror_aegis" },
  { id: "f_concussion",          ingredients: ["warr_bash",            "warr_bash"],           result: "fuse_concussion" },
  { id: "f_mortal_cleave",       ingredients: ["warr_cleave",          "warr_cleave"],         result: "fuse_mortal_cleave" },
  { id: "f_arcane_volley",       ingredients: ["sorc_magic_missile",   "sorc_magic_missile"],  result: "fuse_arcane_volley" },
  { id: "f_coruscation",         ingredients: ["sorc_spark",           "sorc_spark"],          result: "fuse_coruscation" },
  { id: "f_cataclysm_swing",     ingredients: ["barb_wild_swing",      "barb_wild_swing"],     result: "fuse_cataclysm_swing" },
  { id: "f_soulrot",             ingredients: ["sorc_hex",             "sorc_mana_burn"],      result: "fuse_soulrot" },
  { id: "f_bloody_hilt",         ingredients: ["barb_rage_strike",     "warr_sword_stance"],   result: "fuse_bloody_hilt" },
  { id: "f_ironweave",           ingredients: ["sorc_mage_armor",      "warr_iron_will"],      result: "fuse_ironweave" },
  { id: "f_world_render",        ingredients: ["barb_crushing_blow",   "warr_heavy_strike"],   result: "fuse_world_render" },
  { id: "f_blood_riot",          ingredients: ["barb_frenzy",          "barb_adrenaline"],     result: "fuse_blood_riot" },
  { id: "f_unending_warcry",     ingredients: ["warr_battle_cry",      "barb_howl"],           result: "fuse_unending_warcry" },
  { id: "f_kiln_blade",          ingredients: ["bm_flame_sword",       "warr_sword_stance"],   result: "fuse_kiln_blade" },
  { id: "f_hourglass",           ingredients: ["barb_frenzy",          "sorc_time_warp"],      result: "fuse_hourglass" },
];

/** Find fusions whose both ingredients are present in the given deck. */
export function availableFusions(deckCardIds: string[]): FusionRecipe[] {
  return FUSIONS.filter((recipe) => {
    const [a, b] = recipe.ingredients;
    if (a === b) {
      return deckCardIds.filter((id) => id === a).length >= 2;
    }
    return deckCardIds.includes(a) && deckCardIds.includes(b);
  });
}
