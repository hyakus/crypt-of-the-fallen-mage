export type CardClass =
  | "sorcerer"
  | "warrior"
  | "barbarian"
  | "battlemage"
  | "fusion"
  | "neutral";

export type CardRarity = "starter" | "basic" | "rare" | "super" | "fusion";

export type CardKind = "attack" | "defend" | "utility";

export interface CardEffect {
  // Direct numbers
  damage?: number;
  shield?: number;
  heal?: number;
  draw?: number;
  selfDamage?: number;
  hits?: number; // multi-hit attacks (default 1)

  // Statuses applied to the enemy
  burn?: number;
  freeze?: number;
  stun?: number;
  bleed?: number;

  // Statuses applied to the player
  regen?: number;
  empowered?: number;

  // Mechanics flags
  extraPlay?: boolean;        // +1 action this turn
  grantActions?: number;      // +N actions this turn (for Hourglass-type bursts)
  pierce?: boolean;
  reflect?: number;
  counter?: number;
  revive?: number; // revive once with N HP if killed this fight
  /** After resolving, return this card to hand instead of going to discard. */
  returnToHand?: boolean;
  /** Card can only be played once per turn (tracked by card id). */
  onceEachTurn?: boolean;

  // Sequence: bonus that triggers if this card is the Nth-or-later card played this turn.
  sequence?: {
    n: number;
    bonusDamage?: number;
    bonusShield?: number;
    extraDraw?: number;
  };

  // Echo: replay the effects of the last card you played this turn.
  echoLast?: boolean;

  // Synergy: scales by count of <class> cards currently in the player's deck
  synergyClass?: CardClass;
  synergyDamage?: number;
  synergyShield?: number;
  /** Caps total synergy bonus damage. e.g. Prismatic Bolt is "+1 per Sorcerer
   *  card (max +5)" — synergyDamage 1, synergyMax 5. */
  synergyMax?: number;
  /** Additional classes whose cards count for synergy. e.g. Arcane Berserker
   *  is "+1 per Sorcerer or Barbarian card" — synergyClass "sorcerer",
   *  synergyExtraClasses ["barbarian"]. */
  synergyExtraClasses?: CardClass[];

  // Conditional bonus
  conditional?: {
    type: "playerHpBelow" | "playerHpAbove" | "enemyHpBelow" | "synergyAtLeast";
    threshold: number;
    /** Required when type === "synergyAtLeast": which class is counted. */
    synergyClass?: CardClass;
    bonusDamage?: number;
    bonusShield?: number;
  };

  // Missing-HP bonus damage: adds `per` damage for every point of HP the
  // player is missing, capped at `max` total bonus. Used by Bloodlust /
  // Unleash Rage. Lives in the structured schema so the engine actually
  // applies it (was previously only described in the cosmetic `special` field).
  missingHpBonus?: { per: number; max: number };

  /** Reduces the enemy's NEXT attack damage by this amount. Stacks; consumed
   *  one stack per enemy attack. Used by Mind Steal. */
  enemyWeaken?: number;

  /** Fight-lingering boost to the player's per-turn baseline plays. Applied
   *  immediately AND persists for the rest of this fight. Used by Archmage
   *  Ascension. (extraPlay / grantActions are this-turn-only.) */
  bonusActionsAllFight?: number;

  // Per-card descriptive notes for special effects we display but don't yet engine-fully-implement
  special?: string;
}

export interface Card {
  id: string;
  name: string;
  class: CardClass;
  rarity: CardRarity;
  kind: CardKind;
  description: string;
  flavor: string;
  effect: CardEffect;
  /** Per-instance "this exact card has a holo finish" flag — set by
   *  inflateDeck when the deck-entry string carries the SHINY_PREFIX.
   *  CardSprite checks this and applies an animated holographic overlay. */
  shiny?: boolean;
}

export interface FusionRecipe {
  id: string;
  ingredients: [string, string]; // two card ids
  result: string; // card id of the fusion card
}
