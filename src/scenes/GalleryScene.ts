import Phaser from "phaser";
import { C, S, classColor } from "@/ui/palette";
import { CARDS } from "@/data/cards";
import { makeCardSprite, openCardPreview, CARD_W, CARD_H } from "@/ui/CardSprite";
import { makeNavButton } from "@/ui/NavButton";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";

const FILTER_CLASSES = ["all", "sorcerer", "warrior", "barbarian", "battlemage", "fusion", "neutral"] as const;
type FilterClass = (typeof FILTER_CLASSES)[number];

/**
 * Browse every card in the catalogue. Filter by class via a top-left dropdown
 * button (matches the "← Menu" button on the top-right). Cards are added
 * directly to the scene; the scene's MAIN CAMERA scrolls — far cheaper than
 * iterating every sprite's y on every pointermove (was visibly laggy with 151
 * cards on phone hardware). Pinned chrome (title / nav / dropdown) sets
 * `scrollFactor(0)` so it stays glued to the viewport while the cards scroll.
 */
export class GalleryScene extends Phaser.Scene {
  private filter: FilterClass = "all";
  private cards: Phaser.GameObjects.Container[] = [];
  /** Authoritative card-grid Y coords in world space. Used to compute the
   *  scroll bound after a redraw. Cards stay at these positions forever —
   *  scrolling moves the camera, not the cards. */
  private cardBaseY: number[] = [];
  private gridTopY = 116;
  /** Max camera scrollY — bottom of the last card row minus the viewport
   *  height, with a small padding so the last row breathes at the bottom.
   *  Recomputed on every redraw because the grid shrinks/grows by filter. */
  private maxScrollY = 0;

  // Filter dropdown overlay — created lazily, destroyed on close. Tracked
  // here so a re-tap on the filter button knows to toggle rather than stack.
  private dropdownOpen = false;
  private dropdownLayer: Phaser.GameObjects.GameObject[] = [];

  // Filter button label — kept on the instance so selecting a filter from
  // the dropdown can update it in place without rebuilding the button.
  private filterButtonText!: Phaser.GameObjects.Text;

  constructor() { super("Gallery"); }

