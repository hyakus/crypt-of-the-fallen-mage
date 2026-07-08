# Art notes & upgrade path

## Backgrounds: chunky pixel art (current)

Every scene/level/node background is **true low-resolution raster pixel art**,
generated procedurally and displayed with NEAREST filtering so each source pixel
becomes a crisp, chunky on-screen block — sharp at any size and on any phone.

- **Generator:** `tools/` — `pixellib.mjs` (PNG encoder + drawing/dither/bevel
  primitives), `palette.mjs` (dark-fantasy material ramps), `parts.mjs`
  (reusable architecture/props/lighting), `gen.mjs` (one composer per scene).
- **Regenerate all art:** `npm run art` (writes PNGs to `public/art/`).
  Preview upscaled: `PREVIEW=1 npm run art` → `/tmp/prev-*.png`.
- **Native resolution:** landscape scenes 320×200 (16:10), tall map frames
  200×320 (10:16). Compositions are symmetric/centred so the full-bleed
  horizontal stretch on wide phones reads as intended.
- **Wiring:** `src/ui/sceneBg.ts` — `preloadBackgrounds` + `applyPixelFilters`
  run in `BootScene`; scenes call `addBackground(this, key, { dim })` (replacing
  the old solid `C.bg` fill). Combat layers the per-floor level art *behind* the
  animated arcane sigil (`combat-{crypt,castle,throne}`); the map frames keep
  their `map-backdrop-{floor}` keys (now PNG, was SVG).
- **Asset set:** combat crypt/castle/throne, map floors 1–3, forge, well,
  shrine, grave, shop, meta-shop, menu, dream, gameover, victory.

To restyle a scene, edit its composer in `gen.mjs` and rerun `npm run art`.
The only hand-authored SVG left is `combat-backdrop.svg` (the animated sigil
CombatScene spins up — it rides *above* the pixel-art level art).

Still code-drawn (candidates for a future pixel-art pass): card faces
(`CardSprite.ts`), enemy portraits, and map-node glyphs.

## v1 (original scaffold): all art was code-drawn

There are **no external image files** in the project yet. Every visual is drawn with Phaser's `Graphics` primitives plus `Text`:

- **Cards** — rounded rectangle, class-tinted border, parchment fill, top name banner, bottom meta strip. See [src/ui/CardSprite.ts](../src/ui/CardSprite.ts).
- **Enemy portraits** — silhouette block with two glowing eye dots. See `CombatScene.create()`.
- **Map nodes** — circles with glyph characters (`⚔ ☠ $ ⚱ ⚒ ✦ ♛`).
- **Backgrounds** — solid color + soft radial "candlelight" overlays.

This means the game **runs with zero asset dependencies** — perfect for early playtesting.

## v2: drop-in free assets

Suggested free / CC0 sources:

| Slot | Source | Notes |
|------|--------|-------|
| Class icons (sorcerer / warrior etc.) | [game-icons.net](https://game-icons.net) | CC-BY 3.0. White SVG icons, tintable. |
| Card frames | Itch.io "RPG card frame" packs (lots of CC0) | Look for parchment / fantasy style. |
| Enemy silhouettes | OpenGameArt fantasy monster packs | Silhouettes specifically so they sit on parchment. |
| Boss illustrations | AI-generated (Stable Diffusion or Midjourney) | One painting per boss for impact. |
| UI ornament (corners, bars) | "illuminated manuscript" public-domain scans | Wikimedia Commons has many. |

Drop them in `public/art/` and load them in `BootScene.preload()` like:

```ts
this.load.image("frame-sorcerer", "art/frames/sorcerer.png");
this.load.image("enemy-cryptrat",  "art/enemies/cryptrat.png");
```

Then upgrade `CardSprite.ts` and `CombatScene` to use the loaded textures instead of `Graphics`. The data layer doesn't need to change.

## v3: bespoke art

When the game is fun and you want it to *look* like the GDD says it should:

- One illuminated frame per class (5: sorcerer / warrior / barbarian / battlemage / fusion).
- One painting per card (88 + 4 supers + 20 fusions = 112 minimum). This is the expensive bit.
- One full painting per boss (3) + one per elite (3).
- Animated candle background loop for the main menu & dream scene.
- Page-turn / dry-paper SFX for UI clicks; low strings + bell for combat.

## Visual direction (sticky)

If anything is added by AI generation, the *one rule that matters*: **flat illuminated-manuscript palette**. Cream parchment, dried-blood red, candle amber, ghost blue, deep crypt purple/black. No bright greens, no neon, no glossy 3D shading. If a generated asset feels like it belongs in a different game, reject it.

Reference moodboard prompts:
- *"medieval illuminated manuscript card frame, parchment, gold leaf, dried blood ink, flat"*
- *"silhouette of a [creature], glowing eyes, against aged parchment, woodcut style"*
- *"painting of a fallen wizard rising from a stone coffin, candlelight, oil paint, dark"*
