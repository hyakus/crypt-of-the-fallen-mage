// Reusable pixel-art scene parts: architecture, props, lighting. Each takes a
// Canvas and draws in place. Kept material-agnostic where possible (pass a ramp
// from palette.mjs) so the same pillar/arch/brazier reads as crypt, castle, or
// throne depending on the ramp + light color handed in.
import { mix, lighten, darken } from "./pixellib.mjs";
import { PAL } from "./palette.mjs";

// Perspective flagstone floor: rows of tiles receding toward `vanishY`, getting
// shorter/darker with depth. Fills from `topY` to bottom of canvas.
export function floor(cv, topY, ramp, light, rand) {
  const { w, h } = cv;
  const depth = h - topY;
  // base wash, darker at the back
  cv.vgradStops(0, topY, w, depth, [
    [0, ramp[1]],
    [1, ramp[2]],
  ]);
  // horizontal mortar lines, spacing widens toward the front (perspective)
  let y = topY;
  let gap = 3;
  const seams = [];
  while (y < h) {
    seams.push(y);
    cv.hline(0, w - 1, y, ramp[0], 0.7);
    cv.hline(0, w - 1, y + 1, lighten(ramp[2], 0.06), 0.4);
    y += gap;
    gap += 1.4;
  }
  // vertical seams, offset per row (brick stagger), converging toward center
  const cx = w / 2;
  for (let r = 0; r < seams.length - 1; r++) {
    const y0 = seams[r], y1 = seams[r + 1];
    const tile = 16 + r * 6; // wider tiles toward the front
    const off = (r % 2) * (tile / 2);
    for (let bx = -tile; bx < w + tile; bx += tile) {
      // converge a touch toward centre for fake perspective
      const conv = (r / seams.length) * 0.12;
      const x0 = bx + off + (cx - (bx + off)) * conv;
      cv.vline(Math.round(x0), y0, y1 - 1, ramp[0], 0.55);
    }
  }
  // subtle grit
  cv.stipple(0, topY, w, depth, ramp[0], 0.04, rand, 0.5);
  cv.stipple(0, topY, w, depth, lighten(ramp[3], 0.1), 0.02, rand, 0.3);
}

// Back wall masonry (brick courses) from y0..y1.
export function backWall(cv, y0, y1, ramp, rand) {
  const { w } = cv;
  cv.vgradStops(0, y0, w, y1 - y0, [
    [0, ramp[0]],
    [1, ramp[2]],
  ]);
  const courseH = 7;
  let course = 0;
  for (let y = y0; y < y1; y += courseH) {
    cv.hline(0, w - 1, y, darken(ramp[0], 0.3), 0.6);
    const off = (course % 2) * 11;
    for (let x = -22 + off; x < w; x += 22) {
      cv.vline(x, y, Math.min(y1 - 1, y + courseH - 1), darken(ramp[0], 0.3), 0.5);
      // highlight top-left of each brick
      cv.hline(x + 1, x + 20, y + 1, lighten(ramp[2], 0.08), 0.25);
    }
    course++;
  }
  cv.stipple(0, y0, w, y1 - y0, darken(ramp[0], 0.4), 0.05, rand, 0.4);
}

// Vaulted ceiling: dark arched band across the top with ribbed vault lines.
export function vault(cv, h0, ramp) {
  const { w } = cv;
  cv.vgradStops(0, 0, w, h0, [
    [0, PAL.void],
    [1, ramp[1]],
  ]);
  const cx = w / 2;
  // ribs radiating from a keystone
  for (let i = -3; i <= 3; i++) {
    const x1 = cx + i * (w / 7);
    cv.line(cx, 2, x1, h0, darken(ramp[0], 0.2), 0.5);
  }
  // arch curve
  for (let x = 0; x < w; x++) {
    const t = (x - cx) / (w / 2);
    const yy = Math.round(h0 * 0.5 + t * t * h0 * 0.5);
    cv.px(x, yy, ramp[2], 0.6);
    cv.px(x, yy + 1, darken(ramp[0], 0.2), 0.7);
  }
}

