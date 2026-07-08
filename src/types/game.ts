import type { Card, CardClass } from "./cards";

export type NodeKind =
  | "combat"
  | "elite"
  | "shop"
  | "grave"
  | "forge"
  | "shrine"
  | "well"
  | "boss";

export interface MapNode {
  id: string;
  kind: NodeKind;
  row: number;        // 0 = bottom (start), higher = further up
  col: number;        // horizontal slot
  next: string[];     // ids of nodes reachable from this one (one row up)
  visited?: boolean;
}

export interface FloorMap {
  floor: number;
  nodes: MapNode[];
  startNodeIds: string[];
  bossNodeId: string;
}

/**
 * When in the fight cycle a passive hero skill considers firing.
 *   turnStart    — at the very start of each player turn
 *   turnEnd      — at the very end of each player turn (before enemy acts)
 *   combatStart  — once at fight start, before opening hand is drawn
 *   onLowHp      — fires the first frame each turn where player.hp < 5
 */
export type HeroTriggerWhen = "turnStart" | "turnEnd" | "combatStart" | "onLowHp";

export interface HeroEffect {
  // Active-only effects (tap-to-fire from combat UI):
  kind:
    | "draw"
    | "shield"
    | "damage"
    | "heal"
    | "regen"
    | "revive"
    | "cleanse"          // strip all negative statuses from self
    | "freezeEnemy"      // apply Freeze N
    | "weakenEnemy"      // apply Weaken N
    | "shieldMaxHpHalf"  // shield = floor(maxHp / 2)
    | "berserkAttack"    // lose `cost` HP, deal `value` damage
    | "extraActions"     // gain N bonus actions this turn
    | "peekDraw"         // draw N from the top
    // Passive-only effects (fire from engine triggers):
    | "addShinyRareAttack"  // append a random rare attack card to hand AND deck
    | "gainEmpowered"       // status.empowered += value
    | "addCounter"          // status.counter += value
    | "extraActionsNextTurn"; // value bonus actions next turn
  value: number;
  /** Optional secondary cost (used by berserkAttack: HP cost). */
  cost?: number;
}

export interface HeroAction {
  id: string;
  name: string;
  description: string;
  /** Active = player taps to fire from the in-combat list.
   *  Passive = engine auto-fires when `trigger` conditions are met. */
  kind: "active" | "passive";
  /** Effect when fired. */
  effect: HeroEffect;
  /** For passives — when in the fight cycle to consider firing.
   *  Ignored for active skills. */
  trigger?: HeroTriggerWhen;
  /** True if this skill should only fire once per FIGHT (resets at combat start).
   *  All current skills are once-per-fight; left as a flag for future per-run
   *  passives that should burn permanently. */
  oncePerFight: boolean;
  /** Reset to false at start of every combat. */
  usedThisFight: boolean;
}

/** Persistent state for a single run. */
export interface RunState {
  hp: number;
  maxHp: number;
  gold: number;
  deck: string[];           // card ids
  floor: number;
  currentNodeId: string | null;
  map: FloorMap | null;
  freeGraveUsedThisFloor: boolean;
  superCardUnlockedThisRun: boolean;

  /** Class the player picked from the Goddess. Null if Dream was skipped. */
  chosenClass: CardClass | null;

  // ---- Humanity / perks ----
  /** IDs of perks earned across this run. Cosmetic + design tracking. */
  perks: string[];
  /** Hero actions earned by perk picks (one-per-fight buttons in combat). */
  heroActions: HeroAction[];
  /** Each turn's baseline action count (1 by default; perks can raise this). */
  baseActionsPerTurn: number;
  /** Extra forge nodes to inject into the next floor's map. */
  pendingExtraForges: number;
  /** Extra shrine nodes to inject into the next floor's map. */
  pendingExtraShrines: number;
  /** Combat-start shield granted by perks. */
  combatStartShield: number;
  /** If true, half of the player's shield carries to the next turn instead
   *  of fully resetting. Granted by the Bulwark perk. */
  shieldCarryover: boolean;
  /** Meta-perks owned at the time this run started. Copied from MetaState so
   *  runtime checks (intent vision, opening hand size, etc.) don't need to
   *  re-read localStorage. */
  metaPerks: string[];
  /** Per-shop-node inventory. Keyed by MapNode.id. Rolled once on first
   *  visit so re-entering the same shop doesn't re-roll the stock. Cleared
   *  when a new floor is generated. */
  shopStock?: Record<string, ShopStockEntry[]>;
  /** Per-well-node outcome. Keyed by MapNode.id. Rolled once on first pull so
   *  re-entering the same well doesn't re-roll what's down there. Cleared when
   *  a new floor is generated. */
  wellStock?: Record<string, WellOutcome>;
}

