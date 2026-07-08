// Pixel-art engine for Crypt of the Fallen Mage.
//
// Produces TRUE low-resolution raster PNGs (e.g. 320×200). The game displays
// them with nearest-neighbour filtering (NEAREST), so each source pixel becomes
// a crisp chunky block on screen — authentic pixel art that stays sharp at any
// scale and on any phone. No external deps: PNG is encoded with Node's zlib.
//
// Coordinate system: (0,0) top-left, x→right, y→down. All colors are [r,g,b]
// 0-255; alpha is handled via separate `a` arg (0-1) with source-over blend.

import zlib from "node:zlib";
import fs from "node:fs";

// ----------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) so every build produces identical art.
// ----------------------------------------------------------------------------
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------------------
// Color helpers
// ----------------------------------------------------------------------------
export function hex(s) {
  s = s.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
// Linear blend between two colors, t in [0,1].
export function mix(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}
// Lighten/darken toward white/black by amount [0,1].
export const lighten = (c, t) => mix(c, [255, 255, 255], t);
export const darken = (c, t) => mix(c, [0, 0, 0], t);

// 8×8 Bayer ordered-dither matrix, normalised to [0,1).
const BAYER8 = (() => {
  const m = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ];
  return m.map((row) => row.map((v) => (v + 0.5) / 64));
})();
export const bayer = (x, y) => BAYER8[((y % 8) + 8) % 8][((x % 8) + 8) % 8];