// Chunky stone pillar with capital + base. cx = centre x, drawn from y0..y1.
export function pillar(cv, cx, y0, y1, pw, ramp) {
  const x = Math.round(cx - pw / 2);
  const hi = lighten(ramp[3], 0.12), lo = darken(ramp[0], 0.25);
  // shaft with vertical shading (left lit)
  for (let xx = 0; xx < pw; xx++) {
    const t = xx / (pw - 1);
    const col = mix(lighten(ramp[3], 0.1), darken(ramp[1], 0.1), t);
    cv.vline(x + xx, y0, y1, col);
  }
  cv.vline(x, y0, y1, hi, 0.8);
  cv.vline(x + pw - 1, y0, y1, lo);
  // fluting grooves
  for (let g = 1; g < 4; g++) cv.vline(x + Math.round((pw * g) / 4), y0 + 4, y1 - 4, darken(ramp[1], 0.2), 0.4);
  // capital
  cv.block(x - 4, y0 - 6, pw + 8, 7, ramp[3], { hi, lo });
  cv.block(x - 6, y0 - 9, pw + 12, 4, ramp[2], { hi, lo });
  // base
  cv.block(x - 5, y1 - 5, pw + 10, 7, ramp[3], { hi, lo });
}

// Rounded (Romanesque) arch opening: a rectangle capped by a clean
// half-ellipse. cx = centre, baseY = floor line, archW/archH = full size.
export function archway(cv, cx, baseY, archW, archH, ramp, innerCol) {
  innerCol = innerCol || PAL.void;
  const half = archW / 2;
  const capH = Math.min(archH * 0.55, half);  // height of the arched cap
  const springY = Math.round(baseY - (archH - capH));
  const left = Math.round(cx - half), right = Math.round(cx + half);
  // straight jambs
  for (let y = springY; y <= baseY; y++) cv.hline(left, right, y, innerCol);
  // elliptical cap
  for (let dy = 1; dy <= capH; dy++) {
    const t = dy / capH;                       // 0..1 toward apex
    const hw = Math.round(half * Math.sqrt(Math.max(0, 1 - t * t)));
    cv.hline(cx - hw, cx + hw, springY - dy, innerCol);
  }
  // stone voussoir frame around the cap + jambs
  const frame = darken(ramp[1], 0.12), fhi = lighten(ramp[2], 0.06);
  cv.vline(left - 1, springY, baseY, frame); cv.vline(left - 2, springY, baseY, frame);
  cv.vline(right + 1, springY, baseY, frame); cv.vline(right + 2, springY, baseY, frame);
  for (let dy = 0; dy <= capH; dy++) {
    const t = dy / capH;
    const hw = half * Math.sqrt(Math.max(0, 1 - t * t));
    cv.px(Math.round(cx - hw) - 1, springY - dy, frame);
    cv.px(Math.round(cx + hw) + 1, springY - dy, frame);
    cv.px(Math.round(cx - hw), springY - dy, fhi, 0.3);
    cv.px(Math.round(cx + hw), springY - dy, fhi, 0.3);
  }
}

// Hanging banner / tapestry from y0, length len, centred at cx.
export function banner(cv, cx, y0, bw, len, cloth, emblem) {
  const x = Math.round(cx - bw / 2);
  const hi = lighten(cloth, 0.18), lo = darken(cloth, 0.3);
  // rod
  cv.rect(x - 3, y0 - 2, bw + 6, 2, PAL.iron[3]);
  // cloth with shaded folds + V bottom
  for (let yy = 0; yy < len; yy++) {
    const y = y0 + yy;
    const taper = yy > len - 8 ? (yy - (len - 8)) : 0; // V notch at bottom
    for (let xx = 0; xx < bw; xx++) {
      if (taper > 0 && Math.abs(xx - bw / 2) > bw / 2 - taper) continue;
      // fold shading: sine across width
      const f = Math.sin((xx / bw) * Math.PI * 3);
      const col = f > 0.4 ? hi : f < -0.4 ? lo : cloth;
      cv.px(x + xx, y, col);
    }
  }
  cv.vline(x, y0, y0 + len - 8, lo, 0.7);
  cv.vline(x + bw - 1, y0, y0 + len - 8, lo, 0.7);
  // emblem blob
  if (emblem) {
    cv.disc(cx, y0 + Math.round(len * 0.4), Math.max(3, Math.round(bw / 5)), emblem, 0.9);
  }
}

