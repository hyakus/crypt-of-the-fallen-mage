import Phaser from "phaser";
import { C } from "@/ui/palette";

export interface NavButton {
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  /** Convenience: apply setScrollFactor(0) to all three pieces. */
  pin: () => NavButton;
  /** Convenience: apply setDepth to all three pieces. */
  depth: (d: number) => NavButton;
}

/**
 * Small rounded-rect text button used for corner navigation (Back, Menu,
 * View Deck, Reset, etc.). Sized for touch — every call site should pass
 * width ≥ 100 and height ≥ 36 so the hit target stays thumb-friendly.
 *
 * Returns the constructed game objects + a `pin()` shorthand for scenes
 * that want the button to stay fixed under a scrolling camera.
 *
 * `fontSize` defaults to 14px but call sites can pass a larger value for
 * touch-targets — Map screen passes 24px to match its 1.8× chrome scale.
 */
export function makeNavButton(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  w: number,
  h: number,
  label: string,
  color: string,
  onClick: () => void,
  fontSize: string = "14px",
): NavButton {
  const bg = scene.add.graphics();
  bg.fillStyle(C.ink, 0.6);
  bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  bg.lineStyle(2, C.amber, 0.5);
  bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);

  const text = scene.add.text(cx, cy, label, {
    fontFamily: "Lora", fontSize, color,
  }).setOrigin(0.5);

  const zone = scene.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
  zone.on("pointerdown", onClick);

  const out: NavButton = {
    bg, text, zone,
    pin() {
      bg.setScrollFactor(0);
      text.setScrollFactor(0);
      zone.setScrollFactor(0);
      return out;
    },
    depth(d: number) {
      bg.setDepth(d);
      text.setDepth(d);
      zone.setDepth(d);
      return out;
    },
  };
  return out;
}
