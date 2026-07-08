import Phaser from "phaser";
import type { Card } from "@/types/cards";
import type { MetaPerk } from "@/data/metaPerks";
import type { EnemySilhouette } from "@/systems/CombatEngine";
import { C, S, FONT, classColor } from "@/ui/palette";

export const CARD_W = 182;
export const CARD_H = 260;

/**
 * Draws a card as a Phaser Container of Graphics+Text.
 * Returns a Container so it can be moved/animated as one.
 *
 * `lift` (combat hand only): tween the card UP and untilt on hover. Also
 * extends the hit area so the mouse stays inside while the card moves,
 * which is what was causing the hover flicker on the fanned hand.
 */
export function makeCardSprite(
  scene: Phaser.Scene,
  card: Card,
  x: number,
  y: number,
  opts: { interactive?: boolean; scale?: number; lift?: boolean } = {},
): Phaser.GameObjects.Container {
  const scale = opts.scale ?? 1;
  const w = CARD_W * scale;
  const h = CARD_H * scale;
  const c = scene.add.container(x, y);

  // Background (parchment) with class-tinted border
  const border = classColor(card.class);
  const g = scene.add.graphics();
  g.fillStyle(C.ink, 1);
  g.fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 8 * scale);
  g.fillStyle(border, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 7 * scale);
  g.fillStyle(C.parchment, 1);
  g.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 5 * scale);

  // Top banner — name
  g.fillStyle(border, 0.85);
  g.fillRect(-w / 2 + 6, -h / 2 + 6, w - 12, 22 * scale);

  // Kind icon strip at bottom
  g.fillStyle(C.ink, 0.85);
  g.fillRect(-w / 2 + 6, h / 2 - 30 * scale, w - 12, 24 * scale);
  c.add(g);

  // Faint heraldic emblem watermark behind the text — a class-tinted
  // silhouette keyed to the card's kind (sword / shield / sparkle). Added
  // before the text so it always sits BEHIND it, and kept at a low alpha so
  // the description stays perfectly readable on the parchment.
  drawCardEmblem(scene, c, card, scale);

  // Card name
  const name = scene.add.text(0, -h / 2 + 16 * scale, card.name, {
    fontFamily: "Lora",
    fontSize: `${Math.round(17 * scale)}px`,
    color: S.parchHi,
    align: "center",
  }).setOrigin(0.5, 0.5);
  c.add(name);

  // Description (wrapped). Stashed on the container so the combat scene
  // can rewrite it on hover (e.g. to show Empowered-boosted damage).
  const desc = scene.add.text(0, -8 * scale, card.description, {
    fontFamily: "Lora",
    fontSize: `${Math.round(14 * scale)}px`,
    color: S.ink,
    align: "center",
    wordWrap: { width: w - 16 },
  }).setOrigin(0.5, 0.5);
  c.add(desc);
  c.setData("descText", desc);
  c.setData("descOriginal", card.description);

  // Class / kind strip — for non-basic cards the rarity glyph replaces the
  // separator dot, so the line reads "class  ★  kind" at a glance.
  const klassLabel = card.class === "neutral" ? "—" : card.class;
  const raritySep =
    card.rarity === "super"  ? "✦" :
    card.rarity === "fusion" ? "◈" :
    card.rarity === "rare"   ? "★" : "·";
  const meta = scene.add.text(0, h / 2 - 18 * scale, `${klassLabel}  ${raritySep}  ${card.kind}`, {
    fontFamily: "Lora",
    fontSize: `${Math.round(13 * scale)}px`,
    color: S.cream,
    align: "center",
  }).setOrigin(0.5, 0.5);
  c.add(meta);

  c.setSize(w, h);
  if (opts.interactive) {
    // External Zone for hit detection. The Zone never moves or scales — but
    // it has to be BIGGER than the card so that when the card scales up (or
    // lifts) on hover, the pointer at the new edge is still inside the zone.
    // Otherwise: pointerout fires → card shrinks → pointer re-enters → cycle.
    // Lift state extends upward, so we offset the zone center up to match.
    const zoneW = opts.lift ? w * 1.3 : w * 1.2;
    const zoneH = opts.lift ? h * 1.3 + 50 : h * 1.2;
    const zoneOffsetY = opts.lift ? -25 : 0;
    const zone = scene.add.zone(x, y + zoneOffsetY, zoneW, zoneH).setInteractive({ useHandCursor: true });
    c.setData("zone", zone);

    zone.on("pointerover", () => {
      const base = (c.getData("baseDepth") as number | undefined) ?? 0;
      c.setDepth(base + 1000);
      scene.tweens.killTweensOf(c);
      c.setAlpha(1); // defensive: snap any leftover alpha-fade-in to opaque
      if (opts.lift) {
        const restY = (c.getData("restY") as number | undefined) ?? c.y;
        scene.tweens.add({
          targets: c, y: restY - 40, scale: 1.15,
          duration: 140, ease: "Cubic.Out",
        });
      } else {
        scene.tweens.add({
          targets: c, scale: 1.10,
          duration: 110, ease: "Cubic.Out",
        });
      }
    });
    zone.on("pointerout", () => {
      const base = (c.getData("baseDepth") as number | undefined) ?? 0;
      c.setDepth(base);
      scene.tweens.killTweensOf(c);
      c.setAlpha(1);
      if (opts.lift) {
        const restX = (c.getData("restX") as number | undefined) ?? c.x;
        const restY = (c.getData("restY") as number | undefined) ?? c.y;
        scene.tweens.add({
          targets: c, x: restX, y: restY, scale: 1.0,
          duration: 120, ease: "Cubic.Out",
        });
      } else {
        scene.tweens.add({
          targets: c, scale: 1.0,
          duration: 100, ease: "Cubic.Out",
        });
      }
    });
    // Forward clicks to the container so existing `sprite.on("pointerdown",…)`
    // listeners in caller scenes don't need to change. Pointerup is also
    // forwarded so scenes that need drag-vs-tap discrimination (touch input)
    // can listen on the release side and check pointer.getDistance().
    zone.on("pointerdown", (
      pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      c.emit("pointerdown", pointer, _localX, _localY, event);
    });
    zone.on("pointerup", (
      pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      c.emit("pointerup", pointer, _localX, _localY, event);
    });
  }

  // Stash data for click handlers
  c.setData("card", card);

  // Shiny / holographic overlay — applied to per-instance shiny cards (Last
  // Resort additions). Idle decoration that loops forever; sits inside the
  // card container so it travels with the card through hand-fan / pile /
  // grave / deck-viewer renderings.
  if (card.shiny) applyShinyEffect(scene, c);
  return c;
}