// FX-canvas plumbing. setFxCanvas(fx, jitter) makes subsequent flame-emitting
// parts also draw their DYNAMIC pixels (flame body, glow, drifting motes) onto
// `fx` with `flame_height * jitter`. The base canvas always gets its canonical
// flame so the unanimated PNG still reads correctly on its own; the fx canvas
// is what Phaser layers on top and cycles between frames to produce flicker.
let _fx = null;
let _jitter = 1;
export function setFxCanvas(fx = null, jitter = 1) { _fx = fx; _jitter = jitter; }
// For scenes (notably the forge hearth) that draw flames via direct
// `cv.glow` / `P.flame` calls rather than through candle/torch/brazier:
// `mirrorFx(draw)` invokes `draw(target, jitter)` once for each layer that
// needs them — once for the base canvas implicitly via the existing code,
// and once for the fx canvas if one is set. Callers pass a closure that
// draws the dynamic pixels parameterised by jitter.
export function mirrorFx(drawFn) {
  if (_fx) drawFn(_fx, _jitter);
}

// Candle on a holder with a live flame + glow. Returns nothing.
export function candle(cv, cx, baseY, ch, scale = 1) {
  const cw = Math.max(2, Math.round(2 * scale));
  // wax body
  cv.block(cx - cw, baseY - ch, cw * 2, ch, PAL.bone[3], { hi: PAL.bone[4], lo: PAL.bone[1] });
  // drips
  cv.px(cx - cw, baseY - Math.round(ch * 0.4), PAL.bone[4]);
  // flame (base — canonical shape)
  const fh = Math.max(2, Math.round(3 * scale));
  flame(cv, cx, baseY - ch - 1, fh);
  cv.glow(cx, baseY - ch - 2, Math.round(16 * scale), PAL.flame[4], 0.5, 2);
  cv.glow(cx, baseY - ch - 2, Math.round(34 * scale), PAL.flame[3], 0.18, 2.4);
  // Mirror onto the fx canvas with jittered height + glow radius for flicker.
  if (_fx) {
    const jfh = Math.max(2, Math.round(fh * _jitter));
    flame(_fx, cx, baseY - ch - 1, jfh);
    _fx.glow(cx, baseY - ch - 2, Math.round(16 * scale * _jitter), PAL.flame[4], 0.5, 2);
    _fx.glow(cx, baseY - ch - 2, Math.round(34 * scale * _jitter), PAL.flame[3], 0.18, 2.4);
  }
}

// A small teardrop flame, hot core to amber tip, height ~h.
export function flame(cv, cx, tipY, h) {
  const baseY = tipY + h;
  for (let y = tipY; y <= baseY; y++) {
    const t = (y - tipY) / h; // 0 tip..1 base
    const rad = Math.max(0.5, t * (h / 2.4));
    for (let x = -Math.ceil(rad); x <= Math.ceil(rad); x++) {
      if (Math.abs(x) <= rad) {
        const inner = Math.abs(x) < rad * 0.45;
        cv.px(cx + x, y, inner ? PAL.flame[5] : t < 0.4 ? PAL.flame[3] : PAL.flame[2]);
      }
    }
  }
  cv.px(cx, tipY, PAL.flame[4]);
}

