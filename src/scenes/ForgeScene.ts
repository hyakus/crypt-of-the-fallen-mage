import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import { CARDS_BY_ID } from "@/data/cards";
import { availableFusions } from "@/data/fusions";
import { makeCardSprite } from "@/ui/CardSprite";
import { makeNavButton } from "@/ui/NavButton";
import { drawHudPills } from "@/ui/HudPills";
import { RUN_KEY } from "@/systems/RunState";
import type { RunState } from "@/types/game";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";
import { addBackground } from "@/ui/sceneBg";

export class ForgeScene extends Phaser.Scene {
  constructor() { super("Forge"); }

  create() {
    gateSceneInput(this);
    const run = this.game.registry.get(RUN_KEY) as RunState;
    const { width, height } = this.scale;

    addBackground(this, "bg-forge", { dim: 0.42 });
    const g = this.add.graphics();
    // Subtle inner panel matches the Shop parchment-glow framing.
    g.fillStyle(C.parchment, 0.05).fillRect(60, 60, width - 120, height - 140);

    // Title sized to match Shop / Map chrome — the old 26px title felt
    // marooned next to the giant card sprites below it.
    this.add.text(width / 2, 70, "The Forge", {
      fontFamily: "Lora", fontSize: "46px", color: S.amber,
    }).setOrigin(0.5);
    this.add.text(width / 2, 122, "Two cards become one — choose a fusion.", {
      fontFamily: "Lora", fontSize: "18px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5);

    const recipes = availableFusions(run.deck);
    if (recipes.length === 0) {
      this.add.text(width / 2, height / 2, "Your deck has no fusion-ready cards yet.", {
        fontFamily: "Lora", fontSize: "20px", color: S.cream,
      }).setOrigin(0.5);
    } else {
      const startY = 230;
      // Each recipe row needs ~190 px for cards + ~80 px for the Fuse pill,
      // so 260 keeps the next row from butting up against the previous pill.
      const rowH = 260;
      recipes.slice(0, 3).forEach((r, idx) => {
        const a = CARDS_BY_ID[r.ingredients[0]];
        const b = CARDS_BY_ID[r.ingredients[1]];
        const result = CARDS_BY_ID[r.result];
        const y = startY + idx * rowH;

        // Cards become visual previews only — the Fuse pill below the row
        // is the click target now. Reads more like a recipe + commit step
        // and matches the Shop/Map button language.
        makeCardSprite(this, a, width / 2 - 260, y, { scale: 0.75 });
        this.add.text(width / 2 - 130, y, "+", {
          fontFamily: "Lora", fontSize: "32px", color: S.amber,
        }).setOrigin(0.5);
        makeCardSprite(this, b, width / 2, y, { scale: 0.75 });
        this.add.text(width / 2 + 130, y, "→", {
          fontFamily: "Lora", fontSize: "32px", color: S.amber,
        }).setOrigin(0.5);
        makeCardSprite(this, result, width / 2 + 260, y, { scale: 0.75 });

        // Fuse pill — same shape language as Shop's Buy button + MapScene's
        // Enter pill (rounded ends, amber stroke, purple fill).
        this.makeFusePill(width / 2, y + 150, () => {
          this.removeOne(run, r.ingredients[0]);
          this.removeOne(run, r.ingredients[1]);
          run.deck.push(r.result);
          this.scene.start("Map");
        });
      });
    }

    makeNavButton(this, width - 130, 58, 200, 60, "← Map", S.parchHi, () =>
      this.scene.start("Map"), "24px",
    );
    this.events.off("androidback");
    this.events.on("androidback", () => this.scene.start("Map"));

    drawHudPills(this, run);

    markSceneReady(this);
  }

  /**
   * Pill-shaped commit button matching the Shop Buy / Map Enter aesthetic:
   * rounded full-height ends, amber stroke, purple fill, parch-highlight text.
   * Pointerdown fires `onClick`; the zone sits on top of the visuals so the
   * sprite stack-order doesn't matter.
   */
  private makeFusePill(cx: number, cy: number, onClick: () => void) {
    const w = 220, h = 64;
    const r = h / 2;
    const bg = this.add.graphics();
    bg.fillStyle(C.purple, 1);
    bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
    bg.lineStyle(3, C.amber, 1);
    bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, r);

    const label = this.add.text(cx, cy, "Fuse", {
      fontFamily: "Lora", fontSize: "26px", color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5);

    const zone = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => {
      bg.clear();
      bg.fillStyle(C.bloodHi, 1);
      bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
      bg.lineStyle(3, C.amber, 1);
      bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
      label.setColor(S.amber);
    });
    zone.on("pointerout", () => {
      bg.clear();
      bg.fillStyle(C.purple, 1);
      bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
      bg.lineStyle(3, C.amber, 1);
      bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
      label.setColor(S.parchHi);
    });
    // pointerup + distance check so a drag that starts on the pill doesn't
    // accidentally fire (matches the MapScene Enter button convention).
    zone.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.getDistance() > 8) return;
      onClick();
    });
  }

  private removeOne(run: RunState, cardId: string) {
    const idx = run.deck.indexOf(cardId);
    if (idx >= 0) run.deck.splice(idx, 1);
  }
}
