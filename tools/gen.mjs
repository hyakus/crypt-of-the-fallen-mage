// Scene composers → PNG. Run: `node tools/gen.mjs [name]` (no arg = all).
// Outputs to public/art/. Landscape scenes are 16:10 (320×200); the tall map
// frames are 10:16 (200×320). All are displayed with NEAREST filtering, so the
// low native resolution reads as deliberate chunky pixel art.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas, rng, lighten, darken, mix } from "./pixellib.mjs";
import { PAL, LIGHT } from "./palette.mjs";
import * as P from "./parts.mjs";

const OUT = path.resolve(fileURLToPath(new URL("../public/art", import.meta.url)));

const W = 320, H = 200;        // landscape 16:10
const MW = 200, MH = 320;      // map portrait 10:16

// ============================================================================
// COMBAT — FLOOR 1: THE CRYPT
// ============================================================================
function combatCrypt() {
  const cv = new Canvas(W, H);
  const r = rng(101);
  const stone = PAL.stone;

  // back wall + vault
  P.backWall(cv, 0, 150, stone, r);
  P.vault(cv, 46, stone);

  // far doorway centre-back (the path onward)
  P.archway(cv, W / 2, 150, 46, 70, stone, PAL.void);
  cv.glowE(W / 2, 150, 30, 40, PAL.purple[3], 0.16, 2);

  // flanking sarcophagi against the back wall
  for (const sx of [70, 250]) {
    cv.block(sx - 26, 104, 52, 30, stone[2], { hi: stone[4], lo: stone[0] });
    cv.block(sx - 30, 98, 60, 8, stone[3], { hi: stone[4], lo: stone[1] });
    // carved cross relief
    cv.rect(sx - 2, 110, 4, 18, PAL.bone[2], 0.5);
    cv.rect(sx - 7, 116, 14, 4, PAL.bone[2], 0.5);
  }

  // wall niches with skulls
  for (const nx of [120, 200]) {
    cv.block(nx - 9, 60, 18, 26, PAL.void, { hi: stone[1], lo: stone[0] });
    P.skull(cv, nx, 74, 5);
  }

  // pillars flanking the whole scene
  P.pillar(cv, 22, 30, 150, 22, stone);
  P.pillar(cv, W - 22, 30, 150, 22, stone);

  // floor
  P.floor(cv, 150, stone, LIGHT.candle, r);

  // candles + braziers for warm pools of light
  P.candle(cv, 70, 150, 12, 1.2);
  P.candle(cv, 250, 150, 12, 1.2);
  P.brazier(cv, 40, 176, 1.1, PAL.flame);
  P.brazier(cv, W - 40, 176, 1.1, PAL.flame);

  // hanging bone chandelier behind the centre (above where the sigil sits)
  cv.vline(W / 2, 46, 66, PAL.iron[1], 0.7);
  cv.ring(W / 2, 68, 22, PAL.iron[2], 0.85, 1);
  cv.ellipse(W / 2, 68, 22, 4, PAL.iron[1], 0.0); // (ring only — no solid plate)
  for (const dx of [-18, 0, 18]) {
    cv.vline(W / 2 + dx, 64, 70, PAL.iron[1], 0.6);
    P.candle(cv, W / 2 + dx, 64, 5, 0.7);
  }

  // cobwebs
  P.cobweb(cv, "tl", 46);
  P.cobweb(cv, "tr", 46);

  // ambient candle motes + dust
  P.motes(cv, 0, 60, W, 110, PAL.flame[4], 40, r, 0.5);

  // mood: warm floor glow rising, cool top
  cv.glowE(W / 2, H, W * 0.7, 70, PAL.flame[2], 0.1, 2);
  cv.vignette(0.6, 2.0);
  return cv;
}

// ============================================================================
// COMBAT — FLOOR 2: THE CASTLE HALLS  (twilight, ghost-blue, lingering amber)
// ============================================================================
function combatCastle() {
  const cv = new Canvas(W, H);
  const r = rng(202);
  const sand = PAL.sand;

  P.backWall(cv, 0, 150, sand, r);
  // dark wood-beam ceiling
  cv.vgradStops(0, 0, W, 40, [[0, PAL.void], [1, PAL.wood[0]]]);
  for (let x = 24; x < W; x += 40) cv.vline(x, 0, 40, darken(PAL.wood[0], 0.3), 0.6);

  // tall arched twilight windows letting in cold ghost-blue dusk
  for (const wx of [80, 240]) {
    const ww = 34, wy0 = 24, wy1 = 120;
    // recess
    cv.block(wx - ww / 2 - 3, wy0 - 3, ww + 6, wy1 - wy0 + 6, sand[1], { hi: sand[3], lo: sand[0] });
    // sky gradient (dusk → ghost glow at horizon)
    cv.vgradStops(wx - ww / 2, wy0, ww, wy1 - wy0, [
      [0, PAL.ghost[0]], [0.5, PAL.ghost[2]], [1, mix(PAL.ghost[3], PAL.flame[2], 0.3)],
    ]);
    // arched top mask (carve corners back to wall)
    for (let y = wy0; y < wy0 + 16; y++) for (let x = wx - ww / 2; x < wx + ww / 2; x++) {
      const t = (y - wy0) / 16;
      if (Math.abs(x - wx) > (ww / 2) * t) cv.px(x, y, sand[1]);
    }
    // mullions
    cv.vline(wx, wy0, wy1, sand[0], 0.8);
    cv.hline(wx - ww / 2, wx + ww / 2, wy0 + 40, sand[0], 0.7);
    cv.hline(wx - ww / 2, wx + ww / 2, wy0 + 70, sand[0], 0.7);
    // spill of cold light onto the wall/floor
    cv.glowE(wx, wy1, 30, 50, PAL.ghost[4], 0.12, 2);
  }

  // central raised dais doorway onward
  P.archway(cv, W / 2, 150, 40, 64, sand, PAL.void);
  cv.glowE(W / 2, 150, 26, 36, PAL.ghost[2], 0.14, 2);

  // hanging blood banners with gold emblem
  P.banner(cv, 158, 16, 18, 70, PAL.blood[2], PAL.gold[4]);
  P.banner(cv, W - 158, 16, 18, 70, PAL.blood[2], PAL.gold[4]);

  // grand pillars
  P.pillar(cv, 26, 24, 150, 26, sand);
  P.pillar(cv, W - 26, 24, 150, 26, sand);

  // floor + a long red carpet down the centre
  P.floor(cv, 150, sand, LIGHT.amber, r);
  cv.vgradStops(W / 2 - 26, 150, 52, H - 150, [[0, PAL.blood[1]], [1, PAL.blood[2]]]);
  cv.vline(W / 2 - 26, 150, H - 1, PAL.gold[2], 0.5);
  cv.vline(W / 2 + 25, 150, H - 1, PAL.gold[2], 0.5);

  // warm wall torches (amber) contrasting the cold windows
  P.torch(cv, 120, 70, 1.1, PAL.flame);
  P.torch(cv, 200, 70, 1.1, PAL.flame);

  P.cobweb(cv, "tl", 40);
  P.cobweb(cv, "tr", 40);
  P.motes(cv, 0, 40, W, 100, PAL.ghost[4], 30, r, 0.4);
  cv.glowE(W / 2, H, W * 0.7, 70, PAL.flame[2], 0.08, 2);
  cv.vignette(0.58, 2.0);
  return cv;
}

