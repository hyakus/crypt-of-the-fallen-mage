import Phaser from "phaser";
import { S } from "@/ui/palette";
import { clearRun } from "@/systems/RunState";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";
import { addBackground } from "@/ui/sceneBg";

export class VictoryScene extends Phaser.Scene {
  constructor() { super("Victory"); }

  create() {
    gateSceneInput(this);
    clearRun();
    const { width, height } = this.scale;
    addBackground(this, "bg-victory", { dim: 0.18 });

    this.add.text(width / 2, height / 2 - 50, "The Heart of Rot stills.", {
      fontFamily: "Lora", fontSize: "48px", color: S.amber,
    }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 + 6, "The wood remembers the sun. Mortimer's name is spoken in full.", {
      fontFamily: "Lora", fontSize: "22px", color: S.parchHi, fontStyle: "italic",
    }).setOrigin(0.5);

    const back = this.add.text(width / 2, height / 2 + 100, "→ Title", {
      fontFamily: "Lora", fontSize: "28px", color: S.cream,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    back.on("pointerdown", () => this.scene.start("MainMenu"));
    this.events.off("androidback");
    this.events.on("androidback", () => this.scene.start("MainMenu"));

    markSceneReady(this);
  }
}
