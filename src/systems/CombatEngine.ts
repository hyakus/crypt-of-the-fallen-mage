import type { Card } from "@/types/cards";
import type { CombatState, HeroAction } from "@/types/game";
import { FRESH_STATUS } from "@/types/game";
import { countByClass, inflateDeck, shuffle } from "@/systems/Deck";

/**
 * Identifier for the amber silhouette drawn on this enemy's card-backs.
 * Each kind maps to a Phaser Graphics routine in CardSprite.ts. Keep this
 * list and the renderer in sync.
 */
export type EnemySilhouette =
  | "rat"
  | "skull"
  | "knight"
  | "key"
  | "shield"
  | "cross"
  | "spider"
  | "scales"
  | "eye"
  | "hound"
  | "crown"
  | "goddess"
  // Cursed-forest biome (floors 4-8)
  | "mushroom"
  | "treant"
  | "antler"
  | "wisp"
  | "rotheart";

export interface EnemyTemplate {
  name: string;
  hp: number;
  /** Rotating list of intents; index advances each enemy turn. */
  pattern: Array<{ kind: "attack" | "defend" | "buff"; value: number; text: string }>;
  /**
   * Cosmetic-only hand size for the "cards in hand" indicator. Decrements
   * each enemy turn and resets when it hits 0 (reflavours pattern cycling
   * as a deck being played out & reshuffled). Defaults to `pattern.length`.
   */
  handSize?: number;
  /** Which silhouette is stamped on the enemy's card-back. */
  silhouette?: EnemySilhouette;
}

export function startCombat(
  playerDeckIds: string[],
  playerHp: number,
  playerMaxHp: number,
  enemy: EnemyTemplate,
  baseActions: number = 1,
): CombatState {
  const drawPile = shuffle(inflateDeck(playerDeckIds));
  return {
    player: {
      name: "Mortimer Vex",
      hp: playerHp,
      maxHp: playerMaxHp,
      shield: 0,
      status: FRESH_STATUS(),
    },
    enemy: {
      name: enemy.name,
      hp: enemy.hp,
      maxHp: enemy.hp,
      shield: 0,
      status: FRESH_STATUS(),
      intent: enemy.pattern[0],
      handSize: enemy.handSize ?? enemy.pattern.length,
      cardsInHand: enemy.handSize ?? enemy.pattern.length,
    },
    drawPile,
    hand: [],
    discardPile: [],
    playsRemainingThisTurn: baseActions,
    bonusActions: 0,
    bonusBaseActionsThisFight: 0,
    cardsPlayedThisTurn: 0,
    cardIdsPlayedThisTurn: [],
    lastPlayedCard: null,
    turn: 0,
    log: ["The fight begins."],
    outcome: "ongoing",
    stats: {
      damageDealt: 0,
      damageReceived: 0,
      cardsPlayed: 0,
      maxCombo: 0,
      totalCombos: 0,
      turns: 0,
    },
    statusTriggers: [],
  };
}

/**
 * Append a status-fired event for the renderer to flash on its HP cross.
 * Kept as a tiny helper so each call site reads as one line and the actor
 * literal can't drift typo-wise.
 */
function trigger(state: CombatState, actor: "player" | "enemy", key: import("@/types/game").StatusTrigger["key"]) {
  state.statusTriggers.push({ actor, key });
}

/**
 * Draw N cards into hand. If the draw pile is empty mid-draw, auto-reshuffle
 * the discard back into it and keep going — standard deckbuilder behaviour.
 * Only fails (returns less than N) when BOTH piles are empty.
 */
export function drawCards(state: CombatState, n: number): number {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length === 0) break; // truly empty — can't draw
      recycleDeck(state);
    }
    const c = state.drawPile.shift();
    if (c) {
      state.hand.push(c);
      drawn++;
    }
  }
  return drawn;
}

/** Reshuffle discard back into draw pile. */
export function recycleDeck(state: CombatState): void {
  state.drawPile = shuffle(state.discardPile);
  state.discardPile = [];
  state.log.push("Discard reshuffled into deck.");
}

/**
 * Resolve a card. `ordinal` = which play-number-of-the-turn this card is
 * (1-indexed). Used for Sequence bonuses.
 */