// ============================================================================
// COMBAT — FLOOR 3: THE THRONE ROOM  (basalt, blood, dread)
// ============================================================================
function combatThrone() {
  const cv = new Canvas(W, H);
  const r = rng(303);
  const bas = PAL.basalt;

  P.backWall(cv, 0, 138, bas, r);
  cv.vgradStops(0, 0, W, 36, [[0, PAL.void], [1, bas[1]]]);

  // a vast dark throne on a stepped dais, dead centre back
  const tx = W / 2;
  // dais steps
  for (let i = 0; i < 3; i++) {
    const sw = 120 - i * 24, sh = 6;
    cv.block(tx - sw / 2, 132 - i * sh, sw, sh, bas[2], { hi: bas[3], lo: bas[0] });
  }
  // throne back (tall slab) with skull crest
  cv.block(tx - 22, 60, 44, 60, bas[1], { hi: bas[3], lo: PAL.void });
  cv.block(tx - 28, 54, 56, 10, bas[2], { hi: bas[4], lo: bas[0] });
  // jagged crown spikes
  for (let i = -2; i <= 2; i++) {
    const sx = tx + i * 11;
    cv.line(sx, 54, sx, 44 - Math.abs(i) * 2, bas[3]);
  }
  P.skull(cv, tx, 70, 7, PAL.bone);
  // seat shadow
  cv.rect(tx - 16, 100, 32, 18, PAL.void, 0.8);
  cv.glowE(tx, 90, 34, 40, PAL.blood[3], 0.18, 2);

  // massive columns
  P.pillar(cv, 30, 20, 138, 30, bas);
  P.pillar(cv, W - 30, 20, 138, 30, bas);
  P.pillar(cv, 92, 30, 138, 18, bas);
  P.pillar(cv, W - 92, 30, 138, 18, bas);

  // towering blood banners
  P.banner(cv, 60, 10, 22, 96, PAL.blood[1], PAL.bone[3]);
  P.banner(cv, W - 60, 10, 22, 96, PAL.blood[1], PAL.bone[3]);

  // floor — dark polished basalt with a blood runner
  P.floor(cv, 138, bas, LIGHT.blood, r);
  cv.vgradStops(W / 2 - 30, 138, 60, H - 138, [[0, PAL.blood[1]], [1, PAL.blood[0]]]);

  // blood-red braziers flanking the dais
  P.brazier(cv, 116, 150, 1.2, PAL.flame);
  P.brazier(cv, W - 116, 150, 1.2, PAL.flame);

  // dread purple-blood ambience + pooling shadow
  cv.glowE(W / 2, H, W * 0.8, 80, PAL.blood[1], 0.14, 2);
  P.motes(cv, 0, 40, W, 100, PAL.blood[4], 26, r, 0.4);
  cv.vignette(0.66, 1.9, PAL.purple[0]);
  return cv;
}

// ============================================================================
// MAP BACKDROPS — tall portrait, goal at top → start at bottom
// ============================================================================
function mapColumnHall(seed, ramp, light, opts = {}) {
  const cv = new Canvas(MW, MH);
  const r = rng(seed);
  // deep vertical gradient: cold dark top, warmer pooled bottom
  cv.vgradStops(0, 0, MW, MH, [
    [0, PAL.void], [0.4, ramp[0]], [0.8, ramp[1]], [1, darken(ramp[1], 0.2)],
  ]);
  // receding columns down both sides (smaller/closer at top)
  const cols = 5;
  for (let i = 0; i < cols; i++) {
    const t = i / (cols - 1);
    const y = 40 + t * (MH - 80);
    const pw = 10 + t * 18;
    const inset = 30 - t * 16;
    P.pillar(cv, inset, y - 30, y + 30, pw, ramp);
    P.pillar(cv, MW - inset, y - 30, y + 30, pw, ramp);
  }
  // floor strip near the bottom where the player starts
  P.floor(cv, MH - 70, ramp, light, r);
  // the GOAL at the very top
  if (opts.goal) opts.goal(cv, r);
  // light sources
  if (opts.lights) opts.lights(cv, r);
  P.motes(cv, 0, 0, MW, MH, light, 40, r, 0.4);
  cv.vignette(0.55, 1.8);
  return cv;
}

function mapCrypt() {
  return mapColumnHall(11, PAL.stone, PAL.flame[4], {
    goal(cv) {
      // ominous doorway with a skull keystone — the way deeper / boss
      P.archway(cv, MW / 2, 56, 44, 56, PAL.stone, PAL.void);
      P.skull(cv, MW / 2, 14, 7);
      P.crossbones(cv, MW / 2, 14, 12);
      cv.glowE(MW / 2, 50, 26, 30, PAL.purple[3], 0.18, 2);
    },
    lights(cv) {
      for (const y of [120, 200, 280]) {
        P.candle(cv, 22, y, 10, 1);
        P.candle(cv, MW - 22, y, 10, 1);
      }
      P.brazier(cv, MW / 2, MH - 24, 1.1);
    },
  });
}
function mapCastle() {
  return mapColumnHall(12, PAL.sand, PAL.ghost[4], {
    goal(cv) {
      // tall ghost-lit window / portal at the top of the stair
      cv.vgradStops(MW / 2 - 24, 8, 48, 56, [[0, PAL.ghost[0]], [1, PAL.ghost[4]]]);
      cv.rectb(MW / 2 - 27, 5, 54, 62, PAL.sand[1], 1, 3);
      cv.vline(MW / 2, 8, 64, PAL.sand[0], 0.7);
      cv.glowE(MW / 2, 50, 30, 36, PAL.ghost[4], 0.2, 2);
    },
    lights(cv) {
      P.banner(cv, 40, 80, 16, 60, PAL.blood[2], PAL.gold[4]);
      P.banner(cv, MW - 40, 80, 16, 60, PAL.blood[2], PAL.gold[4]);
      for (const y of [150, 240]) { P.torch(cv, 30, y, 1); P.torch(cv, MW - 30, y, 1); }
    },
  });
}
function mapThrone() {
  return mapColumnHall(13, PAL.basalt, PAL.blood[4], {
    goal(cv) {
      // the throne at the summit
      cv.block(MW / 2 - 18, 18, 36, 44, PAL.basalt[1], { hi: PAL.basalt[3], lo: PAL.void });
      for (let i = -2; i <= 2; i++) cv.line(MW / 2 + i * 9, 18, MW / 2 + i * 9, 10 - Math.abs(i), PAL.basalt[3]);
      P.skull(cv, MW / 2, 30, 6, PAL.bone);
      cv.glowE(MW / 2, 40, 30, 40, PAL.blood[3], 0.2, 2);
    },
    lights(cv) {
      P.banner(cv, 38, 70, 18, 80, PAL.blood[1], PAL.bone[3]);
      P.banner(cv, MW - 38, 70, 18, 80, PAL.blood[1], PAL.bone[3]);
      P.brazier(cv, MW / 2 - 50, MH - 30, 1);
      P.brazier(cv, MW / 2 + 50, MH - 30, 1);
    },
  });
}

// ============================================================================
// CURSED FOREST — MAP backdrops, floors 4-8 (portrait, 10:16)
// ============================================================================
//
// Shared template: a vertical path lined with trees, with the goal at the
// top of the parchment frame and the player's start at the bottom. Each
// floor recolours / re-shapes the tree and floor primitives to set its
// mood. mapColumnHall is the indoor analogue (floors 1-3); this is the
// outdoor cousin.
function mapForestPath(seed, opts) {
  const cv = new Canvas(MW, MH);
  const r = rng(seed);
  // Sky/canopy gradient — opts.sky decides the top→bottom mood.
  cv.vgradStops(0, 0, MW, MH, opts.sky);
  // Receding tree pairs lining the path; smaller / further at the top.
  const rows = 5;
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const y = 40 + t * (MH - 80);
    const scale = 0.6 + t * 0.8;
    const inset = 28 - t * 12;
    opts.tree(cv, inset, y + 8, Math.round(28 * scale), scale, r);
    opts.tree(cv, MW - inset, y + 8, Math.round(28 * scale), scale, r);
  }
  // Forest floor at the bottom (where the player starts).
  P.forestFloor(cv, MH - 60, opts.dirt ?? PAL.wood, opts.leaf ?? PAL.toxic, r);
  // The goal at the top of the parchment — boss area silhouette / portal.
  if (opts.goal) opts.goal(cv, r);
  // Mid-scene atmospheric props.
  if (opts.lights) opts.lights(cv, r);
  // Floating particles — fungi spores, fireflies, etc.
  P.motes(cv, 0, 0, MW, MH, opts.moteCol ?? PAL.toxic[4], 40, r, 0.4);
  cv.vignette(0.55, 1.8);
  return cv;
}