/**
 * Stamp a holo-card identity onto a card sprite. Adds a gilded inner border
 * that hue-shifts amber → ghost-cyan → amber on a slow breathing loop, plus
 * a single ✦ glyph in the top-right that drifts a couple of pixels and
 * pulses its alpha. Cheap pure-Phaser primitives, no shaders, looks the
 * "this card is special" beat the way trading-card foils do.
 */
function applyShinyEffect(scene: Phaser.Scene, container: Phaser.GameObjects.Container) {
  const w = CARD_W;
  const h = CARD_H;
  // Inner border that hue-cycles. Stroke colour is updated via a counter
  // tween so we get smooth mix() colours rather than discrete jumps.
  const border = scene.add.graphics();
  const drawBorder = (col: number) => {
    border.clear();
    border.lineStyle(3, col, 1);
    border.strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 7);
  };
  drawBorder(0xffd86e);
  container.add(border);
  const stops = [0xffd86e, 0x6db7d6, 0xffd86e, 0xf5cb6d];
  let idx = 0;
  scene.tweens.addCounter({
    from: 0, to: 1, duration: 900, repeat: -1, ease: "Sine.InOut",
    onRepeat: () => { idx = (idx + 1) % stops.length; },
    onUpdate: (tw) => {
      const a = stops[idx];
      const b = stops[(idx + 1) % stops.length];
      const t = tw.getValue() ?? 0;
      // Channel-wise mix between two 24-bit colours.
      const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
      const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
      const r = Math.round(ar + (br - ar) * t);
      const g = Math.round(ag + (bg - ag) * t);
      const bl = Math.round(ab + (bb - ab) * t);
      drawBorder((r << 16) | (g << 8) | bl);
    },
  });
  // Top-right sparkle.
  const sparkle = scene.add.text(w / 2 - 14, -h / 2 + 14, "✦", {
    fontFamily: "Lora", fontSize: "16px", color: "#ffd86e", fontStyle: "bold",
    stroke: "#0b0a16", strokeThickness: 2,
  }).setOrigin(0.5);
  container.add(sparkle);
  scene.tweens.add({
    targets: sparkle,
    alpha: { from: 0.6, to: 1 },
    y: sparkle.y + 2,
    duration: 600 + Math.floor(Math.random() * 200),
    yoyo: true, repeat: -1, ease: "Sine.InOut",
  });
}

/**
 * Draw the faint emblem watermark on a card face, centred in the parchment
 * area (between the name banner and the bottom strip). The shape is chosen by
 * `card.kind` — an upright sword (attack), a heraldic shield (defend), or a
 * four-point sparkle (utility) — tinted with the class accent colour. It sits
 * at a low alpha and a thin highlight pass gives the silhouette a little
 * carved depth without ever competing with the description text on top.
 */
function drawCardEmblem(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  card: Card,
  scale: number,
) {
  const col = classColor(card.class);
  const g = scene.add.graphics();
  const S2 = scale;
  // Base fill alpha — deliberately low so dark ink text reads cleanly over it.
  const A = 0.14;
  const HI = 0.1; // highlight pass for a hint of relief

  const poly = (pts: Array<[number, number]>, alpha: number) => {
    g.fillStyle(col, alpha);
    g.beginPath();
    g.moveTo(pts[0][0] * S2, pts[0][1] * S2);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * S2, pts[i][1] * S2);
    g.closePath();
    g.fillPath();
  };

  if (card.kind === "defend") {
    // Heraldic shield: flat top, shoulders, tapering to a point.
    const sw = 38, top = -42, shoulder = 6, bot = 50;
    poly([[-sw, top], [sw, top], [sw, shoulder], [0, bot], [-sw, shoulder]], A);
    // inner chevron for relief
    poly([[-sw + 8, top + 8], [sw - 8, top + 8], [sw - 8, shoulder - 4], [0, bot - 12], [-sw + 8, shoulder - 4]], HI);
  } else if (card.kind === "attack") {
    // Upright sword: tip, blade, crossguard, grip, pommel.
    poly([[0, -54], [6, -46], [6, 14], [-6, 14], [-6, -46]], A); // blade
    poly([[-26, 16], [26, 16], [26, 23], [-26, 23], [-26, 16]], A); // crossguard
    poly([[-4, 24], [4, 24], [4, 44], [-4, 44]], A); // grip
    g.fillStyle(col, A);
    g.fillCircle(0, 49 * S2, 5 * S2); // pommel
    poly([[0, -54], [3, -47], [-3, -47]], HI); // bright tip
  } else {
    // Utility: four-point sparkle (two crossed slim diamonds) + core.
    poly([[0, -54], [11, 0], [0, 54], [-11, 0]], A);
    poly([[-54, 0], [0, 11], [54, 0], [0, -11]], A);
    g.fillStyle(col, HI);
    g.fillCircle(0, 0, 7 * S2);
  }

  container.add(g);
}

/** Tooltip-style large card render for when something is focused. */
export function makeCardSpriteLarge(scene: Phaser.Scene, card: Card, x: number, y: number) {
  return makeCardSprite(scene, card, x, y, { scale: 1.4 });
}

/**
 * Render a meta-perk as a card-shaped container so it can reuse the existing
 * click-zoom + slide-in animations. Same dimensions as a game card. The
 * border is always amber (meta = persistent), and the bottom strip shows the
 * shard cost instead of class/kind.
 *
 * `state` toggles three appearances:
 *   - "available": full color, click to buy
 *   - "owned":     "OWNED" stamp across the bottom, no buy
 *   - "locked":    greyed, "X shards" still shown but not affordable
 */