  create() {
    gateSceneInput(this);
    const { width, height } = this.scale;

    // Background — pinned with scrollFactor 0 so the camera's vertical scroll
    // doesn't drag the bg with it (and leave the top of the scene as a void).
    const bg = this.add.graphics();
    bg.fillStyle(C.bg, 1).fillRect(0, 0, width, height);
    bg.setScrollFactor(0);

    // Title — also pinned; the "Card Gallery" label is part of the chrome.
    this.add.text(width / 2, 30, "Card Gallery", {
      fontFamily: "Lora", fontSize: "22px", color: S.amber,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50);

    // Filter button (top-LEFT) — same dimensions/font as the Menu button so
    // the two chrome anchors visually balance. The ▾ suffix telegraphs that
    // it expands into a dropdown rather than being a plain action button.
    const filterBtn = makeNavButton(this, 130, 58, 200, 60, this.filterLabel(), S.parchHi, () =>
      this.toggleDropdown(), "24px",
    ).depth(60);
    filterBtn.bg.setScrollFactor(0);
    filterBtn.text.setScrollFactor(0);
    filterBtn.zone.setScrollFactor(0);
    this.filterButtonText = filterBtn.text;

    // Menu button (top-RIGHT) — symmetrical with the Filter button.
    const menuBtn = makeNavButton(this, width - 130, 58, 200, 60, "← Menu", S.dim, () =>
      this.scene.start("MainMenu"), "24px",
    ).depth(60);
    menuBtn.bg.setScrollFactor(0);
    menuBtn.text.setScrollFactor(0);
    menuBtn.zone.setScrollFactor(0);

    this.events.off("androidback");
    this.events.on("androidback", () => this.scene.start("MainMenu"));

    // Scrolling — wheel for desktop, touch-drag for mobile.
    // The camera-based approach is the whole point of the rewrite: the old
    // implementation walked all 151 cards on every pointermove, which was
    // visibly laggy on phone hardware. Now scrolling = one number update.
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.applyScroll(this.cameras.main.scrollY + dy);
    });
    let dragStartY = 0;
    let dragStartScroll = 0;
    let dragging = false;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      dragStartY = p.y;
      dragStartScroll = this.cameras.main.scrollY;
      dragging = true;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !dragging) return;
      // Drag DOWN = camera scrolls UP = content moves down = scrollY decreases.
      // (Camera scrollY increasing reveals MORE of the content below the viewport.)
      this.applyScroll(dragStartScroll - (p.y - dragStartY));
    });
    this.input.on("pointerup", () => { dragging = false; });

    this.redraw();

    markSceneReady(this);
  }

  /** Filter button label: "All", "Sorcerer", etc., with a ▾ hinting at the dropdown. */
  private filterLabel(): string {
    const name = this.filter === "all" ? "All" : this.filter.charAt(0).toUpperCase() + this.filter.slice(1);
    return `${name} ▾`;
  }

  /** Clamp camera scroll into the valid range and apply. */
  private applyScroll(next: number) {
    this.cameras.main.scrollY = Phaser.Math.Clamp(next, 0, this.maxScrollY);
  }

  // ───── Filter dropdown ────────────────────────────────────────────────────

  private toggleDropdown() {
    if (this.dropdownOpen) this.closeDropdown();
    else this.openDropdown();
  }

  /**
   * Pop a vertical stack of class options anchored below the filter button.
   * The whole panel sits above a dim, full-screen backdrop — tapping the
   * backdrop closes the dropdown without selecting. Tapping an option
   * updates the filter and closes.
   *
   * Items are sized at 200 × 44 (matching the filter button's width, slightly
   * shorter to fit all seven within the smartphone canvas height) and
   * separated by 2 px so the column reads as a single dropdown panel rather
   * than disconnected buttons.
   */
  private openDropdown() {
    if (this.dropdownOpen) return;
    this.dropdownOpen = true;
    const { width, height } = this.scale;

    // Backdrop: dims the rest of the scene + acts as tap-to-close. Pinned
    // so it stays put while the camera could otherwise scroll under it.
    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setDepth(1000)
      .setScrollFactor(0)
      .setInteractive();
    dim.on("pointerdown", () => this.closeDropdown());
    this.dropdownLayer.push(dim);

    const itemW = 200;
    const itemH = 44;
    const gap = 2;
    const cx = 130;
    // Sit just below the filter button (button bottom is at y = 58 + 30 = 88;
    // plus 6 px of breathing room).
    const topY = 94;

    FILTER_CLASSES.forEach((klass, i) => {
      const cy = topY + itemH / 2 + i * (itemH + gap);
      const isSelected = this.filter === klass;
      const fill = isSelected
        ? (klass === "all" || klass === "fusion" ? C.amber : klass === "neutral" ? C.ironHi : classColor(klass))
        : C.bgSoft;
      const stroke = isSelected ? C.amberHi : C.amber;
      const bg = this.add.graphics()
        .setDepth(1001)
        .setScrollFactor(0);
      bg.fillStyle(fill, isSelected ? 0.92 : 0.85);
      bg.fillRoundedRect(cx - itemW / 2, cy - itemH / 2, itemW, itemH, 8);
      bg.lineStyle(2, stroke, 0.9);
      bg.strokeRoundedRect(cx - itemW / 2, cy - itemH / 2, itemW, itemH, 8);
      const labelStr = klass === "all" ? "All" : klass.charAt(0).toUpperCase() + klass.slice(1);
      const label = this.add.text(cx, cy, labelStr, {
        fontFamily: "Lora",
        fontSize: "18px",
        color: isSelected ? S.ink : S.cream,
        fontStyle: isSelected ? "bold" : "normal",
      }).setOrigin(0.5).setDepth(1002).setScrollFactor(0);
      // Zone above bg so it always receives the tap. Higher depth than the
      // dim backdrop so the backdrop's catch-all close handler doesn't win.
      const zone = this.add.zone(cx, cy, itemW, itemH)
        .setInteractive({ useHandCursor: true })
        .setDepth(1003)
        .setScrollFactor(0);
      zone.on("pointerdown", () => {
        this.filter = klass;
        this.filterButtonText.setText(this.filterLabel());
        this.closeDropdown();
        this.applyScroll(0);
        this.redraw();
      });
      this.dropdownLayer.push(bg, label, zone);
    });
  }

  private closeDropdown() {
    if (!this.dropdownOpen) return;
    this.dropdownOpen = false;
    for (const obj of this.dropdownLayer) obj.destroy();
    this.dropdownLayer = [];
  }

  // ───── Grid ───────────────────────────────────────────────────────────────

  private redraw() {
    // Destroy old card sprites and rebuild for the new filter.
    this.cards.forEach((c) => c.destroy());
    this.cards = [];
    this.cardBaseY = [];

    const { width, height } = this.scale;
    const filtered = this.filter === "all" ? CARDS : CARDS.filter((c) => c.class === this.filter);
    const perRow = 6;
    const scale = 0.75;
    // Use the REAL card dimensions (was 140 — that was the old card width
    // pre-makeCardSprite refactor, so the cells were narrower than the
    // sprites and cards visually overlapped). Add generous padding so the
    // grid feels browseable on a phone.
    const cw = CARD_W * scale + 28;
    const ch = CARD_H * scale + 32;

    filtered.forEach((c, i) => {
      const r = Math.floor(i / perRow);
      const col = i % perRow;
      const rowStart = r * perRow;
      const rowCount = Math.min(perRow, filtered.length - rowStart);
      const rowStartX = (width - rowCount * cw) / 2;
      const x = rowStartX + col * cw + cw / 2;
      const baseY = this.gridTopY + r * ch + ch / 2;
      // Cards live in world space at their authoritative (x, baseY). The
      // camera scroll is what moves them on screen — we never touch c.y again.
      const sprite = makeCardSprite(this, c, x, baseY, { scale, interactive: true });

      // Arming flag: tapping the menu's "Card Gallery" button on the previous
      // scene fires `pointerdown` there, transitions to this scene, and the
      // matching `pointerup` then fires on whichever card is under the finger
      // — which would instantly open a preview without the user ever tapping
      // a card in this scene. Track that pointerdown happened HERE first;
      // pointerup only counts if so. Same pattern as combat-hand cards.
      sprite.on("pointerdown", () => sprite.setData("armed", true));
      sprite.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        const armed = !!sprite.getData("armed");
        sprite.setData("armed", false);
        if (!armed) return;
        // Drag-vs-tap: a flick > 8 px since pointerdown is a scroll, not a tap.
        if (pointer.getDistance() > 8) return;
        // While the dropdown is open, taps on cards should NOT fall through
        // — the dropdown's backdrop handles its own close already, but the
        // card zones sit underneath at a lower depth and could still match.
        if (this.dropdownOpen) return;
        // Hide every OTHER gallery card while the preview is open. With 151
        // cards on screen, the flip tween was rebuilding the whole frame each
        // tick; skipping the off-screen draws makes it feel instant.
        this.cards.forEach((other) => { if (other !== sprite) other.setVisible(false); });
        const restore = () => {
          this.cards.forEach((other) => { if (other !== sprite) other.setVisible(true); });
        };
        openCardPreview(this, c, sprite, { onClose: restore });
      });

      this.cards.push(sprite);
      this.cardBaseY.push(baseY);
    });

    // Recompute the scroll bound. Bottom of last card row + a little breathing
    // room beneath, minus the viewport height. Clamped to ≥ 0 so a short
    // filter list (only ~6 cards) doesn't allow scrolling below the top.
    const lastBottom = this.cardBaseY.length > 0
      ? this.cardBaseY[this.cardBaseY.length - 1] + ch / 2
      : this.gridTopY;
    this.maxScrollY = Math.max(0, lastBottom + 24 - height);
    // If the new filter is shorter than the old scroll position, snap to top
    // so the user isn't staring at a partially-scrolled empty viewport.
    this.applyScroll(this.cameras.main.scrollY);
  }
}
