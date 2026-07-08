// Chunky pixel-art scene backgrounds.
//
// The art is authored at a low native resolution (see tools/gen.mjs) and
// displayed with NEAREST filtering so each source pixel becomes a crisp,
// chunky on-screen block — true pixel art that stays sharp at any size and on
// any phone. Landscape scenes are full-bleed and stretch to the canvas (the
// compositions are symmetric/centred so horizontal stretch reads as intended);
// the tall map frames are placed by MapScene into its parchment rect.
import Phaser from "phaser";
import { C } from "@/ui/palette";

/** key → file under public/art/. Loaded once in BootScene.preload. */
export const BG_ASSETS: ReadonlyArray<readonly [string, string]> = [
  ["combat-crypt", "combat-crypt.png"],
  ["combat-castle", "combat-castle.png"],
  ["combat-throne", "combat-throne.png"],
  // Cursed forest combat backdrops (floors 4-8). Authored for the forest
  // biome that runs after Gorgonzola; loaded here so they're available
  // whenever the gameplay wiring lands them on those floors.
  ["combat-grove",  "combat-grove.png"],
  ["combat-hollow", "combat-hollow.png"],
  ["combat-mire",   "combat-mire.png"],
  ["combat-bones",  "combat-bones.png"],
  ["combat-heart",  "combat-heart.png"],
  ["bg-forge", "forge.png"],
  ["bg-well", "well.png"],
  ["bg-shrine", "shrine.png"],
  ["bg-grave", "grave.png"],
  ["bg-shop", "shop.png"],
  ["bg-meta-shop", "meta-shop.png"],
  ["bg-menu", "menu.png"],
  ["bg-dream", "dream.png"],
  ["bg-gameover", "gameover.png"],
  ["bg-victory", "victory.png"],
] as const;

/** How many fx frames each backdrop ships with (see tools/gen.mjs FX_JITTERS). */
export const FX_FRAME_COUNT = 3;

/** Preload every pixel-art background AND its 3 fx flicker frames.
 *  Call from BootScene.preload(). Fx frames are tiny (mostly transparent
 *  pixels) so the extra load cost is negligible. */
export function preloadBackgrounds(scene: Phaser.Scene): void {
  for (const [key, file] of BG_ASSETS) {
    scene.load.image(key, `art/${file}`);
    const base = file.replace(/\.png$/, "");
    for (let i = 0; i < FX_FRAME_COUNT; i++) {
      scene.load.image(`${key}-fx-${i}`, `art/${base}-fx-${i}.png`);
    }
  }
}

/**
 * Force NEAREST sampling on every loaded background texture so upscaling keeps
 * hard pixel edges (the game runs antialias:true, whose default is LINEAR —
 * which would smear the chunky pixels into mush). Call from BootScene.create()
 * after the loader has finished. Text/cards keep their own LINEAR filter; this
 * only touches the background keys.
 */
