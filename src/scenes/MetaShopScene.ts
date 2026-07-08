import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import { META_PERKS, type MetaPerk } from "@/data/metaPerks";
import { loadMeta, buyPerk, resetMeta } from "@/systems/MetaState";
import { makeMetaPerkSprite, CARD_W, CARD_H } from "@/ui/CardSprite";
import { makeNavButton } from "@/ui/NavButton";
import { gateSceneInput, markSceneReady, markSceneReadyAfter } from "@/ui/sceneReady";
import { addBackground } from "@/ui/sceneBg";

type PerkState = "available" | "owned" | "locked";

interface PerkEntry {
  perk: MetaPerk;
  sprite: Phaser.GameObjects.Container;
  /** Hit zone — present only for buyable ("available") perks. */
  zone?: Phaser.GameObjects.Zone;
  state: PerkState;
  rest: { x: number; y: number };
  /** Resting alpha (locked perks render at 0.5). */
  restAlpha: number;
  baseDepth: number;
}

/**
 * Main-menu shop for permanent meta-perks. Browses META_PERKS, marks owned
 * ones, and lets the player spend crystal shards. Reset button at the bottom
 * wipes meta progress (after confirmation).
 *
 * Perks are rendered as cards so the slide-in / hover animations from the
 * combat-card UI come along for free.
 *
 * Interaction model mirrors ShopScene (the wandering card merchant): on
 * desktop you hover a card and click it to buy; on touch a tap selects the
 * card — popping it to a readable centre-screen preview over a dimmed
 * backdrop — and a large bottom "Buy" button confirms the purchase. Tapping a
 * small fanned card directly to buy never worked reliably on Android, which
 * was the bug this flow fixes.
 */
export class MetaShopScene extends Phaser.Scene {
  private shardText!: Phaser.GameObjects.Text;
  private confirmActive = false;

  // Tap-to-confirm flow toggle. UA-based device.os detection is fragile
  // (Capacitor WebViews can omit the Android string on some configs), so we
  // additionally check for touch capability. Touch present → tap flow.
  private useTapFlow = false;

  private entries: PerkEntry[] = [];
  private selectedIdx: number | null = null;

  // Tap-flow modal pieces.
  private buyContainer: Phaser.GameObjects.Container | null = null;
  private buyZone: Phaser.GameObjects.Zone | null = null;
  private backdrop: Phaser.GameObjects.Rectangle | null = null;
  private backdropZone: Phaser.GameObjects.Zone | null = null;
  private dimmedIndices: Set<number> = new Set();

  // Card geometry for the current render (scale baked in).
  private cardW = 0;
  private cardH = 0;

  constructor() { super("MetaShop"); }