// Iron brazier bowl on a stand with fire + heavy glow. cx centre, baseY ground.
export function brazier(cv, cx, baseY, scale, light = PAL.flame) {
  const bw = Math.round(14 * scale);
  // tripod legs
  cv.line(cx - bw / 2, baseY - 12 * scale, cx - 2, baseY, PAL.iron[1]);
  cv.line(cx + bw / 2, baseY - 12 * scale, cx + 2, baseY, PAL.iron[1]);
  cv.line(cx, baseY - 12 * scale, cx, baseY, PAL.iron[2]);
  // bowl
  const bowlY = Math.round(baseY - 13 * scale);
  cv.block(cx - bw, bowlY, bw * 2, Math.round(6 * scale), PAL.iron[2], { hi: PAL.iron[4], lo: PAL.iron[0] });
  cv.ellipse(cx, bowlY, bw, Math.round(3 * scale), PAL.iron[1]);
  // coals (dynamic — the ember glow flickers)
  cv.ellipse(cx, bowlY - 1, bw - 2, Math.round(2 * scale), PAL.ember[2]);
  cv.ellipse(cx, bowlY - 1, Math.round((bw - 2) * 0.6), Math.round(2 * scale), PAL.ember[3]);
  // Helper that draws the brazier's five-flame cluster on a target canvas
  // at a given jitter — used once for the base, then once per fx frame.
  const drawFireOn = (target, j) => {
    const fh = Math.round(13 * scale * j);
    flame(target, cx - Math.round(bw * 0.35), bowlY - Math.round(fh * 0.55), Math.round(fh * 0.55));
    flame(target, cx + Math.round(bw * 0.35), bowlY - Math.round(fh * 0.55), Math.round(fh * 0.55));
    flame(target, cx - Math.round(bw * 0.15), bowlY - Math.round(fh * 0.8),  Math.round(fh * 0.8));
    flame(target, cx + Math.round(bw * 0.15), bowlY - Math.round(fh * 0.8),  Math.round(fh * 0.8));
    flame(target, cx,                          bowlY - fh,                    fh);
    target.glow(cx, bowlY - fh / 2, Math.round(40 * scale * j), light[4], 0.4, 2);
    target.glow(cx, bowlY - fh / 2, Math.round(80 * scale * j), light[3], 0.14, 2.5);
  };
  drawFireOn(cv, 1);
  if (_fx) drawFireOn(_fx, _jitter);
}

// Wall torch in an iron bracket, flame leaning slightly.
export function torch(cv, x, y, scale, light = PAL.flame) {
  cv.block(x - 1, y, 2, Math.round(12 * scale), PAL.wood[2], { hi: PAL.wood[3], lo: PAL.wood[0] });
  // bracket
  cv.line(x, y + 10 * scale, x - 4, y + 12 * scale, PAL.iron[2]);
  // canonical flame on base
  flame(cv, x, y - Math.round(10 * scale), Math.round(11 * scale));
  cv.glow(x, y - 4 * scale, Math.round(26 * scale), light[4], 0.45, 2);
  cv.glow(x, y - 4 * scale, Math.round(52 * scale), light[3], 0.16, 2.5);
  // jittered flame on fx (if any) for cyclable flicker
  if (_fx) {
    flame(_fx, x, y - Math.round(10 * scale), Math.max(2, Math.round(11 * scale * _jitter)));
    _fx.glow(x, y - 4 * scale, Math.round(26 * scale * _jitter), light[4], 0.45, 2);
    _fx.glow(x, y - 4 * scale, Math.round(52 * scale * _jitter), light[3], 0.16, 2.5);
  }
}

// Skull (front view) centred at cx,cy, radius r.
export function skull(cv, cx, cy, r, tone = PAL.bone) {
  cv.ellipse(cx, cy, r, Math.round(r * 1.15), tone[3]);
  // cranium shading
  cv.ellipse(cx - r * 0.3, cy - r * 0.3, Math.round(r * 0.5), Math.round(r * 0.45), tone[4], 0.5);
  // jaw
  cv.rect(cx - Math.round(r * 0.5), cy + r, Math.round(r), Math.round(r * 0.5), tone[2]);
  // eye sockets
  const er = Math.max(1, Math.round(r * 0.32));
  cv.disc(cx - Math.round(r * 0.45), cy - Math.round(r * 0.1), er, PAL.void);
  cv.disc(cx + Math.round(r * 0.45), cy - Math.round(r * 0.1), er, PAL.void);
  // nose
  cv.disc(cx, cy + Math.round(r * 0.4), Math.max(1, Math.round(r * 0.18)), PAL.void);
  // teeth lines
  for (let i = -1; i <= 1; i++) cv.vline(cx + i * Math.round(r * 0.3), cy + r, cy + r + Math.round(r * 0.45), tone[1]);
}