function mapGrove() {
  // FLOOR 4 — Outer Grove. Sickly daylight still bleeds through; the player
  // has just stepped outside the throne room and the forest is corrupted
  // but not yet fully malignant.
  return mapForestPath(401, {
    sky: [[0, PAL.toxic[1]], [0.4, PAL.toxic[0]], [1, darken(PAL.wood[0], 0.2)]],
    tree: (cv, x, baseY, h, s) =>
      P.tree(cv, x, baseY, h, s, PAL.wood, PAL.toxic),
    goal(cv) {
      // A distant path threading deeper into the wood — twin trunks
      // bowing inward like a natural archway.
      P.tree(cv, MW / 2 - 18, 60, 38, 1.0, PAL.wood, PAL.toxic);
      P.tree(cv, MW / 2 + 18, 60, 38, 1.0, PAL.wood, PAL.toxic);
      cv.glowE(MW / 2, 50, 26, 30, PAL.toxic[4], 0.18, 2);
    },
    lights(cv) {
      // Scatter a few luminescent mushrooms along the path.
      for (const y of [140, 220, 290]) {
        P.mushroom(cv, 30, y, 0.9, PAL.toxic, PAL.bone, true);
        P.mushroom(cv, MW - 30, y, 0.9, PAL.toxic, PAL.bone, true);
      }
    },
  });
}

function mapHollow() {
  // FLOOR 5 — Mushroom Hollow. Underbelly of the wood; gigantic fungi
  // dominate the path and the trees thin out.
  return mapForestPath(402, {
    sky: [[0, darken(PAL.toxic[0], 0.4)], [0.5, PAL.toxic[0]], [1, PAL.void]],
    moteCol: PAL.toxic[5] ?? PAL.toxic[4],
    tree: (cv, x, baseY, h, s) =>
      P.deadTree(cv, x, baseY, h, s * 0.9, PAL.bone),
    goal(cv) {
      // A monumental mushroom marking the way deeper — its cap is a
      // glowing eye-mark of the cursed wood.
      P.mushroom(cv, MW / 2, 80, 3, PAL.toxic, PAL.bone, true);
      cv.glowE(MW / 2, 60, 34, 38, PAL.toxic[4], 0.22, 2);
    },
    lights(cv) {
      for (const cfg of [
        [MW / 2 - 40, 150, 1.4],
        [MW / 2 + 40, 200, 1.2],
        [MW / 2 - 30, 260, 1.6],
        [MW / 2 + 50, 270, 1.0],
      ]) {
        const [x, y, s] = cfg;
        P.mushroom(cv, x, y, s, PAL.toxic, PAL.bone, true);
      }
    },
  });
}

function mapMire() {
  // FLOOR 6 — Black Mire. Stagnant swamp; dead trees jut from black water
  // that reflects every light source twice.
  return mapForestPath(403, {
    sky: [[0, PAL.basalt[0]], [0.4, PAL.basalt[1]], [1, darken(PAL.ghost[0], 0.3)]],
    moteCol: PAL.ghost[4],
    tree: (cv, x, baseY, h, s) =>
      P.deadTree(cv, x, baseY, h, s, PAL.iron),
    goal(cv) {
      // A drowned doorway — twin dead trees curving inward, with a
      // ghost-lit water glow between them.
      P.deadTree(cv, MW / 2 - 22, 80, 56, 1.2, PAL.iron);
      P.deadTree(cv, MW / 2 + 22, 80, 56, 1.2, PAL.iron);
      cv.glowE(MW / 2, 50, 24, 36, PAL.ghost[3], 0.22, 2);
    },
    lights(cv) {
      // Reflective water patches — bright streaks below ground line.
      for (let y = MH - 50; y < MH; y += 4) {
        const w = 60 + Math.random() * 80;
        const x0 = MW / 2 - w / 2;
        for (let x = 0; x < w; x++) {
          if (Math.random() < 0.3) cv.px(x0 + x, y, PAL.ghost[2], 0.5);
        }
      }
      // Ghost-blue marsh fires.
      for (const y of [160, 240, 300]) {
        cv.glowE(30, y, 14, 18, PAL.ghost[3], 0.35, 1.6);
        cv.glowE(MW - 30, y, 14, 18, PAL.ghost[3], 0.35, 1.6);
      }
    },
  });
}

function mapBones() {
  // FLOOR 7 — Bone Thicket. Where the forest meets the dead; skeletal
  // trees wrapped in roots clutch at scattered skulls.
  return mapForestPath(404, {
    sky: [[0, PAL.purple[0]], [0.4, PAL.void], [1, darken(PAL.bone[0], 0.2)]],
    moteCol: PAL.bone[3],
    tree: (cv, x, baseY, h, s) =>
      P.deadTree(cv, x, baseY, h, s, PAL.bone),
    goal(cv) {
      // An arch of fused bone-roots framing the way deeper.
      cv.line(MW / 2 - 22, 80, MW / 2 - 6, 40, PAL.bone[3]);
      cv.line(MW / 2 + 22, 80, MW / 2 + 6, 40, PAL.bone[3]);
      cv.line(MW / 2 - 6, 40, MW / 2 + 6, 40, PAL.bone[3]);
      P.skull(cv, MW / 2, 50, 6, PAL.bone);
      cv.glowE(MW / 2, 50, 22, 28, PAL.purple[3], 0.22, 2);
    },
    lights(cv) {
      // Skulls embedded in roots along the path.
      for (const y of [150, 220, 290]) {
        P.skull(cv, 28, y, 4, PAL.bone);
        P.skull(cv, MW - 28, y, 4, PAL.bone);
      }
      // Cold purple grave-light pools.
      for (const y of [180, 260]) {
        cv.glowE(MW / 2, y, 30, 14, PAL.purple[3], 0.18, 2);
      }
    },
  });
}

function mapHeart() {
  // FLOOR 8 — Heart of Rot. The boss arena; a massive corrupted tree
  // dominates the centre. The whole path leads TO it.
  return mapForestPath(405, {
    sky: [[0, PAL.blood[0]], [0.4, darken(PAL.toxic[0], 0.3)], [1, PAL.void]],
    moteCol: PAL.blood[3],
    tree: (cv, x, baseY, h, s) =>
      // Sparse trees — the heart-tree dwarfs them.
      P.deadTree(cv, x, baseY, h * 0.8, s * 0.8, PAL.basalt),
    goal(cv, r) {
      // The Heart Tree — massive twisted trunk centred at the top of the
      // map, with glowing red eyes burned into the bark.
      const hx = MW / 2, baseY = 110;
      const trunkH = 90;
      const w = 18;
      for (let y = 0; y < trunkH; y++) {
        const t = y / trunkH;
        const ww = Math.max(2, Math.round(w * (1 - t * 0.4)));
        const sway = Math.round(Math.sin(y * 0.12) * 2.5);
        for (let x = -ww; x <= ww; x++) {
          const c = x < 0 ? PAL.basalt[0] : x === ww ? PAL.basalt[3] : PAL.basalt[1];
          cv.px(hx + sway + x, baseY - y, c);
        }
      }
      // Red eyes in the trunk
      const eyeY = baseY - Math.round(trunkH * 0.55);
      cv.disc(hx - 5, eyeY, 2, PAL.blood[3]);
      cv.disc(hx + 5, eyeY, 2, PAL.blood[3]);
      cv.glow(hx - 5, eyeY, 6, PAL.blood[4], 0.6, 1.5);
      cv.glow(hx + 5, eyeY, 6, PAL.blood[4], 0.6, 1.5);
      // Twisted canopy of dead branches
      const tipY = baseY - trunkH;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.5;
        const len = 14 + Math.round(r() * 8);
        cv.line(hx, tipY + 2, hx + Math.cos(a) * len, tipY + Math.sin(a) * len, PAL.basalt[2]);
      }
      // Heart-glow at the centre
      cv.glowE(hx, eyeY, 28, 24, PAL.blood[2], 0.25, 2);
    },
    lights(cv) {
      // Bleeding pools along the floor where the roots have spread
      P.roots(cv, MW / 2, MH - 60, 80, PAL.basalt);
      cv.glowE(MW / 2, MH - 30, 60, 22, PAL.blood[2], 0.2, 2);
    },
  });
}

