import type { HeroAction } from "@/types/game";

/**
 * Hero Skill catalogue. Mortimer's "Jokers" — picked at run start, after
 * elite kills, and after boss kills. Mix of:
 *   - Active skills (tap in combat to fire, once per fight)
 *   - Passive skills (engine auto-fires on a trigger: turn start, turn end,
 *     combat start, low HP)
 *
 * Picking a skill ADDS it to run.heroActions (no replacement, no cap — see
 * the player's "no cap" preference). The in-combat UI renders a popup list
 * triggered by tapping the portrait.
 */
export type HeroSkillTemplate = Omit<HeroAction, "usedThisFight">;

export const HERO_SKILLS: HeroSkillTemplate[] = [
  // ─────────── ACTIVE skills (tap to fire) ────────────────────────────────

  {
    id: "ha_second_wind",
    name: "Second Wind",
    description: "Once per fight — draw 2 cards.",
    kind: "active",
    effect: { kind: "draw", value: 2 },
    oncePerFight: true,
  },
  {
    id: "ha_brace",
    name: "Brace",
    description: "Once per fight — gain 5 shield.",
    kind: "active",
    effect: { kind: "shield", value: 5 },
    oncePerFight: true,
  },
  {
    id: "ha_strike",
    name: "Strike",
    description: "Once per fight — deal 5 damage.",
    kind: "active",
    effect: { kind: "damage", value: 5 },
    oncePerFight: true,
  },
  {
    id: "ha_steady_breath",
    name: "Steady Breath",
    description: "Once per fight — heal 4 HP.",
    kind: "active",
    effect: { kind: "heal", value: 4 },
    oncePerFight: true,
  },
  {
    id: "ha_reclaim",
    name: "Reclaim",
    description: "Once per fight — gain Regen 2 (3 turns).",
    kind: "active",
    effect: { kind: "regen", value: 2 },
    oncePerFight: true,
  },
  {
    // Phoenix Form now auto-arms at combat start. The old "tap to arm in
    // combat" UX had a wart: there's never a reason NOT to tap it, so the
    // tap was just busywork between rooms. Passive at combatStart gives
    // the same effect without making the player click through a guaranteed
    // good thing every fight.
    id: "ha_phoenix_form",
    name: "Phoenix Form",
    description: "At combat start — arms a revive with 5 HP if you fall this fight.",
    kind: "passive",
    trigger: "combatStart",
    effect: { kind: "revive", value: 5 },
    oncePerFight: true,
  },
  {
    id: "ha_cleanse",
    name: "Cleanse",
    description: "Once per fight — remove every negative status from yourself.",
    kind: "active",
    effect: { kind: "cleanse", value: 0 },
    oncePerFight: true,
  },
  {
    id: "ha_mind_steal",
    name: "Mind Steal",
    description: "Once per fight — apply Weaken 2 to the enemy.",
    kind: "active",
    effect: { kind: "weakenEnemy", value: 2 },
    oncePerFight: true,
  },
  {
    id: "ha_frost_touch",
    name: "Frost Touch",
    description: "Once per fight — apply Freeze 3 to the enemy.",
    kind: "active",
    effect: { kind: "freezeEnemy", value: 3 },
    oncePerFight: true,
  },
  {
    id: "ha_brick_wall",
    name: "Brick Wall",
    description: "Once per fight — gain shield equal to half your max HP.",
    kind: "active",
    effect: { kind: "shieldMaxHpHalf", value: 0 },
    oncePerFight: true,
  },
  {
    id: "ha_berserker",
    name: "Berserker",
    description: "Once per fight — lose 3 HP, deal 8 damage to the enemy.",
    kind: "active",
    effect: { kind: "berserkAttack", value: 8, cost: 3 },
    oncePerFight: true,
  },
  {
    id: "ha_sword_dance",
    name: "Sword Dance",
    description: "Once per fight — gain 2 actions this turn.",
    kind: "active",
    effect: { kind: "extraActions", value: 2 },
    oncePerFight: true,
  },
  {
    id: "ha_insight",
    name: "Insight",
    description: "Once per fight — draw 3 cards.",
    kind: "active",
    effect: { kind: "peekDraw", value: 3 },
    oncePerFight: true,
  },

  // ─────────── PASSIVE skills (engine auto-fires) ──────────────────────────

  {
    id: "ha_last_resort",
    name: "Last Resort",
    // Important: matches the player's verbatim spec — the added card joins
    // the permanent deck AND comes in shimmering.
    description:
      "Once per fight — at the start of your turn, if HP < 5, add a random rare attack card to your hand. It joins your deck and shines.",
    kind: "passive",
    trigger: "onLowHp",
    effect: { kind: "addShinyRareAttack", value: 1 },
    oncePerFight: true,
  },
  {
    id: "ha_bloodlust_pact",
    name: "Bloodlust Pact",
    description: "At the start of each turn — gain Empowered 1.",
    kind: "passive",
    trigger: "turnStart",
    effect: { kind: "gainEmpowered", value: 1 },
    oncePerFight: false,
  },
  {
    id: "ha_ironclad",
    name: "Ironclad",
    description: "At the start of each turn — gain 2 shield.",
    kind: "passive",
    trigger: "turnStart",
    effect: { kind: "shield", value: 2 },
    oncePerFight: false,
  },
  {
    id: "ha_ancestral_echo",
    name: "Ancestral Echo",
    description: "At the end of each turn — gain Regen 1.",
    kind: "passive",
    trigger: "turnEnd",
    effect: { kind: "regen", value: 1 },
    oncePerFight: false,
  },
  {
    id: "ha_counter_stance",
    name: "Counter Stance",
    description: "At the start of each turn — gain Counter 2.",
    kind: "passive",
    trigger: "turnStart",
    effect: { kind: "addCounter", value: 2 },
    oncePerFight: false,
  },
  {
    id: "ha_tireless",
    name: "Tireless",
    description: "Once per fight — when your HP drops below 5, gain 2 bonus actions next turn.",
    kind: "passive",
    trigger: "onLowHp",
    effect: { kind: "extraActionsNextTurn", value: 2 },
    oncePerFight: true,
  },
  {
    id: "ha_warm_bones",
    name: "Warm Bones",
    description: "At combat start — heal 5 HP.",
    kind: "passive",
    trigger: "combatStart",
    effect: { kind: "heal", value: 5 },
    oncePerFight: false,
  },
  {
    id: "ha_iron_will",
    name: "Iron Will",
    description: "At combat start — draw 1 extra card.",
    kind: "passive",
    trigger: "combatStart",
    effect: { kind: "draw", value: 1 },
    oncePerFight: false,
  },
];

const HERO_SKILLS_BY_ID: Record<string, HeroSkillTemplate> = Object.fromEntries(
  HERO_SKILLS.map((h) => [h.id, h]),
);

export function heroSkillById(id: string): HeroSkillTemplate | undefined {
  return HERO_SKILLS_BY_ID[id];
}

/**
 * Roll N distinct hero skills to offer the player. Excludes anything they
 * already own — no point offering a duplicate they can't stack.
 */
export function rollHeroSkills(ownedIds: string[], n: number): HeroSkillTemplate[] {
  const owned = new Set(ownedIds);
  const pool = HERO_SKILLS.filter((h) => !owned.has(h.id));
  const out: HeroSkillTemplate[] = [];
  const picks = [...pool];
  while (out.length < n && picks.length > 0) {
    const idx = Math.floor(Math.random() * picks.length);
    out.push(picks.splice(idx, 1)[0]);
  }
  return out;
}

/** Convert a template to a fresh HeroAction (usedThisFight false). */
export function instantiateHeroSkill(t: HeroSkillTemplate): HeroAction {
  return { ...t, usedThisFight: false };
}
