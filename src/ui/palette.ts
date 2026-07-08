// Dark-fantasy / illuminated-manuscript palette.
// Colors as 0xRRGGBB for Phaser fills, and "#RRGGBB" strings for text.

export const C = {
  bg:          0x0b0a16,
  bgSoft:      0x161325,
  parchment:   0xe9d9a8,
  parchHi:     0xf5e8c2,
  parchShade:  0xb89c6a,
  ink:         0x261b10,
  blood:       0x8b1d22,
  bloodHi:     0xc23a3a,
  amber:       0xe2a93e,
  amberHi:     0xf5cb6d,
  ghost:       0x6db7d6,
  ghostHi:     0xbfe7f5,
  purple:      0x3b2549,
  // Player card-back inner field. Deep pine/forest green, picked to read as
  // "the wizard's deck" while contrasting sharply with the blood-red enemy
  // backs. Different enough from the bg, parchment, and shield-cyan that it
  // never gets confused with another UI surface.
  forest:      0x1f3a2a,
  forestHi:    0x2e5c40,
  iron:        0x4a4a55,
  ironHi:      0x7b7b87,
  cream:       0xefe6c8,

  // class accent colors
  sorcerer:    0x6cb6ff,
  warrior:     0xd6a35a,
  barbarian:   0xb8443a,
  battlemage:  0xa46ad6,
  fusion:      0xe8b94f,
  neutral:     0xa39a85,
  starter:     0x8a8174,
} as const;

export const S = {
  bg:          "#0b0a16",
  parchment:   "#e9d9a8",
  parchHi:     "#f5e8c2",
  ink:         "#1a120a",
  blood:       "#8b1d22",
  bloodHi:     "#c23a3a",
  amber:       "#e2a93e",
  ghost:       "#6db7d6",
  cream:       "#efe6c8",
  dim:         "#a39a85",
} as const;

export const FONT = {
  title:  "32px Georgia",
  big:    "22px Georgia",
  body:   "14px Georgia",
  small:  "11px Georgia",
} as const;

export const classColor = (klass: string): number => {
  switch (klass) {
    case "sorcerer":   return C.sorcerer;
    case "warrior":    return C.warrior;
    case "barbarian":  return C.barbarian;
    case "battlemage": return C.battlemage;
    case "fusion":     return C.fusion;
    case "neutral":    return C.neutral;
    default:           return C.starter;
  }
};
