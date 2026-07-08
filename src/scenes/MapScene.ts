import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import { makeNavButton } from "@/ui/NavButton";
import { drawHudPills } from "@/ui/HudPills";
import type { FloorMap, MapNode, NodeKind, RunState } from "@/types/game";

// Re-enterable nodes: the player can hop in and out of these freely until
// they pick a node on the next row. Combat-y nodes (combat/elite/boss) are
// one-shot — entering them consumes the encounter.
const REENTERABLE: Set<NodeKind> = new Set(["shop", "grave", "forge", "shrine", "well"]);
import { generateFloor } from "@/systems/MapGen";
import { RUN_KEY, saveRun } from "@/systems/RunState";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";
import { attachFxLayer } from "@/ui/sceneBg";

const NODE_ICON: Record<MapNode["kind"], string> = {
  combat: "⚔",
  elite:  "☠",
  shop:   "$",
  grave:  "⚱",
  forge:  "⚒",
  shrine: "✦",
  well:   "⊙",
  boss:   "♛",
};

const NODE_LABEL: Record<MapNode["kind"], string> = {
  combat: "Combat",
  elite:  "Elite",
  shop:   "Shop",
  grave:  "Grave",
  forge:  "Forge",
  shrine: "Shrine",
  well:   "Well",
  boss:   "BOSS",
};

export class MapScene extends Phaser.Scene {
  /** True while a node's selection spin is playing — guards double-taps. */
  private selecting = false;

  constructor() { super("Map"); }

  create() {
    gateSceneInput(this);
    this.selecting = false;
    const run = this.game.registry.get(RUN_KEY) as RunState;
    if (!run.map || run.map.floor !== run.floor) {
      run.map = generateFloor(run.floor, {
        extraForges: run.pendingExtraForges,
        extraShrines: run.pendingExtraShrines,
      });
      run.pendingExtraForges = 0;
      run.pendingExtraShrines = 0;
      run.currentNodeId = null;
      run.freeGraveUsedThisFloor = false;
      // Shop inventories and well outcomes are per-floor: wipe so the next
      // floor's shops/wells roll fresh.
      run.shopStock = {};
      run.wellStock = {};
    }
    // Snapshot run state at every map visit — rest point for save/resume.
    saveRun(this.game);
    this.draw(run);
  }