function applyCardEffects(state: CombatState, card: Card, playerDeckIds: string[], ordinal: number): void {
  const e = card.effect;
  const log = state.log;

  // Sequence bonus (triggers if this is the Nth-or-later card played this turn)
  let seqDmg = 0, seqShield = 0, seqDraw = 0;
  if (e.sequence && ordinal >= e.sequence.n) {
    seqDmg = e.sequence.bonusDamage ?? 0;
    seqShield = e.sequence.bonusShield ?? 0;
    seqDraw = e.sequence.extraDraw ?? 0;
    log.push(`Sequence ${e.sequence.n} triggers.`);
  }

  // Synergy bonus — counts cards of `synergyClass` (plus any `synergyExtraClasses`)
  // in the player's current deck. `synergyMax` caps the bonus damage total
  // (Prismatic Bolt's "max +5"). Shield bonus is uncapped — no card uses both yet.
  let synergyBonusDmg = 0;
  let synergyBonusShield = 0;
  if (e.synergyClass) {
    let count = countByClass(playerDeckIds, e.synergyClass);
    if (e.synergyExtraClasses) {
      for (const extra of e.synergyExtraClasses) {
        count += countByClass(playerDeckIds, extra);
      }
    }
    synergyBonusDmg = (e.synergyDamage ?? 0) * count;
    if (e.synergyMax !== undefined) synergyBonusDmg = Math.min(synergyBonusDmg, e.synergyMax);
    synergyBonusShield = (e.synergyShield ?? 0) * count;
  }

  // Conditional bonus — flat add when the predicate holds. "synergyAtLeast"
  // checks the player's deck for `threshold` cards of `synergyClass` (Glimmer
  // is "+1 damage if you have 5+ Sorcerer cards").
  let condBonusDmg = 0;
  let condBonusShield = 0;
  if (e.conditional) {
    const c = e.conditional;
    let meets = false;
    if (c.type === "playerHpBelow")  meets = state.player.hp < c.threshold;
    else if (c.type === "playerHpAbove") meets = state.player.hp > c.threshold;
    else if (c.type === "enemyHpBelow") meets = state.enemy.hp < c.threshold;
    else if (c.type === "synergyAtLeast" && c.synergyClass) {
      meets = countByClass(playerDeckIds, c.synergyClass) >= c.threshold;
    }
    if (meets) {
      condBonusDmg = c.bonusDamage ?? 0;
      condBonusShield = c.bonusShield ?? 0;
    }
  }

  // Missing-HP bonus (Bloodlust, Unleash Rage). Per-point of HP missing,
  // capped at `max`. Applied as a flat add to per-hit damage — same shape as
  // synergy / conditional bonuses. Computed against current HP so the bonus
  // grows as the fight wears Mortimer down.
  let missingHpDmg = 0;
  if (e.missingHpBonus) {
    const missing = Math.max(0, state.player.maxHp - state.player.hp);
    missingHpDmg = Math.min(e.missingHpBonus.max, missing * e.missingHpBonus.per);
  }

  // Damage
  const hits = e.hits ?? 1;
  const empoweredBonus = state.player.status.empowered;
  if (e.damage && e.damage > 0) {
    let perHit = e.damage + seqDmg + synergyBonusDmg + condBonusDmg + missingHpDmg + empoweredBonus;
    if (perHit < 0) perHit = 0;
    for (let h = 0; h < hits; h++) {
      dealDamageToEnemy(state, perHit, !!e.pierce);
      if (state.enemy.hp <= 0) break;
    }
    if (empoweredBonus > 0) {
      state.player.status.empowered = 0; // empowered fires once
      trigger(state, "player", "empowered");
    }
    log.push(`${card.name} hits for ${perHit}${hits > 1 ? ` × ${hits}` : ""}.`);
  }

  // Shield
  if (e.shield && e.shield > 0) {
    const total = e.shield + seqShield + synergyBonusShield + condBonusShield;
    state.player.shield += total;
    log.push(`+${total} shield.`);
  }

  // Heal
  if (e.heal && e.heal > 0) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + e.heal);
    log.push(`Healed ${e.heal}.`);
  }

  // Self damage
  if (e.selfDamage && e.selfDamage > 0) {
    state.player.hp -= e.selfDamage;
    log.push(`Took ${e.selfDamage} self damage.`);
  }

  // Draw
  const drawAmt = (e.draw ?? 0) + seqDraw;
  if (drawAmt > 0) {
    const drew = drawCards(state, drawAmt);
    if (drew > 0) log.push(`Drew ${drew}.`);
  }

  // Statuses on enemy
  if (e.burn) state.enemy.status.burn += e.burn;
  if (e.freeze) state.enemy.status.freeze += e.freeze;
  if (e.stun) state.enemy.status.stun += e.stun;
  if (e.bleed) state.enemy.status.bleed += e.bleed;
  // Weaken stacks; one stack is consumed per enemy attack in endPlayerTurn.
  if (e.enemyWeaken && e.enemyWeaken > 0) state.enemy.status.weaken += e.enemyWeaken;

  // Statuses on player
  if (e.regen) state.player.status.regen += e.regen;
  if (e.empowered) state.player.status.empowered += e.empowered;
  if (e.reflect) state.player.status.reflect += e.reflect;
  if (e.counter) state.player.status.counter += e.counter;
  if (e.revive) state.player.status.reviveAt = Math.max(state.player.status.reviveAt, e.revive);

  // Extra actions go to the BONUS counter, not the baseline. Bonus is
  // consumed first when playing a card (handled in CombatScene), so the
  // player visually sees the fire pip appear and then get spent.
  if (e.extraPlay) state.bonusActions += 1;
  if (e.grantActions && e.grantActions > 0) state.bonusActions += e.grantActions;
  // Fight-lingering baseline boost (Archmage Ascension). Bumps the stored
  // counter so every future turn-end refills with the higher floor, AND mirrors
  // the bump into bonusActions so the player gets the benefit on the very turn
  // the card is played (baseline for THIS turn was locked at turn start).
  if (e.bonusActionsAllFight && e.bonusActionsAllFight > 0) {
    state.bonusBaseActionsThisFight += e.bonusActionsAllFight;
    state.bonusActions += e.bonusActionsAllFight;
  }

  if (state.enemy.hp <= 0) {
    state.outcome = "won";
    log.push(`${state.enemy.name} falls.`);
  } else if (state.player.hp <= 0) {
    maybeRevive(state);
  }
}

