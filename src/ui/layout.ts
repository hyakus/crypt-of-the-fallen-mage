// Lightweight column layout for HUD clusters.
//
// The combat scene used to position every pill/text by hand with magic-number
// y-offsets, which meant every tweak to a pill size or font caused overlap
// somewhere downstream. `vstack` removes that whole class of bug: declare the
// items in order, give each a height (and a hidden flag if it can disappear),
// and the column re-flows around insertions, removals, and visibility changes.

type Positionable = { setPosition(x: number, y: number): unknown };

export interface StackItem {
  /** The game object (or any object with setPosition) to place. */
  item: Positionable;
  /** Vertical footprint this item claims in the stack — pill height, font line height, etc. */
  height: number;
  /** When true, the stack closes around this item (its position is not touched). */
  hidden?: boolean;
}

export interface VStackOpts {
  /** Horizontal centre of the column. All items are placed at this x. */
  centerX: number;
  /** Anchor y. Meaning depends on `align`. */
  anchorY: number;
  /** Pixels between adjacent visible items. */
  gap: number;
  /**
   * - `"top"` (default): anchorY is the top edge; items grow downward.
   * - `"bottom"`: anchorY is the bottom edge; items grow upward.
   * - `"center"`: stack is centred on anchorY.
   */
  align?: "top" | "bottom" | "center";
}

/**
 * Lay out a column. Items must use origin (0.5, 0.5) so the position passed
 * to `setPosition` is the centre. The function returns the final cy of each
 * visible item in input order (skipped items get null) so callers can stash
 * a position for downstream code (e.g. the hero-action button anchored to
 * the portrait centre).
 */
export function vstack(items: StackItem[], opts: VStackOpts): (number | null)[] {
  const align = opts.align ?? "top";
  const visible = items.filter((it) => !it.hidden);
  const out: (number | null)[] = items.map(() => null);
  if (visible.length === 0) return out;
  const totalH =
    visible.reduce((acc, it) => acc + it.height, 0) +
    (visible.length - 1) * opts.gap;
  let topY: number;
  if (align === "top") topY = opts.anchorY;
  else if (align === "bottom") topY = opts.anchorY - totalH;
  else topY = opts.anchorY - totalH / 2;
  let y = topY;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.hidden) continue;
    const cy = y + it.height / 2;
    it.item.setPosition(opts.centerX, cy);
    out[i] = cy;
    y += it.height + opts.gap;
  }
  return out;
}
