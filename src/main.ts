import Phaser from "phaser";

// Text rendering recipe — canvas2D Text with a modern screen-optimised
// webfont (Cormorant Garamond, loaded via index.html). The earlier
// BitmapText migration produced soft/scaled glyphs (a 96 px bake
// downsampled to 14 px display via bilinear sampling loses detail no
// matter what), so we're back to canvas Text — but now with the right
// font and the right rendering knobs:
//
//   1. The webfont is loaded BEFORE Phaser.Game is constructed (see the
//      `document.fonts.load(...)` await below), so glyphs are rasterised
//      against Cormorant Garamond, not the system serif fallback. No
//      glyph-shift halfway through boot.
//   2. setResolution = devicePixelRatio. Source texture matches screen
//      pixel density 1:1 — no upscale fuzz, no downscale blur.
//   3. LINEAR filter on text textures so any residual sub-pixel sampling
//      at the GPU level interpolates cleanly between source pixels.
//   4. roundPixels = true (in render config) snaps glyph positions to
//      integer pixels, killing the half-pixel smear canvas2D-rendered
//      text otherwise picks up at fractional positions.
{
  const factoryProto = Phaser.GameObjects.GameObjectFactory.prototype as unknown as {
    text: (...args: unknown[]) => Phaser.GameObjects.Text;
  };
  const original = factoryProto.text;
  factoryProto.text = function (...args: unknown[]) {
    const t = original.apply(this, args);
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    t.setResolution(ratio);
    const tex = t.texture as Phaser.Textures.Texture | undefined;
    if (tex && tex.source && tex.source[0]) {
      tex.source[0].setFilter(0 /* Phaser.Textures.FilterMode.LINEAR */);
    }
    return t;
  };
}

import { BootScene } from "@/scenes/BootScene";
import { MainMenuScene } from "@/scenes/MainMenuScene";
import { DreamScene } from "@/scenes/DreamScene";
import { ForestTransitionScene } from "@/scenes/ForestTransitionScene";
import { ClassSelectScene } from "@/scenes/ClassSelectScene";
import { CombatScene } from "@/scenes/CombatScene";
import { MapScene } from "@/scenes/MapScene";
import { RewardScene } from "@/scenes/RewardScene";
import { BattleSummaryScene } from "@/scenes/BattleSummaryScene";
import { HumanityScene } from "@/scenes/HumanityScene";
import { ShopScene } from "@/scenes/ShopScene";
import { GraveScene } from "@/scenes/GraveScene";
import { ForgeScene } from "@/scenes/ForgeScene";
import { ShrineScene } from "@/scenes/ShrineScene";
import { WellScene } from "@/scenes/WellScene";
import { GameOverScene } from "@/scenes/GameOverScene";
import { VictoryScene } from "@/scenes/VictoryScene";
import { GalleryScene } from "@/scenes/GalleryScene";
import { DeckScene } from "@/scenes/DeckScene";
import { MetaShopScene } from "@/scenes/MetaShopScene";
import { HeroPickScene } from "@/scenes/HeroPickScene";

// DPR-aware: zoom multiplies the canvas backbuffer so it renders at physical
// pixels. Capped at 2 to keep fillrate sane on 3×/4× displays where the eye
// can't tell the difference anyway.
const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

// Smartphone detection: touch-capable AND short axis < 600 CSS px. Tablets
// (short axis 768+) fall through to the desktop design path so their bigger
// screens still get the full UI density.
const IS_SMARTPHONE = (() => {
  const touch =
    "ontouchstart" in window ||
    (navigator.maxTouchPoints !== undefined && navigator.maxTouchPoints > 0);
  const shortAxis = Math.min(window.innerWidth, window.innerHeight);
  return touch && shortAxis > 0 && shortAxis < 600;
})();

// Design space height. We compute the width to match the device's actual
// aspect ratio so Scale.FIT produces no pillarbox on wider phones (20:9,
// 19.5:9). Clamped so weird ultrawide or near-square viewports don't push UI
// elements wildly off-design.
//
// Smartphones get 2/3 the design dimensions (was 1/2) so Phaser FIT-scales
// the same physical screen using fewer design pixels — meaning every UI
// element (cards, buttons, text, map nodes…) renders ~1.5× larger on screen
// than the desktop/tablet density (was ~2×, which felt overbearing). This
// is a global handle: any scene that lays out against
// `this.scale.width/height` adapts automatically; the few that use hard-coded
// vertical offsets ("y = 160", "height - 360") may need tweaks.
const DESIGN_HEIGHT     = IS_SMARTPHONE ? 533  : 800;
const MIN_DESIGN_WIDTH  = IS_SMARTPHONE ? 853  : 1280;
const MAX_DESIGN_WIDTH  = IS_SMARTPHONE ? 1467 : 2200;