/**
 * Play a card. Handles Echo by replaying the last non-echo card's effects.
 * Tracks `cardsPlayedThisTurn` (drives Sequence and the combo counter) and
 * `lastPlayedCard` (Echo's reference). Echo itself does not become "last played".
 */
export function playCard(state: CombatState, card: Card, playerDeckIds: string[]): void {
  if (state.outcome !== "ongoing") return;
  const ordinal = state.cardsPlayedThisTurn + 1;

  if (card.effect.echoLast) {
    const target = state.lastPlayedCard;
    if (target && !target.effect.echoLast) {
      state.log.push(`Echo replays ${target.name}.`);
      applyCardEffects(state, target, playerDeckIds, ordinal);
    } else {
      state.log.push("Echo whispers into silence.");
    }
    state.cardsPlayedThisTurn += 1;
    state.stats.cardsPlayed += 1;
    if (state.cardsPlayedThisTurn === 2) state.stats.totalCombos += 1;
    if (state.cardsPlayedThisTurn > state.stats.maxCombo) {
      state.stats.maxCombo = state.cardsPlayedThisTurn;
    }
    return; // do not update lastPlayedCard — Echo doesn't become the new "last"
  }

  applyCardEffects(state, card, playerDeckIds, ordinal);
  state.cardsPlayedThisTurn += 1;
  state.cardIdsPlayedThisTurn.push(card.id);
  state.stats.cardsPlayed += 1;
  if (state.cardsPlayedThisTurn === 2) state.stats.totalCombos += 1;
  if (state.cardsPlayedThisTurn > state.stats.maxCombo) {
    state.stats.maxCombo = state.cardsPlayedThisTurn;
  }
  state.lastPlayedCard = card;
}

function dealDamageToEnemy(state: CombatState, amount: number, pierce: boolean): void {
  let dmg = amount;
  if (!pierce && state.enemy.shield > 0) {
    const absorbed = Math.min(state.enemy.shield, dmg);
    state.enemy.shield -= absorbed;
    dmg -= absorbed;
  }
  if (dmg > 0) {
    state.enemy.hp -= dmg;
    state.stats.damageDealt += dmg;
  }
}