// ============================================================================
// CURSED FOREST — COMBAT backdrops (landscape, 16:10)
// ============================================================================
// These are the per-floor fight scenes. Combat currently uses a quiet
// gradient instead of pixel-art (see CombatScene), but the generator
// produces them so the assets are ready when/if the user re-enables level
// art for the forest biome later.
function combatGrove() {
  const cv = new Canvas(W, H);
  const r = rng(411);
  cv.vgradStops(0, 0, W, H, [
    [0, PAL.toxic[1]], [0.4, darken(PAL.wood[0], 0.2)], [1, PAL.void],
  ]);
  // Foreground trees flanking the action area
  P.tree(cv, 30, 165, 60, 1.6, PAL.wood, PAL.toxic);
  P.tree(cv, W - 30, 165, 60, 1.6, PAL.wood, PAL.toxic);
  // Mid-ground trees
  for (const x of [80, W - 80, 130, W - 130]) {
    P.tree(cv, x, 155, 38, 1.0, PAL.wood, PAL.toxic);
  }
  // Distant tree silhouettes
  for (let i = 0; i < 8; i++) {
    const x = 60 + i * 30;
    P.tree(cv, x, 140, 22, 0.6, PAL.wood, PAL.toxic);
  }
  // Forest floor
  P.forestFloor(cv, 160, PAL.wood, PAL.toxic, r);
  // Foreground mushrooms
  P.mushroom(cv, 55, 178, 1.2, PAL.toxic, PAL.bone, true);
  P.mushroom(cv, W - 55, 178, 1.2, PAL.toxic, PAL.bone, true);
  // A few vines from the canopy
  for (const x of [45, W - 45, 110, W - 110]) {
    P.vine(cv, x, 30, 30, PAL.toxic);
  }
  P.motes(cv, 0, 40, W, 100, PAL.toxic[4], 35, r, 0.4);
  cv.glowE(W / 2, H, W * 0.7, 70, PAL.toxic[3], 0.1, 2);
  cv.vignette(0.5, 2.0);
  return cv;
}

function combatHollow() {
  const cv = new Canvas(W, H);
  const r = rng(412);
  cv.vgradStops(0, 0, W, H, [
    [0, PAL.void], [0.5, darken(PAL.toxic[0], 0.3)], [1, PAL.toxic[0]],
  ]);
  // Big foreground mushroom on the left — the kind of fungi-cap you'd
  // mistake for a tree from a distance.
  P.mushroom(cv, 50, 170, 3.5, PAL.toxic, PAL.bone, true);
  // Smaller mushrooms scattered around
  for (const [x, y, s] of [
    [W - 70, 175, 2.2], [120, 180, 1.4], [W - 130, 180, 1.5],
    [180, 178, 1.0], [W - 180, 178, 1.0], [240, 182, 0.9],
  ]) P.mushroom(cv, x, y, s, PAL.toxic, PAL.bone, true);
  // Dead tree silhouettes in the back
  for (const x of [90, W - 90, 160, W - 160]) {
    P.deadTree(cv, x, 150, 50, 0.9, PAL.bone);
  }
  // Hanging vines from the top
  for (const x of [40, 100, 180, 240, W - 240, W - 180, W - 100, W - 40]) {
    P.vine(cv, x, 20, 40 + Math.round(Math.random() * 20), PAL.toxic);
  }
  P.forestFloor(cv, 165, PAL.wood, PAL.toxic, r);
  P.motes(cv, 0, 0, W, H, PAL.toxic[4], 50, r, 0.5);
  cv.glowE(W / 2, H, W * 0.7, 70, PAL.toxic[3], 0.12, 2);
  cv.vignette(0.55, 2.1);
  return cv;
}

function combatMire() {
  const cv = new Canvas(W, H);
  const r = rng(413);
  cv.vgradStops(0, 0, W, H, [
    [0, PAL.basalt[0]], [0.5, darken(PAL.ghost[0], 0.2)], [1, PAL.void],
  ]);
  // Dead trees rising from the swamp
  for (const [x, h, s] of [
    [40, 70, 1.4], [W - 40, 70, 1.4],
    [100, 60, 1.0], [W - 100, 60, 1.0],
    [160, 50, 0.8], [W - 160, 50, 0.8],
    [220, 44, 0.7],
  ]) P.deadTree(cv, x, 160, h, s, PAL.iron);
  // Water surface with ripples and reflected ghost-light
  const waterY = 168;
  for (let y = waterY; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (y - waterY) / (H - waterY);
      cv.px(x, y, mix(PAL.iron[0], PAL.void, t), 0.85);
    }
  }
  // Ripple highlights
  for (let i = 0; i < 80; i++) {
    const x = Math.floor(r() * W);
    const y = waterY + Math.floor(r() * (H - waterY));
    if (r() < 0.4) cv.px(x, y, PAL.ghost[2], 0.6);
  }
  // Marsh fires
  for (const [x, y] of [[55, 150], [W - 55, 150], [130, 142], [W - 130, 142]]) {
    cv.glowE(x, y, 12, 16, PAL.ghost[3], 0.35, 1.6);
    cv.px(x, y, PAL.ghost[4]);
  }
  // Mist layers
  for (let y = 60; y < 140; y += 12) {
    for (let x = 0; x < W; x++) {
      if (r() < 0.15) cv.px(x, y, PAL.ghost[1], 0.3);
    }
  }
  P.motes(cv, 0, 40, W, 100, PAL.ghost[4], 30, r, 0.4);
  cv.vignette(0.6, 2.2);
  return cv;
}

function combatBones() {
  const cv = new Canvas(W, H);
  const r = rng(414);
  cv.vgradStops(0, 0, W, H, [
    [0, PAL.purple[0]], [0.5, darken(PAL.bone[0], 0.4)], [1, PAL.void],
  ]);
  // Tight corridor of bone-pale dead trees
  for (const [x, h, s] of [
    [30, 80, 1.5], [W - 30, 80, 1.5],
    [80, 75, 1.3], [W - 80, 75, 1.3],
    [140, 65, 1.0], [W - 140, 65, 1.0],
    [200, 55, 0.8], [W - 200, 55, 0.8],
  ]) P.deadTree(cv, x, 165, h, s, PAL.bone);
  // Skulls embedded among the roots
  for (const [x, y, sc] of [[55, 175, 5], [W - 55, 175, 5], [120, 180, 4], [W - 120, 180, 4]]) {
    P.skull(cv, x, y, sc, PAL.bone);
  }
  // Crossbones in the background
  P.crossbones(cv, W / 2, 60, 26, PAL.bone);
  cv.glowE(W / 2, 60, 24, 30, PAL.purple[3], 0.2, 2);
  // Cold purple grave-light pooling at the floor
  P.forestFloor(cv, 165, PAL.bone, PAL.purple, r);
  cv.glowE(W / 2, H - 10, W * 0.5, 40, PAL.purple[2], 0.18, 2);
  P.motes(cv, 0, 30, W, 130, PAL.purple[4], 25, r, 0.35);
  cv.vignette(0.6, 2.2);
  return cv;
}

