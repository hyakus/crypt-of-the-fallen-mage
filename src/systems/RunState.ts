import type { RunState } from "@/types/game";
import type { CardClass } from "@/types/cards";
import { loadMeta } from "@/systems/MetaState";

/**
 * Default (no-class) starter — used if the dream is skipped.
 * Quickening guarantees an extraPlay card from turn 1.
 */
const DEFAULT_STARTER = [
  "starter_slash",
  "starter_slash",
  "starter_bolt",
  "starter_ward",
  "starter_ward",
  "starter_quickening",
  "starter_breath",
];

/**
 * Class-themed starter decks. The Goddess hands you one of these based on
 * what you choose in the dream.
 *
 * Each deck has 7 cards: 1 extraPlay enabler + 4 class-themed basics + one
 * extra of the class's main attack and main defense.
 */
const STARTER_DECKS: Record<CardClass, string[]> = {
  sorcerer: [
    "starter_quickening",
    "sorc_magic_missile",
    "sorc_magic_missile",
    "sorc_mage_armor",
    "sorc_mage_armor",
    "sorc_spark",
    "starter_bolt",
  ],
  warrior: [
    "starter_quickening",
    "warr_slash",
    "warr_slash",
    "warr_block",
    "warr_block",
    "warr_iron_will",
    "starter_breath",
  ],
  barbarian: [
    "starter_quickening",
    "barb_rage_strike",
    "barb_rage_strike",
    "barb_reckless_block",
    "barb_reckless_block",
    "barb_frenzy",
    "starter_slash",
  ],
  battlemage: [
    "starter_quickening",
    "bm_flame_sword",
    "bm_flame_sword",
    "bm_mystic_armor",
    "bm_mystic_armor",
    "bm_spell_weapon",
    "starter_ward",
  ],
  // The "neutral" / "fusion" entries aren't picked by the player; provided
  // for type completeness.
  neutral: DEFAULT_STARTER,
  fusion:  DEFAULT_STARTER,
};

export function starterDeckFor(klass: CardClass | null): string[] {
  const base = klass ? [...STARTER_DECKS[klass]] : [...DEFAULT_STARTER];
  // Meta perk "Old Habits" adds one extra Tattered Ward to the starter deck.
  const meta = loadMeta();
  if (meta.ownedPerks.includes("meta_old_habits")) {
    base.push("starter_ward");
  }
  return base;
}

/**
 * Single source of truth for the active run.
 * Held on the Phaser Game's registry as `run`, mutated in place.
 */
export function freshRunState(): RunState {
  const meta = loadMeta();
  const owned = new Set(meta.ownedPerks);

  // Apply meta-perks that touch starting HP / gold. Per-fight effects (intent
  // vision, opening hand size) read run.metaPerks at runtime instead.
  let maxHp = 20;
  if (owned.has("meta_crystalline_resolve")) maxHp += 1;

  let gold = 0;
  if (owned.has("meta_pocket_change")) gold += 5;

  return {
    hp: maxHp,
    maxHp,
    gold,
    deck: starterDeckFor(null), // overwritten if a class is chosen; respects meta perks
    floor: 1,
    currentNodeId: null,
    map: null,
    freeGraveUsedThisFloor: false,
    superCardUnlockedThisRun: false,

    chosenClass: null,
    perks: [],
    heroActions: [],
    baseActionsPerTurn: 2,
    pendingExtraForges: 0,
    pendingExtraShrines: 0,
    combatStartShield: 0,
    shieldCarryover: false,
    metaPerks: [...meta.ownedPerks],
    shopStock: {},
  };
}

export const RUN_KEY = "run";

// ============================================================================
// Persistence — save the active run to localStorage so a page refresh or
// browser close doesn't lose progress. Saves are snapshot at map-rest points
// (every MapScene visit) so mid-combat refresh dumps you back to the map with
// the combat available to re-fight.
// ============================================================================

const SAVE_KEY = "crypt-fallen-mage:run-v2";

interface SavedPayload {
  version: 1;
  run: RunState;
  savedAt: number;
}

/** Snapshot the run state held on the Phaser registry into localStorage. */
export function saveRun(game: Phaser.Game): void {
  const run = game.registry.get(RUN_KEY) as RunState | undefined;
  if (!run) return;
  try {
    const payload: SavedPayload = { version: 1, run, savedAt: Date.now() };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch (e) {
    // localStorage can fail in private mode, quota-exceeded, etc. Non-fatal.
    console.warn("saveRun failed:", e);
  }
}

/** Pull a saved run back into the registry. Returns true on success. */
export function loadRun(game: Phaser.Game): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const payload = JSON.parse(raw) as SavedPayload;
    if (!payload || payload.version !== 1 || !payload.run) {
      clearRun();
      return false;
    }
    game.registry.set(RUN_KEY, payload.run);
    return true;
  } catch (e) {
    console.warn("loadRun failed, clearing corrupt save:", e);
    clearRun();
    return false;
  }
}

/** Wipe any saved run. Called on death/victory. */
export function clearRun(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

/** Is there a saved run we can resume? */
export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

/** When the save was created (ms epoch), or 0 if no save. */
export function saveTimestamp(): number {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return 0;
    const payload = JSON.parse(raw) as SavedPayload;
    return payload?.savedAt ?? 0;
  } catch {
    return 0;
  }
}