export function dealDamageToPlayer(state: CombatState, amount: number, pierce = false): void {
  let dmg = amount;
  if (!pierce && state.player.shield > 0) {
    const absorbed = Math.min(state.player.shield, dmg);
    state.player.shield -= absorbed;
    dmg -= absorbed;
  }
  if (dmg > 0) {
    state.player.hp -= dmg;
    state.stats.damageReceived += dmg;
  }

  // Reflect & counter
  if (state.player.status.reflect > 0) {
    state.enemy.hp -= state.player.status.reflect;
    state.log.push(`Reflect: ${state.player.status.reflect}.`);
    trigger(state, "player", "reflect");
  }
  if (state.player.status.counter > 0) {
    state.enemy.hp -= state.player.status.counter;
    state.log.push(`Counter: ${state.player.status.counter}.`);
    trigger(state, "player", "counter");
  }

  if (state.player.hp <= 0) maybeRevive(state);
  if (state.enemy.hp <= 0) {
    state.outcome = "won";
    state.log.push(`${state.enemy.name} falls (countered).`);
  }
}

function maybeRevive(state: CombatState): void {
  if (state.player.status.reviveAt > 0) {
    state.player.hp = state.player.status.reviveAt;
    state.player.status.reviveAt = 0;
    state.log.push("Phoenix Form: you rise again.");
    trigger(state, "player", "reviveAt");
    return;
  }
  state.outcome = "lost";
}

/** Move card from hand to discard. */
export function discardFromHand(state: CombatState, cardIndex: number): void {
  const [c] = state.hand.splice(cardIndex, 1);
  if (c) state.discardPile.push(c);
}

/**
 * Apply a hero skill's effect. Used by both:
 *   - active skills (player taps in combat → CombatScene.applyHeroEffect)
 *   - passive skills (engine auto-fires via firePassives)
 * Some effect kinds need access to RunState (e.g. addShinyRareAttack must
 * mutate run.deck so the new card persists past combat); pass `run` when
 * the caller has it. When omitted, those effects are no-ops.
 */
export function applyHeroEffect(
  state: CombatState,
  effect: HeroAction["effect"],
  run?: import("@/types/game").RunState,
): void {
  if (state.outcome !== "ongoing") return;
  switch (effect.kind) {
    case "draw":
      drawCards(state, effect.value);
      state.log.push(`Hero: drew ${effect.value}.`);
      break;
    case "peekDraw":
      drawCards(state, effect.value);
      state.log.push(`Hero: drew ${effect.value}.`);
      break;
    case "shield":
      state.player.shield += effect.value;
      state.log.push(`Hero: +${effect.value} shield.`);
      break;
    case "shieldMaxHpHalf": {
      const v = Math.floor(state.player.maxHp / 2);
      state.player.shield += v;
      state.log.push(`Hero: +${v} shield.`);
      break;
    }
    case "damage":
      dealDamageToEnemy(state, effect.value, false);
      state.log.push(`Hero: dealt ${effect.value} damage.`);
      if (state.enemy.hp <= 0) {
        state.outcome = "won";
        state.log.push(`${state.enemy.name} falls.`);
      }
      break;
    case "berserkAttack": {
      const cost = effect.cost ?? 0;
      state.player.hp = Math.max(1, state.player.hp - cost);
      dealDamageToEnemy(state, effect.value, false);
      state.log.push(`Hero: −${cost} HP, dealt ${effect.value} damage.`);
      if (state.enemy.hp <= 0) {
        state.outcome = "won";
        state.log.push(`${state.enemy.name} falls.`);
      }
      break;
    }
    case "heal":
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + effect.value);
      state.log.push(`Hero: healed ${effect.value}.`);
      break;
    case "regen":
      state.player.status.regen += effect.value;
      state.log.push(`Hero: gained Regen ${effect.value}.`);
      break;
    case "revive":
      // Idempotent — replaying just keeps the higher of the two reviveAt
      // values (same semantics as the old Phoenix Form card).
      state.player.status.reviveAt = Math.max(state.player.status.reviveAt, effect.value);
      state.log.push(`Hero: Phoenix Form armed (${effect.value} HP).`);
      break;
    case "cleanse": {
      const s = state.player.status;
      s.burn = 0; s.freeze = 0; s.stun = 0; s.bleed = 0; s.weaken = 0;
      state.log.push("Hero: cleansed.");
      break;
    }
    case "freezeEnemy":
      state.enemy.status.freeze += effect.value;
      state.log.push(`Hero: Freeze ${effect.value} on enemy.`);
      break;
    case "weakenEnemy":
      state.enemy.status.weaken += effect.value;
      state.log.push(`Hero: Weaken ${effect.value} on enemy.`);
      break;
    case "extraActions":
      state.bonusActions += effect.value;
      state.log.push(`Hero: +${effect.value} actions.`);
      break;
    case "extraActionsNextTurn":
      state.bonusBaseActionsThisFight += effect.value;
      state.log.push(`Hero: +${effect.value} actions next turn.`);
      break;
    case "gainEmpowered":
      state.player.status.empowered += effect.value;
      state.log.push(`Hero: Empowered +${effect.value}.`);
      break;
    case "addCounter":
      state.player.status.counter += effect.value;
      state.log.push(`Hero: Counter +${effect.value}.`);
      break;
    case "addShinyRareAttack": {
      // Pull a random rare attack from the catalogue, mark it shiny via the
      // shiny-prefix convention (see Deck.ts), insert into HAND for this
      // turn, AND append to run.deck so the card persists into the deck
      // permanently. Without `run` we can't do the persistent part, so
      // skip — better to no-op than to give a one-shot.
      if (!run) break;
      const card = randomRareAttack();
      if (!card) break;
      const shinyId = SHINY_PREFIX + card.id;
      run.deck.push(shinyId);
      // Inflate (with shiny marker) and push into hand so the player can
      // play it this turn.
      const inflated = inflateDeck([shinyId])[0];
      state.hand.push(inflated);
      state.log.push(`Last Resort: ${card.name} (shiny).`);
      break;
    }
  }
}