function combatHeart() {
  const cv = new Canvas(W, H);
  const r = rng(415);
  cv.vgradStops(0, 0, W, H, [
    [0, PAL.blood[0]], [0.4, darken(PAL.toxic[0], 0.3)], [0.8, PAL.void], [1, darken(PAL.basalt[0], 0.2)],
  ]);
  // Distant menacing wall of dead trees
  for (let i = 0; i < 10; i++) {
    const x = 30 + i * 30;
    P.deadTree(cv, x, 150, 40 + Math.round(r() * 20), 0.7, PAL.basalt);
  }
  // The Heart Tree dominating the centre
  const hx = W / 2, baseY = 175;
  const trunkH = 130;
  const w = 26;
  for (let y = 0; y < trunkH; y++) {
    const t = y / trunkH;
    const ww = Math.max(3, Math.round(w * (1 - t * 0.45)));
    const sway = Math.round(Math.sin(y * 0.1) * 3.5);
    for (let x = -ww; x <= ww; x++) {
      const c = x < -ww * 0.4 ? PAL.basalt[0] : x > ww * 0.4 ? PAL.basalt[3] : PAL.basalt[1];
      cv.px(hx + sway + x, baseY - y, c);
    }
  }
  // Glowing red eyes
  const eyeY = baseY - Math.round(trunkH * 0.55);
  cv.disc(hx - 8, eyeY, 3, PAL.blood[4]);
  cv.disc(hx + 8, eyeY, 3, PAL.blood[4]);
  cv.glow(hx - 8, eyeY, 9, PAL.blood[4], 0.7, 1.5);
  cv.glow(hx + 8, eyeY, 9, PAL.blood[4], 0.7, 1.5);
  // Twisted dead branches reaching outward
  const tipY = baseY - trunkH;
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i - 3.5) * 0.45;
    const len = 22 + Math.round(r() * 14);
    cv.line(hx, tipY + 2, hx + Math.cos(a) * len, tipY + Math.sin(a) * len, PAL.basalt[2]);
  }
  // Massive root system at the base
  P.roots(cv, hx, baseY, 100, PAL.basalt);
  // Heart glow
  cv.glowE(hx, eyeY, 60, 50, PAL.blood[2], 0.25, 2.4);
  cv.glowE(hx, baseY - 20, 70, 30, PAL.blood[2], 0.18, 2);
  // Forest floor + ambient
  P.forestFloor(cv, 170, PAL.basalt, PAL.blood, r);
  P.motes(cv, 0, 30, W, 130, PAL.blood[3], 30, r, 0.5);
  cv.vignette(0.55, 2.3);
  return cv;
}

// ============================================================================
// NODE SCREENS — landscape, focal prop, calm centre for panels
// ============================================================================
function forge() {
  const cv = new Canvas(W, H);
  const r = rng(401);
  P.backWall(cv, 0, 150, PAL.stone, r);
  cv.vgradStops(0, 0, W, 30, [[0, PAL.void], [1, PAL.wood[0]]]);
  P.floor(cv, 150, PAL.stone, LIGHT.forge, r);

  // a great stone forge / hearth to the LEFT, glowing
  cv.block(20, 70, 90, 80, PAL.stone[1], { hi: PAL.stone[3], lo: PAL.stone[0] });
  // arched fire mouth
  for (let y = 100; y < 150; y++) for (let x = 38; x < 92; x++) {
    const t = (y - 100) / 50;
    if (Math.abs(x - 65) < 24 * (0.4 + t)) cv.px(x, y, PAL.void);
  }
  // Direct flame calls — wrapped in a parameterised closure so the same code
  // produces the canonical hearth blaze on the base AND a jittered copy on
  // the fx canvas (for cyclable flicker in the live scene).
  const drawHearthFire = (t, j) => {
    t.glowE(65, 138, Math.round(30 * j), Math.round(26 * j), PAL.ember[3], 0.5, 1.6);
    P.flame(t, 58, 130, Math.max(2, Math.round(14 * j)));
    P.flame(t, 72, 130, Math.max(2, Math.round(14 * j)));
    P.flame(t, 65, 122, Math.max(2, Math.round(22 * j)));
    P.flame(t, 60, 126, Math.max(2, Math.round(17 * j)));
    P.flame(t, 70, 126, Math.max(2, Math.round(17 * j)));
    t.glowE(65, 130, Math.round(52 * j), Math.round(44 * j), PAL.ember[3], 0.22, 2);
  };
  drawHearthFire(cv, 1);
  P.mirrorFx(drawHearthFire);
  // chimney
  cv.block(40, 40, 30, 32, PAL.stone[2], { hi: PAL.stone[3], lo: PAL.stone[0] });

  // anvil on a wood stump, centre-right — clear classic silhouette
  const ax = 218, ay = 156;
  const iH = { hi: PAL.iron[4], lo: PAL.iron[0] };
  cv.block(ax - 14, ay, 28, 14, PAL.wood[2], { hi: PAL.wood[3], lo: PAL.wood[0] });   // stump
  cv.rect(ax - 14, ay + 4, 28, 2, PAL.wood[0], 0.5);                                  // stump band
  cv.block(ax - 18, ay - 8, 36, 8, PAL.iron[2], iH);                                  // top face slab
  cv.block(ax - 8, ay - 2, 16, 4, PAL.iron[1]);                                       // waist
  cv.block(ax - 13, ay + 2, 26, 4, PAL.iron[2], iH);                                  // foot
  // tapering horn off the left
  for (let i = 0; i < 12; i++) cv.vline(ax - 18 - i, ay - 7 + Math.floor(i / 2), ay - 4 + Math.floor(i / 3), PAL.iron[2]);
  cv.hline(ax - 18, ax + 17, ay - 8, PAL.iron[4], 0.7);                               // lit top edge
  // hot ingot on the face + hammer striking it. The ingot glow flickers
  // with the rest of the fire bundle.
  cv.rect(ax - 2, ay - 9, 8, 2, PAL.flame[3]);
  cv.glow(ax + 2, ay - 9, 8, PAL.flame[4], 0.6, 1.5);
  P.mirrorFx((t, j) => t.glow(ax + 2, ay - 9, Math.round(8 * j), PAL.flame[4], 0.6, 1.5));
  cv.line(ax + 6, ay - 26, ax + 14, ay - 12, PAL.wood[3]);                            // haft
  cv.block(ax + 2, ay - 30, 12, 7, PAL.iron[3], { hi: PAL.iron[5] || PAL.iron[4], lo: PAL.iron[1] }); // head
  // sparks flying off the strike point
  P.motes(cv, ax - 8, ay - 22, 36, 18, PAL.flame[4], 22, r, 0.85);

  // hanging tools on the right wall
  for (let i = 0; i < 3; i++) {
    const hx = 280 + i * 10;
    cv.vline(hx, 60, 84, PAL.iron[2], 0.8);
    cv.block(hx - 2, 84, 5, 4, PAL.iron[3]);
  }
  cv.glowE(W * 0.3, H, W * 0.5, 70, PAL.ember[2], 0.12, 2);
  P.cobweb(cv, "tr", 36);
  cv.vignette(0.55, 2.0);
  return cv;
}

