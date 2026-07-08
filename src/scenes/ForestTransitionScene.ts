import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";

// Narrative beat between the throne room (floor 3) and the Cursed Forest
// (floors 4-8). Modelled on DreamScene: a quiet gradient backdrop and
// tap-to-advance lines. Routed to from HeroPickScene the moment the floor-3
// boss falls and `run.floor` rolls over to 4.
const LINES = [
  "Gorgonzola is unmade. The throne room falls silent.",
  "But the silence does not hold.",
  "Behind the throne, a seam of root has split the stone.",
  "The crypt opens onto a wood that has forgotten the sun.",
  "Something at its heart is still beating. Wet. Slow. Wrong.",
  "Your name is not yet whole. The road goes deeper.",
];

export class ForestTransitionScene extends Phaser.Scene {
  private idx = 0;
  private body!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;

  constructor() { super("ForestTransition"); }

  create() {
    gateSceneInput(this);
    const { width, height } = this.scale;

    // Quiet gradient backdrop — ink fill plus a faint sickly-green radial
    // halo to seed the forest mood without competing with the text.
    const g = this.add.graphics();
    g.fillStyle(C.bg, 1).fillRect(0, 0, width, height);
    for (let r = 360; r > 0; r -= 12) {
      g.fillStyle(C.forestHi, 0.008);
      g.fillCircle(width / 2, height / 2, r);
    }

    this.body = this.add.text(width / 2, height / 2 - 30, LINES[0], {
      fontFamily: "Lora", fontSize: "32px", color: S.parchHi, align: "center",
      wordWrap: { width: width - 240 },
    }).setOrigin(0.5);

    this.prompt = this.add.text(width / 2, height - 50, "▼ tap to continue", {
      fontFamily: "Lora", fontSize: "20px", color: S.dim,
    }).setOrigin(0.5);

    this.input.on("pointerdown", () => this.advance());

    markSceneReady(this);
  }

  private advance() {
    this.idx++;
    if (this.idx >= LINES.length) {
      this.scene.start("Map");
      return;
    }
    this.body.setText(LINES[this.idx]);
    if (this.idx === LINES.length - 1) this.prompt.setText("▼ tap to step into the wood");
  }
}
