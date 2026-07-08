import type { Card } from "@/types/cards";
import { CARDS_BY_ID } from "@/data/cards";

/**
 * Prefix used to mark a deck entry as SHINY (holo). A shiny variant of any
 * card id is encoded by prepending this prefix — e.g. `★sorc_arc_lance` is
 * a shiny Arc Lance. The deck stays a `string[]` (no per-instance struct,
 * no parallel arrays) and all per-fight code that resolves an id calls
 * inflateDeck / resolveCardId, which strip the prefix and set `shiny: true`
 * on the cloned Card. Other code paths (shop, grave, forge) just shuffle
 * strings around without caring about shiny.
 */
export const SHINY_PREFIX = "★";

/** True if the given deck id encodes a shiny variant. */
export function isShinyId(id: string): boolean {
  return id.startsWith(SHINY_PREFIX);
}

/** Strip the shiny prefix to recover the base card id. */
export function baseCardId(id: string): string {
  return isShinyId(id) ? id.slice(SHINY_PREFIX.length) : id;
}

/**
 * Resolve a deck-entry id (possibly shiny-prefixed) to a Card instance with
 * the `shiny` flag set correctly. Scenes that walk `run.deck` to render
 * card thumbnails (DeckScene, GraveScene, etc.) MUST go through this
 * helper rather than `CARDS_BY_ID[id]` directly — the raw lookup will
 * silently drop shiny entries because `★rare_id` isn't a known card key,
 * which was the original "shiny card disappears from my deck" bug.
 */
export function resolveCardId(id: string): Card | undefined {
  const c = CARDS_BY_ID[baseCardId(id)];
  if (!c) return undefined;
  return isShinyId(id) ? { ...c, shiny: true } : c;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function inflateDeck(cardIds: string[]): Card[] {
  return cardIds.map((id) => {
    const baseId = baseCardId(id);
    const c = CARDS_BY_ID[baseId];
    if (!c) throw new Error(`Unknown card id: ${id}`);
    // Per-instance fields (shiny) require a shallow clone so we don't
    // pollute the shared template.
    return isShinyId(id) ? { ...c, shiny: true } : c;
  });
}

export function countByClass(cardIds: string[], klass: Card["class"]): number {
  return cardIds.filter((id) => CARDS_BY_ID[baseCardId(id)]?.class === klass).length;
}

/** Returns the class with the most cards in the deck (ignoring neutrals & fusions). */
export function dominantClass(cardIds: string[]): Card["class"] | null {
  const counts: Partial<Record<Card["class"], number>> = {};
  for (const id of cardIds) {
    const c = CARDS_BY_ID[id];
    if (!c) continue;
    if (c.class === "neutral" || c.class === "fusion") continue;
    counts[c.class] = (counts[c.class] ?? 0) + 1;
  }
  let best: Card["class"] | null = null;
  let bestN = 0;
  for (const [klass, n] of Object.entries(counts) as [Card["class"], number][]) {
    if (n > bestN) {
      best = klass;
      bestN = n;
    }
  }
  return best;
}