  private draw(run: RunState) {
    this.children.removeAll(true);
    const { width, height } = this.scale;

    // Background — solid scene fill (always fixed under the camera).
    // Explicit depth -3 so the pixel-art map backdrop (at depth -2) renders
    // ON TOP of this fill rather than being hidden beneath it. The fx
    // flicker layer sits at -1.5 between the backdrop and the default-depth
    // map nodes (0), so everything stacks: fill → backdrop → fx → nodes.
    const fixedBg = this.add.graphics().setScrollFactor(0).setDepth(-3);
    fixedBg.fillStyle(C.bg, 1).fillRect(0, 0, width, height);

    // Chrome (title, HUD pills, nav buttons, hint) is all pinned AND given
    // a very high depth so scrolling content (parchment frame, nodes, edges,
    // Enter button) is always drawn behind the chrome. That lets the
    // parchment frame extend up past the chrome without bleeding through.
    const CHROME_DEPTH = 1000;

    // Title (fixed at top regardless of map scroll), wrapped in a parchment
    // pill so it reads as a chrome element alongside the HP/gold HUD.
    const titleY = 44;
    const titleStr = `Floor ${run.floor} — ${floorName(run.floor)}`;
    const titleTmp = this.add.text(0, 0, titleStr, {
      fontFamily: "Lora", fontSize: "22px", color: S.amber,
    }).setOrigin(0.5).setVisible(false);
    const titleW = titleTmp.width + 36;
    const titleH = 40;
    titleTmp.destroy();
    const titleBg = this.add.graphics();
    titleBg.fillStyle(C.ink, 0.92);
    titleBg.fillRoundedRect(width / 2 - titleW / 2, titleY - titleH / 2, titleW, titleH, titleH / 2);
    titleBg.lineStyle(3, C.amber, 0.85);
    titleBg.strokeRoundedRect(width / 2 - titleW / 2, titleY - titleH / 2, titleW, titleH, titleH / 2);
    titleBg.setScrollFactor(0).setDepth(CHROME_DEPTH);
    const title = this.add.text(width / 2, titleY, titleStr, {
      fontFamily: "Lora", fontSize: "22px", color: S.amber,
    }).setOrigin(0.5);
    title.setScrollFactor(0).setDepth(CHROME_DEPTH + 1);

    // HUD: three pills (HP / Gold / Deck) matching the combat-scene shape
    // language. Pinned + high-depth so they don't scroll with the map.
    drawHudPills(this, run, CHROME_DEPTH);

    const map = run.map!;
    const rows = Math.max(...map.nodes.map((n) => n.row)) + 1;
    // Node & edge layout was uniformly scaled up ~1.8× so the whole path is
    // thumb-readable on a phone. The chrome (title, HUD, hint, nav buttons)
    // stays pinned via setScrollFactor(0); the bigger nodes spill below the
    // viewport and become reachable via the existing scroll-drag handler.
    const ROW_HEIGHT = 158; // was 198 — 20% reduction
    const baseY = height - 130;
    const rowHeight = ROW_HEIGHT;
    // Node radii, also 1.8×
    const R_NORMAL = 32, R_ELITE = 38, R_BOSS = 46;
    // Rect that frames the path — scales to encompass nodes + labels with
    // padding so the bottom-row labels don't poke past the border.
    const topNodeY = baseY - (rows - 1) * rowHeight;
    // padTop doubled (was 54) so the parchment frame's top edge sits well
    // above the now-larger chrome. Combined with the high chrome depth,
    // the rect can never collide with the title/HUD/nav row visually.
    const padTop = 86;
    const padBottom = 58;
    const rectTop = topNodeY - R_BOSS - padTop;
    const rectBottom = baseY + R_NORMAL + padBottom;
    const rectX = 60;
    const rectW = width - 120;
    const rectH = rectBottom - rectTop;

    // Atmospheric backdrop — vertical "goal at top, where you started at
    // bottom" image stretched to fill the parchment frame. Picked by
    // `run.floor` so each floor reads as its own location:
    //   1 Crypt · 2 Castle Halls · 3 Throne Room                (original biome)
    //   4 Outer Grove · 5 Mushroom Hollow · 6 Black Mire · 7 Bone Thicket · 8 Heart of Rot
    //                                                            (cursed-forest biome,
    //                                                             post-Gorgonzola)
    // Clamped to [1, 8] so any out-of-range floor falls back to the Crypt
    // rather than rendering as an empty rect.
    const backdropFloor = Math.min(8, Math.max(1, run.floor));
    const backdropKey = `map-backdrop-${backdropFloor}`;
    if (this.textures.exists(backdropKey)) {
      // Backdrop + fx flicker layer sit BELOW the default-depth nodes
      // (which render at depth 0). Explicit negative depths keep the
      // animated flames from drawing over map nodes — the bug from the
      // first overlay attempt.
      const bdImg = this.add.image(rectX + rectW / 2, rectTop + rectH / 2, backdropKey)
        .setDisplaySize(rectW, rectH)
        .setDepth(-2);
      attachFxLayer(this, backdropKey, bdImg, -2);
    }
    const g = this.add.graphics();
    g.lineStyle(4, C.parchShade, 0.4).strokeRect(rectX, rectTop, rectW, rectH);

    // Edges, sorted into three visual categories so the map reads at a glance:
    //   walked   — you took this step (both endpoints visited)
    //   active   — leads from your current node to a node you can pick now
    //   inactive — anything else (a road you didn't / can't take)
    const activeEdge = new Set<string>();
    if (run.currentNodeId) {
      const cur = map.nodes.find((n) => n.id === run.currentNodeId);
      if (cur) for (const nx of cur.next) activeEdge.add(`${cur.id}|${nx}`);
    }
    const edgeKey = (from: string, to: string) => `${from}|${to}`;

    type EdgeRecord = { from: MapNode; to: MapNode; cat: "walked" | "active" | "inactive" };
    const edges: EdgeRecord[] = [];
    for (const node of map.nodes) {
      for (const nxtId of node.next) {
        const to = map.nodes.find((n) => n.id === nxtId);
        if (!to) continue;
        const isActive = activeEdge.has(edgeKey(node.id, nxtId));
        const isWalked = !isActive && !!node.visited && !!to.visited;
        edges.push({ from: node, to, cat: isActive ? "active" : isWalked ? "walked" : "inactive" });
      }
    }

    const edgeG = this.add.graphics();
    const drawEdgesOfCat = (cat: EdgeRecord["cat"]) => {
      for (const e of edges) {
        if (e.cat !== cat) continue;
        const a = nodePos(e.from, map, baseY, rowHeight, width);
        const b = nodePos(e.to,   map, baseY, rowHeight, width);
        edgeG.beginPath();
        edgeG.moveTo(a.x, a.y);
        edgeG.lineTo(b.x, b.y);
        edgeG.strokePath();
      }
    };

    // Inactive + walked stay as a static Graphics — they don't animate.
    edgeG.lineStyle(3, C.parchShade, 0.18); drawEdgesOfCat("inactive");
    edgeG.lineStyle(3, C.parchHi,    0.55); drawEdgesOfCat("walked");

    // Active edges no longer draw a solid amber line — the pulsing amber
    // ring on the current node + the pulsing arrowhead on each destination
    // are enough to communicate "these are your choices" without the
    // chunky highway. The dotted line that DOES draw between nodes only
    // appears once a destination is committed (see animateSelectionLine).
    const radiusFor = (kind: MapNode["kind"]) =>
      kind === "boss" ? R_BOSS : kind === "elite" ? R_ELITE : R_NORMAL;
    for (const e of edges) {
      if (e.cat !== "active") continue;
      const a = nodePos(e.from, map, baseY, rowHeight, width);
      const b = nodePos(e.to,   map, baseY, rowHeight, width);

      // Arrowhead: tip sits just outside the destination node, pointing
      // from a → b. Triangle filled in amber, sized to match the line.
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const destR = radiusFor(e.to.kind);
      const tipX = b.x - Math.cos(angle) * (destR + 6);
      const tipY = b.y - Math.sin(angle) * (destR + 6);
      const len = 18, halfBase = 10;
      const backX = tipX - Math.cos(angle) * len;
      const backY = tipY - Math.sin(angle) * len;
      const perpX =  Math.sin(angle) * halfBase;
      const perpY = -Math.cos(angle) * halfBase;
      // Place the Graphics at the triangle's centroid and draw vertices
      // RELATIVE to that point. Phaser scales a Graphics around its (x, y)
      // origin, so centroid-anchoring means the pulse grows/shrinks around
      // the arrow's visual centre instead of pivoting from a corner.
      const cx = (tipX + 2 * backX) / 3;
      const cy = (tipY + 2 * backY) / 3;
      const arrowG = this.add.graphics().setPosition(cx, cy);
      arrowG.fillStyle(C.amber, 1);
      arrowG.beginPath();
      arrowG.moveTo(tipX - cx, tipY - cy);
      arrowG.lineTo((backX + perpX) - cx, (backY + perpY) - cy);
      arrowG.lineTo((backX - perpX) - cx, (backY - perpY) - cy);
      arrowG.closePath();
      arrowG.fillPath();
      this.tweens.add({
        targets: arrowG,
        scale: { from: 1.0, to: 1.25 },
        alpha: { from: 1.0, to: 0.7 },
        yoyo: true, repeat: -1,
        duration: 1200, ease: "Sine.InOut",
      });
    }

    // Nodes
    const reachable = this.reachableNodeIds(run);
    for (const node of map.nodes) {
      const p = nodePos(node, map, baseY, rowHeight, width);
      const isCurrent = node.id === run.currentNodeId;
      const isPick = reachable.has(node.id);
      const isVisited = !!node.visited;

      // The circle + icon live in a container anchored at the node centre so
      // the selection flourish can spin them around the node's vertical axis
      // (scaleX pivots about the container origin). Pulsing rings, the halo,
      // the label and the Enter button stay in scene space — they shouldn't
      // spin or mirror with the node.
      const nodeBody = this.add.container(p.x, p.y);
      const ng = this.add.graphics();
      // Per-kind fill: each non-combat node gets a thematic colour so the
      // player can read the map at a glance without leaning on the text
      // labels. Combat keeps the neutral iron grey.
      const fill =
        node.kind === "boss"   ? C.blood    // deep red — danger
        : node.kind === "elite"  ? C.bloodHi  // bright red — tougher than combat
        : node.kind === "shop"   ? C.amberHi  // bright gold — merchant / coin
        : node.kind === "forge"  ? C.amber    // rich orange — forge fire
        : node.kind === "grave"  ? C.purple   // dark mystical — death
        : node.kind === "shrine" ? C.ghostHi  // pale cyan — divine light
        : node.kind === "well"   ? C.ghost    // deeper cyan — water
        : C.ironHi;                            // combat — neutral grey
      const ringColor = isPick ? C.amberHi : isVisited ? C.iron : C.iron;
      const r = radiusFor(node.kind);
      ng.fillStyle(C.bg, 1).fillCircle(0, 0, r + 6);
      ng.fillStyle(fill, isVisited ? 0.35 : 1).fillCircle(0, 0, r);
      ng.lineStyle(isPick ? 4 : 3, ringColor, 1).strokeCircle(0, 0, r);
      nodeBody.add(ng);

      if (isCurrent) {
        // "You are here" marker: a thick pulsing amber ring around the node.
        // The matching "you could go here" beat is delivered by the pulsing
        // arrowheads on outgoing active edges (drawn above), so the old
        // bouncing ▼ above the node is no longer needed.
        const youRing = this.add.circle(p.x, p.y, r + 20)
          .setStrokeStyle(6, C.amber)
          .setFillStyle(undefined, 0);
        this.tweens.add({
          targets: youRing,
          scale: { from: 1.0, to: 1.10 },
          alpha: { from: 1.0, to: 0.75 },
          yoyo: true, repeat: -1,
          duration: 1200, ease: "Sine.InOut",
        });

        // Re-enterable nodes get an explicit "Enter <Name>" button below the
        // node. The button label carries the node name, so the small text
        // label that normally sits under the icon is suppressed (see below)
        // to avoid two stacked labels competing for attention.
        if (REENTERABLE.has(node.kind)) {
          const btnW = 208, btnH = 58;
          const btnCx = p.x;
          const btnCy = p.y + r + 56;

          const btnBg = this.add.graphics();
          btnBg.fillStyle(C.ink, 0.85);
          btnBg.fillRoundedRect(btnCx - btnW / 2, btnCy - btnH / 2, btnW, btnH, btnH / 2);
          btnBg.lineStyle(2, C.amber, 0.9);
          btnBg.strokeRoundedRect(btnCx - btnW / 2, btnCy - btnH / 2, btnW, btnH, btnH / 2);

          this.add.text(btnCx, btnCy, `Enter ${NODE_LABEL[node.kind]}`, {
            fontFamily: "Lora", fontSize: "19px", color: S.amber, fontStyle: "bold",
          }).setOrigin(0.5);

          // pointerup + distance check matches the node click — a drag that
          // starts on the button (e.g. a scroll gesture) won't fire it.
          const btnZone = this.add.zone(btnCx, btnCy, btnW, btnH)
            .setInteractive({ useHandCursor: true });
          btnZone.on("pointerup", (pointer: Phaser.Input.Pointer) => {
            if (pointer.getDistance() > 8) return;
            this.selectNode(run, node, nodeBody);
          });
        }
      }

      const iconText = this.add.text(0, -2, NODE_ICON[node.kind], {
        fontFamily: "Lora", fontSize: "32px", color: S.parchHi,
      }).setOrigin(0.5);
      nodeBody.add(iconText);
      // Label only the nodes the player can actually move to right now.
      // Unreachable nodes (visited or not-yet-reachable) read by icon alone,
      // keeping the map uncluttered. The Enter button (drawn for re-enterable
      // current nodes) already names the node, so skip the label there too.
      const hasEnterButton = isCurrent && REENTERABLE.has(node.kind);
      if (!hasEnterButton && isPick) {
        this.add.text(p.x, p.y + r + 16, NODE_LABEL[node.kind], {
          fontFamily: "Lora", fontSize: "16px", color: S.amber,
        }).setOrigin(0.5);
      }

      if (isPick) {
        // Pulsing halo — soft amber ring scaling up & fading out, looping.
        // Draws attention to the nodes the player is allowed to pick.
        // Skipped on the current node (the youRing above already pulses).
        if (!isCurrent) {
          const halo = this.add.circle(p.x, p.y, r + 9)
            .setStrokeStyle(4, C.amberHi)
            .setFillStyle(undefined, 0);
          this.tweens.add({
            targets: halo,
            scale: { from: 1.0, to: 1.25 },
            alpha:  { from: 0.85, to: 0.18 },
            yoyo: true,
            repeat: -1,
            duration: 850,
            ease: "Sine.InOut",
          });
        }

        // One-shot hover animation: icon pops via Back.Out + a ring ripples
        // outward and fades. Both cancel cleanly on pointerout.
        const zone = this.add.zone(p.x, p.y, r * 2 + 26, r * 2 + 26)
          .setInteractive({ useHandCursor: true });
        let hoverRing: Phaser.GameObjects.Arc | null = null;
        zone.on("pointerover", () => {
          // Icon pops (one-shot, won't loop)
          this.tweens.killTweensOf(iconText);
          this.tweens.add({
            targets: iconText,
            scale: 1.35,
            duration: 220,
            ease: "Back.Out",
          });
          // Ring ripples out, fades, destroys itself
          hoverRing?.destroy();
          hoverRing = this.add.circle(p.x, p.y, r * 0.6)
            .setStrokeStyle(3, C.amberHi)
            .setFillStyle(undefined, 0)
            .setDepth(20);
          const ringRef = hoverRing;
          this.tweens.add({
            targets: ringRef,
            scale: { from: 1.0, to: 3.2 },
            alpha: { from: 1.0, to: 0 },
            duration: 480,
            ease: "Cubic.Out",
            onComplete: () => {
              ringRef.destroy();
              if (hoverRing === ringRef) hoverRing = null;
            },
          });
          // Path-line thicken/pulse on hover used to live here too, but
          // the solid active-edge lines have been removed — the per-arrow
          // pulse + hover ring carry the affordance now.
        });
        zone.on("pointerout", () => {
          // Cancel: reset icon, kill the in-flight ring.
          this.tweens.killTweensOf(iconText);
          this.tweens.add({
            targets: iconText,
            scale: 1.0,
            duration: 140,
            ease: "Cubic.Out",
          });
          if (hoverRing) {
            this.tweens.killTweensOf(hoverRing);
            const ringRef = hoverRing;
            this.tweens.add({
              targets: ringRef,
              alpha: 0,
              duration: 90,
              onComplete: () => ringRef.destroy(),
            });
            hoverRing = null;
          }
          // (No path-line reset — active edges no longer render solid.)
        });
        // Use pointerup + distance check so a drag that starts on a node
        // doesn't accidentally select it.
        zone.on("pointerup", (pointer: Phaser.Input.Pointer) => {
          if (pointer.getDistance() > 8) return;
          this.selectNode(run, node, nodeBody);
        });
      }
    }

    // Bottom panel — current node / hint, 1.8× larger.
    const hintText = !run.currentNodeId ? "Pick a starting path." : "Pick the next encounter on your path.";
    const hint = this.add.text(width / 2, height - 50, hintText, {
      fontFamily: "Lora", fontSize: !run.currentNodeId ? "19px" : "16px",
      color: !run.currentNodeId ? S.amber : S.dim,
    }).setOrigin(0.5);
    hint.setScrollFactor(0).setDepth(CHROME_DEPTH);

    // Map-corner buttons: View Deck and back to Menu. Sized for touch and
    // inset from the right edge so rounded-corner phones don't crop them.
    const navW = 200, navH = 60;
    const navY = 58;
    const rightInset = 130; // ≥ navW/2 + safe-area margin
    makeNavButton(this, width - rightInset - navW - 18, navY, navW, navH, "View Deck", S.parchHi, () =>
      this.scene.start("Deck", { fromScene: "Map" }), "24px",
    ).pin().depth(CHROME_DEPTH);
    makeNavButton(this, width - rightInset, navY, navW, navH, "Menu", S.parchHi, () =>
      this.scene.start("MainMenu"), "24px",
    ).pin().depth(CHROME_DEPTH);

    // Hardware back → menu.
    this.events.off("androidback");
    this.events.on("androidback", () => this.scene.start("MainMenu"));

    // Scroll: wheel for desktop + touch-drag for mobile. Now allows scrolling
    // in BOTH directions — top rows can sit above y=0 once nodes are 1.8×, so
    // the camera needs negative scrollY to reach them. Pinned chrome (title,
    // HUD pills, hint, nav buttons) stays put while the path scrolls.
    const viewportTop = 60;             // below the title row
    const viewportBottom = height - 70; // above the hint band
    const minScrollY = Math.min(0, rectTop - viewportTop);
    const maxScrollY = Math.max(0, rectBottom - viewportBottom);
    const canScroll = minScrollY < 0 || maxScrollY > 0;
    const applyScroll = (next: number) => {
      this.cameras.main.scrollY = Phaser.Math.Clamp(next, minScrollY, maxScrollY);
    };

    // Find the focused node's world Y — the row the player is about to MOVE
    // TO, not the one they're standing on. On a fresh floor (no current
    // node), that's baseY = the bottom row of pickable starts. Once a node
    // is current, focus shifts up one row to the connected next-row nodes
    // — those are the choices the player is here to make. The current node
    // (and its Enter button on re-enterable shop/grave/forge/shrine sites)
    // sits below the focus point and stays reachable by drag/scroll.
    // All `cur.next` entries are in the same row, so any one's y works.
    // On the boss row `cur.next` is empty — fall back to the current node
    // so the boss itself becomes the focus.
    let focusY = baseY;
    if (run.currentNodeId) {
      const cur = map.nodes.find((n) => n.id === run.currentNodeId);
      if (cur) {
        const nextId = cur.next[0];
        const next = nextId ? map.nodes.find((n) => n.id === nextId) : undefined;
        const focusNode = next ?? cur;
        focusY = nodePos(focusNode, map, baseY, rowHeight, width).y;
      }
    }
    // Drop the focus near the lower-middle of the viewport so the row above
    // (the row past the choices) stays visible too — the player can see
    // one step ahead while reading their immediate options. NODE_TARGET_Y
    // is reachable on every device because positive scrollY overscrolls
    // past the natural maxScrollY when needed; drag/wheel stay clamped to
    // the original bounds.
    const NODE_TARGET_Y = viewportBottom - 200; // ≈ 530 on an 800-tall design
    const desired = focusY - NODE_TARGET_Y;
    const scrollTarget = Math.max(desired, minScrollY);

    // Camera starts at minScrollY (the very TOP of the parchment frame, with
    // the boss row visible) and tweens DOWN to scrollTarget every time
    // create() runs. Three deliberate properties:
    //   1. Same direction every entry — always "from the top of the map
    //      down to where you are." Predictable, signals progress visually.
    //   2. Maximum motion. For most current nodes the pan covers most of the
    //      parchment height, so the player can't miss it.
    //   3. Survives Capacitor Android's post-create scroll resets. A tween
    //      writes scrollY every frame, overwriting any external reset, and
    //      lands at scrollTarget regardless of what happened mid-flight.
    // Edge case: when the player is already on a top-row node (scrollTarget
    // == minScrollY), there's no motion to play. That's correct — they're
    // already where the pan would land.
    this.cameras.main.scrollY = minScrollY;
    let introTween: Phaser.Tweens.Tween | null = null;
    // delayedCall(0) defers to the next tick — gives Phaser one frame to
    // finalise the scene mount + camera viewport before we start panning.
    this.time.delayedCall(0, () => {
      // If the pan target equals the current scroll, there's nothing to
      // animate — release input immediately so the player can act.
      if (scrollTarget === minScrollY) {
        markSceneReady(this);
        return;
      }
      introTween = this.tweens.add({
        targets: this.cameras.main,
        scrollY: scrollTarget,
        duration: 850,
        delay: 180,
        ease: "Cubic.InOut",
        onComplete: () => markSceneReady(this),
      });
    });
    // If the player drags/wheels mid-pan, kill the intro so the camera
    // doesn't fight their input.
    const cancelIntroTween = () => {
      if (introTween && introTween.isPlaying()) introTween.stop();
      introTween = null;
    };

    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (!canScroll) return;
      cancelIntroTween();
      applyScroll(this.cameras.main.scrollY + dy);
    });
    let dragStartY = 0;
    let dragStartScroll = 0;
    // Sticky gate: pointermove is only a drag/cancel signal once a pointerdown
    // has actually landed on THIS MapScene mount. Without this, a tap on the
    // previous scene's button (e.g. Shop's "← Map") that's still held during
    // the scene transition produces a stream of `pointermove isDown=true`
    // events on the just-mounted MapScene — those events are residue from the
    // earlier scene's tap, not real user drag intent, and on touch devices
    // with high sensitivity (Pixel 10, vs. e.g. Pixel 6) they reliably arrive
    // within the intro tween's 180ms delay window and kill it before it
    // animates. Empirically this is exactly why the intro pan was firing for
    // the post-combat path (Reward → Map has a delay between its own button
    // tap and the Map mount) but not for Shop/Forge/Shrine/Grave → Map.
    let sawPointerDownOnThisMount = false;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      sawPointerDownOnThisMount = true;
      dragStartY = p.y;
      dragStartScroll = this.cameras.main.scrollY;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      if (!canScroll) return;
      if (!sawPointerDownOnThisMount) return;
      if (introTween) {
        // Aborting mid-pan: re-anchor to the camera's current scroll so the
        // drag delta doesn't snap the camera back to wherever the user
        // happened to touch down a few hundred ms ago.
        cancelIntroTween();
        dragStartY = p.y;
        dragStartScroll = this.cameras.main.scrollY;
        return;
      }
      // Subtract drag delta so dragging UP scrolls map content UP (reveal more below).
      applyScroll(dragStartScroll - (p.y - dragStartY));
    });
  }

  private reachableNodeIds(run: RunState): Set<string> {
    const map = run.map!;
    if (!run.currentNodeId) return new Set(map.startNodeIds);
    const cur = map.nodes.find((n) => n.id === run.currentNodeId);
    const ids = new Set(cur?.next ?? []);
    if (cur && REENTERABLE.has(cur.kind)) ids.add(cur.id);
    return ids;
  }

  /**
   * Animated dotted-line trail from the player's current node to a chosen
   * destination — the "path commits" beat that precedes the spin. Drawn as
   * a sequence of short amber dashes that reveal in order from current to
   * destination over ~400 ms. Pure decoration: no game state changes
   * during it, no input needed (caller handles the gate). Calls
   * `onComplete` once the last dash has landed.
   */
  private animateSelectionLine(
    from: { x: number; y: number },
    to: { x: number; y: number },
    onComplete: () => void,
  ) {
    // Depth 5 puts the dotted trail ABOVE the static edge graphics and the
    // map nodes (default depth 0), so it reads as the focal animation of
    // the selection — not buried under existing chrome. Acceptable because
    // it's only on-screen for ~1.2s during the selection sequence, then
    // fades out before the scene transitions.
    const g = this.add.graphics().setDepth(5);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const ux = dx / dist;
    const uy = dy / dist;
    const dashLen = 12;
    const gapLen = 8;
    // Cap distance so the inner ends sit just outside the node circles —
    // avoids visually crashing into the source/destination art.
    const inset = 38;
    const startD = Math.min(inset, dist * 0.2);
    const endD = Math.max(dist - inset, dist * 0.8);
    const driver = { p: 0 };
    this.tweens.add({
      targets: driver, p: 1,
      duration: 420, ease: "Cubic.Out",
      onUpdate: () => {
        g.clear();
        // 6 px stroke + amberHi colour so the trail reads loud and clear
        // against both the dim parchment frame edges and the busier
        // pixel-art backdrops.
        g.lineStyle(6, C.amberHi, 1);
        const revealedEnd = startD + (endD - startD) * driver.p;
        let d = startD;
        while (d < revealedEnd) {
          const segEnd = Math.min(d + dashLen, revealedEnd);
          g.beginPath();
          g.moveTo(from.x + ux * d, from.y + uy * d);
          g.lineTo(from.x + ux * segEnd, from.y + uy * segEnd);
          g.strokePath();
          d += dashLen + gapLen;
        }
      },
      onComplete: () => {
        // Hold the finished trail through the node spin, then fade it out
        // so the next scene transition starts clean.
        this.tweens.add({
          targets: g, alpha: 0,
          delay: 600, duration: 200, ease: "Cubic.In",
          onComplete: () => g.destroy(),
        });
        onComplete();
      },
    });
  }

  /**
   * Selection flourish: a dotted yellow trail draws from the current node
   * to the chosen one, then the chosen node spins around its vertical axis
   * (a horizontal "coin flip") for ~0.8s, swelling slightly, then we commit
   * and enter it. Map input is frozen for the duration so a second tap
   * can't queue a second transition, and `selecting` guards against
   * re-entry.
   */
  private selectNode(run: RunState, node: MapNode, nodeBody: Phaser.GameObjects.Container) {
    if (this.selecting) return;
    this.selecting = true;
    this.input.enabled = false;
    nodeBody.setDepth(50); // float above neighbouring nodes/edges during the spin

    const map = run.map!;
    const { width, height } = this.scale;
    const rowHeight = 158;
    const baseY = height - 130;
    const cur = run.currentNodeId
      ? map.nodes.find((n) => n.id === run.currentNodeId) ?? null
      : null;

    const startSpin = () => {
      const drive = { t: 0 };
      this.tweens.killTweensOf(nodeBody);
      this.tweens.add({
        targets: drive,
        t: 1,
        duration: 800,
        ease: "Cubic.InOut",
        onUpdate: () => {
          const spins = 2; // two full horizontal revolutions
          const pop = 1 + 0.2 * Math.sin(drive.t * Math.PI); // swell out then settle
          nodeBody.scaleX = Math.cos(drive.t * Math.PI * 2 * spins) * pop;
          nodeBody.scaleY = pop;
        },
        onComplete: () => {
          nodeBody.setScale(1);
          // Re-enable input + clear the guard before committing. Most paths
          // immediately start a new scene (which re-gates its own input),
          // but the boss node opens a confirm dialog instead — restoring
          // state here keeps the map usable if the player backs out.
          this.input.enabled = true;
          this.selecting = false;
          this.enterNode(run, node);
        },
      });
    };

    // If the player is moving FROM somewhere (the normal case), draw the
    // dotted trail first then spin. On a fresh floor with no current node
    // yet, skip the trail and spin immediately.
    if (cur) {
      const a = nodePos(cur, map, baseY, rowHeight, width);
      const b = nodePos(node, map, baseY, rowHeight, width);
      this.animateSelectionLine(a, b, startSpin);
    } else {
      startSpin();
    }
  }

  private enterNode(run: RunState, node: MapNode) {
    // Boss path is gated by a confirm dialog — Mortimer is fully restored
    // before the climactic fight, so we want the player to see the heal AND
    // get a last chance to back out.
    if (node.kind === "boss") {
      this.showBossDialog(run, node);
      return;
    }
    run.currentNodeId = node.id;
    node.visited = true;
    switch (node.kind) {
      case "combat":
      case "elite":
        this.scene.start("Combat", { source: "map", nodeKind: node.kind });
        break;
      case "shop":   this.scene.start("Shop"); break;
      case "grave":  this.scene.start("Grave"); break;
      case "forge":  this.scene.start("Forge"); break;
      case "shrine": this.scene.start("Shrine"); break;
      case "well":   this.scene.start("Well"); break;
    }
  }

  /**
   * Modal shown when the player commits to a boss node. Communicates the
   * "fully restored" heal that happens before the fight, with a prominent
   * Begin button and a Not Yet escape hatch so the player can still browse
   * the map / shop / forge before stepping into the throne room.
   *
   * State (currentNodeId, visited, HP heal) is only mutated on confirm —
   * so cancelling leaves the run untouched.
   */
  private showBossDialog(run: RunState, node: MapNode) {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    const DEPTH = 9000;

    const dim = this.add.rectangle(cx, cy, width, height, 0x000000, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH)
      .setInteractive();
    this.tweens.add({ targets: dim, fillAlpha: 0.78, duration: 200 });

    const panelW = 680, panelH = 360;
    const panel = this.add.rectangle(cx, cy, panelW, panelH, C.bgSoft, 1)
      .setStrokeStyle(3, C.blood)
      .setScrollFactor(0)
      .setDepth(DEPTH + 1);

    const title = this.add.text(cx, cy - 120, "Before the Throne", {
      fontFamily: "Lora", fontSize: "34px", color: S.amber, fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);

    const body = this.add.text(
      cx, cy - 50,
      "Mortimer steels himself. Wounds knit; mana cools.\nHe is fully restored for the fight ahead.",
      {
        fontFamily: "Lora", fontSize: "20px", color: S.parchHi,
        align: "center", wordWrap: { width: panelW - 80 },
      },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);

    const healAmount = run.maxHp - run.hp;
    const healStr = healAmount > 0
      ? `✚  HP  ${run.hp}  →  ${run.maxHp}    (+${healAmount})`
      : `✚  HP  ${run.maxHp} / ${run.maxHp}    ·  ready`;
    const healLabel = this.add.text(cx, cy + 20, healStr, {
      fontFamily: "Lora", fontSize: "24px", color: S.bloodHi, fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);

    // --- Begin button (primary, blood)
    const btnY = cy + 110;
    const btnW = 240, btnH = 72;
    const beginCx = cx - 140;
    const cancelCx = cx + 140;

    const beginBg = this.add.rectangle(beginCx, btnY, btnW, btnH, C.blood, 1)
      .setStrokeStyle(3, C.amber)
      .setScrollFactor(0)
      .setDepth(DEPTH + 2);
    const beginText = this.add.text(beginCx, btnY, "Begin →", {
      fontFamily: "Lora", fontSize: "26px", color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3);
    const beginZone = this.add.zone(beginCx, btnY, btnW, btnH)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(DEPTH + 4);

    // --- Cancel button (secondary, purple)
    const cancelBg = this.add.rectangle(cancelCx, btnY, btnW, btnH, C.purple, 1)
      .setStrokeStyle(3, C.amber, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH + 2);
    const cancelText = this.add.text(cancelCx, btnY, "Not yet", {
      fontFamily: "Lora", fontSize: "26px", color: S.dim,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3);
    const cancelZone = this.add.zone(cancelCx, btnY, btnW, btnH)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(DEPTH + 4);

    const cleanup = () => {
      dim.destroy(); panel.destroy(); title.destroy(); body.destroy(); healLabel.destroy();
      beginBg.destroy(); beginText.destroy(); beginZone.destroy();
      cancelBg.destroy(); cancelText.destroy(); cancelZone.destroy();
      // Restore the map's androidback handler (we overrode it below).
      this.events.off("androidback");
      this.events.on("androidback", () => this.scene.start("MainMenu"));
    };

    beginZone.on("pointerdown", () => {
      cleanup();
      run.hp = run.maxHp;
      run.currentNodeId = node.id;
      node.visited = true;
      this.scene.start("Combat", { source: "map", nodeKind: "boss" });
    });
    cancelZone.on("pointerdown", cleanup);

    // Hardware back closes the dialog (rather than exiting the map).
    this.events.off("androidback");
    this.events.on("androidback", cleanup);
  }
}

function nodePos(node: MapNode, map: FloorMap, baseY: number, rowHeight: number, width: number) {
  const rowCount = map.nodes.filter((n) => n.row === node.row).length;
  const span = Math.min(width - 200, 800);
  const startX = (width - span) / 2;
  const slot = rowCount === 1 ? span / 2 : (node.col * span) / (rowCount - 1);
  return { x: startX + slot, y: baseY - node.row * rowHeight };
}

function floorName(floor: number): string {
  switch (floor) {
    case 1: return "The Crypt";
    case 2: return "The Castle Halls";
    case 3: return "The Throne Room";
    // Cursed-forest biome — five floors leading to the Heart of Rot.
    case 4: return "The Outer Grove";
    case 5: return "The Mushroom Hollow";
    case 6: return "The Black Mire";
    case 7: return "The Bone Thicket";
    case 8: return "The Heart of Rot";
    default: return "The Crypt";
  }
}
