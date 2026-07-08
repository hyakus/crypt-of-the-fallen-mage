import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import { resolveCardId } from "@/systems/Deck";
import { makeCardSprite, openCardPreview } from "@/ui/CardSprite";
import { makeNavButton } from "@/ui/NavButton";
import { RUN_KEY } from "@/systems/RunState";
import type { RunState } from "@/types/game";
import type { Card } from "@/types/cards";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";

/**
 * Read-only view of the player's current deck. Reachable from the Map (and
 * from anywhere else a "view my cards" affordance lands). Returns to the
 * previously-active scene via the registry-stored "fromScene" hint, falling
 * back to Map.
 *
 * Cards are added directly to the scene (not to a scrolling Container) so
 * Phaser's input system reliably hits the card the pointer is over.
 */
export class DeckScene extends Phaser.Scene {
  private fromScene = "Map";
  private cards: Phaser.GameObjects.Container[] = [];
  private cardBaseY: number[] = [];
  private scrollY = 0;
  private gridTopY = 100;

  constructor() { super("Deck"); }

  init(data: { fromScene?: string }) {
    this.fromScene = data?.fromScene ?? "Map";
  }

  create() {
    gateSceneInput(this);
    const { width, height } = this.scale;
    const run = this.game.registry.get(RUN_KEY) as RunState;

    const g = this.add.graphics();
    g.fillStyle(C.bg, 1).fillRect(0, 0, width, height);

    this.add.text(width / 2, 30, "Your Deck", {
      fontFamily: "Lora", fontSize: "22px", color: S.amber,
    }).setOrigin(0.5);

    this.add.text(width / 2, 58, `${run.deck.length} cards`, {
      fontFamily: "Lora", fontSize: "13px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5);

    makeNavButton(this, width - 130, 58, 200, 60, "← Back", S.parchHi, () =>
      this.scene.start(this.fromScene), "24px",
    );

    // Hardware back returns to whichever scene we came from.
    this.events.off("androidback");
    this.events.on("androidback", () => this.scene.start(this.fromScene));

    // Scroll support: wheel for desktop, touch-drag for mobile. Drag-vs-tap
    // is sorted out at card pointerup time via pointer.getDistance().
    const applyScroll = (next: number) => {
      this.scrollY = Math.min(0, next);
      this.cards.forEach((c, i) => {
        const newY = this.cardBaseY[i] + this.scrollY;
        c.y = newY;
        const zone = c.getData("zone") as Phaser.GameObjects.Zone | undefined;
        if (zone) zone.y = newY;
      });
    };
    this.input.on("wheel", (_: unknown, __: unknown, ___: number, dy: number) => {
      applyScroll(this.scrollY - dy);
    });
    let dragStartY = 0;
    let dragStartScroll = 0;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      dragStartY = p.y;
      dragStartScroll = this.scrollY;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      applyScroll(dragStartScroll + (p.y - dragStartY));
    });

    this.drawCards(run);

    markSceneReady(this);
  }

  private drawCards(run: RunState) {
    // resolveCardId strips the shiny prefix (★) and sets the per-instance
    // shiny flag, so cards added by the Last Resort hero skill show up in
    // the deck viewer instead of being silently dropped by a raw lookup.
    const deckCards: Card[] = run.deck
      .map((id) => resolveCardId(id))
      .filter((c): c is Card => !!c);

    const { width } = this.scale;
    const perRow = 6;
    const scale = 0.75;
    const cw = 140 * scale + 18;
    const ch = 200 * scale + 22;
    deckCards.forEach((c, i) => {
      const r = Math.floor(i / perRow);
      const col = i % perRow;
      const rowStart = r * perRow;
      const rowCount = Math.min(perRow, deckCards.length - rowStart);
      const rowStartX = (width - rowCount * cw) / 2;
      const x = rowStartX + col * cw + cw / 2;
      const baseY = this.gridTopY + r * ch + ch / 2;
      const sprite = makeCardSprite(this, c, x, baseY + this.scrollY, { scale, interactive: true });
      // Open the preview only when the press lifts without a drag, so
      // touch-drag scrolling doesn't accidentally pop a card open.
      sprite.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() > 8) return;
        openCardPreview(this, c, sprite);
      });
      this.cards.push(sprite);
      this.cardBaseY.push(baseY);
    });
  }
}
