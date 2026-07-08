import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import type { Card } from "@/types/cards";
import { resolveCardId } from "@/systems/Deck";
import { makeCardSprite, openCardPreview } from "@/ui/CardSprite";
import { makeNavButton } from "@/ui/NavButton";
import { drawHudPills } from "@/ui/HudPills";
import { RUN_KEY } from "@/systems/RunState";
import type { RunState } from "@/types/game";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";
import { addBackground } from "@/ui/sceneBg";

interface GraveInit { paid?: boolean; fromScene?: string; }

export class GraveScene extends Phaser.Scene {
  constructor() { super("Grave"); }

  create(data: GraveInit) {
    gateSceneInput(this);
    const run = this.game.registry.get(RUN_KEY) as RunState;
    const { width } = this.scale;

    addBackground(this, "bg-grave", { dim: 0.4 });

    this.add.text(width / 2, 36, "The Open Grave", {
      fontFamily: "Lora", fontSize: "26px", color: S.amber,
    }).setOrigin(0.5);
    // Flavour + brief mechanical explainer. Two lines: the WHAT (mood) then
    // the WHY (lighter decks draw their best cards more often). Word-wrap
    // budget leaves room for the HUD pills on the left and the Back button
    // on the right so the flavor never overlaps chrome — ~380 px reserved
    // (two pill columns + safe padding).
    this.add.text(width / 2, 84,
      "A pit of fading names. Bury a card and it leaves\n" +
      "your deck for the rest of this run.\n" +
      "A leaner deck draws its strongest cards more often.",
      {
        fontFamily: "Lora", fontSize: "13px", color: S.cream,
        fontStyle: "italic", align: "center",
        wordWrap: { width: Math.min(500, width - 380) },
        lineSpacing: 4,
      },
    ).setOrigin(0.5);

    const freeAvailable = !run.freeGraveUsedThisFloor && !data.paid;
    // Single-line action hint that doubles as the "free once per floor"
    // indicator. Keeps the vertical budget tight so the card grid has room
    // on the smartphone canvas without overlapping the chrome.
    const hintText = freeAvailable
      ? "Tap a card to bury it.  (Free once per floor.)"
      : "Tap a card to bury it.";
    this.add.text(width / 2, 142, hintText, {
      fontFamily: "Lora", fontSize: "13px",
      color: freeAvailable ? S.amber : S.dim,
    }).setOrigin(0.5);

    // Grid of cards
    const perRow = 6;
    const cardScale = 0.7;
    const cardW = 140 * cardScale + 12;
    const cardH = 200 * cardScale + 16;
    const gridW = perRow * cardW;
    const startX = (width - gridW) / 2 + cardW / 2;
    // Push the grid down enough that the card tops clear the hint line at
    // y=142 (cards are 156 px tall at scale 0.7, origin 0.5 → top = startY - 78).
    const startY = 240;

    // After destroying (or leaving), return to wherever we came from. The
    // Shop pays for an extra grave use and expects to come back to itself.
    const returnScene = data.fromScene ?? "Map";

    // Cards rendered as a grid; tap one → flip-and-enlarge preview with a
    // red ✕ Forget button. The grid cards are hidden during preview (same
    // pattern as the Card Gallery) so the renderer isn't redrawing the
    // whole deck while the flip plays.
    const gridSprites: Phaser.GameObjects.Container[] = [];
    run.deck.forEach((id, i) => {
      // resolveCardId handles the shiny prefix; raw CARDS_BY_ID would silently
      // drop ★-prefixed entries (Last Resort additions).
      const card = resolveCardId(id);
      if (!card) return;
      const r = Math.floor(i / perRow);
      const c = i % perRow;
      const x = startX + c * cardW;
      const y = startY + r * cardH;
      const sprite = makeCardSprite(this, card, x, y, { interactive: true, scale: cardScale });
      sprite.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() > 8) return;
        this.openDestroyPreview(card, sprite, gridSprites, () => {
          run.deck.splice(i, 1);
          if (!data.paid) run.freeGraveUsedThisFloor = true;
          this.scene.start(returnScene);
        });
      });
      gridSprites.push(sprite);
    });

    // Back — matches the deck viewer / map nav button chrome.
    makeNavButton(this, width - 130, 58, 200, 60, "← Back", S.parchHi, () =>
      this.scene.start(returnScene), "24px",
    );
    this.events.off("androidback");
    this.events.on("androidback", () => this.scene.start(returnScene));

    drawHudPills(this, run);

    markSceneReady(this);
  }

  /**
   * Tap a card in the grave → flip-enlarge preview + red ✕ Forget button.
   * Other grid cards hide during the preview (same trick as the gallery)
   * so the renderer doesn't grind on a deck-sized grid during the flip.
   */
  private openDestroyPreview(
    card: Card,
    source: Phaser.GameObjects.Container,
    grid: Phaser.GameObjects.Container[],
    onConfirm: () => void,
  ) {
    grid.forEach((g) => { if (g !== source) g.setVisible(false); });
    openCardPreview(this, card, source, {
      onClose: () => grid.forEach((g) => { if (g !== source) g.setVisible(true); }),
      actions: [{
        label: "✕  Forget",
        fill: C.blood,
        stroke: C.amber,
        textColor: S.parchHi,
        onClick: onConfirm,
      }],
    });
  }
}
