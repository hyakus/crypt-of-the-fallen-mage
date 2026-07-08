import type { RunState } from "@/types/game";

/**
 * Humanity perks. Awarded after beating a floor boss, in place of the old
 * super-power card. Each pick gives the player a "smidge of humanity back".
 *
 * Hero skills used to live here too (wrapped as perks) and competed with
 * regular perks in the boss pool. They've been split out to src/data/
 * heroSkills.ts — picks for hero skills run through their own HeroPickScene
 * at run-start, elite kill, and boss kill.
 */
export interface Perk {
  id: string;
  name: string;
  description: string;
  /** Mutates the run state in place when the player picks this perk. */
  apply: (run: RunState) => void;
}

// ============================================================================
// Regular perks (passive run-state changes — HP, gold, shield, actions, …).
// ============================================================================
export const PERKS: Perk[] = [
  {
    id: "perk_hardened",
    name: "Hardened",
    description: "+8 max HP. Heal to full.",
    apply: (run) => {
      run.maxHp += 8;
      run.hp = run.maxHp;
    },
  },
  {
    id: "perk_purse",
    name: "Heavy Purse",
    description: "+30 gold.",
    apply: (run) => { run.gold += 30; },
  },
  {
    id: "perk_wayshrines",
    name: "Wayshrines",
    description: "One extra shrine appears on the next floor.",
    apply: (run) => { run.pendingExtraShrines += 1; },
  },
  {
    id: "perk_wandering_forge",
    name: "Wandering Forge",
    description: "One extra forge appears on the next floor.",
    apply: (run) => { run.pendingExtraForges += 1; },
  },
  {
    id: "perk_iron_skin",
    name: "Iron Skin",
    description: "Begin every combat with 3 shield.",
    apply: (run) => { run.combatStartShield += 3; },
  },
  {
    id: "perk_bulwark",
    name: "Bulwark",
    description: "Half your shield carries to the next turn instead of fading.",
    apply: (run) => { run.shieldCarryover = true; },
  },
  {
    id: "perk_quickening",
    name: "Quickening",
    description: "+1 ◆ action per turn — permanently.",
    apply: (run) => { run.baseActionsPerTurn += 1; },
  },
  {
    id: "perk_steady_hand",
    name: "Steady Hand",
    description: "Begin every turn with +1 ◆ action.",
    apply: (run) => { run.baseActionsPerTurn += 1; },
  },
  {
    id: "perk_disciplined",
    name: "Disciplined",
    description: "Begin every turn with +1 ◆ action.",
    apply: (run) => { run.baseActionsPerTurn += 1; },
  },
];

/** Roll N random perks, excluding any already owned. */
export function rollPerks(run: RunState, n: number): Perk[] {
  const owned = new Set(run.perks);
  const pool = PERKS.filter((p) => !owned.has(p.id));
  const out: Perk[] = [];
  const pickFrom = [...pool];
  while (out.length < n && pickFrom.length > 0) {
    const idx = Math.floor(Math.random() * pickFrom.length);
    out.push(pickFrom.splice(idx, 1)[0]);
  }
  return out;
}
