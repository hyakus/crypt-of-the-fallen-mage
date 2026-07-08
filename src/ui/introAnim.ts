import Phaser from "phaser";

export interface IntroItem {
  /** The panel container to animate (children in local coords). */
  c: Phaser.GameObjects.Container;
  /** Final resting position for the panel's centre. */
  x: number;
  y: number;
}

/**
 * "Choose one of N" reveal: every option flies UP to screen centre stacked on
 * top of each other, then fans OUT to its resting slot. Used by the perk and
 * hero-skill pickers so the choice arrives with a beat of drama.
 *
 * Panels must be Containers (so the whole panel moves/scales as one). The
 * caller should keep input gated (gateSceneInput) and only mark the scene
 * ready in `onComplete`, so nothing is clickable until the panels have landed.
 */
export function playStackExpandIntro(
  scene: Phaser.Scene,
  items: IntroItem[],
  onComplete?: () => void,
): void {
  if (items.length === 0) { onComplete?.(); return; }

  const cx = scene.scale.width / 2;
  // Stack point: horizontal centre, at the average resting height (the slots
  // usually share a y, so this lands the stack right where the row will be).
  const cy = items.reduce((acc, it) => acc + it.y, 0) / items.length;

  for (const { c } of items) c.setPosition(cx, cy).setScale(0.46).setAlpha(0);

  // Phase 1 — rise into the centre as a tight stack.
  scene.tweens.add({
    targets: items.map((it) => it.c),
    scale: 0.9,
    alpha: 1,
    duration: 200,
    ease: "Cubic.Out",
  });

  // Phase 2 — fan out to the resting slots with a little overshoot, staggered
  // so the spread reads left-to-right rather than snapping all at once.
  const tweens = items.map((it, i) =>
    scene.tweens.add({
      targets: it.c,
      x: it.x,
      y: it.y,
      scale: 1,
      delay: 250 + i * 90,
      duration: 360,
      ease: "Back.Out",
    }),
  );

  // The last-staggered tween finishes last → fire the ready callback there.
  tweens[tweens.length - 1].once("complete", () => onComplete?.());
}