// Source the aspect from the actual #game element rather than window.innerWidth.
// On Capacitor Android, immersive mode (status bar + nav bar hidden) kicks in
// after MainActivity.onWindowFocusChanged, and window.innerWidth can lag the
// real viewport. getBoundingClientRect on the 100vw/100vh #game div reflects
// what Phaser actually has to fill.
function designSizeForViewport(): { width: number; height: number } {
  const el = document.getElementById("game");
  const rect = el ? el.getBoundingClientRect() : null;
  const w = rect && rect.width  > 0 ? rect.width  : (window.innerWidth  || 1280);
  const h = rect && rect.height > 0 ? rect.height : (window.innerHeight || 800);
  const aspect = w / h;
  const width = Math.round(
    Math.min(MAX_DESIGN_WIDTH, Math.max(MIN_DESIGN_WIDTH, DESIGN_HEIGHT * aspect))
  );
  return { width, height: DESIGN_HEIGHT };
}
const initialSize = designSizeForViewport();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b0a16",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: initialSize.width,
    height: initialSize.height,
    zoom: dpr,
  },
  scene: [
    BootScene,
    MainMenuScene,
    DreamScene,
    ForestTransitionScene,
    ClassSelectScene,
    MapScene,
    CombatScene,
    BattleSummaryScene,
    RewardScene,
    HumanityScene,
    ShopScene,
    GraveScene,
    ForgeScene,
    ShrineScene,
    WellScene,
    GameOverScene,
    VictoryScene,
    GalleryScene,
    DeckScene,
    MetaShopScene,
    HeroPickScene,
  ],
  render: {
    pixelArt: false,
    antialias: true,
    antialiasGL: true,
    // roundPixels = true: snap glyph positions to integer screen pixels.
    // The earlier note here said this fights sub-pixel sampling on rotated
    // text — but the result of NOT rounding was that Phaser-rendered text
    // came out soft/smeared on phone canvases (canvas2D doesn't do real
    // subpixel anti-aliasing the way browser DOM text does). Rounded
    // positions + LINEAR filter + DPR-matched setResolution gives clean
    // glyph edges. Rotated text loses a tiny bit of smoothness but very
    // little of the game's text is rotated anyway.
    roundPixels: true,
  },
};

// Block Phaser startup until the UI webfont is actually loaded — otherwise
// the very first frames get rasterised against the system serif fallback,
// then re-rasterised once the webfont arrives (visible glyph-shape pop).
// `document.fonts.load(spec)` returns a Promise that resolves when the
// browser has the font ready for canvas2D drawing. We request a small
// sample of weights/styles we use; the rest stream in from the stylesheet
// link in index.html. Falls back gracefully on browsers without the
// FontFaceSet API.
function loadUiFont(): Promise<unknown> {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all([
    document.fonts.load('400 16px "Lora"'),
    document.fonts.load('700 16px "Lora"'),
    document.fonts.load('italic 400 16px "Lora"'),
    document.fonts.load('italic 700 16px "Lora"'),
  ]).catch(() => undefined);
}

let game: Phaser.Game;
loadUiFont().then(() => {
  game = new Phaser.Game(config);
});

// Recompute design width on viewport changes. Active scenes restart so they
// re-run their layout against the new dimensions — simpler than threading a
// resize listener through every scene.
//
// Sources of resize (Android-relevant):
//  - window.resize       — desktop dev / orientation flips
//  - ResizeObserver      — Capacitor: fires when the WebView's viewport actually
//                          changes (e.g. immersive mode hiding system bars
//                          AFTER the game was constructed). The window.resize
//                          event is unreliable in that window on some devices.
//  - delayed re-check    — final safety net for any device where the immersive
//                          transition happens silently within the first ~500ms.
//
// Critically, all four signal sources funnel through `scheduleApplyViewportSize`
// rather than calling `applyViewportSize` directly. On devices that fire the
// resize burst at a higher frequency (observed: Pixel 10 emits notably more
// ResizeObserver events than Pixel 6 during the immersive transition), each
// raw invocation would call `s.scene.restart()` on every active scene — which
// in turn destroys any tweens / timers the just-mounted scene had scheduled
// (notably MapScene's intro pan). Debouncing coalesces the burst into a
// single restart once the viewport has been stable for `RESIZE_DEBOUNCE_MS`.
function applyViewportSize() {
  // `game` may still be undefined if a resize signal fires before the
  // webfont has loaded and Phaser was constructed. In that case the
  // initial size is already correct (designSizeForViewport ran on the
  // current viewport just before Phaser.Game was scheduled), so we can
  // safely skip.
  if (!game) return;
  const next = designSizeForViewport();
  if (next.width === game.scale.width && next.height === game.scale.height) return;
  game.scale.resize(next.width, next.height);
  const actives = game.scene.getScenes(true);
  for (const s of actives) s.scene.restart();
}

const RESIZE_DEBOUNCE_MS = 120;
let resizeTimer: number | null = null;
function scheduleApplyViewportSize() {
  if (resizeTimer !== null) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null;
    applyViewportSize();
  }, RESIZE_DEBOUNCE_MS);
}

window.addEventListener("resize", scheduleApplyViewportSize);

const gameEl = document.getElementById("game");
if (gameEl && typeof ResizeObserver !== "undefined") {
  new ResizeObserver(scheduleApplyViewportSize).observe(gameEl);
}

// Capacitor's onWindowFocusChanged → immersive mode runs on the native side
// after the WebView has already loaded. Re-check after a couple of frames so
// the canvas catches the now-larger viewport. These also go through the
// debouncer so they merge with any ResizeObserver burst in flight.
requestAnimationFrame(() => requestAnimationFrame(scheduleApplyViewportSize));
window.setTimeout(scheduleApplyViewportSize, 500);

/**
 * Android hardware back-button routing. Each scene that wants to handle it
 * registers an event listener via `this.events.on("androidback", fn)`. When
 * the back gesture/button fires, we route to the topmost ACTIVE scene's
 * handler — falling back to App.exitApp() if no scene wants it.
 */
import("@capacitor/app").then(({ App }) => {
  App.addListener("backButton", () => {
    if (!game) { App.exitApp(); return; }
    const scenes = game.scene.getScenes(true); // active scenes, top-most last
    for (let i = scenes.length - 1; i >= 0; i--) {
      const s = scenes[i];
      if (s.events.listenerCount("androidback") > 0) {
        s.events.emit("androidback");
        return;
      }
    }
    // Nothing claimed it — fall back to default (close the app).
    App.exitApp();
  });
}).catch(() => {
  // Plugin missing (running in dev/browser) — no-op.
});