export function makeMetaPerkSprite(
  scene: Phaser.Scene,
  perk: MetaPerk,
  x: number,
  y: number,
  state: "available" | "owned" | "locked",
  opts: { scale?: number; interactive?: boolean } = {},
): Phaser.GameObjects.Container {
  const scale = opts.scale ?? 1;
  const w = CARD_W * scale;
  const h = CARD_H * scale;
  const c = scene.add.container(x, y);

  const border = state === "owned" ? C.ironHi : C.amber;
  const innerFill = state === "owned" ? C.iron : C.parchment;
  const g = scene.add.graphics();
  g.fillStyle(C.ink, 1);
  g.fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 8 * scale);
  g.fillStyle(border, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 7 * scale);
  g.fillStyle(innerFill, 1);
  g.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 5 * scale);

  // Top banner with the perk name
  g.fillStyle(border, 0.85);
  g.fillRect(-w / 2 + 6, -h / 2 + 6, w - 12, 22 * scale);

  // Bottom strip — cost / owned label
  g.fillStyle(C.ink, 0.85);
  g.fillRect(-w / 2 + 6, h / 2 - 30 * scale, w - 12, 24 * scale);
  c.add(g);

  const nameColor = state === "owned" ? S.dim : S.parchHi;
  const name = scene.add.text(0, -h / 2 + 16 * scale, perk.name, {
    fontFamily: "Lora", fontSize: `${Math.round(13 * scale)}px`,
    color: nameColor, align: "center",
  }).setOrigin(0.5);
  c.add(name);

  const descColor = state === "owned" ? S.dim : S.ink;
  const desc = scene.add.text(0, -16 * scale, perk.description, {
    fontFamily: "Lora", fontSize: `${Math.round(11 * scale)}px`,
    color: descColor, align: "center",
    wordWrap: { width: w - 16 },
  }).setOrigin(0.5);
  c.add(desc);
  c.setData("descText", desc);
  c.setData("descOriginal", perk.description);

  const flavor = scene.add.text(0, 28 * scale, perk.flavor, {
    fontFamily: "Lora", fontSize: `${Math.round(9 * scale)}px`,
    color: state === "owned" ? S.dim : S.dim, align: "center",
    fontStyle: "italic", wordWrap: { width: w - 20 },
  }).setOrigin(0.5);
  c.add(flavor);

  // Bottom strip text
  const stripLabel = state === "owned" ? "OWNED" : `◆ ${perk.cost}`;
  const stripColor = state === "owned" ? S.amber
    : state === "locked" ? S.dim
    : S.amber;
  const strip = scene.add.text(0, h / 2 - 18 * scale, stripLabel, {
    fontFamily: "Lora", fontSize: `${Math.round(state === "owned" ? 12 : 13 * scale)}px`,
    color: stripColor, fontStyle: "bold", align: "center",
  }).setOrigin(0.5);
  c.add(strip);

  c.setSize(w, h);
  if (opts.interactive) {
    const zoneW = w * 1.2;
    const zoneH = h * 1.2;
    const zone = scene.add.zone(x, y, zoneW, zoneH).setInteractive({ useHandCursor: true });
    c.setData("zone", zone);
    zone.on("pointerover", () => {
      scene.tweens.killTweensOf(c);
      scene.tweens.add({ targets: c, scale: 1.10, duration: 110, ease: "Cubic.Out" });
    });
    zone.on("pointerout", () => {
      scene.tweens.killTweensOf(c);
      scene.tweens.add({ targets: c, scale: 1.0, duration: 100, ease: "Cubic.Out" });
    });
    zone.on("pointerdown", (
      pointer: Phaser.Input.Pointer,
      _lx: number,
      _ly: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      c.emit("pointerdown", pointer, _lx, _ly, event);
    });
  }

  // Apply a global desaturation if locked — easiest way is to dim alpha
  if (state === "locked") c.setAlpha(0.5);

  return c;
}

/**
 * Make a card container clickable in a way that survives being parented
 * to a scrolling container — sets an explicit local-space hit area so the
 * scene's transform stack handles positioning automatically.
 */
export function makeCardClickable(
  sprite: Phaser.GameObjects.Container,
  scale: number,
  onClick: () => void,
) {
  const w = CARD_W * scale;
  const h = CARD_H * scale;
  sprite.setInteractive(
    new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
    Phaser.Geom.Rectangle.Contains,
  );
  if (sprite.input) sprite.input.cursor = "pointer";
  sprite.on("pointerdown", onClick);
}

/**
 * Pop a large, easy-to-read version of `card` over a dim backdrop. If a
 * `source` sprite is given, the preview flies from the source's world
 * position, doing a 360° in-plane rotation and a horizontal flip while
 * growing into the centre — feels like the card flicks up off the grid.
 * Click anywhere (or hit ESC) to dismiss.
 */
export interface CardPreviewAction {
  /** Visible button label, e.g. "✕ Forget". */
  label: string;
  /** Optional explicit fill color. Defaults to amber. */
  fill?: number;
  /** Optional explicit stroke color. Defaults to amber. */
  stroke?: number;
  /** Optional text color. Defaults to parch-highlight. */
  textColor?: string;
  /** Fires on tap. The preview auto-closes AFTER this returns (unless the
   *  action navigates the scene, in which case the close is a no-op). */
  onClick: () => void;
}

