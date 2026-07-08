import type { FloorMap, MapNode, NodeKind } from "@/types/game";

export interface FloorExtras {
  extraForges: number;
  extraShrines: number;
}

/** Odds a floor includes a Forge (mid-floor deck fusion). */
const FORGE_CHANCE = 0.6;
/** Odds a floor includes a Well (gamble node). When absent, the slot falls
 *  back to a shrine or grave so the floor still varies. */
const WELL_CHANCE = 0.55;

/**
 * Generate a small branching map for one floor. The shape is fixed (6 rows
 * ending in a boss) but the CONTENTS — node kinds — are rolled fresh and
 * placed at random positions each run, so two paths through the same floor
 * encounter different combat counts and different rest options.
 *
 * Balance rules (unchanged from the old fixed-layout generator):
 *   - exactly one Shop (somewhere in rows 1-3)
 *   - exactly one Elite (row 4, random column)
 *   - a Boss at the top (row 5)
 *   - a Forge with FORGE_CHANCE (rows 2-3)
 *   - a Well with WELL_CHANCE, else a shrine/grave (row 3-4 side)
 * Floor-1 extra: one additional shrine or grave somewhere in rows 1-3, so
 * the early floor has a bit more breathing room than later ones. Everything
 * left over is combat.
 *
 * Each placement picks uniformly from the eligible-combat slots in the
 * allowed row range, so columns are randomized run-to-run. The result:
 * one path through the map might hit shop + forge + extra-shrine, another
 * might walk past all three and fight ~3 more combats instead.
 */
export function generateFloor(floor: number, extras: FloorExtras = { extraForges: 0, extraShrines: 0 }): FloorMap {
  const nodes: MapNode[] = [];
  const id = (row: number, col: number) => `f${floor}_${row}_${col}`;

  // Per-run randomness: mix the floor number with a random salt so maps are
  // generated fresh each run (the result is cached in run.map, so it stays
  // stable for the rest of THIS run). The old fixed seed made every run's
  // floor N identical.
  const salt = Math.floor(Math.random() * 0xffffffff);
  const rng = mulberry32(((floor * 9973 + 17) ^ salt) >>> 0);

  // Row counts. Floor 1 widens row 1 from 1 to 2 so there's a slot for the
  // floor-1 "extra non-battle node". Other floors keep the original shape.
  const rowCounts = floor === 1
    ? [2, 2, 3, 3, 2, 1]
    : [2, 1, 3, 3, 2, 1];

  // Initialise every node as combat — non-combats overwrite specific slots below.
  rowCounts.forEach((count, r) => {
    for (let c = 0; c < count; c++) {
      nodes.push({ id: id(r, c), kind: "combat", row: r, col: c, next: [] });
    }
  });

  // Row 5 is always the boss.
  nodes.filter((n) => n.row === 5).forEach((n) => (n.kind = "boss"));

  // Row 4 holds the Elite at a random column; the OTHER row-4 slot is left
  // as combat for now (the side-row-3-or-4 placement below may overwrite
  // it with a well/shrine/grave).
  const row4Cols = nodes.filter((n) => n.row === 4).map((n) => n.col);
  const eliteCol = row4Cols[Math.floor(rng() * row4Cols.length)];
  const eliteNode = nodes.find((n) => n.row === 4 && n.col === eliteCol);
  if (eliteNode) eliteNode.kind = "elite";

  // Helper: replace a random combat-tagged node within a row range with the
  // given kind. Skips silently if no eligible slot exists.
  const placeRandomly = (kind: NodeKind, rowMin: number, rowMax: number) => {
    const candidates = nodes.filter(
      (n) => n.row >= rowMin && n.row <= rowMax && n.kind === "combat",
    );
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(rng() * candidates.length)];
    pick.kind = kind;
  };

  // Shop — somewhere in rows 1-3. Always present (one guaranteed outfitting stop).
  placeRandomly("shop", 1, 3);

  // Side-row non-combat (well, or shrine/grave fallback) — placed in row 3
  // or 4 so it stays in the back half of the floor.
  const sideKind: NodeKind = rng() < WELL_CHANCE
    ? "well"
    : weighted(rng, ["shrine", "grave"]);
  placeRandomly(sideKind, 3, 4);

  // Forge (deck fusion) — rolled, placed anywhere in rows 2-3.
  if (rng() < FORGE_CHANCE) placeRandomly("forge", 2, 3);

  // Floor 1 only: one extra shrine or grave somewhere in rows 1-3. Makes
  // the first floor a touch more forgiving than later ones (and gives the
  // hero-skill-from-shrine path more chances to trigger).
  if (floor === 1) {
    const extraKind: NodeKind = weighted(rng, ["shrine", "grave"]);
    placeRandomly(extraKind, 1, 3);
  }

  // Wire edges: each node connects to 1–2 nodes in the next row.
  for (let r = 0; r < rowCounts.length - 1; r++) {
    const cur = nodes.filter((n) => n.row === r);
    const nxt = nodes.filter((n) => n.row === r + 1);
    for (const node of cur) {
      const ratio = nxt.length / cur.length;
      const targetCol = Math.floor(node.col * ratio);
      const choices = new Set<number>();
      choices.add(clamp(targetCol, 0, nxt.length - 1));
      // 60% chance to also add an adjacent next-row node
      if (rng() < 0.6) {
        const off = rng() < 0.5 ? -1 : 1;
        const alt = clamp(targetCol + off, 0, nxt.length - 1);
        choices.add(alt);
      }
      for (const idx of choices) node.next.push(nxt[idx].id);
    }
    // Ensure every node in next row is reachable
    for (let nc = 0; nc < nxt.length; nc++) {
      const reachable = cur.some((n) => n.next.includes(nxt[nc].id));
      if (!reachable) {
        const closest = cur.reduce((acc, n) =>
          Math.abs(n.col * (nxt.length / cur.length) - nc) <
          Math.abs(acc.col * (nxt.length / cur.length) - nc)
            ? n
            : acc,
        );
        closest.next.push(nxt[nc].id);
      }
    }
  }

  // Inject perk-granted extras: convert filler nodes (a grave, or a mid-floor
  // combat) into forges / shrines as needed. Done after layout so wiring stays
  // valid. Deliberately never touches the guaranteed shop/elite/well or the
  // start row / boss, so the per-floor guarantees survive the injection.
  if (extras.extraForges > 0 || extras.extraShrines > 0) {
    const lastRow = rowCounts.length - 1;
    const sideNodes = nodes.filter((n) =>
      (n.kind === "grave" || n.kind === "combat") && n.row >= 2 && n.row < lastRow,
    );
    let forgeNeeded = extras.extraForges;
    let shrineNeeded = extras.extraShrines;
    for (const n of sideNodes) {
      if (forgeNeeded > 0) {
        n.kind = "forge";
        forgeNeeded--;
        continue;
      }
      if (shrineNeeded > 0) {
        n.kind = "shrine";
        shrineNeeded--;
      }
    }
  }

  const startNodeIds = nodes.filter((n) => n.row === 0).map((n) => n.id);
  const bossNodeId = nodes.find((n) => n.kind === "boss")!.id;

  return { floor, nodes, startNodeIds, bossNodeId };
}

function weighted<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// deterministic per-floor PRNG so maps are stable within a run
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
