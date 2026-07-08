import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import type { RunState } from "@/types/game";

type Pinnable = Phaser.GameObjects.Graphics | Phaser.GameObjects.Text;

/** Returned by drawHudPills so scenes can update the values mid-scene. */
export interface HudPillsHandle {
  refresh: (run: RunState) => void;
}

/**
 * Top-left HUD: a single HP pill plus a bare-icon gold readout. The deck
 * count pill was dropped per UX feedback (the player knows their own deck
 * size) and gold no longer needs the pill chrome — just the coin glyph +
 * value reads cleaner.
 *
 * `depth` lets callers push the elements above other content (e.g. the Map
 * scene's scrolling parchment frame). Defaults to 0 — fine for static scenes.
 *
 * Everything is pinned via setScrollFactor(0), so they stay put under any
 * scrolling camera. The returned handle lets the caller refresh values
 * (e.g. after a shop purchase) without recreating anything.
 */
export function drawHudPills(
  scene: Phaser.Scene,
  run: RunState,
  depth: number = 0,
): HudPillsHandle {
  const pillW = 140, pillH = 46;
  const baseX = 60;
  const baseY = 28;

  const pinAll = (...objs: Pinnable[]) => {
    for (const o of objs) {
      o.setScrollFactor(0);
      o.setDepth(depth);
    }
  };

  // --- HP pill: red cross + "hp/maxHp"
  const hpX = baseX;
  const hpBg = scene.add.graphics();
  hpBg.fillStyle(C.ink, 0.92);
  hpBg.fillRoundedRect(hpX, baseY, pillW, pillH, 10);
  hpBg.lineStyle(3, C.blood, 0.9);
  hpBg.strokeRoundedRect(hpX, baseY, pillW, pillH, 10);
  pinAll(hpBg);
  const hpCross = scene.add.text(hpX + 24, baseY + pillH / 2, "✚", {
    fontFamily: "Lora", fontSize: "28px", color: S.blood, fontStyle: "bold",
  }).setOrigin(0.5);
  const hpText = scene.add.text(hpX + pillW - 14, baseY + pillH / 2, `${run.hp}/${run.maxHp}`, {
    fontFamily: "Lora", fontSize: "24px", color: S.parchHi, fontStyle: "bold",
  }).setOrigin(1, 0.5);
  pinAll(hpCross, hpText);

  // --- Gold: coin glyph + number, no pill background. Anchored to the
  // right of the HP pill at the same vertical centre.
  const goldX = hpX + pillW + 22;
  const goldY = baseY + pillH / 2;
  const coin = scene.add.graphics();
  coin.fillStyle(C.amber, 1);
  coin.fillCircle(goldX + 12, goldY, 14);
  coin.lineStyle(2, C.amberHi, 1);
  coin.strokeCircle(goldX + 12, goldY, 14);
  const coinG = scene.add.text(goldX + 12, goldY, "g", {
    fontFamily: "Lora", fontSize: "20px", color: S.ink, fontStyle: "bold",
  }).setOrigin(0.5);
  const goldText = scene.add.text(goldX + 32, goldY, `${run.gold}`, {
    fontFamily: "Lora", fontSize: "26px", color: S.amber, fontStyle: "bold",
  }).setOrigin(0, 0.5);
  pinAll(coin, coinG, goldText);

  return {
    refresh(r: RunState) {
      hpText.setText(`${r.hp}/${r.maxHp}`);
      goldText.setText(`${r.gold}`);
    },
  };
}