export function openCardPreview(
  scene: Phaser.Scene,
  card: Card,
  source?: Phaser.GameObjects.Container,
  opts: { onClose?: () => void; actions?: CardPreviewAction[] } = {},
) {
  const { width, height } = scene.scale;
  const cx = width / 2;
  const cy = height / 2;
  const baseDepth = 9000;
  // Responsive preview scale. The 1.8 default is sized for the 800-tall
  // desktop canvas — at 1.8× the card occupies ~468 px vertically, leaving
  // room for buttons below it. On smartphone canvases (DESIGN_HEIGHT=533)
  // the same 1.8× card + 60 px gap + 72 px button extends to y=596 — i.e.
  // 63 px past the bottom of the screen, so the Forget / Buy / Destroy
  // buttons are unreachable. 1.2× keeps the preview legible while leaving
  // the buttons comfortably above the bottom edge.
  const targetScale = height < 600 ? 1.2 : 1.8;

  // Backdrop fades in to the target alpha so it dims the rest of the screen
  // gradually rather than slamming on instantly.
  // setScrollFactor(0): the gallery (and any future scene that scrolls its
  // main camera) reads (cx, cy) as screen-space, not world-space. Without
  // this, opening a preview while scrolled would render it offset by the
  // current camera scrollY — i.e. above or below the visible viewport.
  const dim = scene.add.rectangle(0, 0, width, height, 0x000000, 0)
    .setOrigin(0, 0)
    .setInteractive()
    .setScrollFactor(0)
    .setDepth(baseDepth);
  scene.tweens.add({ targets: dim, fillAlpha: 0.72, duration: 200, ease: "Cubic.Out" });

  // Resolve origin: source sprite's world position + scale if given,
  // else just centre at small scale so the flight still has some travel.
  // The preview pieces are screen-pinned (scrollFactor 0) below, so when
  // the source lives in a scrolled camera we have to translate its WORLD
  // position into the equivalent SCREEN-pinned position by subtracting the
  // camera's current scroll. Otherwise the flip starts from a phantom
  // location offset by the scroll.
  let originX = cx;
  let originY = cy;
  let originScale = 0.6;
  if (source) {
    const m = source.getWorldTransformMatrix();
    const cam = scene.cameras.main;
    originX = m.tx - cam.scrollX;
    originY = m.ty - cam.scrollY;
    originScale = m.scaleX || 0.6;
    source.setVisible(false);
  }

  // Two sprites at the same anchor: face shown when cos(angle) >= 0,
  // back shown when cos(angle) < 0 — gives the illusion of the card flipping
  // around its vertical axis in 3D. Both are scaled by |cos| so the card
  // visibly thins to an edge before revealing the opposite side.
  const front = makeCardSprite(scene, card, originX, originY, { scale: targetScale });
  const back = makeCardBackSprite(scene, originX, originY, { scale: targetScale });
  front.setDepth(baseDepth + 1).setScrollFactor(0);
  back.setDepth(baseDepth + 1).setScrollFactor(0);
  const startRelScale = originScale / targetScale;
  front.setScale(startRelScale);
  back.setScale(startRelScale).setVisible(false);

  // Single composed tween: position lerp + relative scale grow + one full
  // horizontal flip (front → edge → back → edge → front). No in-plane spin
  // — the flip itself is the rotation we want.
  //
  // Cache the visibility state so we only toggle setVisible() when the side
  // actually changes (4 times across the animation). setVisible() has to
  // walk the container's child list to dirty their render state, so calling
  // it 60×/sec on a deep card hurts on lower-end Android WebViews.
  const drive = { t: 0 };
  let lastFacing = true; // front starts facing forward
  scene.tweens.add({
    targets: drive,
    t: 1,
    duration: 420,
    ease: "Cubic.InOut",
    onUpdate: () => {
      const t = drive.t;
      const s = startRelScale + (1 - startRelScale) * t;
      const x = originX + (cx - originX) * t;
      const y = originY + (cy - originY) * t;
      const cosX = Math.cos(t * Math.PI * 2);
      const facing = cosX >= 0;
      if (facing !== lastFacing) {
        front.setVisible(facing);
        back.setVisible(!facing);
        lastFacing = facing;
      }
      const showing = facing ? front : back;
      showing.x = x;
      showing.y = y;
      showing.scaleX = Math.abs(cosX) * s;
      showing.scaleY = s;
    },
    onComplete: () => {
      front.setVisible(true);
      back.setVisible(false);
      front.x = cx;
      front.y = cy;
      front.setScale(1);
      // Spawn action buttons (if any) AFTER the flip — wiring them earlier
      // would let the player tap-through before the card is readable.
      spawnActionButtons();
    },
  });

  // Holds the action-button game objects so close() can clean them up.
  const actionGameObjects: Phaser.GameObjects.GameObject[] = [];
  const spawnActionButtons = () => {
    const actions = opts.actions;
    if (!actions || actions.length === 0) return;
    const cardH = CARD_H * targetScale;
    const btnW = 240, btnH = 72, gap = 28;
    const totalW = actions.length * btnW + (actions.length - 1) * gap;
    const startX = cx - totalW / 2 + btnW / 2;
    // Default 60 px gap below the card; clamped so the button stays fully
    // on-screen even if the card overshoots (defensive — targetScale above
    // should already keep things in bounds, but a weird canvas aspect could
    // still push us out).
    const ideal = cy + cardH / 2 + 60;
    const maxY = height - btnH / 2 - 12;
    const buttonY = Math.min(ideal, maxY);
    actions.forEach((a, i) => {
      const bx = startX + i * (btnW + gap);
      const fill = a.fill ?? C.purple;
      const stroke = a.stroke ?? C.amber;
      const textColor = a.textColor ?? S.parchHi;

      const bg = scene.add.rectangle(bx, buttonY, btnW, btnH, fill, 1)
        .setStrokeStyle(3, stroke).setDepth(baseDepth + 2).setAlpha(0).setScrollFactor(0);
      const text = scene.add.text(bx, buttonY, a.label, {
        fontFamily: "Lora", fontSize: "26px", color: textColor, fontStyle: "bold",
      }).setOrigin(0.5).setDepth(baseDepth + 3).setAlpha(0).setScrollFactor(0);
      const zone = scene.add.zone(bx, buttonY, btnW, btnH)
        .setInteractive({ useHandCursor: true }).setDepth(baseDepth + 4).setScrollFactor(0);
      zone.on("pointerdown", () => {
        a.onClick();
        close();
      });
      scene.tweens.add({ targets: [bg, text], alpha: 1, duration: 180, ease: "Cubic.Out" });
      actionGameObjects.push(bg, text, zone);
    });
  };

  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    dim.disableInteractive();
    scene.tweens.add({
      targets: dim,
      fillAlpha: 0,
      duration: 160,
      ease: "Cubic.In",
      onComplete: () => dim.destroy(),
    });
    // Front is the one visible at rest; back is hidden but still exists.
    // Action buttons fade out alongside the card; their zones are killed
    // immediately so a stray tap during the fade can't re-fire them.
    actionGameObjects.forEach((o) => {
      if ("disableInteractive" in o) (o as Phaser.GameObjects.Zone).disableInteractive();
    });
    scene.tweens.add({
      targets: actionGameObjects,
      alpha: 0,
      duration: 120,
      ease: "Cubic.In",
      onComplete: () => actionGameObjects.forEach((o) => o.destroy()),
    });
    scene.tweens.add({
      targets: front,
      scale: 0.55,
      alpha: 0,
      duration: 160,
      ease: "Cubic.In",
      onComplete: () => {
        front.destroy();
        back.destroy();
        source?.setVisible(true);
        opts.onClose?.();
      },
    });
  };
  dim.on("pointerdown", close);
  // The big card itself isn't interactive, so clicks on it fall through
  // to the dim backdrop — clicking anywhere genuinely dismisses.
  scene.input.keyboard?.once("keydown-ESC", close);
}

/**
 * Flip a card in place: scaleX cycles through 1 → 0 → -1 → 0 → 1, with a
 * back sprite swapped in when the front would face away. Same cos(t·2π)
 * driver as the gallery preview, but no translation — designed to fire
 * after a card has *landed* at rest, where the eye can actually catch the
 * flip motion. Used as the rare-tier reward flourish.
 */