// Crossed femurs behind a point.
export function crossbones(cv, cx, cy, len, tone = PAL.bone) {
  for (const dir of [1, -1]) {
    cv.line(cx - len, cy - dir * len * 0.5, cx + len, cy + dir * len * 0.5, tone[2]);
    // knobby ends
    cv.disc(cx - len, cy - dir * len * 0.5, 2, tone[3]);
    cv.disc(cx + len, cy + dir * len * 0.5, 2, tone[3]);
  }
}

// Cobweb in a corner. corner: 'tl','tr'. size px.
export function cobweb(cv, corner, size, col = PAL.stone[4]) {
  const { w } = cv;
  const ox = corner.includes("l") ? 0 : w - 1;
  const dirx = corner.includes("l") ? 1 : -1;
  const oy = 0, diry = 1;
  // radial threads
  for (let i = 1; i <= 4; i++) {
    const ang = (i / 5) * (Math.PI / 2);
    cv.line(ox, oy, ox + dirx * size * Math.cos(ang), oy + diry * size * Math.sin(ang), col, 0.35);
  }
  // arcs
  for (let rr = size * 0.35; rr < size; rr += size * 0.28) {
    let prev = null;
    for (let a = 0; a <= Math.PI / 2; a += 0.12) {
      const x = ox + dirx * rr * Math.cos(a);
      const y = oy + diry * rr * Math.sin(a);
      if (prev) cv.line(prev[0], prev[1], x, y, col, 0.3);
      prev = [x, y];
    }
  }
}

// ============================================================================
// FOREST PRIMITIVES — used by the cursed-forest biome (floors 4-8).
// ============================================================================

/**
 * Stylised twisted tree silhouette — gnarled trunk plus a clustered canopy
 * of ellipse "leaves" at the top. Used for living-but-cursed forest scenes;
 * pair `leafRamp` with PAL.toxic for sickly greens or with PAL.basalt for
 * blackened/dead aesthetics.
 *
 * cx, baseY = trunk-base centre, world coords. trunkH controls overall size;
 * scale=1 → mid-ground tree, scale=1.6 → foreground hero tree.
 */
export function tree(cv, cx, baseY, trunkH, scale = 1, trunkRamp = PAL.wood, leafRamp = PAL.toxic) {
  const tw = Math.max(2, Math.round(3 * scale));
  // Trunk — slightly tapered toward the top, with darker shading on the left
  // (faux directional light) so it reads as 3D rather than a flat post.
  for (let y = 0; y < trunkH; y++) {
    const t = y / Math.max(1, trunkH);
    const w = Math.max(1, Math.round(tw * (1 - t * 0.35)));
    // Slight zigzag for a twisted feel
    const sway = Math.round(Math.sin(y * 0.18) * 1.2);
    for (let x = -w; x <= w; x++) {
      const shade = x < 0 ? trunkRamp[1] : x === w ? trunkRamp[3] : trunkRamp[2];
      cv.px(cx + sway + x, baseY - y, shade);
    }
  }
  // Bare branches kicking out near the top
  const tipY = baseY - trunkH;
  const branchN = 3;
  for (let i = 0; i < branchN; i++) {
    const a = -Math.PI / 2 + (i - 1) * 0.7;
    const len = Math.round((8 + Math.random() * 4) * scale);
    cv.line(cx, tipY + 2, cx + Math.cos(a) * len, tipY + Math.sin(a) * len, trunkRamp[1]);
  }
  // Canopy — 3-5 overlapping leaf ellipses for a clumpy silhouette
  const cw = Math.round(14 * scale), ch = Math.round(10 * scale);
  cv.ellipse(cx, tipY - ch * 0.4, cw, ch, leafRamp[2]);
  cv.ellipse(cx - cw * 0.45, tipY - ch * 0.2, Math.round(cw * 0.65), Math.round(ch * 0.75), leafRamp[1]);
  cv.ellipse(cx + cw * 0.45, tipY - ch * 0.2, Math.round(cw * 0.65), Math.round(ch * 0.75), leafRamp[1]);
  cv.ellipse(cx, tipY - ch * 0.85, Math.round(cw * 0.55), Math.round(ch * 0.6), leafRamp[3]);
}