export function applyPixelFilters(scene: Phaser.Scene): void {
  const baseKeys = BG_ASSETS.map(([k]) => k);
  // Map frames are loaded by BootScene under these keys; pixelate them too.
  // Floors 1-3 are crypt/castle/throne (the original biome); 4-8 are the
  // cursed-forest biome (grove/hollow/mire/bones/heart).
  for (let f = 1; f <= 8; f++) baseKeys.push(`map-backdrop-${f}`);
  // Fx flicker frames need NEAREST too — otherwise the upscaled flames
  // smear instead of staying chunky-pixel-art-sharp.
  const keys = [
    ...baseKeys,
    ...baseKeys.flatMap((k) =>
      Array.from({ length: FX_FRAME_COUNT }, (_, i) => `${k}-fx-${i}`),
    ),
  ];
  for (const key of keys) {
    if (scene.textures.exists(key)) {
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }
}

export interface SceneBgOpts {
  /** Dark wash drawn over the art so foreground panels/text stay readable. */
  dim?: number;
  /** Depth for the image (default -100). The dim sits at depth+1. */
  depth?: number;
}

/**
 * Add a full-bleed pixel-art background to a scene, stretched to fill the
 * canvas, with an optional dark overlay for legibility. Returns the image (or
 * null if the texture is missing, so callers degrade gracefully to the solid
 * C.bg fill they already paint).
 */
export function addBackground(
  scene: Phaser.Scene,
  key: string,
  opts: SceneBgOpts = {},
): Phaser.GameObjects.Image | null {
  const { width, height } = scene.scale;
  const depth = opts.depth ?? -100;
  if (!scene.textures.exists(key)) return null;
  const img = scene.add
    .image(width / 2, height / 2, key)
    .setDisplaySize(width, height)
    .setDepth(depth)
    .setScrollFactor(0);
  if (opts.dim && opts.dim > 0) {
    scene.add
      .rectangle(width / 2, height / 2, width, height, C.bg, opts.dim)
      .setDepth(depth + 1)
      .setScrollFactor(0);
  }
  // Fx flicker layer — only attached if the fx textures actually loaded.
  // Lives immediately above the base image (and below the dim wash if any)
  // so the dim still applies uniformly to base + flames together.
  attachFxLayer(scene, key, img, depth);
  return img;
}

/**
 * Layer N animated fx frames above a backdrop and cycle them to produce a
 * gentle flicker effect on the flame-coloured pixels. Frames share the
 * source coordinate space with the base PNG, so alignment is automatic
 * regardless of how the base is positioned / stretched — solves the
 * eyeball-derived-fractions problem of the old Graphics overlay approach.
 *
 * Called automatically by `addBackground`. Manual backdrop loaders (e.g.
 * MapScene's parchment-rect backdrop, CombatScene's full-bleed level art)
 * can call this directly after placing their base image.
 */
export function attachFxLayer(
  scene: Phaser.Scene,
  key: string,
  base: Phaser.GameObjects.Image,
  baseDepth: number,
): Phaser.GameObjects.Image | null {
  // All N frames must be present — partial loads would cycle to a missing
  // texture and show garbage. Better to skip the layer entirely than to
  // show a broken animation.
  for (let i = 0; i < FX_FRAME_COUNT; i++) {
    if (!scene.textures.exists(`${key}-fx-${i}`)) return null;
  }
  const fx = scene.add
    .image(base.x, base.y, `${key}-fx-0`)
    .setDisplaySize(base.displayWidth, base.displayHeight)
    .setDepth(baseDepth + 0.5)
    .setScrollFactor(base.scrollFactorX, base.scrollFactorY);
  // Track current frame on the image itself so multiple fx layers in one
  // scene (rare, but possible) don't share state through a closure-captured
  // variable. The `__fxLayer` flag lets scenes that walk children.list
  // (notably CombatScene's playStartOfCombat sweep) identify and skip the
  // fx layer instead of caging it into their generic "hide everything in
  // the centre" pass.
  fx.setData("frame", 0);
  fx.setData("__fxLayer", true);
  // Cycle 0 → 1 → 2 → 1 → 0 → 1 → 2... a 4-step ping-pong that reads as
  // gentle breathing rather than the harsher 0→1→2 wrap-around. ~140 ms
  // per frame matches the natural flicker rate of a candle.
  //
  // Implementation note: we use the browser's setInterval rather than
  // scene.time.addEvent because some Phaser scenes (especially ones started
  // via game.scene.start outside the normal flow, like after a Vite HMR
  // reload) end up with a stalled Time plugin whose `now` clock never
  // advances. setInterval uses the browser clock directly and side-steps
  // that whole class of issues; we still hook the scene shutdown event to
  // clear the interval so we don't leak.
  const sequence = [0, 1, 2, 1];
  let step = 0;
  const handle = window.setInterval(() => {
    if (!fx.scene || !fx.active) {
      window.clearInterval(handle);
      return;
    }
    step = (step + 1) % sequence.length;
    const f = sequence[step];
    fx.setTexture(`${key}-fx-${f}`);
  }, 140);
  fx.once("destroy", () => window.clearInterval(handle));
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.clearInterval(handle));
  return fx;
}