export function playCardFlipReveal(
  scene: Phaser.Scene,
  front: Phaser.GameObjects.Container,
  x: number,
  y: number,
  opts: { duration?: number; onComplete?: () => void } = {},
) {
  const duration = opts.duration ?? 520;
  const back = makeCardBackSprite(scene, x, y, { scale: 1 });
  back.setDepth(front.depth);
  back.setVisible(false);

  const drive = { t: 0 };
  scene.tweens.add({
    targets: drive,
    t: 1,
    duration,
    ease: "Cubic.InOut",
    onUpdate: () => {
      const t = drive.t;
      const cosX = Math.cos(t * Math.PI * 2);
      const facing = cosX >= 0;
      front.setVisible(facing);
      back.setVisible(!facing);
      const showing = facing ? front : back;
      showing.scaleX = Math.abs(cosX);
      showing.scaleY = 1;
    },
    onComplete: () => {
      front.setVisible(true);
      front.setScale(1);
      back.destroy();
      opts.onComplete?.();
    },
  });
}

/**
 * Sweep a thin translucent diagonal strip across a card — the "rare glint"
 * reward-pick gets when it lands. The strip is parented to the container so
 * it travels with the card; alpha fades in then out so the start/end don't
 * pop. ~480ms total.
 */
export function playCardShine(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Container,
  scale = 1,
) {
  const w = CARD_W * scale;
  const h = CARD_H * scale;
  const strip = scene.add.rectangle(-w / 2 - 24, 0, 18, h * 1.5, 0xffffff, 0)
    .setRotation(-0.4);
  sprite.add(strip);
  scene.tweens.add({
    targets: strip,
    x: w / 2 + 24,
    duration: 480,
    ease: "Sine.InOut",
    onComplete: () => strip.destroy(),
  });
  scene.tweens.add({
    targets: strip,
    alpha: 0.55,
    duration: 240,
    yoyo: true,
  });
}

/**
 * Draw a face-DOWN PLAYER card (card back). Same shape & size as a real card
 * so it can sit in a fan and animate the same way. Used for the player's deck
 * face, shuffle animation, and the brief back-side glimpse during card flips.
 *
 * Identity: forest-green field + crescent-moon sigil — "the wizard's deck".
 * Enemy backs use `makeEnemyCardBackSprite` (silhouette stamp on black), so
 * the two decks read as distinct visual identities even when intermingled
 * mid-flight. Callers can override `color`/`glyph` for one-off variants.
 */
export function makeCardBackSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: { scale?: number; color?: number; glyph?: string } = {},
): Phaser.GameObjects.Container {
  const scale = opts.scale ?? 1;
  const fieldColor = opts.color ?? C.forest;
  const glyph = opts.glyph ?? "☾"; // ☾ crescent moon
  const w = CARD_W * scale;
  const h = CARD_H * scale;
  const c = scene.add.container(x, y);

  const g = scene.add.graphics();
  // Outer ink rim
  g.fillStyle(C.ink, 1);
  g.fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 8 * scale);
  // Amber border
  g.fillStyle(C.amber, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 7 * scale);
  // Inner field — defaults to forest green for the player.
  g.fillStyle(fieldColor, 1);
  g.fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 5 * scale);
  // Decorative inner border lines
  g.lineStyle(1, C.amber, 0.6);
  g.strokeRoundedRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 4 * scale);
  // Center sigil ornament
  g.lineStyle(2, C.amber, 0.85);
  g.strokeCircle(0, 0, 22 * scale);
  c.add(g);

  // Glyph at centre — crescent moon by default. Slightly larger than the old
  // ✦ so the curved silhouette reads cleanly at small scales (e.g. shuffle
  // cards rendered at 0.34×).
  const sigil = scene.add.text(0, 0, glyph, {
    fontFamily: "Lora", fontSize: `${Math.round(32 * scale)}px`, color: S.amber,
  }).setOrigin(0.5);
  c.add(sigil);

  c.setSize(w, h);
  return c;
}

/**
 * Enemy card-back: pitch-black field + amber border + an amber silhouette
 * stamped at center identifying which monster's deck this is. Same shape &
 * size as a real card so it fans / flies identically to the player back.
 *
 * The silhouettes are drawn with Phaser Graphics (not emoji glyphs) because
 * Android WebView renders emoji as Noto Color Emoji regardless of CSS color,
 * which would defeat the "yellow silhouette" look. Hand-drawn shapes stay
 * monochrome amber at every scale.
 */
export function makeEnemyCardBackSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  silhouette: EnemySilhouette,
  opts: { scale?: number } = {},
): Phaser.GameObjects.Container {
  const scale = opts.scale ?? 1;
  const w = CARD_W * scale;
  const h = CARD_H * scale;
  const c = scene.add.container(x, y);

  const g = scene.add.graphics();
  // Outer ink rim (kept — matches the player back's silhouette so the two
  // decks read as a pair even with different fills).
  g.fillStyle(C.ink, 1);
  g.fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 8 * scale);
  // Amber border
  g.fillStyle(C.amber, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 7 * scale);
  // Pitch-black inner field (was blood-red on the old enemy back).
  g.fillStyle(0x000000, 1);
  g.fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 5 * scale);
  // Same decorative inner border line as the player back for visual rhyme.
  g.lineStyle(1, C.amber, 0.6);
  g.strokeRoundedRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 4 * scale);
  c.add(g);

  // Silhouette stamp — sized at ~38px in design units, scales with card.
  // 76px in design units (was 38). Doubled so the silhouette reads as the
  // dominant element of the card-back instead of a small medallion.
  const stampSize = 76 * scale;
  const stamp = scene.add.graphics();
  drawEnemySilhouette(stamp, silhouette, 0, 0, stampSize, C.amber);
  c.add(stamp);

  c.setSize(w, h);
  return c;
}

/**
 * Draw one of the predefined enemy silhouettes centered on (cx, cy), sized to
 * fit roughly within a `size`×`size` box. All shapes share the same amber
 * fill so an array of decks reads visually consistent.
 *
 * Each silhouette is intentionally stylized — simple recognizable shape, no
 * fine detail (would mud up at the 0.4-scale deck visual). Think tarot icon,
 * not portrait.
 */
