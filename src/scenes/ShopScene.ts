import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import { cardsByRarity } from "@/data/cards";
import { makeCardSprite, CARD_H } from "@/ui/CardSprite";
import { makeNavButton } from "@/ui/NavButton";
import { drawHudPills } from "@/ui/HudPills";
import { RUN_KEY } from "@/systems/RunState";
import type { RunState, ShopStockEntry } from "@/types/game";
import type { Card } from "@/types/cards";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";
import { addBackground } from "@/ui/sceneBg";

type Stock = ShopStockEntry;

interface ShopEntry {
  kind: "sale" | "destroy";
  sprite: Phaser.GameObjects.Container;
  /** Cost overlay attached as a child of the sprite — fades in on lift. */
  overlay: Phaser.GameObjects.Container;
  zone: Phaser.GameObjects.Zone;
  rest: { x: number; y: number };
  lift: { x: number; y: number };
  rotation: number;
  depth: number;
  cost: number;
  stock?: Stock; // sale only
  /** Repaint affordability-dependent visuals (price badge colours, BUY/
   *  DESTROY label, destroy ✕ glyph). Fires after every purchase so the
   *  rest of the fan reflects the player's new gold balance live. */
  applyAffordability: (canAfford: boolean) => void;
}

export class ShopScene extends Phaser.Scene {
  private stock: Stock[] = [];
  private entries: ShopEntry[] = [];
  private selectedIdx: number | null = null;
  // Tap-to-confirm flow toggle. UA-based device.os detection is fragile
  // (Capacitor WebViews can omit the Android string on some configs), so we
  // additionally check for touch capability. Touch present → tap flow.
  private useTapFlow = false;
  private buyContainer: Phaser.GameObjects.Container | null = null;
  private buyLabel: Phaser.GameObjects.Text | null = null;
  private buyZone: Phaser.GameObjects.Zone | null = null;
  // Tap-flow modal pieces — full-screen dim layer + dismiss zone.
  private backdrop: Phaser.GameObjects.Rectangle | null = null;
  private backdropZone: Phaser.GameObjects.Zone | null = null;
  // Indices currently dimmed by the preview modal. Restore only touches
  // these — crucially NOT the selected card, whose un-preview position
  // tween must not be killed by an alpha-only kill cascade.
  private dimmedIndices: Set<number> = new Set();

  constructor() { super("Shop"); }

