import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";

const LINES = [
  "You wake.",
  "But you are not… here.",
  "A goddess stands in candlelight, four decks fanned in her hand.",
  "“Mortimer Vex. Court wizard. Slain by Gorgonzola the Unspoken.”",
  "“Your body rots in the king's deepest crypt.”",
  "“But your name has not yet been spoken in full.”",
  "“So. The road back has four shapes.”",
  "“Pick the one that will carry you.”",
];

export class DreamScene extends Phaser.Scene {
  private idx = 0;
  private body!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;

  constructor() { super("Dream"); }

  create() {
    gateSceneInput(this);
    const { width, height } = this.scale;

    // Dream uses the quiet gradient backdrop instead of the pixel-art
    // candlelit-goddess scene — the text is doing all the storytelling
    // work here and a busy backdrop competes with it. The gradient is a
    // simple solid ink fill plus a soft ghost-blue radial halo (the same
    // halo the pre-pixelart version had).
    const g = this.add.graphics();
    g.fillStyle(C.bg, 1).fillRect(0, 0, width, height);
    for (let r = 360; r > 0; r -= 12) {
      g.fillStyle(C.ghost, 0.006);
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
      // Class pick — Goddess offers four decks
      this.scene.start("ClassSelect");
      return;
    }
    this.body.setText(LINES[this.idx]);
    if (this.idx === LINES.length - 1) this.prompt.setText("▼ tap to face the Goddess's offer");
  }
}
