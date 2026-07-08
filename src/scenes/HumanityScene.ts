import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import { rollPerks, type Perk } from "@/data/perks";
import { RUN_KEY } from "@/systems/RunState";
import type { RunState } from "@/types/game";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";
import { playStackExpandIntro } from "@/ui/introAnim";

/**
 * Run after a boss kill — the player reclaims a "smidge of humanity" and
 * picks one of three perks. Replaces the old super-card boss reward.
 */
export class HumanityScene extends Phaser.Scene {
  constructor() { super("Humanity"); }

  create() {
    gateSceneInput(this);
    const run = this.game.registry.get(RUN_KEY) as RunState;
    const { width, height } = this.scale;

    const bg = this.add.graphics();
    bg.fillStyle(C.bg, 1).fillRect(0, 0, width, height);
    for (let r = 420; r > 0; r -= 12) {
      bg.fillStyle(C.amber, 0.005).fillCircle(width / 2, 200, r);
    }

    this.add.text(width / 2, 80, "A smidge of humanity returns.", {
      fontFamily: "Lora", fontSize: "28px", color: S.amber, fontStyle: "italic",
    }).setOrigin(0.5);
    this.add.text(width / 2, 120, "Choose what to remember.", {
      fontFamily: "Lora", fontSize: "22px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5);

    const choices = rollPerks(run, 3);
    if (choices.length === 0) {
      // Edge case — shouldn't happen often but safe.
      this.add.text(width / 2, height / 2, "Nothing more to remember. The road waits.",
        { fontFamily: "Lora", fontSize: "16px", color: S.cream }).setOrigin(0.5);
      this.continueButton(width / 2, height - 80);
      markSceneReady(this);
      return;
    }

    const panelW = 320;
    const spacing = 60;
    const totalW = panelW * choices.length + spacing * (choices.length - 1);
    const startX = (width - totalW) / 2 + panelW / 2;

    const top = 180;
    const panelCenterY = top + 100; // renderPerk's panelH is 200
    const panels = choices.map((perk, i) => {
      const cx = startX + i * (panelW + spacing);
      return { c: this.renderPerk(cx, top, perk, run), x: cx, y: panelCenterY };
    });

    // Skip option
    const skip = this.add.text(width / 2, height - 50, "Refuse and walk on →", {
      fontFamily: "Lora", fontSize: "20px", color: S.dim,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    skip.on("pointerover", () => skip.setColor(S.amber));
    skip.on("pointerout",  () => skip.setColor(S.dim));
    skip.on("pointerdown", () => this.proceed(run));

    // Perks fly to centre stacked, then fan out to their slots; input stays
    // gated until they land.
    playStackExpandIntro(this, panels, () => markSceneReady(this));
  }

  /**
   * Build one perk panel as a Container centred at (cx, top + panelH/2), with
   * all children in local coords so the intro can fly/expand it as one unit.
   */
  private renderPerk(cx: number, top: number, perk: Perk, run: RunState): Phaser.GameObjects.Container {
    const panelW = 280;
    const panelH = 200;
    const cy = top + panelH / 2;
    const panel = this.add.container(cx, cy);
    const isHero = perk.name.startsWith("Hero Action:");

    const g = this.add.graphics();
    g.fillStyle(C.bg, 1).fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 12);
    g.lineStyle(2, isHero ? C.amberHi : C.parchShade, 1)
      .strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 12);
    if (isHero) {
      g.fillStyle(C.amber, 0.10).fillRoundedRect(-panelW / 2, -panelH / 2, panelW, 36, 12);
    }
    panel.add(g);

    const labelTitle = isHero ? perk.name.replace("Hero Action: ", "") : perk.name;
    const tag = isHero ? "✦ HERO ACTION" : "✦ PERK";

    panel.add(this.add.text(0, -panelH / 2 + 18, tag, {
      fontFamily: "Lora", fontSize: "16px", color: isHero ? S.amber : S.dim,
      fontStyle: "bold",
    }).setOrigin(0.5));

    panel.add(this.add.text(0, -panelH / 2 + 56, labelTitle, {
      fontFamily: "Lora", fontSize: "26px", color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5));

    panel.add(this.add.text(0, -panelH / 2 + 120, perk.description, {
      fontFamily: "Lora", fontSize: "20px", color: S.cream, align: "center",
      wordWrap: { width: panelW - 30 },
    }).setOrigin(0.5));

    // CTA
    const btnY = panelH / 2 - 28;
    const btnW = panelW - 40;
    const btnH = 36;
    const bg = this.add.rectangle(0, btnY, btnW, btnH, isHero ? C.amber : C.purple, 1)
      .setStrokeStyle(2, isHero ? C.amberHi : C.amber);
    const label = this.add.text(0, btnY, "Take it.", {
      fontFamily: "Lora", fontSize: "20px", color: isHero ? S.ink : S.parchHi,
      fontStyle: "bold",
    }).setOrigin(0.5);
    const zone = this.add.zone(0, btnY, btnW, btnH)
      .setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => {
      if (isHero) { bg.fillColor = C.amberHi; }
      else { bg.fillColor = C.iron; label.setColor(S.amber); }
    });
    zone.on("pointerout", () => {
      if (isHero) { bg.fillColor = C.amber; }
      else { bg.fillColor = C.purple; label.setColor(S.parchHi); }
    });
    zone.on("pointerdown", () => {
      perk.apply(run);
      run.perks.push(perk.id);
      this.proceed(run);
    });
    panel.add([bg, label, zone]);

    return panel;
  }

  private continueButton(x: number, y: number) {
    const t = this.add.text(x, y, "Continue →", {
      fontFamily: "Lora", fontSize: "16px", color: S.amber,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    t.on("pointerdown", () => {
      const run = this.game.registry.get(RUN_KEY) as RunState;
      this.proceed(run);
    });
  }

  private proceed(_run: RunState) {
    // After the Humanity perk pick, boss kills now ALSO grant a Hero Skill
    // pick. HeroPickScene's "boss" branch is the one that advances the floor
    // (or routes to Victory after floor 3) — so we hand off floor-advance
    // logic to it and just route there. This keeps "boss-flow knows how to
    // wrap up the floor" in one place.
    this.scene.start("HeroPick", { source: "boss" });
  }
}
