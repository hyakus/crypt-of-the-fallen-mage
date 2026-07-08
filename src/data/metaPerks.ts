/**
 * Meta-perks — permanent upgrades the player buys from the main-menu shop
 * with crystal shards. Each one is a modest start-of-run nudge; the design
 * intent is that owning all of them adds up to a noticeable head start
 * without changing the moment-to-moment balance of a single fight.
 *
 * Cost ladder (low → high) is roughly tied to power: cheap perks are tiny
 * head-starts, expensive ones unlock structural changes (hand size, intent
 * vision) that take many runs to afford.
 */
export interface MetaPerk {
  id: string;
  name: string;
  /** One-line description shown on the card. */
  description: string;
  /** Slightly longer flavour line, italic on the card. */
  flavor: string;
  /** Cost in crystal shards. */
  cost: number;
}

export const META_PERKS: MetaPerk[] = [
  {
    id: "meta_pocket_change",
    name: "Pocket Change",
    description: "Start each run with +5 gold.",
    flavor: "A handful of coins. The dead don't notice the missing ones.",
    cost: 8,
  },
  {
    id: "meta_crystalline_resolve",
    name: "Crystalline Resolve",
    description: "+1 max HP every run.",
    flavor: "A little less ghost. A little more bone.",
    cost: 12,
  },
  {
    id: "meta_old_habits",
    name: "Old Habits",
    description: "Start every run with one extra Tattered Ward.",
    flavor: "The body remembers the brace before the blow.",
    cost: 15,
  },
  {
    id: "meta_knowing_eye",
    name: "Knowing Eye",
    description: "See the enemy's intent above their HP.",
    flavor: "You've fought this thing before, in a dream you can't remember.",
    cost: 20,
  },
  {
    id: "meta_studied_hand",
    name: "Studied Hand",
    description: "Opening hand grows: 3 → 4 cards.",
    flavor: "An extra option, drawn before the first breath.",
    cost: 30,
  },
];

export function metaPerkById(id: string): MetaPerk | undefined {
  return META_PERKS.find((p) => p.id === id);
}
