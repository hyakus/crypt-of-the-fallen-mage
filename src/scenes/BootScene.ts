import Phaser from "phaser";
import { freshRunState, RUN_KEY } from "@/systems/RunState";
import { preloadBackgrounds, applyPixelFilters, FX_FRAME_COUNT } from "@/ui/sceneBg";

export class BootScene extends Phaser.Scene {
  constructor() { super("Boot"); }

  preload() {
    // Map backdrops, one per floor (Crypt / Castle Halls / Throne Room). Now
    // chunky pixel-art PNGs authored at 10:16 native res (see tools/gen.mjs);
    // MapScene stretches them into its parchment rect via setDisplaySize and
    // they're displayed NEAREST (see applyPixelFilters) so the pixels stay
    // crisp. Keys are "map-backdrop-{floor}"; MapScene picks by `run.floor`.
    // Floors 1-3 are the original biome (Crypt, Castle Halls, Throne Room).
    // Floors 4-8 are the Cursed Forest biome (Outer Grove → Mushroom Hollow
    // → Black Mire → Bone Thicket → Heart of Rot). Each floor gets a base
    // PNG plus three fx flicker frames; load them all in one sweep.
    for (let floor = 1; floor <= 8; floor++) {
      this.load.image(`map-backdrop-${floor}`, `art/map-backdrop-${floor}.png`);
      for (let i = 0; i < FX_FRAME_COUNT; i++) {
        this.load.image(`map-backdrop-${floor}-fx-${i}`,
          `art/map-backdrop-${floor}-fx-${i}.png`);
      }
    }

    // Combat backdrop — arcane sigil, not scenery. Still the animated SVG
    // layer CombatScene spins up at start of combat; it rides ABOVE the new
    // per-floor pixel-art level backgrounds (combat-{crypt,castle,throne}).
    this.load.svg(
      "combat-backdrop",
      "art/combat-backdrop.svg",
      { width: 1800, height: 1200 },
    );

    // Every pixel-art scene background (levels + node screens + menu/dream/etc).
    preloadBackgrounds(this);
  }

  create() {
    // Backgrounds are chunky pixel art — force NEAREST sampling so upscaling
    // keeps hard pixel edges instead of the LINEAR smear the global
    // antialias:true render config would otherwise apply.
    applyPixelFilters(this);

    // Initialise run-state if absent so a hot reload doesn't drop it.
    if (!this.game.registry.get(RUN_KEY)) {
      this.game.registry.set(RUN_KEY, freshRunState());
    }
    this.scene.start("MainMenu");
  }
}