/**
 * Run all eligible passive hero skills for a given trigger moment. Called
 * by CombatEngine at turn-start / turn-end / combat-start / low-HP moments.
 *
 * Once-per-fight passives mark `usedThisFight = true` after firing so they
 * don't double-trigger across turns within the same fight.
 *
 * `onLowHp` is special: only fires when player.hp DROPPED below 5 this
 * trigger window (caller passes `onlyIf` to gate that — for `turnStart`,
 * we check at-or-under-5 directly).
 */
export function firePassives(
  state: CombatState,
  run: import("@/types/game").RunState,
  when: import("@/types/game").HeroTriggerWhen,
): void {
  if (state.outcome !== "ongoing") return;
  for (const ha of run.heroActions) {
    if (ha.kind !== "passive") continue;
    if (ha.trigger !== when) continue;
    if (ha.oncePerFight && ha.usedThisFight) continue;
    // onLowHp gate — only fire if the player is actually low.
    if (when === "onLowHp" && state.player.hp >= 5) continue;
    applyHeroEffect(state, ha.effect, run);
    if (ha.oncePerFight) ha.usedThisFight = true;
    if (state.outcome !== "ongoing") return;
  }
}

/** Inline import to avoid circular type dep at top of file. */
import { CARDS, CARDS_BY_ID } from "@/data/cards";
import { SHINY_PREFIX } from "@/systems/Deck";