function well() {
  const cv = new Canvas(W, H);
  const r = rng(402);
  P.backWall(cv, 0, 120, PAL.stone, r);
  cv.vgradStops(0, 0, W, 34, [[0, PAL.void], [1, PAL.stone[1]]]);
  P.floor(cv, 120, PAL.stone, LIGHT.ghost, r);

  // damp arched recesses dripping in the back
  for (const wx of [70, 250]) P.archway(cv, wx, 116, 30, 44, PAL.stone, darken(PAL.stone[0], 0.2));

  // the WELL, centre, glowing ghost-blue from within
  const wx = W / 2, wy = 150;
  cv.glowE(wx, wy, 60, 36, PAL.ghost[3], 0.18, 2);
  // stone ring (ellipse) — body
  cv.ellipse(wx, wy + 24, 46, 16, PAL.stone[2]);
  cv.ellipse(wx, wy + 20, 46, 14, PAL.stone[3]);
  // mouth (water inside, lit)
  cv.ellipse(wx, wy + 18, 38, 11, PAL.stone[0]);
  cv.ellipse(wx, wy + 18, 30, 8, PAL.ghost[2]);
  cv.ellipse(wx, wy + 18, 22, 5, PAL.ghost[4]);
  cv.glowE(wx, wy + 14, 30, 18, PAL.ghost[5], 0.4, 1.6);
  // front lip stones
  for (let a = 0; a < Math.PI; a += 0.35) {
    const sx = wx + Math.cos(a) * 40, sy = wy + 26 + Math.sin(a) * 13;
    cv.block(sx - 4, sy - 3, 8, 6, PAL.stone[3], { hi: PAL.stone[4], lo: PAL.stone[1] });
  }
  // posts + crossbeam + bucket
  cv.block(wx - 48, wy - 30, 5, 40, PAL.wood[2], { hi: PAL.wood[3], lo: PAL.wood[0] });
  cv.block(wx + 43, wy - 30, 5, 40, PAL.wood[2], { hi: PAL.wood[3], lo: PAL.wood[0] });
  cv.block(wx - 50, wy - 34, 100, 5, PAL.wood[3], { hi: PAL.wood[4], lo: PAL.wood[1] });
  cv.vline(wx + 8, wy - 30, wy + 4, PAL.iron[2], 0.8); // rope
  cv.block(wx + 4, wy + 4, 9, 8, PAL.wood[2], { hi: PAL.wood[3], lo: PAL.wood[0] }); // bucket

  P.candle(cv, 40, 150, 12, 1); P.candle(cv, W - 40, 150, 12, 1);
  P.motes(cv, wx - 50, 90, 100, 70, PAL.ghost[5], 26, r, 0.5);
  cv.vignette(0.55, 2.0);
  return cv;
}

function shrine() {
  const cv = new Canvas(W, H);
  const r = rng(403);
  P.backWall(cv, 0, 140, PAL.stone, r);
  cv.vgradStops(0, 0, W, 40, [[0, PAL.void], [1, PAL.purple[0]]]);
  P.floor(cv, 140, PAL.stone, LIGHT.candle, r);

  // a radiant niche behind the idol
  cv.glowE(W / 2, 80, 70, 70, PAL.gold[4], 0.16, 2);
  P.archway(cv, W / 2, 130, 56, 92, PAL.stone, PAL.purple[0]);

  // the GODDESS idol — a serene robed statue on an altar
  const ix = W / 2;
  // altar block
  cv.block(ix - 34, 140, 68, 30, PAL.stone[2], { hi: PAL.stone[4], lo: PAL.stone[0] });
  cv.block(ix - 40, 134, 80, 8, PAL.stone[3], { hi: PAL.stone[4], lo: PAL.stone[1] });
  // statue: robe (triangle), head, halo
  for (let y = 70; y < 134; y++) {
    const t = (y - 70) / 64;
    const hw = 6 + t * 22;
    cv.hline(ix - hw, ix + hw, y, mix(PAL.bone[2], PAL.bone[4], 1 - t));
  }
  cv.vline(ix, 74, 132, PAL.bone[1], 0.4); // robe centre fold
  cv.disc(ix, 64, 8, PAL.bone[4]);          // head
  cv.ring(ix, 60, 14, PAL.gold[4], 0.8, 2); // halo
  cv.glow(ix, 64, 22, PAL.gold[5], 0.3, 2);
  // outstretched offering bowl glow
  cv.glowE(ix, 110, 18, 12, PAL.gold[4], 0.4, 1.6);

  // flanking candelabra
  for (const cxx of [70, 250]) {
    cv.block(cxx - 3, 120, 6, 40, PAL.iron[2], { hi: PAL.iron[4], lo: PAL.iron[0] });
    P.candle(cxx ? cv : cv, cxx, 122, 10, 1.1);
    P.candle(cv, cxx - 14, 128, 8, 0.9);
    P.candle(cv, cxx + 14, 128, 8, 0.9);
  }
  P.motes(cv, 0, 40, W, 120, PAL.gold[4], 36, r, 0.5);
  cv.vignette(0.5, 2.0, PAL.purple[0]);
  return cv;
}

function grave() {
  const cv = new Canvas(W, H);
  const r = rng(404);
  // night sky over a buried graveyard chamber
  cv.vgradStops(0, 0, W, 90, [[0, PAL.void], [1, PAL.purple[1]]]);
  // far wall + barred window with sickly moon-glow
  cv.glowE(W / 2, 36, 50, 30, PAL.ghost[3], 0.12, 2);
  P.backWall(cv, 70, 150, PAL.stone, r);
  cv.rect(0, 70, W, 2, PAL.stone[0], 0.5);
  // mounded earth floor
  cv.vgradStops(0, 150, W, H - 150, [[0, darken(PAL.wood[0], 0.2)], [1, PAL.wood[0]]]);
  cv.stipple(0, 150, W, H - 150, PAL.wood[1], 0.05, r, 0.5);

  // tombstones at varied depths
  const stones = [[60, 150], [110, 158], [255, 152], [300, 160], [200, 148]];
  for (const [sx, sy] of stones) {
    const sh = 26 + (sx % 7);
    cv.block(sx - 9, sy - sh, 18, sh, PAL.stone[2], { hi: PAL.stone[3], lo: PAL.stone[0] });
    cv.disc(sx, sy - sh, 9, PAL.stone[2]);
    cv.ring(sx, sy - sh + 2, 4, PAL.stone[0], 0.6, 1); // carved ring/cross
    cv.vline(sx, sy - sh + 1, sy - sh + 8, PAL.stone[0], 0.6);
  }

  // a fresh open grave + leaning urn, centre focal
  const gx = W / 2, gy = 168;
  cv.ellipse(gx, gy, 40, 14, PAL.void);
  cv.ellipse(gx, gy - 1, 40, 13, darken(PAL.wood[0], 0.3));
  cv.ellipse(gx, gy, 30, 9, PAL.void);
  // mound of dirt beside it
  cv.ellipse(gx - 44, gy + 6, 16, 6, PAL.wood[1]);
  // a shovel
  cv.line(gx + 40, gy - 26, gx + 48, gy + 4, PAL.wood[3]);
  cv.block(gx + 46, gy + 2, 6, 8, PAL.iron[3], { hi: PAL.iron[4], lo: PAL.iron[1] });
  // ghost-fire rising from the grave
  P.flame(cv, gx, gy - 18, 14);
  cv.glowE(gx, gy - 6, 30, 22, PAL.ghost[4], 0.3, 1.8);

  P.candle(cv, 36, 160, 12, 1); P.candle(cv, W - 36, 160, 12, 1);
  P.motes(cv, 0, 60, W, 110, PAL.ghost[4], 30, r, 0.45);
  cv.vignette(0.6, 2.0, PAL.purple[0]);
  return cv;
}

