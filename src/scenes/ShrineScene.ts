import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import { makeNavButton } from "@/ui/NavButton";
import { RUN_KEY } from "@/systems/RunState";
import type { RunState } from "@/types/game";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";
import { addBackground } from "@/ui/sceneBg";

export class ShrineScene extends Phaser.Scene {
  constructor() { super("Shrine"); }

  create() {
    gateSceneInput(this);
    const run = this.game.registry.get(RUN_KEY) as RunState;
    const { width, height } = this.scale;

    addBackground(this, "bg-shrine", { dim: 0.38 });
    const g = this.add.graphics();
    for (let r = 200; r > 0; r -= 8) {
      g.fillStyle(C.amber, 0.008);
      g.fillCircle(width / 2, height / 2, r);
    }

    this.add.text(width / 2, 60, "A small shrine of candles.", {
      fontFamily: "Lora", fontSize: "22px", color: S.amber,
    }).setOrigin(0.5);

    this.option(width / 2, height / 2 - 72, "Pray  —  heal 8", () => {
      run.hp = Math.min(run.maxHp, run.hp + 8);
      this.scene.start("Map");
    });
    this.option(width / 2, height / 2,      "Bleed for the saint  —  +2 max HP, −1 HP now", () => {
      run.maxHp += 2;
      run.hp = Math.max(1, run.hp - 1);
      this.scene.start("Map");
    });
    // Third option — picks up a hero skill at the cost of 4 HP. Keeps the
    // "stack jokers" loop alive for players who skipped the elite, without
    // making the elite path redundant (no full heal, no risk-free skill).
    this.option(width / 2, height / 2 + 72, "Listen to the candles  —  −4 HP, choose a Hero Skill", () => {
      run.hp = Math.max(1, run.hp - 4);
      this.scene.start("HeroPick", { source: "runStart" });
    });
    // "Leave" is the corner nav button — matches the deck viewer chrome.
    makeNavButton(this, width - 130, 58, 200, 60, "← Map", S.parchHi, () =>
      this.scene.start("Map"), "24px",
    );

    this.events.off("androidback");
    this.events.on("androidback", () => this.scene.start("Map"));

    markSceneReady(this);
  }

  /**
   * A shrine choice rendered as a proper pill button (purple fill, amber
   * stroke, parch-highlight text) — the same language as the Forge "Fuse" pill
   * and the Map "Enter" button — so it clearly reads as clickable. Width
   * auto-fits the label; hover repaints to blood + amber text.
   */
  private option(x: number, y: number, label: string, onClick: () => void) {
    const fontSize = "16px";
    const tmp = this.add.text(0, 0, label, { fontFamily: "Lora", fontSize })
      .setVisible(false);
    const w = Math.max(280, tmp.width + 52);
    tmp.destroy();
    const h = 50;
    const r = h / 2;

    const bg = this.add.graphics();
    const paint = (fill: number) => {
      bg.clear();
      bg.fillStyle(fill, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, r);
      bg.lineStyle(3, C.amber, 1).strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);
    };
    paint(C.purple);

    const t = this.add.text(x, y, label, {
      fontFamily: "Lora", fontSize, color: S.parchHi,
    }).setOrigin(0.5);

    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => { paint(C.bloodHi); t.setColor(S.amber); });
    zone.on("pointerout",  () => { paint(C.purple);  t.setColor(S.parchHi); });
    zone.on("pointerdown", onClick);
  }
}
