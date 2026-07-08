import Phaser from "phaser";

/**
 * Characters baked into the runtime bitmap-font atlas.
 *
 * Anything used in the card UI (descriptions, names, banners, glyphs)
 * needs to be in here — characters not in the atlas just won't render.
 * Add new ones as the game grows.
 */
const CHARS =
  ` !"#$%&'()*+,-./0123456789:;<=>?@` +
  `ABCDEFGHIJKLMNOPQRSTUVWXYZ` +
  `[\\]^_\`` +
  `abcdefghijklmnopqrstuvwxyz` +
  `{|}~` +
  // Common punctuation extras
  `×÷±©®™…—–“”‘’·` +
  // Card glyphs (status icons, suits, indicators)
  `◆◇✕✦★⚔⛨✚▼◀▶♛♠♥♦♣❤✺⏱` +
  // Greek + accented letters that crept into flavour text
  `’"—`;

/**
 * Render every glyph in CHARS to an off-screen canvas, then register the
 * canvas as a Phaser bitmap font keyed by `key`.
 *
 * `fontSize` is the BAKE size — make it large (~80-128) so when BitmapText
 * displays at a smaller size you get supersampled crisp output. The atlas
 * lives on the GPU as a single texture; glyphs are drawn as textured quads
 * so rotation/scale stay sharp.
 */
export function generateBitmapFont(
  scene: Phaser.Scene,
  key: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: string = "normal",
): void {
  const padding = 4;
  const fontDecl = `${fontWeight} ${fontSize}px ${fontFamily}`;

  // First pass: measure each glyph's advance width.
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) throw new Error("Canvas 2d context unavailable");
  measureCtx.font = fontDecl;
  measureCtx.textBaseline = "alphabetic";

  const probe = measureCtx.measureText("Mg");
  const ascent  = Math.ceil(probe.actualBoundingBoxAscent  ?? fontSize * 0.8);
  const descent = Math.ceil(probe.actualBoundingBoxDescent ?? fontSize * 0.25);
  const lineHeight = ascent + descent;

  // Glyph cell uses uniform width = max measured + padding (simple atlas).
  const widths: number[] = [];
  let maxWidth = 0;
  for (const ch of CHARS) {
    const w = Math.ceil(measureCtx.measureText(ch).width);
    widths.push(w);
    if (w > maxWidth) maxWidth = w;
  }
  const cellW = maxWidth + padding * 2;
  const cellH = lineHeight + padding * 2;

  const cols = 16;
  const rows = Math.ceil(CHARS.length / cols);

  // Build atlas canvas.
  const canvas = document.createElement("canvas");
  canvas.width  = cols * cellW;
  canvas.height = rows * cellH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d context unavailable");
  ctx.font = fontDecl;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff"; // white — Phaser tint applies on top
  // Subpixel antialiasing for the baked glyphs themselves.
  (ctx as unknown as { imageSmoothingEnabled: boolean }).imageSmoothingEnabled = true;

  // Phaser's BitmapFontCharacterData TS typings are missing several
  // runtime fields, so we type loosely and cast at registration time.
  const chars: Record<number, Record<string, unknown>> = {};

  // We need texture dimensions to compute UVs. Canvas size is fixed by now.
  const textureWidth = canvas.width;
  const textureHeight = canvas.height;

  for (let i = 0; i < CHARS.length; i++) {
    const ch = CHARS[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = col * cellW;
    const cellY = row * cellH;
    const charW = widths[i] || 1;
    const gx = cellX + padding;
    const gy = cellY + padding;
    const gw = charW;
    const gh = lineHeight;

    // Draw at baseline-aligned position inside the cell.
    ctx.fillText(ch, gx, gy + ascent);

    chars[ch.charCodeAt(0)] = {
      x: gx,
      y: gy,
      width: gw,
      height: gh,
      // Phaser's parser stores HALF-dimensions in centerX/Y (not absolute).
      centerX: Math.floor(gw / 2),
      centerY: Math.floor(gh / 2),
      xOffset: 0,
      yOffset: 0,
      xAdvance: gw + 1,
      data: {},
      kerning: {},
      // Pre-computed UVs in [0,1] texture space — REQUIRED by the WebGL
      // BitmapText renderer. Without these, glyphs render as invisible
      // quads (the bug that ate the card text on the first attempt).
      u0: gx / textureWidth,
      v0: gy / textureHeight,
      u1: (gx + gw) / textureWidth,
      v1: (gy + gh) / textureHeight,
    };
  }

  // Register the atlas canvas as a Phaser texture, then register the
  // bitmap-font metadata pointing at that texture. Match Phaser's loader
  // convention: texture key = font key, frame = null.
  scene.textures.addCanvas(key, canvas);
  const bmpFontConfig = {
    data: {
      font: fontFamily,
      size: fontSize,
      lineHeight,
      retroFont: false,
      chars,
    },
    texture: key,
    frame: null,
  } as unknown as Parameters<typeof scene.cache.bitmapFont.add>[1];
  scene.cache.bitmapFont.add(key, bmpFontConfig);
}