function randomRareAttack(): import("@/types/cards").Card | null {
  const pool = CARDS.filter((c) => c.rarity === "rare" && c.kind === "attack");
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

// Silence "unused" warning — re-export so callers in tests can introspect.
export { CARDS_BY_ID as _CARDS_BY_ID };

/** End player's turn -> enemy acts -> tick statuses -> next player turn. */
export function endPlayerTurn(
  state: CombatState,
  enemyPattern: EnemyTemplate["pattern"],
  baseActions: number = 1,
  shieldCarryover: boolean = false,
  run?: import("@/types/game").RunState,
): void {
  if (state.outcome !== "ongoing") return;

  // Passive hero skills tagged with trigger "turnEnd" fire BEFORE the enemy
  // resolves — same beat as Regen/Burn ticks on the player.
  if (run) firePassives(state, run, "turnEnd");
  if (state.outcome !== "ongoing") return;

  // tick: burn at start of *each actor's* turn — here it's about to be enemy's turn
  if (state.enemy.status.burn > 0) {
    state.enemy.hp -= state.enemy.status.burn;
    state.enemy.status.burn = Math.max(0, state.enemy.status.burn - 1);
    state.log.push("Enemy burns.");
    trigger(state, "enemy", "burn");
    if (state.enemy.hp <= 0) {
      state.outcome = "won";
      state.log.push(`${state.enemy.name} falls (burn).`);
      return;
    }
  }

  // Enemy acts (unless stunned / frozen)
  if (state.enemy.status.stun > 0) {
    state.enemy.status.stun--;
    state.log.push("Enemy is stunned.");
    trigger(state, "enemy", "stun");
  } else {
    const intent = state.enemy.intent ?? enemyPattern[0];
    if (intent.kind === "attack") {
      // Weaken consumes one stack per attack — reduces the incoming damage.
      // Floors at 0 so a heavy weaken stack can fully neutralize a light hit.
      let dmg = intent.value;
      if (state.enemy.status.weaken > 0) {
        const reduce = state.enemy.status.weaken;
        dmg = Math.max(0, dmg - reduce);
        state.enemy.status.weaken = Math.max(0, state.enemy.status.weaken - 1);
        state.log.push(`Enemy attack weakened by ${reduce}.`);
        trigger(state, "enemy", "weaken");
      }
      dealDamageToPlayer(state, dmg);
      state.log.push(`Enemy attacks for ${dmg}.`);
    } else if (intent.kind === "defend") {
      state.enemy.shield += intent.value;
      state.log.push(`Enemy raises shield ${intent.value}.`);
    } else if (intent.kind === "buff") {
      state.enemy.hp = Math.min(state.enemy.maxHp, state.enemy.hp + intent.value);
      state.log.push(`Enemy heals ${intent.value}.`);
    }

    // Burn a card from the enemy's cosmetic hand. Reshuffle when empty.
    if (state.enemy.cardsInHand !== undefined && state.enemy.handSize !== undefined) {
      state.enemy.cardsInHand -= 1;
      if (state.enemy.cardsInHand <= 0) {
        state.enemy.cardsInHand = state.enemy.handSize;
        state.log.push("Enemy reshuffles their hand.");
      }
    }
  }
  if (state.outcome !== "ongoing") return;

  // Freeze on enemy reduces their effectiveness (we model as -1 from next intent)
  if (state.enemy.status.freeze > 0) {
    state.enemy.status.freeze--;
    trigger(state, "enemy", "freeze");
  }

  // Counter and reflect last only on the turn they're played
  state.player.status.counter = 0;
  state.player.status.reflect = 0;

  // Player regen at the start of new turn
  if (state.player.status.regen > 0) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + state.player.status.regen);
    state.player.status.regen = Math.max(0, state.player.status.regen - 1);
    state.log.push("Regen.");
    trigger(state, "player", "regen");
  }

  // Bleed: when player plays an attack they take Bleed dmg — handled in playCard if needed (skipped v1)

  // Player shield resets at end of turn — same as Slay-the-Spire block.
  // Without this, double-shield starter decks snowball into invincibility.
  // Bulwark perk halves the shield instead of zeroing it, so a defend turn
  // keeps tapering coverage for a couple more turns.
  state.player.shield = shieldCarryover ? Math.floor(state.player.shield / 2) : 0;

  // Next turn — reset per-turn ledgers
  state.turn++;
  state.stats.turns = state.turn;
  // Baseline = perk-given baseActions + any fight-lingering boost (Archmage
  // Ascension etc.). bonusActions is cleared because those are this-turn-only.
  state.playsRemainingThisTurn = baseActions + state.bonusBaseActionsThisFight;
  state.bonusActions = 0;
  state.cardsPlayedThisTurn = 0;
  state.cardIdsPlayedThisTurn = [];
  state.lastPlayedCard = null;

  // Pick next enemy intent
  state.enemy.intent = enemyPattern[state.turn % enemyPattern.length];

  // Player draws 1. If the draw fails because everything's empty (drawPile
  // AND discard), do NOT recurse — that was the bug that killed players
  // who kept ending their turn: an extra "skip-turn" enemy attack would
  // fire every recursion, infinitely, until HP hit 0.
  const drawn = drawCards(state, 1);
  if (drawn === 0) {
    if (state.discardPile.length > 0) {
      // Discard has cards: take the "skip-turn" penalty (one extra enemy
      // attack) after reshuffling. drawCards itself will auto-reshuffle
      // on the recursive call, so a meaningful state change happens.
      state.log.push("Out of cards — turn skipped.");
      endPlayerTurn(state, enemyPattern, baseActions, shieldCarryover, run);
    } else {
      // Truly nothing to draw — log it and continue normally. The player
      // still has whatever's in their hand; they just don't get a new card.
      state.log.push("Deck and discard both empty — no card drawn.");
    }
  }

  // Player's new turn just began — fire turnStart passives now, then check
  // onLowHp (gated by hp < 5 inside firePassives). Skipped turn paths
  // already fired these in their recursive call.
  if (run && state.outcome === "ongoing") {
    firePassives(state, run, "turnStart");
    firePassives(state, run, "onLowHp");
  }
}