/**
 * What a well's bucket brings up, rolled once per well node and persisted so
 * re-entry is stable.
 *   - "enemy": something lurks below — pulling drops the player into an easy
 *     combat encounter.
 *   - "cards": treasure — pulling offers a choice of one of three cards.
 * `resolved` flips true once the player commits (takes a card / triggers the
 * fight) so a re-entered well reads as already-drawn.
 */
export interface WellOutcome {
  kind: "enemy" | "cards" | "heroSkill";
  /** Three card ids when kind === "cards"; empty for "enemy" / "heroSkill". */
  cardIds: string[];
  resolved: boolean;
}

/** A single offering inside a shop's stock — a card + its price + sold state. */
export interface ShopStockEntry {
  card: Card;
  cost: number;
  sold: boolean;
}

/** Rolling stats collected during a fight — displayed on the battle summary screen. */
export interface CombatStats {
  damageDealt: number;
  damageReceived: number;
  cardsPlayed: number;
  maxCombo: number;
  totalCombos: number;
  turns: number;
}

/** Per-combat ephemeral state. */
export interface CombatState {
  player: CombatActor;
  enemy: CombatActor;
  drawPile: Card[];
  hand: Card[];
  discardPile: Card[];
  /** Baseline actions remaining (refilled at turn start to baseActionsPerTurn + bonusBaseActionsThisFight). */
  playsRemainingThisTurn: number;
  /** Extra actions granted by extraPlay/grantActions effects — consumed BEFORE baseline. */
  bonusActions: number;
  /** Lingering boost to the per-turn baseline plays for the rest of THIS fight.
   *  Stacked by `bonusActionsAllFight` effects (e.g. Archmage Ascension).
   *  Added on top of `baseActionsPerTurn` every turn end. */
  bonusBaseActionsThisFight: number;
  /** How many cards have been played this turn — drives Sequence + the combo counter UI. */
  cardsPlayedThisTurn: number;
  /** IDs of cards played this turn — used to gate onceEachTurn cards. Reset on turn end. */
  cardIdsPlayedThisTurn: string[];
  /** Last non-echo card played this turn (for Echo cards). Null at turn start. */
  lastPlayedCard: Card | null;
  turn: number;
  log: string[];
  outcome: "ongoing" | "won" | "lost";
  stats: CombatStats;
  /** Status-effect fire events the engine pushes when an effect actually
   *  triggers (burn deals damage, regen heals, reflect returns damage,
   *  etc.). The scene drains and clears this list each refresh, playing a
   *  brief flash on the matching HP cross. Not persisted — it's a transient
   *  inbox the engine writes to and the renderer reads. */
  statusTriggers: StatusTrigger[];
}

export interface StatusEffects {
  burn: number;
  freeze: number;
  stun: number;
  bleed: number;
  regen: number;
  empowered: number;
  reflect: number;
  counter: number;
  reviveAt: number; // HP to revive at if killed (one-shot)
  /** On the enemy: reduces the NEXT attack's damage by this many points,
   *  consuming one stack per attack. Stacks are additive (Mind Steal × 2 ⇒ -2).
   *  Unused on the player. */
  weaken: number;
}

/**
 * One-shot record of a status effect firing on an actor — pushed by the
 * combat engine when (e.g.) burn deals its damage, regen heals, stun skips
 * an action. The CombatScene drains this list each refresh and plays a
 * brief flash on the matching HP cross so the player sees that the effect
 * actually triggered (not just sits on the actor).
 *
 * Distinct from a value rising (a "took hold" event the scene detects via
 * snapshot diff) — triggers are the engine deliberately *firing* an effect.
 */
export interface StatusTrigger {
  actor: "player" | "enemy";
  key: keyof StatusEffects;
}

export interface CombatActor {
  name: string;
  hp: number;
  maxHp: number;
  shield: number;
  status: StatusEffects;
  /** Telegraphed intent for next turn ("attack 3", "defend", etc.) */
  intent?: { kind: "attack" | "defend" | "buff"; value: number; text: string };
  /** Cosmetic-only "cards in hand" count for the enemy display. */
  handSize?: number;
  cardsInHand?: number;
}

export const FRESH_STATUS = (): StatusEffects => ({
  burn: 0,
  freeze: 0,
  stun: 0,
  bleed: 0,
  regen: 0,
  empowered: 0,
  reflect: 0,
  counter: 0,
  reviveAt: 0,
  weaken: 0,
});