function shop() {
  const cv = new Canvas(W, H);
  const r = rng(405);
  P.backWall(cv, 0, 150, PAL.sand, r);
  cv.vgradStops(0, 0, W, 30, [[0, PAL.void], [1, PAL.wood[0]]]);
  P.floor(cv, 150, PAL.sand, LIGHT.candle, r);

  // striped market awning across the top
  for (let x = 0; x < W; x += 24) {
    cv.rect(x, 20, 12, 16, PAL.blood[2]);
    cv.rect(x + 12, 20, 12, 16, PAL.parch[3]);
  }
  cv.rect(0, 18, W, 3, PAL.wood[2]);
  // scalloped awning edge
  for (let x = 0; x < W; x += 12) cv.disc(x + 6, 36, 5, x % 24 ? PAL.parch[3] : PAL.blood[2]);

  // wooden stall counter across the front-centre
  cv.block(50, 150, W - 100, 18, PAL.wood[2], { hi: PAL.wood[4], lo: PAL.wood[0] });
  cv.hline(50, W - 50, 150, PAL.wood[4], 0.6);
  for (let x = 60; x < W - 50; x += 26) cv.vline(x, 152, 166, PAL.wood[0], 0.4);

  // shelves of wares behind: potions (ghost/blood/toxic), tomes, coins
  const potCols = [PAL.ghost[4], PAL.blood[3], PAL.toxic[4], PAL.gold[4], PAL.purple[4]];
  cv.block(70, 96, 180, 6, PAL.wood[3], { hi: PAL.wood[4], lo: PAL.wood[1] }); // shelf
  for (let i = 0; i < 8; i++) {
    const px = 80 + i * 22, col = potCols[i % potCols.length];
    cv.block(px - 3, 84, 7, 12, PAL.iron[2]);     // bottle body
    cv.rect(px - 1, 80, 3, 4, PAL.wood[2]);        // cork
    cv.rect(px - 2, 88, 5, 6, col);                // liquid
    cv.glow(px, 90, 5, col, 0.4, 1.6);
  }
  // stacked tomes + coin piles on the counter
  for (let i = 0; i < 3; i++) cv.block(70 + i * 3, 138 - i * 4, 22, 5, [PAL.blood, PAL.purple, PAL.wood][i][2], { hi: PAL.gold[3], lo: PAL.void });
  for (let i = 0; i < 5; i++) cv.disc(250 + (i % 3) * 6, 146 - Math.floor(i / 3) * 4, 3, PAL.gold[4]);

  // hanging lantern casting warm light over the stall
  cv.vline(W / 2, 36, 60, PAL.iron[2], 0.8);
  cv.block(W / 2 - 6, 60, 12, 14, PAL.iron[2], { hi: PAL.gold[4], lo: PAL.iron[0] });
  cv.rect(W / 2 - 4, 63, 8, 9, PAL.flame[4]);
  cv.glow(W / 2, 67, 40, PAL.flame[3], 0.3, 2);

  cv.glowE(W / 2, 130, 90, 50, PAL.flame[2], 0.1, 2);
  P.motes(cv, 0, 60, W, 90, PAL.flame[4], 22, r, 0.4);
  cv.vignette(0.5, 2.0);
  return cv;
}

function metaShop() {
  // The between-runs hub: a spectral goddess shrine in the void.
  const cv = new Canvas(W, H);
  const r = rng(406);
  cv.vgradStops(0, 0, W, H, [[0, PAL.void], [0.6, PAL.purple[0]], [1, PAL.purple[1]]]);
  // starfield / soul motes
  P.motes(cv, 0, 0, W, H, PAL.ghost[5], 70, r, 0.6);
  // floating stone platform
  cv.ellipse(W / 2, 168, 110, 18, PAL.stone[1]);
  cv.ellipse(W / 2, 164, 110, 16, PAL.stone[2]);
  cv.ellipse(W / 2, 162, 96, 13, PAL.stone[3]);
  // ghostly arch of light
  cv.ring(W / 2, 150, 70, PAL.ghost[4], 0.25, 2);
  cv.ring(W / 2, 150, 58, PAL.ghost[3], 0.2, 1);
  cv.glowE(W / 2, 110, 70, 80, PAL.ghost[3], 0.14, 2);
  // central pedestal with a glowing soul-gem
  cv.block(W / 2 - 10, 150, 20, 16, PAL.stone[2], { hi: PAL.stone[4], lo: PAL.stone[0] });
  cv.disc(W / 2, 138, 7, PAL.ghost[4]);
  cv.glow(W / 2, 138, 26, PAL.ghost[5], 0.5, 1.8);
  // flanking ghost candles
  P.candle(cv, W / 2 - 70, 162, 12, 1); P.candle(cv, W / 2 + 70, 162, 12, 1);
  cv.vignette(0.55, 1.8, PAL.purple[0]);
  return cv;
}

// ============================================================================
// MENU / DREAM / OUTCOME SCREENS
// ============================================================================
function menu() {
  const cv = new Canvas(W, H);
  const r = rng(501);
  // the crypt where Mortimer wakes — dramatic, his coffin centre, light above
  cv.vgradStops(0, 0, W, H, [[0, PAL.void], [0.5, PAL.bg], [1, PAL.bgSoft]]);
  P.vault(cv, 60, PAL.stone);
  P.backWall(cv, 60, 150, PAL.stone, r);
  P.floor(cv, 150, PAL.stone, LIGHT.candle, r);
  // a shaft of pale light from a grate above onto the open sarcophagus
  for (let y = 50; y < 158; y++) {
    const t = (y - 50) / 108;
    const hw = 10 + t * 30;
    cv.rect(W / 2 - hw, y, hw * 2, 1, PAL.ghost[4], 0.05 + t * 0.05);
  }
  cv.glowE(W / 2, 60, 40, 40, PAL.ghost[3], 0.1, 2);
  // open stone coffin, lid ajar
  const cxx = W / 2;
  cv.block(cxx - 44, 150, 88, 30, PAL.stone[2], { hi: PAL.stone[4], lo: PAL.stone[0] });
  cv.ellipse(cxx, 152, 36, 9, PAL.void); // dark interior
  cv.block(cxx + 20, 146, 60, 8, PAL.stone[3], { hi: PAL.stone[4], lo: PAL.stone[1] }); // shoved lid
  // two ghost-fire eyes glowing from within the coffin
  cv.disc(cxx - 8, 150, 2, PAL.ghost[5]); cv.glow(cxx - 8, 150, 6, PAL.ghost[5], 0.6, 1.5);
  cv.disc(cxx + 8, 150, 2, PAL.ghost[5]); cv.glow(cxx + 8, 150, 6, PAL.ghost[5], 0.6, 1.5);
  // pillars + braziers framing
  P.pillar(cv, 24, 40, 150, 24, PAL.stone);
  P.pillar(cv, W - 24, 40, 150, 24, PAL.stone);
  P.brazier(cv, 50, 176, 1.2); P.brazier(cv, W - 50, 176, 1.2);
  P.cobweb(cv, "tl", 50); P.cobweb(cv, "tr", 50);
  P.motes(cv, 0, 50, W, 110, PAL.flame[4], 36, r, 0.5);
  cv.vignette(0.62, 1.9);
  return cv;
}

function dream() {
  // the Goddess's dream tutorial — an ethereal green/blue void.
  const cv = new Canvas(W, H);
  const r = rng(502);
  cv.vgradStops(0, 0, W, H, [[0, PAL.void], [0.45, hex2(PAL, "toxic", 0)], [1, PAL.toxic[1]]]);
  // soft concentric soul-rings around a radiant figure
  for (let i = 5; i >= 1; i--) cv.ring(W / 2, 96, i * 24, PAL.toxic[3], 0.06, 1);
  cv.glowE(W / 2, 96, 90, 90, PAL.toxic[3], 0.16, 2);
  // the Goddess — tall luminous robed silhouette
  const ix = W / 2;
  for (let y = 50; y < 150; y++) {
    const t = (y - 50) / 100;
    const hw = 4 + t * 26;
    cv.hline(ix - hw, ix + hw, y, mix(PAL.ghost[5], PAL.toxic[4], t), 0.5 + (1 - t) * 0.4);
  }
  cv.disc(ix, 46, 7, PAL.ghost[5]); cv.glow(ix, 46, 20, PAL.ghost[5], 0.5, 1.8);
  cv.ring(ix, 42, 13, PAL.toxic[5], 0.6, 1);
  // drifting motes rising
  P.motes(cv, 0, 0, W, H, PAL.toxic[5], 80, r, 0.5);
  P.motes(cv, 0, 0, W, H, PAL.ghost[5], 30, r, 0.5);
  cv.vignette(0.5, 1.7, PAL.void);
  return cv;
}