  create() {
    gateSceneInput(this);
    const run = this.game.registry.get(RUN_KEY) as RunState;
    const { width, height } = this.scale;
    const hasTouch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    this.useTapFlow = hasTouch || !this.game.device.os.desktop;
    this.selectedIdx = null;
    this.entries = [];
    this.buyContainer = null;
    this.buyLabel = null;
    this.buyZone = null;
    this.backdrop = null;
    this.backdropZone = null;
    this.hud = null;
    this.dimmedIndices.clear();

    addBackground(this, "bg-shop", { dim: 0.42 });
    const g = this.add.graphics();
    g.fillStyle(C.parchment, 0.05).fillRect(60, 60, width - 120, height - 140);

    this.add.text(width / 2, 50, "Wandering Merchant", {
      fontFamily: "Lora", fontSize: "36px", color: S.amber,
    }).setOrigin(0.5);
    this.add.text(width / 2, 90, "“Coin for cards. Coin for forgetting. Coin, always coin.”", {
      fontFamily: "Lora", fontSize: "18px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5);

    this.stock = this.loadOrRollStock(run);
    this.drawShopFan(run);
    this.playFanIntro();

    // Back to map — same chrome as the deck viewer / map nav buttons.
    makeNavButton(this, width - 130, 58, 200, 60, "← Map", S.parchHi, () =>
      this.scene.start("Map"), "24px",
    );
    this.events.off("androidback");
    this.events.on("androidback", () => this.scene.start("Map"));

    markSceneReady(this);
  }

  private rollStock(): Stock[] {
    const basics = cardsByRarity("basic");
    const rares  = cardsByRarity("rare");
    const pickFrom = (pool: Card[]) => pool[Math.floor(Math.random() * pool.length)];
    return [
      { card: pickFrom(basics), cost: 12, sold: false },
      { card: pickFrom(basics), cost: 18, sold: false },
      { card: pickFrom(rares),  cost: 40, sold: false },
    ];
  }

  /**
   * First visit to a shop node rolls and saves its stock; subsequent
   * re-entries reuse the saved stock so prices and sold-out state persist.
   * Falls back to a fresh roll if currentNodeId isn't set (shouldn't happen
   * — Map sets it before transitioning here — but a safe default).
   */
  private loadOrRollStock(run: RunState): Stock[] {
    if (!run.shopStock) run.shopStock = {};
    const key = run.currentNodeId ?? "__unkeyed__";
    const existing = run.shopStock[key];
    if (existing) return existing;
    const fresh = this.rollStock();
    run.shopStock[key] = fresh;
    return fresh;
  }

  /**
   * Lay out every shop offering — the 3 sale cards plus the "Destroy a card"
   * button — as a single fan. Each card's interaction model depends on
   * `useTapFlow`: desktop hovers and clicks-to-buy; mobile taps to select,
   * then taps the bottom "Buy for X" button.
   */
  private drawShopFan(run: RunState) {
    const { width } = this.scale;
    const removeCost = 30;

    const slots: Array<"sale" | "destroy"> = [
      "destroy",
      ...this.stock.map(() => "sale" as const),
    ];
    const total = slots.length;

    const handCenterX = width / 2;
    const handBaseY = 290;
    const arcRadius = 520;
    const cardScale = 0.85;
    const totalArcDeg = Math.min(34, total * 9);

    for (let i = 0; i < total; i++) {
      const angleDeg = total > 1
        ? -totalArcDeg / 2 + (i / (total - 1)) * totalArcDeg
        : 0;
      const angleRad = (angleDeg * Math.PI) / 180;
      const x = handCenterX + arcRadius * Math.sin(angleRad);
      const y = handBaseY - arcRadius * (1 - Math.cos(angleRad));
      const rotation = -angleRad;
      const depth = 10 + i;

      if (slots[i] === "sale") {
        const stock = this.stock[i - 1];
        this.entries.push(this.buildSaleEntry(x, y, rotation, cardScale, depth, stock, run));
      } else {
        this.entries.push(this.buildDestroyEntry(x, y, rotation, cardScale, depth, removeCost, run));
      }
    }
    this.refreshHud(run);
  }

  /**
   * Entry flourish: when the shop opens, the fan "pushes forward" toward the
   * player — each card starts a touch smaller and set back, then pops to its
   * resting size with a slight overshoot, staggered left-to-right. The price
   * badge is a child of the card container so it rides along. Sold cards keep
   * their dimmed alpha (we only animate scale/position, never alpha).
   */
  private playFanIntro() {
    this.entries.forEach((entry, i) => {
      const card = entry.sprite;
      card.setScale(0.74);
      card.y = entry.rest.y - 14;
      this.tweens.add({
        targets: card,
        scale: 1.0,
        y: entry.rest.y,
        delay: 60 + i * 70,
        duration: 340,
        ease: "Back.Out",
      });
    });
  }

  private buildSaleEntry(
    x: number, y: number, rotation: number, scale: number, depth: number,
    s: Stock, run: RunState,
  ): ShopEntry {
    const sprite = makeCardSprite(this, s.card, x, y, { interactive: false, scale });
    sprite.rotation = rotation;
    sprite.setDepth(depth);
    if (s.sold) sprite.setAlpha(0.3);

    const w = 140 * scale, h = 200 * scale;
    const liftDist = 38;
    const liftX = x - liftDist * Math.sin(rotation);
    const liftY = y + liftDist * Math.cos(rotation);

    const initialAfford = run.gold >= s.cost;
    const overlayHandle = this.makeCostOverlay(sprite, w, h, s.cost, "sale", initialAfford);

    // The sale-card sprite uses CARD_H, not the smaller `h` used for zone/
    // overlay. Anchor the price badge to the actual card edge.
    const badgeHandle = this.attachPriceBadge(sprite, (CARD_H * scale) / 2, s.cost, initialAfford);

    const aSin = Math.abs(Math.sin(rotation));
    const aCos = Math.abs(Math.cos(rotation));
    const zone = this.add.zone(x, y, w * aCos + h * aSin, w * aSin + h * aCos).setDepth(60);
    if (!s.sold) zone.setInteractive({ useHandCursor: true });

    const entry: ShopEntry = {
      kind: "sale", sprite, overlay: overlayHandle.container, zone,
      rest: { x, y }, lift: { x: liftX, y: liftY }, rotation, depth,
      cost: s.cost, stock: s,
      applyAffordability: (canAfford: boolean) => {
        badgeHandle.redraw(canAfford);
        overlayHandle.redraw(canAfford);
      },
    };
    this.wireEntry(entry, run);
    return entry;
  }

  private buildDestroyEntry(
    x: number, y: number, rotation: number, scale: number, depth: number,
    cost: number, run: RunState,
  ): ShopEntry {
    const w = 140 * scale, h = 200 * scale;
    const initialAfford = run.gold >= cost;

    const container = this.add.container(x, y).setDepth(depth);
    container.rotation = rotation;

    const g = this.add.graphics();
    g.fillStyle(C.ink, 1);
    g.fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 8 * scale);
    g.fillStyle(C.iron, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 7 * scale);
    g.fillStyle(C.bgSoft, 1);
    g.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 5 * scale);
    g.fillStyle(C.iron, 0.95);
    g.fillRect(-w / 2 + 6, -h / 2 + 6, w - 12, 22 * scale);
    container.add(g);

    container.add(this.add.text(0, -h / 2 + 16 * scale, "DESTROY", {
      fontFamily: "Lora", fontSize: `${Math.round(13 * scale)}px`,
      color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5));
    // Glyph + description colour shift between can-afford/can't-afford —
    // keep refs so applyAffordability can repaint without rebuilding.
    const glyph = this.add.text(0, -8 * scale, "✕", {
      fontFamily: "Lora", fontSize: `${Math.round(82 * scale)}px`,
      color: initialAfford ? "#c23a3a" : "#5a1416", fontStyle: "bold",
      stroke: "#1a0608", strokeThickness: 4,
    }).setOrigin(0.5);
    container.add(glyph);
    const descText = this.add.text(0, h / 2 - 32 * scale, "Destroy a card\nfrom your deck", {
      fontFamily: "Lora", fontSize: `${Math.round(11 * scale)}px`,
      color: initialAfford ? S.cream : S.dim, align: "center",
    }).setOrigin(0.5);
    container.add(descText);
    container.setSize(w, h);

    const liftDist = 38;
    const liftX = x - liftDist * Math.sin(rotation);
    const liftY = y + liftDist * Math.cos(rotation);

    const overlayHandle = this.makeCostOverlay(container, w, h, cost, "destroy", initialAfford);
    const badgeHandle = this.attachPriceBadge(container, h / 2, cost, initialAfford);

    const aSin = Math.abs(Math.sin(rotation));
    const aCos = Math.abs(Math.cos(rotation));
    const zone = this.add.zone(x, y, w * aCos + h * aSin, w * aSin + h * aCos)
      .setInteractive({ useHandCursor: true })
      .setDepth(60);

    const entry: ShopEntry = {
      kind: "destroy", sprite: container, overlay: overlayHandle.container, zone,
      rest: { x, y }, lift: { x: liftX, y: liftY }, rotation, depth,
      cost,
      applyAffordability: (canAfford: boolean) => {
        badgeHandle.redraw(canAfford);
        overlayHandle.redraw(canAfford);
        glyph.setColor(canAfford ? "#c23a3a" : "#5a1416");
        descText.setColor(canAfford ? S.cream : S.dim);
      },
    };
    this.wireEntry(entry, run);
    return entry;
  }

  /**
   * Hook the interactions onto an entry. Two distinct flows:
   *   desktop  → pointerover/out lift+lower + pointerdown buys directly
   *   mobile   → pointerdown selects (lifts, swaps from prior selection),
   *              a global "Buy for X" button at the bottom executes
   */
  private wireEntry(entry: ShopEntry, run: RunState) {
    if (this.useTapFlow) {
      entry.zone.on("pointerdown", () => {
        if (entry.stock?.sold) return;
        const idx = this.entries.indexOf(entry);
        this.selectEntry(idx, run);
      });
    } else {
      entry.zone.on("pointerover", () => {
        if (entry.stock?.sold) return;
        this.liftEntry(entry);
      });
      entry.zone.on("pointerout", () => {
        if (entry.stock?.sold) return;
        this.lowerEntry(entry);
      });
      entry.zone.on("pointerdown", () => this.executeEntry(entry, run));
    }
  }

  /**
   * Tween an entry to its lifted position, untilt it so the overlay text
   * reads upright, and fade the cost overlay in.
   */
  private liftEntry(entry: ShopEntry) {
    entry.sprite.setDepth(entry.depth + 100);
    this.tweens.killTweensOf(entry.sprite);
    this.tweens.killTweensOf(entry.overlay);
    this.tweens.add({
      targets: entry.sprite,
      x: entry.lift.x, y: entry.lift.y, scale: 1.10, rotation: 0,
      duration: 200, ease: "Cubic.Out",
    });
    this.tweens.add({ targets: entry.overlay, alpha: 1, duration: 200, ease: "Cubic.Out" });
  }

  /** Return an entry to its rest position + rotation, hide the overlay. */
  private lowerEntry(entry: ShopEntry) {
    entry.sprite.setDepth(entry.depth);
    this.tweens.killTweensOf(entry.sprite);
    this.tweens.killTweensOf(entry.overlay);
    this.tweens.add({
      targets: entry.sprite,
      x: entry.rest.x, y: entry.rest.y, scale: 1.0, rotation: entry.rotation,
      duration: 150, ease: "Cubic.Out",
    });
    this.tweens.add({ targets: entry.overlay, alpha: 0, duration: 120, ease: "Cubic.Out" });
  }

  /**
   * Mobile select flow: dim everything, pop the chosen card to a center-
   * screen preview at large scale so the player can READ it, and show a
   * touch-sized Buy/Destroy button at the bottom. Tap the dimmed backdrop
   * to dismiss without buying.
   */
  private selectEntry(idx: number, run: RunState) {
    if (this.selectedIdx === idx) return; // already showing
    if (this.selectedIdx !== null) {
      this.unpreviewEntry(this.entries[this.selectedIdx]);
    }
    this.selectedIdx = idx;
    const entry = this.entries[idx];
    this.ensureBackdrop(run);
    this.dimUnselected(idx);
    this.previewEntry(entry);
    this.showBuyButton(entry, run);
  }

  /** Tap-flow modal cleanup: undo preview, restore alphas, drop backdrop. */
  private clearSelection() {
    if (this.selectedIdx !== null) {
      this.unpreviewEntry(this.entries[this.selectedIdx]);
    }
    this.selectedIdx = null;
    this.restoreUnselected();
    this.hideBackdrop();
    this.hideBuyButton();
  }

  /**
   * Dramatic expand: card flies to screen-centre, scales up significantly,
   * straightens, and rides above the backdrop. Includes alpha→1 so a card
   * that was previously dimmed snaps back to full opacity. No cost overlay
   * tween — the point is for the player to READ the card.
   */
  private previewEntry(entry: ShopEntry) {
    const { width, height } = this.scale;
    entry.sprite.setDepth(700);
    entry.zone.setDepth(720); // above backdrop zone so taps on card don't fall through
    // Hide the persistent price badge while previewing — the bottom-of-screen
    // "Buy for Xg" button already carries the cost and the badge would land
    // in front of the enlarged card art.
    const badge = entry.sprite.getData("priceBadge") as Phaser.GameObjects.Container | undefined;
    if (badge) badge.setVisible(false);
    this.tweens.killTweensOf(entry.sprite);
    this.tweens.add({
      targets: entry.sprite,
      x: width / 2, y: height * 0.42, scale: 1.7, rotation: 0, alpha: 1,
      duration: 240, ease: "Cubic.Out",
    });
  }

  /** Return a previewed card to its fan position + rotation. */
  private unpreviewEntry(entry: ShopEntry) {
    entry.sprite.setDepth(entry.depth);
    entry.zone.setDepth(60);
    // Restore the price badge that was hidden during preview.
    const badge = entry.sprite.getData("priceBadge") as Phaser.GameObjects.Container | undefined;
    if (badge) badge.setVisible(true);
    this.tweens.killTweensOf(entry.sprite);
    this.tweens.add({
      targets: entry.sprite,
      x: entry.rest.x, y: entry.rest.y, scale: 1.0, rotation: entry.rotation,
      duration: 200, ease: "Cubic.Out",
    });
  }

  /**
   * Fade unselected entries to 0.3 so the preview is the focal point.
   * Tracks which indices got dimmed so the restore step only touches those
   * — and never kills the selected card's un-preview position tween.
   * Alpha-only tween, no killTweensOf — runs concurrently with any in-flight
   * position tween (different property, no conflict).
   */
  private dimUnselected(selIdx: number) {
    this.dimmedIndices.clear();
    for (let i = 0; i < this.entries.length; i++) {
      if (i === selIdx) continue;
      this.dimmedIndices.add(i);
      const e = this.entries[i];
      const sold = e.stock?.sold ?? false;
      this.tweens.add({
        targets: e.sprite,
        alpha: sold ? 0.15 : 0.3,
        duration: 200,
      });
    }
  }

  /**
   * Restore the entries we dimmed — and ONLY those — back to resting alpha.
   * Critically does not iterate the just-unpreviewed card; killing tweens on
   * it would interrupt the position tween mid-flight (the bug that left the
   * card stuck centre-screen when dismissed).
   */
  private restoreUnselected() {
    for (const i of this.dimmedIndices) {
      const e = this.entries[i];
      const sold = e.stock?.sold ?? false;
      this.tweens.add({
        targets: e.sprite,
        alpha: sold ? 0.3 : 1.0,
        duration: 200,
      });
    }
    this.dimmedIndices.clear();
  }

  /**
   * Full-screen dim layer + dismiss zone. The zone sits BELOW the previewed
   * card (depth 720) and the buy button (depth 501), so taps on those still
   * land — only taps on empty space hit the dismiss zone.
   */
  private ensureBackdrop(_run: RunState) {
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
      targets: bg,
      alpha: 0,
      duration: 160,
      onComplete: () => bg.destroy(),
    });
  }

  /**
   * Spawn or update the bottom-center "Buy for Xg" / "Destroy for Xg" button.
   * Disabled (greyed) if the player can't afford. Tap → executeEntry().
   */
  private showBuyButton(entry: ShopEntry, run: RunState) {
    const { width, height } = this.scale;
    const cx = width / 2;
    // Sized for touch — 80 design px ≈ 45dp on a 412px-tall WebView, above
    // Android Material's 48dp recommendation accounting for FIT downscale.
    const w = 320, h = 80;
    const cy = height - 70;

    const canAfford = run.gold >= entry.cost;
    const label = entry.kind === "destroy"
      ? `Destroy for ${entry.cost}g`
      : `Buy for ${entry.cost}g`;
    const labelColor = canAfford ? S.parchHi : S.dim;
    const strokeColor = canAfford ? C.amber : C.iron;
    const fillColor = canAfford ? C.purple : C.bgSoft;

    if (!this.buyContainer) {
      const container = this.add.container(cx, cy).setDepth(500);
      const bg = this.add.graphics();
      bg.fillStyle(fillColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
      bg.lineStyle(3, strokeColor, 1);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
      container.add(bg);
      const text = this.add.text(0, 0, label, {
        fontFamily: "Lora", fontSize: "24px", color: labelColor, fontStyle: "bold",
      }).setOrigin(0.5);
      container.add(text);
      container.setAlpha(0);
      container.setScale(0.85);
      this.tweens.add({ targets: container, alpha: 1, scale: 1, duration: 180, ease: "Back.Out" });

      const zone = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true }).setDepth(501);
      zone.on("pointerdown", () => {
        if (this.selectedIdx === null) return;
        this.executeEntry(this.entries[this.selectedIdx], run);
      });

      this.buyContainer = container;
      this.buyLabel = text;
      this.buyZone = zone;
    } else {
      // Redraw the bg in case affordability/color changed, update the label.
      const bg = this.buyContainer.list[0] as Phaser.GameObjects.Graphics;
      bg.clear();
      bg.fillStyle(fillColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
      bg.lineStyle(3, strokeColor, 1);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
      this.buyLabel!.setText(label).setColor(labelColor);
    }
  }

  private hideBuyButton() {
    if (!this.buyContainer) return;
    const container = this.buyContainer;
    const zone = this.buyZone;
    this.buyContainer = null;
    this.buyLabel = null;
    this.buyZone = null;
    zone?.destroy();
    this.tweens.killTweensOf(container);
    this.tweens.add({
      targets: container,
      alpha: 0, scale: 0.85,
      duration: 140, ease: "Cubic.In",
      onComplete: () => container.destroy(),
    });
  }

  /**
   * Apply the purchase/destroy for an entry. Centralized so both the
   * desktop direct-click path and the mobile Buy-button path go through here.
   */
  private executeEntry(entry: ShopEntry, run: RunState) {
    if (entry.kind === "sale") {
      const s = entry.stock!;
      if (s.sold) return;
      if (run.gold < s.cost) return;
      run.gold -= s.cost;
      run.deck.push(s.card.id);
      s.sold = true;
      entry.zone.disableInteractive();
      // Settle the card back to rest, dim it (sold marker), fade overlay out.
      entry.sprite.setDepth(entry.depth);
      entry.zone.setDepth(60);
      this.tweens.killTweensOf(entry.sprite);
      this.tweens.add({
        targets: entry.sprite,
        x: entry.rest.x, y: entry.rest.y, scale: 1.0, rotation: entry.rotation,
        alpha: 0.3,
        duration: 200, ease: "Cubic.Out",
      });
      this.tweens.killTweensOf(entry.overlay);
      this.tweens.add({ targets: entry.overlay, alpha: 0, duration: 160 });
      this.selectedIdx = null;
      this.hideBuyButton();
      // Tap-flow side effects: lift the backdrop and un-dim the other cards
      // so the shop returns to its browsable resting state.
      this.hideBackdrop();
      this.restoreUnselected();
      this.refreshHud(run);
      // Affordability of every OTHER entry may have just flipped — repaint
      // their price-badge colours, BUY text and (for destroy) ✕ glyph so
      // the UI reflects the new gold balance immediately.
      this.refreshAffordability(run);
    } else {
      // Destroy — gated on gold. Route to Grave with paid+from-shop so it
      // can return here after the player picks a card to forget.
      if (run.gold < entry.cost) return;
      run.gold -= entry.cost;
      this.refreshHud(run);
      this.scene.start("Grave", { paid: true, fromScene: "Shop" });
    }
  }

  private hud: import("@/ui/HudPills").HudPillsHandle | null = null;
  private refreshHud(run: RunState) {
    if (!this.hud) {
      this.hud = drawHudPills(this, run);
    } else {
      this.hud.refresh(run);
    }
  }

  /**
   * Walk every entry and repaint affordability-dependent visuals against
   * `run.gold`. Sold entries don't need a repaint — they're locked at 0.3
   * alpha and the price badge / verb colour aren't player-readable through
   * that. Skipping them also keeps the mobile Buy button (if one is open
   * over a now-unaffordable selection) from confusingly de-tinting.
   */
  private refreshAffordability(run: RunState) {
    for (const e of this.entries) {
      if (e.stock?.sold) continue;
      e.applyAffordability(run.gold >= e.cost);
    }
  }

  /**
   * Persistent price badge anchored just below the card edge. Always visible
   * (independent of the lift overlay) so players can see all prices at a
   * glance without hovering or tapping every card. Added as a child of the
   * card container so it rotates and lifts with the card.
   *
   * Returns the badge container plus a `redraw(canAfford)` callback so the
   * caller can repaint the colour scheme after a purchase changes affordability.
   */
  private attachPriceBadge(
    parent: Phaser.GameObjects.Container,
    halfH: number,
    cost: number,
    canAfford: boolean,
  ): { container: Phaser.GameObjects.Container; redraw: (canAfford: boolean) => void } {
    const badgeY = halfH + 16;
    const badge = this.add.container(0, badgeY);
    parent.add(badge);
    // Stash so the preview flow can hide/show the badge per-card.
    parent.setData("priceBadge", badge);

    const populate = (afford: boolean) => {
      // Drop any prior children + their graphics/text resources before
      // repainting. removeAll(true) destroys them.
      badge.removeAll(true);

      const coinFill = afford ? 0xe2a93e : 0x5a4a20;
      const coinHi   = afford ? 0xf5cb6d : 0x3a2e10;
      const numberColor = afford ? "#e2a93e" : "#8b1d22";

      // Dark pill background so the badge reads against any backdrop.
      const pillW = 64, pillH = 24;
      const bg = this.add.graphics();
      bg.fillStyle(0x000000, 0.78);
      bg.fillRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 12);
      bg.lineStyle(1, coinHi, 0.7);
      bg.strokeRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 12);
      badge.add(bg);

      // Coin glyph on the left half of the pill.
      const coinR = 9;
      const coin = this.add.graphics();
      coin.fillStyle(coinFill, 1);
      coin.fillCircle(-pillW / 2 + 13, 0, coinR);
      coin.lineStyle(1, coinHi, 1);
      coin.strokeCircle(-pillW / 2 + 13, 0, coinR);
      badge.add(coin);
      badge.add(this.add.text(-pillW / 2 + 13, 0, "g", {
        fontFamily: "Lora", fontSize: "12px",
        color: "#1a120a", fontStyle: "bold",
      }).setOrigin(0.5));

      // Price number to the right.
      badge.add(this.add.text(8, 0, `${cost}`, {
        fontFamily: "Lora", fontSize: "14px",
        color: numberColor, fontStyle: "bold",
        stroke: "#0b0a16", strokeThickness: 2,
      }).setOrigin(0.5));
    };
    populate(canAfford);
    return { container: badge, redraw: populate };
  }

  /**
   * Lift overlay — fades in on hover (desktop) so the player has a clear
   * call-to-action while the card is raised. The persistent price badge
   * below each card carries the cost, so this overlay is now just a dim
   * cover + a big "BUY" / "DESTROY" verb. Added as a child of the card
   * so it travels with the lift tween.
   *
   * Returns the overlay container plus a `redraw(canAfford)` callback so
   * affordability colour can update without resetting overlay alpha.
   */
  private makeCostOverlay(
    parent: Phaser.GameObjects.Container,
    w: number, h: number,
    _cost: number, kind: "sale" | "destroy",
    canAfford: boolean,
  ): { container: Phaser.GameObjects.Container; redraw: (canAfford: boolean) => void } {
    const overlay = this.add.container(0, 0);
    overlay.setAlpha(0);
    parent.add(overlay);

    // Verb text holds the only affordability-dependent colour. Stash a ref
    // so redraw doesn't have to rebuild the whole overlay (would reset
    // alpha and fight any in-flight lift tween).
    let verb: Phaser.GameObjects.Text | null = null;
    const populate = (afford: boolean) => {
      if (!verb) {
        // First call: build the dim cover + verb text.
        const dim = this.add.graphics();
        dim.fillStyle(0x000000, 0.72);
        dim.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 5);
        overlay.add(dim);

        verb = this.add.text(0, 0, kind === "sale" ? "BUY" : "DESTROY", {
          fontFamily: "Lora", fontSize: "26px",
          color: afford ? "#f5e8c2" : "#a39a85",
          fontStyle: "bold", align: "center",
          stroke: "#0b0a16", strokeThickness: 4,
        }).setOrigin(0.5);
        overlay.add(verb);
      } else {
        verb.setColor(afford ? "#f5e8c2" : "#a39a85");
      }
    };
    populate(canAfford);
    return { container: overlay, redraw: populate };
  }
}
