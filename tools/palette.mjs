// Dark-fantasy material ramps for the pixel-art generator. Each ramp goes
// dark→light; index with ramp[0..n-1]. Built from the game's palette
// (src/ui/palette.ts) so generated art matches the in-engine chrome.
import { hex } from "./pixellib.mjs";

const R = (...hexes) => hexes.map(hex);

export const PAL = {
  // base voids
  void:      hex("#080610"),
  bg:        hex("#0b0a16"),
  bgSoft:    hex("#161325"),

  // cold crypt stone — violet-grey
  stone:     R("#100e1a", "#1d1a2b", "#2c2940", "#3d3954", "#524d6a", "#6d6788"),
  // warmer sandstone / castle masonry
  sand:      R("#171019", "#2a2230", "#3d3142", "#574255", "#74596a", "#937a86"),
  // throne-room dark basalt with blood tint
  basalt:    R("#0d0710", "#1a1018", "#2a1822", "#3d2230", "#552f3e", "#6e3f4e"),

  // bone / skulls
  bone:      R("#3a3328", "#5a4f38", "#8a7c58", "#b8a878", "#d8cba0", "#efe6c8"),
  // wood beams / forge timber
  wood:      R("#1c120a", "#3a2414", "#5a3a1f", "#7a5128", "#9a6a38", "#b98a52"),
  // iron / anvil / fittings
  iron:      R("#15151c", "#2a2a32", "#43434f", "#62626f", "#85858f", "#aaaab2"),
  // gold leaf / brass
  gold:      R("#3a2a0c", "#6e4f16", "#a3791d", "#cf9f2e", "#e8b94f", "#f5d97a"),

  // candle / fire — used for emissive elements
  flame:     R("#5a1408", "#8b1d22", "#c2701a", "#e2a93e", "#f5cb6d", "#f7e6b8"),
  ember:     R("#3a0d08", "#7a1c10", "#c2401a", "#e2702a"),
  // dried blood
  blood:     R("#2a0a0e", "#5a1015", "#8b1d22", "#b22a2a", "#c23a3a"),
  // ghost / soul fire (floor 2 & dream)
  ghost:     R("#0e2630", "#1c4654", "#2f6e80", "#4f9bb0", "#6db7d6", "#bfe7f5"),
  // crypt arcane purple
  purple:    R("#120a1e", "#241338", "#3b2549", "#553466", "#7a4f93", "#a06fc0"),
  // green soul / poison (dream / well water)
  toxic:     R("#0a1810", "#143020", "#1f5236", "#2e7d50", "#46b06e", "#8ce0a8"),

  // parchment
  parch:     R("#8a734a", "#b89c6a", "#d8c690", "#e9d9a8", "#f5e8c2"),
};

// A handy "emissive" set keyed by mood — what a light source throws.
export const LIGHT = {
  candle: hex("#f5cb6d"),
  amber:  hex("#e2a93e"),
  ghost:  hex("#6db7d6"),
  blood:  hex("#c23a3a"),
  green:  hex("#46b06e"),
  forge:  hex("#e2702a"),
};