function drawEnemySilhouette(
  g: Phaser.GameObjects.Graphics,
  kind: EnemySilhouette,
  cx: number,
  cy: number,
  size: number,
  color: number,
) {
  g.fillStyle(color, 1);
  g.lineStyle(0, 0, 0);
  const s = size / 2; // half-size, convenient reach

  switch (kind) {
    case "rat": {
      // Crouched body + head, with a thin curling tail and pointy ears.
      g.fillEllipse(cx - s * 0.15, cy + s * 0.05, s * 1.4, s * 0.85);  // body
      g.fillCircle(cx + s * 0.55, cy - s * 0.1, s * 0.42);             // head
      g.fillTriangle(                                                   // ear 1
        cx + s * 0.45, cy - s * 0.4,
        cx + s * 0.7,  cy - s * 0.5,
        cx + s * 0.6,  cy - s * 0.2,
      );
      g.fillTriangle(                                                   // ear 2
        cx + s * 0.65, cy - s * 0.4,
        cx + s * 0.85, cy - s * 0.45,
        cx + s * 0.8,  cy - s * 0.15,
      );
      // Thin tail — a few small circles approximating a curve.
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const tx = cx - s * (0.7 + t * 0.6);
        const ty = cy + s * (0.05 + Math.sin(t * Math.PI) * 0.3);
        g.fillCircle(tx, ty, s * 0.07);
      }
      // Snout dot
      g.fillCircle(cx + s * 0.85, cy, s * 0.08);
      break;
    }
    case "skull": {
      // Round cranium + jaw notch. Eye sockets cut out as black dots.
      g.fillCircle(cx, cy - s * 0.1, s * 0.7);                       // cranium
      g.fillRect(cx - s * 0.42, cy + s * 0.3, s * 0.84, s * 0.35);   // jaw block
      // Eye sockets — punched in black to read as cutouts on amber.
      g.fillStyle(0x000000, 1);
      g.fillCircle(cx - s * 0.28, cy - s * 0.1, s * 0.16);
      g.fillCircle(cx + s * 0.28, cy - s * 0.1, s * 0.16);
      // Nose triangle
      g.fillTriangle(
        cx,            cy + s * 0.05,
        cx - s * 0.1,  cy + s * 0.25,
        cx + s * 0.1,  cy + s * 0.25,
      );
      // Teeth gaps
      g.fillRect(cx - s * 0.3,  cy + s * 0.32, s * 0.08, s * 0.3);
      g.fillRect(cx - s * 0.05, cy + s * 0.32, s * 0.1,  s * 0.3);
      g.fillRect(cx + s * 0.2,  cy + s * 0.32, s * 0.08, s * 0.3);
      g.fillStyle(color, 1);
      break;
    }
    case "knight": {
      // Great-helm: cylinder helmet with a horizontal eye slit.
      g.fillRoundedRect(cx - s * 0.5, cy - s * 0.6, s * 1.0, s * 1.3, s * 0.18);
      // Eye slit
      g.fillStyle(0x000000, 1);
      g.fillRect(cx - s * 0.35, cy - s * 0.1, s * 0.7, s * 0.12);
      g.fillStyle(color, 1);
      // Plume crest on top
      g.fillTriangle(
        cx, cy - s * 0.95,
        cx - s * 0.15, cy - s * 0.6,
        cx + s * 0.15, cy - s * 0.6,
      );
      break;
    }
    case "key": {
      // Round bow with a hole + long stem with two teeth.
      g.fillCircle(cx - s * 0.4, cy, s * 0.45);                       // bow
      g.fillStyle(0x000000, 1);
      g.fillCircle(cx - s * 0.4, cy, s * 0.18);                       // bow hole
      g.fillStyle(color, 1);
      g.fillRect(cx - s * 0.05, cy - s * 0.1, s * 0.85, s * 0.2);     // stem
      g.fillRect(cx + s * 0.55, cy + s * 0.1, s * 0.12, s * 0.3);     // tooth 1
      g.fillRect(cx + s * 0.75, cy + s * 0.1, s * 0.12, s * 0.3);     // tooth 2
      break;
    }
    case "shield": {
      // Classic heater shield outline — drawn as a polygon.
      g.fillPoints([
        { x: cx - s * 0.6, y: cy - s * 0.7 },
        { x: cx + s * 0.6, y: cy - s * 0.7 },
        { x: cx + s * 0.6, y: cy - s * 0.1 },
        { x: cx,           y: cy + s * 0.8 },
        { x: cx - s * 0.6, y: cy - s * 0.1 },
      ], true);
      break;
    }
    case "cross": {
      // Patriarchal cross — vertical bar with two horizontal arms.
      g.fillRect(cx - s * 0.13, cy - s * 0.8, s * 0.26, s * 1.6);     // vertical
      g.fillRect(cx - s * 0.45, cy - s * 0.4, s * 0.9,  s * 0.22);    // upper arm
      g.fillRect(cx - s * 0.35, cy + s * 0.05, s * 0.7, s * 0.18);    // lower arm
      break;
    }
    case "spider": {
      // Round body + 8 angled legs.
      g.fillCircle(cx, cy, s * 0.4);
      g.lineStyle(Math.max(1, s * 0.1), color, 1);
      const legSpec: Array<[number, number, number, number]> = [
        [-0.4, -0.05, -0.95, -0.55],
        [-0.4,  0.10, -0.95, -0.05],
        [-0.4,  0.20, -0.95,  0.45],
        [-0.4,  0.30, -0.85,  0.85],
        [ 0.4, -0.05,  0.95, -0.55],
        [ 0.4,  0.10,  0.95, -0.05],
        [ 0.4,  0.20,  0.95,  0.45],
        [ 0.4,  0.30,  0.85,  0.85],
      ];
      legSpec.forEach(([x1, y1, x2, y2]) => {
        g.lineBetween(cx + s * x1, cy + s * y1, cx + s * x2, cy + s * y2);
      });
      g.lineStyle(0, 0, 0);
      // Two little fang dots
      g.fillCircle(cx - s * 0.12, cy + s * 0.35, s * 0.08);
      g.fillCircle(cx + s * 0.12, cy + s * 0.35, s * 0.08);
      break;
    }
    case "scales": {
      // Central post + crossbar + two pans.
      g.fillRect(cx - s * 0.06, cy - s * 0.55, s * 0.12, s * 1.3);    // post
      g.fillRect(cx - s * 0.7,  cy - s * 0.6,  s * 1.4, s * 0.1);     // beam
      // Pans — shallow arcs (approximated as ellipses)
      g.fillEllipse(cx - s * 0.55, cy - s * 0.25, s * 0.55, s * 0.18);
      g.fillEllipse(cx + s * 0.55, cy - s * 0.25, s * 0.55, s * 0.18);
      // Hang lines from beam to pan
      g.lineStyle(Math.max(1, s * 0.06), color, 1);
      g.lineBetween(cx - s * 0.55, cy - s * 0.5, cx - s * 0.55, cy - s * 0.3);
      g.lineBetween(cx + s * 0.55, cy - s * 0.5, cx + s * 0.55, cy - s * 0.3);
      g.lineStyle(0, 0, 0);
      // Base
      g.fillRect(cx - s * 0.25, cy + s * 0.7, s * 0.5, s * 0.12);
      break;
    }
    case "eye": {
      // Almond outline with a black pupil — single staring eye.
      g.fillEllipse(cx, cy, s * 1.5, s * 0.85);
      g.fillStyle(0x000000, 1);
      g.fillEllipse(cx, cy, s * 1.2, s * 0.55);
      g.fillStyle(color, 1);
      g.fillCircle(cx, cy, s * 0.28);                                 // iris
      g.fillStyle(0x000000, 1);
      g.fillCircle(cx, cy, s * 0.12);                                 // pupil
      g.fillStyle(color, 1);
      break;
    }
    case "hound": {
      // Wolf-head silhouette — wedge muzzle + triangular ears.
      g.fillTriangle(                                                  // ear L
        cx - s * 0.55, cy - s * 0.7,
        cx - s * 0.3,  cy - s * 0.7,
        cx - s * 0.35, cy - s * 0.2,
      );
      g.fillTriangle(                                                  // ear R
        cx + s * 0.55, cy - s * 0.7,
        cx + s * 0.3,  cy - s * 0.7,
        cx + s * 0.35, cy - s * 0.2,
      );
      g.fillEllipse(cx, cy - s * 0.1, s * 1.1, s * 0.85);             // head
      g.fillTriangle(                                                  // muzzle
        cx - s * 0.25, cy + s * 0.2,
        cx + s * 0.25, cy + s * 0.2,
        cx,            cy + s * 0.75,
      );
      // Eyes — punched
      g.fillStyle(0x000000, 1);
      g.fillCircle(cx - s * 0.25, cy - s * 0.15, s * 0.08);
      g.fillCircle(cx + s * 0.25, cy - s * 0.15, s * 0.08);
      g.fillStyle(color, 1);
      break;
    }
    case "crown": {
      // 5-point crown band with a gem dot in each merlon.
      g.fillRect(cx - s * 0.7, cy + s * 0.25, s * 1.4, s * 0.3);      // band
      const peaks = [-0.7, -0.35, 0, 0.35, 0.7];
      peaks.forEach((px) => {
        const isCenter = px === 0;
        const peakH = isCenter ? 0.9 : 0.65;
        g.fillTriangle(
          cx + s * (px - 0.18), cy + s * 0.25,
          cx + s * (px + 0.18), cy + s * 0.25,
          cx + s * px,          cy - s * peakH,
        );
        // Black gem dot near each tip
        g.fillStyle(0x000000, 1);
        g.fillCircle(cx + s * px, cy - s * (peakH - 0.2), s * 0.07);
        g.fillStyle(color, 1);
      });
      break;
    }
    case "goddess": {
      // Stylised figure — small head + flowing robe triangle.
      g.fillCircle(cx, cy - s * 0.5, s * 0.22);                       // head
      g.fillTriangle(                                                  // robe
        cx,             cy - s * 0.25,
        cx - s * 0.55,  cy + s * 0.8,
        cx + s * 0.55,  cy + s * 0.8,
      );
      // Halo ring
      g.lineStyle(Math.max(1, s * 0.07), color, 1);
      g.strokeCircle(cx, cy - s * 0.6, s * 0.38);
      g.lineStyle(0, 0, 0);
      break;
    }
    case "mushroom": {
      // Wide cap over a stout stalk, with punched spot-cutouts on the cap.
      // The stamp sits on a black field, so the "dome" is faked by drawing a
      // flat-bottomed cap: an ellipse for the crown plus a slab beneath it,
      // then black gills knocked out under the rim.
      g.fillRect(cx - s * 0.2, cy + s * 0.1, s * 0.4, s * 0.7);       // stalk
      g.fillEllipse(cx, cy - s * 0.12, s * 1.5, s * 0.95);            // cap crown
      // Knock out the cap's lower half with black to leave a domed silhouette.
      g.fillStyle(0x000000, 1);
      g.fillRect(cx - s * 0.8, cy + s * 0.12, s * 1.6, s * 0.6);
      g.fillStyle(color, 1);
      g.fillRect(cx - s * 0.2, cy + s * 0.1, s * 0.4, s * 0.7);       // re-draw stalk
      // Spots punched into the cap
      g.fillStyle(0x000000, 1);
      g.fillCircle(cx - s * 0.35, cy - s * 0.25, s * 0.13);
      g.fillCircle(cx + s * 0.3,  cy - s * 0.2,  s * 0.11);
      g.fillCircle(cx,            cy - s * 0.42, s * 0.1);
      g.fillStyle(color, 1);
      break;
    }
    case "treant": {
      // Broad twisted trunk with two raised limb-branches and a knot-face.
      g.fillRect(cx - s * 0.32, cy - s * 0.3, s * 0.64, s * 1.1);     // trunk
      // Splayed roots
      g.fillTriangle(cx - s * 0.32, cy + s * 0.55, cx - s * 0.7, cy + s * 0.85, cx - s * 0.1, cy + s * 0.8);
      g.fillTriangle(cx + s * 0.32, cy + s * 0.55, cx + s * 0.7, cy + s * 0.85, cx + s * 0.1, cy + s * 0.8);
      // Arm-branches angling up
      g.lineStyle(Math.max(1, s * 0.16), color, 1);
      g.lineBetween(cx - s * 0.25, cy - s * 0.1, cx - s * 0.75, cy - s * 0.6);
      g.lineBetween(cx - s * 0.75, cy - s * 0.6, cx - s * 0.6, cy - s * 0.95);
      g.lineBetween(cx + s * 0.25, cy - s * 0.1, cx + s * 0.75, cy - s * 0.6);
      g.lineBetween(cx + s * 0.75, cy - s * 0.6, cx + s * 0.6, cy - s * 0.95);
      g.lineStyle(0, 0, 0);
      // Hollow knot-eyes
      g.fillStyle(0x000000, 1);
      g.fillCircle(cx - s * 0.13, cy, s * 0.1);
      g.fillCircle(cx + s * 0.13, cy, s * 0.1);
      g.fillStyle(color, 1);
      break;
    }
    case "antler": {
      // Beast skull-wedge crowned by a branching antler rack.
      g.fillEllipse(cx, cy + s * 0.25, s * 0.7, s * 0.95);            // skull
      g.fillTriangle(                                                 // muzzle
        cx - s * 0.18, cy + s * 0.6,
        cx + s * 0.18, cy + s * 0.6,
        cx,            cy + s * 0.95,
      );
      g.fillStyle(0x000000, 1);
      g.fillCircle(cx - s * 0.2, cy + s * 0.15, s * 0.08);
      g.fillCircle(cx + s * 0.2, cy + s * 0.15, s * 0.08);
      g.fillStyle(color, 1);
      // Antlers — forked branches off each temple
      g.lineStyle(Math.max(1, s * 0.1), color, 1);
      const fork = (sx: number) => {
        const tx = cx + s * 0.25 * sx;
        g.lineBetween(tx, cy - s * 0.05, tx + s * 0.35 * sx, cy - s * 0.7);
        g.lineBetween(tx + s * 0.35 * sx, cy - s * 0.7, tx + s * 0.7 * sx, cy - s * 0.85);
        g.lineBetween(tx + s * 0.35 * sx, cy - s * 0.7, tx + s * 0.45 * sx, cy - s * 1.05);
        g.lineBetween(tx + s * 0.18 * sx, cy - s * 0.4, tx + s * 0.55 * sx, cy - s * 0.45);
      };
      fork(-1);
      fork(1);
      g.lineStyle(0, 0, 0);
      break;
    }
    case "wisp": {
      // A hovering flame-orb trailing a wavering tail of embers.
      g.fillCircle(cx, cy - s * 0.15, s * 0.42);                      // core orb
      g.fillTriangle(                                                 // flame tip
        cx - s * 0.3, cy - s * 0.3,
        cx + s * 0.3, cy - s * 0.3,
        cx,           cy - s * 0.95,
      );
      g.fillStyle(0x000000, 1);
      g.fillCircle(cx, cy - s * 0.15, s * 0.15);                      // hollow heart
      g.fillStyle(color, 1);
      // Ember trail — shrinking circles drifting down
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const ex = cx + Math.sin(t * Math.PI * 1.5) * s * 0.3;
        const ey = cy + s * (0.35 + t * 0.55);
        g.fillCircle(ex, ey, s * (0.18 - t * 0.12));
      }
      break;
    }
    case "rotheart": {
      // A diseased heart-tree: heart-shaped mass with a burning eye and
      // creeping roots — the source of the curse.
      g.fillCircle(cx - s * 0.35, cy - s * 0.25, s * 0.5);           // left lobe
      g.fillCircle(cx + s * 0.35, cy - s * 0.25, s * 0.5);           // right lobe
      g.fillTriangle(                                                 // point
        cx - s * 0.78, cy - s * 0.02,
        cx + s * 0.78, cy - s * 0.02,
        cx,            cy + s * 0.95,
      );
      // Glowing eye burned into the trunk (hollow, ringed)
      g.fillStyle(0x000000, 1);
      g.fillEllipse(cx, cy - s * 0.1, s * 0.5, s * 0.32);
      g.fillStyle(color, 1);
      g.fillCircle(cx, cy - s * 0.1, s * 0.12);                       // pupil
      // Creeping roots from the base
      g.lineStyle(Math.max(1, s * 0.08), color, 1);
      g.lineBetween(cx, cy + s * 0.9, cx - s * 0.5, cy + s * 1.05);
      g.lineBetween(cx, cy + s * 0.9, cx + s * 0.5, cy + s * 1.05);
      g.lineBetween(cx, cy + s * 0.9, cx, cy + s * 1.1);
      g.lineStyle(0, 0, 0);
      break;
    }
  }
}