  create() {
    gateSceneInput(this);
    const hasTouch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    this.useTapFlow = hasTouch || !this.game.device.os.desktop;
    this.entries = [];
    this.selectedIdx = null;
    this.buyContainer = null;
    this.buyZone = null;
    this.backdrop = null;
    this.backdropZone = null;
    this.dimmedIndices.clear();

    const { width } = this.scale;
    addBackground(this, "bg-meta-shop", { dim: 0.32 });

    this.add.text(width / 2, 40, "Crystal Shrine", {
      fontFamily: "Lora", fontSize: "28px", color: S.amber,
    }).setOrigin(0.5);
    this.add.text(width / 2, 76, "Spend shards on permanent boons for future runs.", {
      fontFamily: "Lora", fontSize: "13px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5);

    this.shardText = this.add.text(width / 2, 110, "", {
      fontFamily: "Lora", fontSize: "18px", color: S.amber, fontStyle: "bold",
    }).setOrigin(0.5);

    makeNavButton(this, 130, 58, 200, 60, "← Menu", S.parchHi, () =>
      this.scene.start("MainMenu"), "24px",
    );

    this.events.off("androidback");
    this.events.on("androidback", () => this.scene.start("MainMenu"));

    makeNavButton(this, width - 130, 58, 200, 60, "Reset Meta", S.blood, () =>
      this.askResetConfirm(), "24px",
    );

    this.renderPerks();
  }

  private renderPerks() {
    const { width } = this.scale;
    const meta = loadMeta();
    this.shardText.setText(`◆ ${meta.crystalShards} crystal shards`);
    const owned = new Set(meta.ownedPerks);

    const cardScale = 0.95;
    this.cardW = CARD_W * cardScale;
    this.cardH = CARD_H * cardScale;
    const cw = this.cardW + 28;
    const perks = META_PERKS;
    const rowSize = Math.min(5, perks.length);
    const totalW = rowSize * cw;
    const startX = (width - totalW) / 2 + cw / 2;
    const cy = 280;

    perks.forEach((perk, i) => {
      const x = startX + i * cw;
      const state: PerkState =
        owned.has(perk.id) ? "owned"
        : meta.crystalShards >= perk.cost ? "available"
        : "locked";

      // Build the card without its own interactive zone — we wire our own
      // zone below so the desktop/touch flows can diverge (matching how
      // ShopScene manages its cards).
      const sprite = makeMetaPerkSprite(this, perk, x, cy, state, {
        scale: cardScale,
        interactive: false,
      });
      const baseDepth = 10 + i;
      sprite.setDepth(baseDepth);

      // Slide-in from off-screen left, staggered. Sprite starts at alpha 0
      // and tweens up. Scene input stays gated until the last card lands
      // (markSceneReadyAfter below), so no tap can register mid-slide.
      const restAlpha = state === "locked" ? 0.5 : 1;
      sprite.x = -CARD_W;
      sprite.setAlpha(0);
      this.tweens.add({
        targets: sprite,
        x,
        alpha: restAlpha,
        duration: 380,
        delay: i * 100,
        ease: "Cubic.Out",
      });

      const entry: PerkEntry = {
        perk, sprite, state,
        rest: { x, y: cy }, restAlpha, baseDepth,
      };

      if (state === "available") {
        const zone = this.add.zone(x, cy, this.cardW * 1.2, this.cardH * 1.2)
          .setInteractive({ useHandCursor: true })
          .setDepth(60);
        entry.zone = zone;
        const idx = i;
        if (this.useTapFlow) {
          zone.on("pointerdown", () => this.selectEntry(idx));
        } else {
          zone.on("pointerover", () => this.hoverLift(entry));
          zone.on("pointerout", () => this.hoverLower(entry));
          zone.on("pointerdown", () => this.tryBuy(entry));
        }
      }

      this.entries.push(entry);
    });

    // Release scene-wide input once the last card has landed. Before that the
    // gate (input.enabled = false) blocks every listener, so taps can't land
    // on a card that's still sliding in.
    const lastCardLandsAt = perks.length > 0
      ? (perks.length - 1) * 100 + 380
      : 0;
    if (lastCardLandsAt === 0) markSceneReady(this);
    else markSceneReadyAfter(this, lastCardLandsAt);
  }

  // ── Desktop hover (direct-click flow) ───────────────────────────────────

  private hoverLift(entry: PerkEntry) {
    entry.sprite.setDepth(entry.baseDepth + 100);
    this.tweens.killTweensOf(entry.sprite);
    this.tweens.add({ targets: entry.sprite, scale: 1.10, duration: 110, ease: "Cubic.Out" });
  }

  private hoverLower(entry: PerkEntry) {
    entry.sprite.setDepth(entry.baseDepth);
    this.tweens.killTweensOf(entry.sprite);
    this.tweens.add({ targets: entry.sprite, scale: 1.0, duration: 100, ease: "Cubic.Out" });
  }

  // ── Touch select-then-confirm flow ──────────────────────────────────────

  /**
   * Tap-select: dim everything else, pop the chosen card to a centre-screen
   * preview at large scale so the player can READ it, and show a touch-sized
   * Buy button at the bottom. Tap the dimmed backdrop to dismiss.
   */
  private selectEntry(idx: number) {
    if (this.selectedIdx === idx) return;
    if (this.selectedIdx !== null) {
      this.unpreviewEntry(this.entries[this.selectedIdx]);
    }
    this.selectedIdx = idx;
    const entry = this.entries[idx];
    this.ensureBackdrop();
    this.dimUnselected(idx);
    this.previewEntry(entry);
    this.showBuyButton(entry);
  }

  private clearSelection() {
    if (this.selectedIdx !== null) {
      this.unpreviewEntry(this.entries[this.selectedIdx]);
    }
    this.selectedIdx = null;
    this.restoreUnselected();
    this.hideBackdrop();
    this.hideBuyButton();
  }

  /** Fly the card to screen-centre and scale it up so it's readable. */
  private previewEntry(entry: PerkEntry) {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height * 0.42;
    entry.sprite.setDepth(700);
    if (entry.zone) {
      // Move the hit zone over the enlarged card and lift it above the
      // backdrop so a tap on the card itself doesn't fall through and dismiss.
      entry.zone.setDepth(720);
      entry.zone.setPosition(cx, cy);
      entry.zone.setSize(this.cardW * 1.7, this.cardH * 1.7);
    }
    this.tweens.killTweensOf(entry.sprite);
    this.tweens.add({
      targets: entry.sprite,
      x: cx, y: cy, scale: 1.7, alpha: 1,
      duration: 240, ease: "Cubic.Out",
    });
  }

  /** Return a previewed card to its resting position. */
  private unpreviewEntry(entry: PerkEntry) {
    entry.sprite.setDepth(entry.baseDepth);
    if (entry.zone) {
      entry.zone.setDepth(60);
      entry.zone.setPosition(entry.rest.x, entry.rest.y);
      entry.zone.setSize(this.cardW * 1.2, this.cardH * 1.2);
    }
    this.tweens.killTweensOf(entry.sprite);
    this.tweens.add({
      targets: entry.sprite,
      x: entry.rest.x, y: entry.rest.y, scale: 1.0, alpha: entry.restAlpha,
      duration: 200, ease: "Cubic.Out",
    });
  }

  /** Fade unselected entries down so the preview is the focal point. */
  private dimUnselected(selIdx: number) {
    this.dimmedIndices.clear();
    for (let i = 0; i < this.entries.length; i++) {
      if (i === selIdx) continue;
      this.dimmedIndices.add(i);
      this.tweens.add({ targets: this.entries[i].sprite, alpha: 0.3, duration: 200 });
    }
  }

  /** Restore the entries we dimmed back to their resting alpha. */
  private restoreUnselected() {
    for (const i of this.dimmedIndices) {
      const e = this.entries[i];
      this.tweens.add({ targets: e.sprite, alpha: e.restAlpha, duration: 200 });
    }
    this.dimmedIndices.clear();
  }

  /**
   * Full-screen dim layer + dismiss zone. The zone sits BELOW the previewed
   * card (depth 720) and the buy button (depth 501), so taps on those still
   * land — only taps on empty space hit the dismiss zone.
   */
  private ensureBackdrop() {
    if (this.backdrop) return;
    const { width, height } = this.scale;
    const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5)
      .setDepth(400)
      .setAlpha(0);
    this.tweens.add({ targets: bg, alpha: 1, duration: 180 });
    const zone = this.add.zone(width / 2, height / 2, width, height)
      .setDepth(401)
      .setInteractive();
    zone.on("pointerdown", () => this.clearSelection());
    this.backdrop = bg;
    this.backdropZone = zone;
  }

  private hideBackdrop() {
    if (!this.backdrop) return;
    const bg = this.backdrop;
    const zone = this.backdropZone;
    this.backdrop = null;
    this.backdropZone = null;
    zone?.destroy();
    this.tweens.killTweensOf(bg);
    this.tweens.add({
      targets: bg, alpha: 0, duration: 160,
      onComplete: () => bg.destroy(),
    });
  }

  /**
   * Spawn the bottom-center "Buy for ◆X" button. Tap → confirm the purchase
   * of the currently selected perk.
   */
  private showBuyButton(entry: PerkEntry) {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height - 70;
    // Sized for touch — matches ShopScene's buy button footprint.
    const w = 320, h = 80;
    const label = `Buy for ◆ ${entry.perk.cost}`;

    const container = this.add.container(cx, cy).setDepth(500);
    const bg = this.add.graphics();
    bg.fillStyle(C.purple, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    bg.lineStyle(3, C.amber, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    container.add(bg);
    const text = this.add.text(0, 0, label, {
      fontFamily: "Lora", fontSize: "24px", color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(text);
    container.setAlpha(0).setScale(0.85);
    this.tweens.add({ targets: container, alpha: 1, scale: 1, duration: 180, ease: "Back.Out" });

    const zone = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true }).setDepth(501);
    zone.on("pointerdown", () => {
      if (this.selectedIdx === null) return;
      this.tryBuy(this.entries[this.selectedIdx]);
    });

    this.buyContainer = container;
    this.buyZone = zone;
  }

  private hideBuyButton() {
    if (!this.buyContainer) return;
    const container = this.buyContainer;
    const zone = this.buyZone;
    this.buyContainer = null;
    this.buyZone = null;
    zone?.destroy();
    this.tweens.killTweensOf(container);
    this.tweens.add({
      targets: container, alpha: 0, scale: 0.85,
      duration: 140, ease: "Cubic.In",
      onComplete: () => container.destroy(),
    });
  }

  private tryBuy(entry: PerkEntry) {
    const ok = buyPerk(entry.perk.id, entry.perk.cost);
    if (!ok) return;
    // Tear down the modal chrome (touch flow) before the transaction flourish.
    this.hideBuyButton();
    this.hideBackdrop();
    this.selectedIdx = null;
    // Flash the card amber-bright and fade it out — feels like a transaction
    // lands. Grow relative to current scale so it reads from both the resting
    // (desktop) and previewed (touch) sizes.
    const sprite = entry.sprite;
    this.tweens.killTweensOf(sprite);
    this.tweens.add({
      targets: sprite, scale: sprite.scaleX * 1.1, alpha: 0,
      duration: 320, ease: "Cubic.In",
      onComplete: () => {
        sprite.destroy();
        this.scene.restart(); // redraw with the new owned/affordable state
      },
    });
  }

  private askResetConfirm() {
    if (this.confirmActive) return;
    this.confirmActive = true;
    const { width, height } = this.scale;
    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.7)
      .setOrigin(0, 0).setInteractive().setDepth(9000);
    // Dialog sized ~20% larger across the board (panel, fonts, spacing, button
    // padding) for legibility on this destructive confirmation.
    const panelW = 504;
    const panelH = 216;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;
    const panel = this.add.graphics().setDepth(9001);
    panel.fillStyle(C.bgSoft, 0.96);
    panel.fillRoundedRect(px, py, panelW, panelH, 12);
    panel.lineStyle(2, C.blood, 0.9);
    panel.strokeRoundedRect(px, py, panelW, panelH, 12);

    const q = this.add.text(width / 2, py + 60, "Reset all meta progress?", {
      fontFamily: "Lora", fontSize: "22px", color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5).setDepth(9002);
    const w2 = this.add.text(width / 2, py + 96, "Shards and owned perks will be wiped.", {
      fontFamily: "Lora", fontSize: "14px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5).setDepth(9002);

    const yes = this.add.text(width / 2 - 96, py + 156, "Reset", {
      fontFamily: "Lora", fontSize: "18px", color: S.parchHi,
      backgroundColor: "#8b1d22", padding: { x: 19, y: 7 },
    }).setOrigin(0.5).setDepth(9002).setInteractive({ useHandCursor: true });
    const no = this.add.text(width / 2 + 96, py + 156, "Cancel", {
      fontFamily: "Lora", fontSize: "18px", color: S.cream,
      backgroundColor: "#262037", padding: { x: 19, y: 7 },
    }).setOrigin(0.5).setDepth(9002).setInteractive({ useHandCursor: true });

    const cleanup = () => {
      dim.destroy(); panel.destroy();
      q.destroy(); w2.destroy(); yes.destroy(); no.destroy();
      this.confirmActive = false;
    };
    yes.on("pointerdown", () => {
      resetMeta();
      cleanup();
      this.scene.restart();
    });
    no.on("pointerdown", cleanup);
    dim.on("pointerdown", cleanup);
  }
}