/**
 * Dead tree — skeletal twisted trunk with NO canopy. Branches reach upward
 * in jagged forks. Trunk colour leans toward bone/iron rather than wood for
 * the "long dead" reading. Used heavily in the mire and bone-thicket
 * floors.
 */
export function deadTree(cv, cx, baseY, trunkH, scale = 1, ramp = PAL.bone) {
  const tw = Math.max(1, Math.round(2 * scale));
  for (let y = 0; y < trunkH; y++) {
    const t = y / Math.max(1, trunkH);
    const w = Math.max(1, Math.round(tw * (1 - t * 0.5)));
    const sway = Math.round(Math.sin(y * 0.22 + cx * 0.03) * 1.6);
    for (let x = -w; x <= w; x++) {
      cv.px(cx + sway + x, baseY - y, x < 0 ? ramp[0] : ramp[1]);
    }
  }
  // Branching: at ~70% trunk height fork into 2-3 jagged arms
  const tipY = baseY - trunkH;
  const fork = baseY - Math.round(trunkH * 0.7);
  for (const dir of [-1, 1]) {
    let x = cx, y = fork;
    const segs = 3 + Math.floor(Math.random() * 2);
    for (let s = 0; s < segs; s++) {
      const len = Math.round((4 + Math.random() * 3) * scale);
      const nx = x + dir * len + (Math.random() < 0.5 ? -1 : 1);
      const ny = y - len + (Math.random() < 0.5 ? -1 : 0);
      cv.line(x, y, nx, ny, ramp[1]);
      x = nx; y = ny;
    }
  }
  // Topmost spike
  cv.line(cx, fork, cx + (Math.random() < 0.5 ? -1 : 1), tipY - 2, ramp[2]);
}

/**
 * Mushroom — stalk plus a domed cap with spots. cap colour comes from a
 * dedicated ramp (PAL.flame for fly-agaric reds, PAL.toxic for cursed
 * greens, PAL.ghost for ghostly blues). Optional `glow` flag draws a soft
 * halo under the cap — used for floors where the cap itself is luminescent.
 */
export function mushroom(cv, cx, baseY, scale = 1, capRamp = PAL.flame, stalkRamp = PAL.bone, glow = false) {
  const sh = Math.round(7 * scale);
  const sw = Math.max(1, Math.round(1.5 * scale));
  // Stalk
  cv.block(cx - sw, baseY - sh, sw * 2, sh, stalkRamp[3], { hi: stalkRamp[4], lo: stalkRamp[1] });
  // Cap — half-ellipse done by ellipse() then chopping the bottom half
  const cw = Math.round(7 * scale), ch = Math.round(5 * scale);
  const capY = baseY - sh;
  for (let y = -ch; y <= 0; y++) for (let x = -cw; x <= cw; x++) {
    if ((x * x) / (cw * cw) + (y * y) / (ch * ch) <= 1) {
      const t = -y / ch;
      const col = t > 0.6 ? capRamp[3] : t > 0.3 ? capRamp[2] : capRamp[1];
      cv.px(cx + x, capY + y, col);
    }
  }
  // Cap underside lip
  cv.hline(cx - cw, cx + cw, capY, stalkRamp[2]);
  // Spots — 2-3 small light dots
  for (let i = 0; i < 3; i++) {
    const sx = cx + Math.round((Math.random() * 2 - 1) * cw * 0.6);
    const sy = capY + Math.round((-Math.random() - 0.2) * ch);
    cv.px(sx, sy, capRamp[5] ?? capRamp[4] ?? capRamp[3]);
    cv.px(sx + 1, sy, capRamp[5] ?? capRamp[4] ?? capRamp[3]);
  }
  if (glow) {
    cv.glow(cx, capY - 2, Math.round(14 * scale), capRamp[3], 0.35, 2);
    if (_fx) _fx.glow(cx, capY - 2, Math.round(14 * scale * _jitter), capRamp[3], 0.35, 2);
  }
}

