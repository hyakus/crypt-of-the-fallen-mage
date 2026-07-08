import Phaser from "phaser";
import { S } from "@/ui/palette";
import { clearRun } from "@/systems/RunState";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";
import { addBackground } from "@/ui/sceneBg";

export class GameOverScene extends Phaser.Scene {
  constructor() { super("GameOver"); }

  create() {
    gateSceneInput(this);
    clearRun();
    const { width, height } = this.scale;
    addBackground(this, "bg-gameover", { dim: 0.35 });

    this.add.text(width / 2, height / 2 - 50, "The worms have you.", {
      fontFamily: "Lora", fontSize: "48px", color: S.blood,
    }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 + 6, "(Mortimer's body fails. Again.)", {
      fontFamily: "Lora", fontSize: "22px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5);

    const back = this.add.text(width / 2, height / 2 + 100, "Begin again →", {
      fontFamily: "Lora", fontSize: "28px", color: S.amber,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    back.on("pointerdown", () => this.scene.start("MainMenu"));
    this.events.off("androidback");
    this.events.on("androidback", () => this.scene.start("MainMenu"));

    markSceneReady(this);
  }
}