// ----------------------------------------------------------------------------
// Canvas
// ----------------------------------------------------------------------------
export class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.buf = new Uint8Array(w * h * 4); // RGBA, starts transparent black
  }

  // Source-over blend a pixel.
  px(x, y, c, a = 1) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    if (a >= 1) {
      this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2]; this.buf[i + 3] = 255;
      return;
    }
    const sa = a;
    const da = this.buf[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) {
      const sc = c[k] * sa;
      const dc = this.buf[i + k] * da * (1 - sa);
      this.buf[i + k] = Math.round((sc + dc) / oa);
    }
    this.buf[i + 3] = Math.round(oa * 255);
  }

  // Filled axis-aligned rectangle.
  rect(x, y, w, h, c, a = 1) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c, a);
  }
  // 1px-thick rectangle outline (thickness configurable).
  rectb(x, y, w, h, c, a = 1, t = 1) {
    this.rect(x, y, w, t, c, a);
    this.rect(x, y + h - t, w, t, c, a);
    this.rect(x, y, t, h, c, a);
    this.rect(x + w - t, y, t, h, c, a);
  }
  hline(x0, x1, y, c, a = 1) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.px(x, y, c, a); }
  vline(x, y0, y1, c, a = 1) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.px(x, y, c, a); }

  // Bresenham line.
  line(x0, y0, x1, y1, c, a = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // Filled disc.
  disc(cx, cy, r, c, a = 1) {
    const r2 = r * r;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r2) this.px(cx + x, cy + y, c, a);
  }
  // Disc outline (ring).
  ring(cx, cy, r, c, a = 1, t = 1) {
    const ro = r * r, ri = (r - t) * (r - t);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (d <= ro && d >= ri) this.px(cx + x, cy + y, c, a);
    }
  }
  // Filled ellipse.
  ellipse(cx, cy, rx, ry, c, a = 1) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++)
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) this.px(cx + x, cy + y, c, a);
  }

  // Vertical 2-stop dithered gradient over a region (ordered Bayer dither).
  vgrad(x, y, w, h, top, bot, a = 1) {
    for (let yy = 0; yy < h; yy++) {
      const t = h <= 1 ? 0 : yy / (h - 1);
      for (let xx = 0; xx < w; xx++) {
        // Dither chooses between the two nearest quantised steps.
        const c = mix(top, bot, t);
        // add subtle dithering by nudging between neighbour rows
        const d = bayer(x + xx, y + yy);
        const t2 = Math.min(1, Math.max(0, t + (d - 0.5) * (1 / h) * 2));
        this.px(x + xx, y + yy, mix(top, bot, t2), a);
      }
    }
  }

  // Multi-stop vertical gradient. stops = [[pos0..1, color], ...] sorted.
  vgradStops(x, y, w, h, stops, a = 1) {
    for (let yy = 0; yy < h; yy++) {
      const t = h <= 1 ? 0 : yy / (h - 1);
      let c = stops[0][1];
      for (let s = 0; s < stops.length - 1; s++) {
        const [p0, c0] = stops[s], [p1, c1] = stops[s + 1];
        if (t >= p0 && t <= p1) { c = mix(c0, c1, (t - p0) / (p1 - p0 || 1)); break; }
        if (t > p1) c = c1;
      }
      for (let xx = 0; xx < w; xx++) {
        const d = bayer(x + xx, y + yy);
        // dither between this row and slightly toward next
        const tt = Math.min(1, Math.max(0, t + (d - 0.5) * (2 / h)));
        let cc = stops[0][1];
        for (let s = 0; s < stops.length - 1; s++) {
          const [p0, c0] = stops[s], [p1, c1] = stops[s + 1];
          if (tt >= p0 && tt <= p1) { cc = mix(c0, c1, (tt - p0) / (p1 - p0 || 1)); break; }
          if (tt > p1) cc = c1;
        }
        this.px(x + xx, y + yy, cc, a);
      }
    }
  }

  // Soft radial glow (additive-ish via alpha falloff). Good for candle light.
  glow(cx, cy, r, c, maxA = 0.6, pow = 2) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y) / r;
      if (d > 1) continue;
      const a = maxA * Math.pow(1 - d, pow);
      this.px(cx + x, cy + y, c, a);
    }
  }
  // Elliptical glow.
  glowE(cx, cy, rx, ry, c, maxA = 0.6, pow = 2) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const d = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry));
      if (d > 1) continue;
      this.px(cx + x, cy + y, c, maxA * Math.pow(1 - d, pow));
    }
  }

  // Chunky beveled block: base fill, top+left highlight, bottom+right shadow.
  // The signature "chunky pixel art with shadows" primitive.
  block(x, y, w, h, base, { hi, lo, bevel = 1 } = {}) {
    hi = hi || lighten(base, 0.28);
    lo = lo || darken(base, 0.4);
    this.rect(x, y, w, h, base);
    for (let b = 0; b < bevel; b++) {
      this.hline(x + b, x + w - 1 - b, y + b, hi);          // top
      this.vline(x + b, y + b, y + h - 1 - b, hi);          // left
      this.hline(x + b, x + w - 1 - b, y + h - 1 - b, lo);  // bottom
      this.vline(x + w - 1 - b, y + b, y + h - 1 - b, lo);  // right
    }
  }

  // Scatter stipple noise of a color within a rect (texture / grit).
  stipple(x, y, w, h, c, density, rand, a = 1) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++)
      if (rand() < density) this.px(xx, yy, c, a);
  }

  // Apply an edge vignette (darken corners/edges) by alpha.
  vignette(strength = 0.55, pow = 2.2, c = [0, 0, 0]) {
    const cx = (this.w - 1) / 2, cy = (this.h - 1) / 2;
    const maxd = Math.sqrt(cx * cx + cy * cy);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxd;
      const a = strength * Math.pow(d, pow);
      if (a > 0.003) this.px(x, y, c, a);
    }
  }

  // ----- PNG export -----
  toPNG() {
    const { w, h, buf } = this;
    // Build raw scanlines with filter byte 0.
    const stride = w * 4;
    const raw = Buffer.alloc((stride + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (stride + 1)] = 0;
      buf.subarray(y * stride, (y + 1) * stride).forEach((v, i) => { raw[y * (stride + 1) + 1 + i] = v; });
    }
    const idat = zlib.deflateSync(raw, { level: 9 });

    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
      const t = Buffer.from(type, "ascii");
      const body = Buffer.concat([t, data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0, 0);
      return Buffer.concat([len, body, crc]);
    };
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type RGBA
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
  }

  save(path) {
    fs.writeFileSync(path, this.toPNG());
    return path;
  }

  // Nearest-neighbour upscaled copy (for inspecting the chunky pixels).
  scaled(f) {
    const out = new Canvas(this.w * f, this.h * f);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = (y * this.w + x) * 4;
      const c = [this.buf[i], this.buf[i + 1], this.buf[i + 2]];
      const a = this.buf[i + 3] / 255;
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++)
        out.px(x * f + dx, y * f + dy, c, a);
    }
    return out;
  }
}

// CRC32 for PNG chunks.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}