/**
 * Face-up card representing what the enemy just played. Red border, big icon
 * for the action kind (⚔ attack, ⛨ defend, ✚ buff), and the intent text.
 * Lands on the central play pile after the card-back flies from the enemy
 * hand and reveals.
 */
export function makeEnemyActionCard(
  scene: Phaser.Scene,
  x: number,
  y: number,
  intent: { kind: "attack" | "defend" | "buff"; value: number; text: string },
  opts: { scale?: number } = {},
): Phaser.GameObjects.Container {
  const scale = opts.scale ?? 1;
  const w = CARD_W * scale;
  const h = CARD_H * scale;
  const c = scene.add.container(x, y);

  const g = scene.add.graphics();
  g.fillStyle(C.ink, 1);
  g.fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 8 * scale);
  g.fillStyle(C.blood, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 7 * scale);
  g.fillStyle(C.parchment, 1);
  g.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 5 * scale);
  // Top banner
  g.fillStyle(C.blood, 0.85);
  g.fillRect(-w / 2 + 6, -h / 2 + 6, w - 12, 22 * scale);
  c.add(g);

  const tag = scene.add.text(0, -h / 2 + 16 * scale, "ENEMY", {
    fontFamily: "Lora", fontSize: `${Math.round(12 * scale)}px`, color: S.parchHi,
    fontStyle: "bold",
  }).setOrigin(0.5, 0.5);
  c.add(tag);

  const icon =
    intent.kind === "attack" ? "⚔" :
    intent.kind === "defend" ? "⛨" : "✚";
  const iconColor =
    intent.kind === "attack" ? "#8b1d22" :
    intent.kind === "defend" ? "#6db7d6" : "#e2a93e";
  const iconText = scene.add.text(0, -10 * scale, icon, {
    fontFamily: "Lora", fontSize: `${Math.round(56 * scale)}px`, color: iconColor,
  }).setOrigin(0.5, 0.5);
  c.add(iconText);

  const valueText = scene.add.text(0, 50 * scale, intent.text, {
    fontFamily: "Lora", fontSize: `${Math.round(13 * scale)}px`, color: S.ink,
    align: "center", wordWrap: { width: w - 16 },
  }).setOrigin(0.5, 0.5);
  c.add(valueText);

  c.setSize(w, h);
  return c;
}

export { FONT };