function gameover() {
  const cv = new Canvas(W, H);
  const r = rng(503);
  cv.vgradStops(0, 0, W, H, [[0, PAL.void], [1, PAL.bg]]);
  P.floor(cv, 150, PAL.wood, LIGHT.blood, r);
  // a fresh grave with the wizard's hat & staff — he's gone back to the worms
  const gx = W / 2;
  cv.ellipse(gx, 168, 50, 16, PAL.void);
  cv.ellipse(gx, 166, 50, 15, darken(PAL.wood[0], 0.3));
  // leaning staff
  cv.line(gx + 30, 100, gx + 18, 168, PAL.wood[3]);
  cv.disc(gx + 31, 98, 5, PAL.purple[4]); cv.glow(gx + 31, 98, 12, PAL.purple[4], 0.4, 1.8);
  // wizard hat on the mound
  cv.block(gx - 50, 158, 24, 6, PAL.purple[1]);
  for (let y = 130; y < 158; y++) { const t = (y - 130) / 28; cv.hline(gx - 38 + (1 - t) * 0, gx - 38 + (t) * 0, y, PAL.purple[2]); }
  // simpler hat cone
  for (let y = 132; y < 158; y++) { const t = (y - 132) / 26; const hw = t * 12; cv.hline(gx - 38 - hw, gx - 38 + hw, y, PAL.purple[2]); }
  cv.block(gx - 52, 156, 28, 5, PAL.purple[3]);
  // dim guttering candle
  P.candle(cv, gx - 70, 168, 8, 0.9);
  cv.glowE(gx, 150, 70, 50, PAL.blood[1], 0.1, 2);
  P.motes(cv, 0, 60, W, 100, PAL.blood[3], 18, r, 0.35);
  cv.vignette(0.7, 1.7, PAL.void);
  return cv;
}

function victory() {
  // breaking out to the surface — dawn light over the castle gate.
  const cv = new Canvas(W, H);
  const r = rng(504);
  cv.vgradStops(0, 0, W, H, [
    [0, mix(PAL.flame[3], PAL.ghost[2], 0.4)], [0.45, PAL.flame[3]], [0.7, PAL.gold[3]], [1, PAL.sand[2]],
  ]);
  // radiant sunburst behind a gateway
  cv.glowE(W / 2, 80, 130, 110, PAL.flame[5], 0.3, 1.6);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    const x2 = W / 2 + Math.cos(a) * 200, y2 = 80 + Math.sin(a) * 200;
    cv.line(W / 2, 80, x2, y2, PAL.flame[5], 0.06);
  }
  // distant castle silhouette gate, dark against the light
  cv.rect(0, 150, W, H - 150, PAL.sand[1]);
  P.archway(cv, W / 2, 150, 60, 90, PAL.sand, mix(PAL.flame[4], PAL.gold[4], 0.5));
  for (const tx of [60, 260]) {
    cv.block(tx - 16, 70, 32, 80, PAL.sand[1], { hi: PAL.sand[2], lo: PAL.basalt[0] });
    // crenellations
    for (let i = 0; i < 4; i++) cv.rect(tx - 16 + i * 9, 64, 5, 8, PAL.sand[1]);
  }
  P.banner(cv, 60, 80, 16, 50, PAL.blood[2], PAL.gold[4]);
  P.banner(cv, 260, 80, 16, 50, PAL.blood[2], PAL.gold[4]);
  // motes of dawn dust
  P.motes(cv, 0, 0, W, H, PAL.flame[5], 50, r, 0.5);
  cv.vignette(0.35, 2.0);
  return cv;
}

// small helper for dream gradient stop
function hex2(pal, key, i) { return pal[key][i]; }

// ============================================================================
const REG = {
  "combat-crypt":  { fn: combatCrypt,  file: "combat-crypt.png" },
  "combat-castle": { fn: combatCastle, file: "combat-castle.png" },
  "combat-throne": { fn: combatThrone, file: "combat-throne.png" },
  "map-backdrop-1": { fn: mapCrypt,  file: "map-backdrop-1.png" },
  "map-backdrop-2": { fn: mapCastle, file: "map-backdrop-2.png" },
  "map-backdrop-3": { fn: mapThrone, file: "map-backdrop-3.png" },
  "map-backdrop-4": { fn: mapGrove,  file: "map-backdrop-4.png" },
  "map-backdrop-5": { fn: mapHollow, file: "map-backdrop-5.png" },
  "map-backdrop-6": { fn: mapMire,   file: "map-backdrop-6.png" },
  "map-backdrop-7": { fn: mapBones,  file: "map-backdrop-7.png" },
  "map-backdrop-8": { fn: mapHeart,  file: "map-backdrop-8.png" },
  "combat-grove":   { fn: combatGrove,  file: "combat-grove.png" },
  "combat-hollow":  { fn: combatHollow, file: "combat-hollow.png" },
  "combat-mire":    { fn: combatMire,   file: "combat-mire.png" },
  "combat-bones":   { fn: combatBones,  file: "combat-bones.png" },
  "combat-heart":   { fn: combatHeart,  file: "combat-heart.png" },
  "forge":     { fn: forge,    file: "forge.png" },
  "well":      { fn: well,     file: "well.png" },
  "shrine":    { fn: shrine,   file: "shrine.png" },
  "grave":     { fn: grave,    file: "grave.png" },
  "shop":      { fn: shop,     file: "shop.png" },
  "meta-shop": { fn: metaShop, file: "meta-shop.png" },
  "menu":      { fn: menu,     file: "menu.png" },
  "dream":     { fn: dream,    file: "dream.png" },
  "gameover":  { fn: gameover, file: "gameover.png" },
  "victory":   { fn: victory,  file: "victory.png" },
};

// Per-frame jitter multipliers for the fx layer. Each value scales flame
// height + glow radius for one frame. Cycling Phaser through these PNGs
// at ~140 ms produces gentle flicker that's perfectly aligned with the base
// PNG (since the structural pixels are shared via the same coordinate
// space — no eyeball-derived overlay positions).
const FX_JITTERS = [1.00, 0.86, 1.16];

function main() {
  const only = process.argv[2];
  const names = only ? [only] : Object.keys(REG);
  for (const name of names) {
    const e = REG[name];
    if (!e) { console.error("unknown:", name); continue; }

    // Pass 1: canonical base PNG. setFxCanvas(null) ensures no fx is
    // accumulated — the existing scene functions draw flames straight to
    // the base canvas like they always have, so the static PNG still looks
    // complete even on browsers / devices that fail to load the fx frames.
    P.setFxCanvas(null);
    const base = e.fn();
    base.save(path.join(OUT, e.file));
    if (process.env.PREVIEW) base.scaled(4).save(path.join("/tmp", "prev-" + e.file));
    console.log("wrote", e.file, `${base.w}×${base.h}`);

    // Pass 2..n: fx frames. Each pass re-runs the scene fn against a fresh
    // transparent canvas with a different jitter — only the dynamic pixels
    // (candle flames, brazier blazes, torch tongues, dust motes, the
    // hearth blaze in the forge) end up on the fx canvas because parts.mjs
    // (and gen.mjs's wrapped hearth code) check _fx and mirror their
    // dynamic draws onto it.
    for (let i = 0; i < FX_JITTERS.length; i++) {
      const fxCv = new Canvas(base.w, base.h);
      P.setFxCanvas(fxCv, FX_JITTERS[i]);
      e.fn(); // discard returned base — we only want the fx canvas
      P.setFxCanvas(null);
      const fxFile = e.file.replace(/\.png$/, `-fx-${i}.png`);
      fxCv.save(path.join(OUT, fxFile));
      if (process.env.PREVIEW) fxCv.scaled(4).save(path.join("/tmp", "prev-" + fxFile));
      console.log("wrote", fxFile, `${fxCv.w}×${fxCv.h}`);
    }
  }
}
main();