/**
 * Hanging vine — a wandering line from (x,y) downward by `length` pixels,
 * with small leaf clusters punctuating it. Adds the "things grow over
 * everything" feel of an old cursed wood.
 */
export function vine(cv, x, y, length, ramp = PAL.toxic) {
  let cx = x;
  for (let dy = 0; dy < length; dy++) {
    if (dy % 3 === 0) cx += Math.random() < 0.5 ? -1 : 1;
    cv.px(cx, y + dy, dy % 4 === 0 ? ramp[2] : ramp[1]);
    if (dy % 6 === 0 && dy > 2) {
      // small leaf cluster — 3 px wide
      cv.px(cx - 1, y + dy, ramp[3]);
      cv.px(cx + 1, y + dy, ramp[3]);
    }
  }
  return cx; // returns the final x so callers can stack vines
}

/**
 * Twisted roots fanning out from a tree base — three or four arcing lines
 * curling away from `cx`. Used to give boss-area trees a more menacing
 * footing and to fill mid-foreground space in forest scenes.
 */
export function roots(cv, cx, baseY, spread, ramp = PAL.wood) {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const dir = i < n / 2 ? -1 : 1;
    const len = spread - Math.round(Math.random() * spread * 0.3);
    let x = cx, y = baseY;
    for (let s = 0; s < len; s++) {
      x += dir * 0.6 + (Math.random() < 0.5 ? -1 : 0);
      y += 0.4 + Math.random() * 0.2;
      cv.px(Math.round(x), Math.round(y), s < len * 0.3 ? ramp[2] : ramp[1]);
      if (s % 2 === 0) cv.px(Math.round(x), Math.round(y) + 1, ramp[0]);
    }
  }
}

/**
 * Forest floor (litter + dirt) — like floor() but darker, with twigs/leaf
 * scatter rather than tile pattern. topY is where the ground starts;
 * extends down to canvas bottom.
 */
export function forestFloor(cv, topY, dirtRamp = PAL.wood, leafRamp = PAL.toxic, rand = Math.random) {
  const { w, h } = cv;
  cv.vgradStops(0, topY, w, h - topY, [
    [0, dirtRamp[1]], [0.5, dirtRamp[0]], [1, PAL.void],
  ]);
  // Scattered litter
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(rand() * w);
    const y = topY + Math.floor(rand() * (h - topY));
    const c = rand() < 0.4 ? leafRamp[1] : dirtRamp[2];
    cv.px(x, y, c, 0.7);
  }
  // Subtle highlight strip just below topY (where the ground starts)
  for (let x = 0; x < w; x++) {
    if (Math.random() < 0.4) cv.px(x, topY, dirtRamp[3], 0.4);
  }
}

// Dust motes / floating embers scattered in a region.
//
// Motes are also dynamic — they drift across frames. We draw them on the
// base canvas (so the static PNG still has ambient sparkle) and ALSO on the
// fx canvas if set, but with per-frame jitter on each mote's position so
// cycling frames produces a gentle drift.
export function motes(cv, x, y, w, h, col, n, rand, a = 0.5) {
  for (let i = 0; i < n; i++) {
    const mx = x + rand() * w, my = y + rand() * h;
    cv.px(mx, my, col, a * (0.4 + rand() * 0.6));
    if (rand() < 0.3) cv.glow(mx, my, 2, col, a * 0.4, 1.5);
    if (_fx) {
      // Drift the fx copy a couple of pixels based on jitter so successive
      // frames show motes nudging around their canonical positions.
      const dx = Math.round((_jitter - 1) * 3);
      const dy = Math.round((1 - _jitter) * 2);
      _fx.px(mx + dx, my + dy, col, a * (0.4 + rand() * 0.6));
      if (rand() < 0.3) _fx.glow(mx + dx, my + dy, 2, col, a * 0.4, 1.5);
    }
  }
}
