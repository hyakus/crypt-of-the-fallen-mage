import { C, S } from "@/ui/palette";
import type { StatusEffects } from "@/types/game";

/**
 * Display metadata for one status effect. Per-key tables (icon, name,
 * one-line "what does it do" text) live here so the HUD doesn't need to know
 * which value is good vs bad, what glyph to draw, or how to phrase the
 * effect description.
 *
 * `isPositive` is from the perspective of the actor the status is ON.
 * Regen on the player is good; Regen on the enemy is bad for the player,
 * but `isPositive: true` here still — the cross-ring tint uses this to pick
 * a colour, and the panel labels it as a benefit "on this actor."
 */
export interface StatusInfo {
  key: keyof StatusEffects;
  name: string;
  icon: string;
  /** Phaser hex int — used for ring strokes, badge fills, etc. */
  color: number;
  /** CSS string — used for text fills. */
  textColor: string;
  isPositive: boolean;
  describe: (v: number) => string;
}

export const STATUS_INFO: Record<keyof StatusEffects, StatusInfo> = {
  burn: {
    key: "burn",
    name: "Burn",
    icon: "✸",
    color: C.bloodHi,
    textColor: S.bloodHi,
    isPositive: false,
    describe: (v) => `Takes ${v} damage at the end of each turn until it expires.`,
  },
  freeze: {
    key: "freeze",
    name: "Freeze",
    icon: "❄",
    color: C.ghost,
    textColor: S.ghost,
    isPositive: false,
    describe: (v) => `Next ${v} attack${v > 1 ? "s" : ""} deal 1 less damage.`,
  },
  stun: {
    key: "stun",
    name: "Stun",
    icon: "✦",
    color: C.amberHi,
    textColor: S.amber,
    isPositive: false,
    describe: (v) => `Skips ${v} upcoming action${v > 1 ? "s" : ""}.`,
  },
  bleed: {
    key: "bleed",
    name: "Bleed",
    icon: "✚",
    color: C.blood,
    textColor: S.blood,
    isPositive: false,
    describe: (v) => `Takes ${v} damage whenever this actor attacks.`,
  },
  weaken: {
    key: "weaken",
    name: "Weaken",
    icon: "↓",
    color: C.ghost,
    textColor: S.ghost,
    isPositive: false,
    describe: (v) => `Next attack deals ${v} less damage.`,
  },
  regen: {
    key: "regen",
    name: "Regen",
    icon: "❤",
    color: C.ghostHi,
    textColor: S.ghost,
    isPositive: true,
    describe: (v) => `Heals ${v} at the start of the next turn.`,
  },
  empowered: {
    key: "empowered",
    name: "Empowered",
    icon: "✦",
    color: C.amber,
    textColor: S.amber,
    isPositive: true,
    describe: (v) => `Attacks deal +${v} damage.`,
  },
  reflect: {
    key: "reflect",
    name: "Reflect",
    icon: "⟲",
    color: C.ghost,
    textColor: S.ghost,
    isPositive: true,
    describe: (v) => `Returns ${v} damage to the attacker (this turn only).`,
  },
  counter: {
    key: "counter",
    name: "Counter",
    icon: "⚔",
    color: C.amber,
    textColor: S.amber,
    isPositive: true,
    describe: (v) => `Deals ${v} damage back when attacked (this turn only).`,
  },
  reviveAt: {
    key: "reviveAt",
    name: "Phoenix Form",
    icon: "✺",
    color: C.amberHi,
    textColor: S.amber,
    isPositive: true,
    describe: (v) => `If killed, revives once at ${v} HP.`,
  },
};

/** Order to render in the panel — positives first, then negatives. */
export const STATUS_DISPLAY_ORDER: (keyof StatusEffects)[] = [
  "empowered",
  "regen",
  "reflect",
  "counter",
  "reviveAt",
  "burn",
  "bleed",
  "freeze",
  "stun",
  "weaken",
];

/** Return only the statuses with a non-zero value, in display order. */
export function activeStatuses(s: StatusEffects): StatusInfo[] {
  const out: StatusInfo[] = [];
  for (const key of STATUS_DISPLAY_ORDER) {
    if (s[key] > 0) out.push(STATUS_INFO[key]);
  }
  return out;
}

/**
 * Choose a single "dominant" colour for the HP-cross indicator when at least
 * one status is active. Negatives outweigh positives — if anything bad is on
 * the actor, the ring goes red; otherwise the brightest positive colour wins.
 * The colour exists only as an at-a-glance "something's going on" cue; the
 * panel breaks down per-effect.
 */
export function statusRingColor(s: StatusEffects): number | null {
  const active = activeStatuses(s);
  if (active.length === 0) return null;
  const negative = active.find((i) => !i.isPositive);
  if (negative) return negative.color;
  return active[0].color;
}

/** Total count of distinct active statuses — drives the badge number. */
export function statusCount(s: StatusEffects): number {
  return activeStatuses(s).length;
}
