/**
 * Meta-progression state that persists ACROSS runs (the run save is wiped
 * on death/victory; this isn't). Stored in localStorage under its own key so
 * resetting a run doesn't touch it.
 *
 * Crystal shards are the meta currency — earned from combat and spent at the
 * main-menu shop on permanent perks that tweak future runs.
 */

export interface MetaState {
  crystalShards: number;
  ownedPerks: string[];
}

const META_KEY = "crypt-fallen-mage:meta-v1";

function freshMeta(): MetaState {
  return { crystalShards: 0, ownedPerks: [] };
}

export function loadMeta(): MetaState {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return freshMeta();
    const parsed = JSON.parse(raw) as Partial<MetaState>;
    return {
      crystalShards: Math.max(0, parsed.crystalShards ?? 0),
      ownedPerks: Array.isArray(parsed.ownedPerks) ? parsed.ownedPerks : [],
    };
  } catch {
    return freshMeta();
  }
}

export function saveMeta(meta: MetaState): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // localStorage may be unavailable (private mode, quota); non-fatal.
  }
}

/** Add N shards to the persisted balance. Returns the new total. */
export function addShards(amount: number): number {
  if (amount <= 0) return loadMeta().crystalShards;
  const meta = loadMeta();
  meta.crystalShards += amount;
  saveMeta(meta);
  return meta.crystalShards;
}

/**
 * Attempt to buy a perk. Returns true if the purchase happened (had enough
 * shards AND didn't already own it). False otherwise.
 */
export function buyPerk(perkId: string, cost: number): boolean {
  const meta = loadMeta();
  if (meta.ownedPerks.includes(perkId)) return false;
  if (meta.crystalShards < cost) return false;
  meta.crystalShards -= cost;
  meta.ownedPerks.push(perkId);
  saveMeta(meta);
  return true;
}

export function resetMeta(): void {
  try {
    localStorage.removeItem(META_KEY);
  } catch {
    // ignore
  }
}

export function hasMetaPerk(meta: MetaState, perkId: string): boolean {
  return meta.ownedPerks.includes(perkId);
}
