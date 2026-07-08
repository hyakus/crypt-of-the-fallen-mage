import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import { makeNavButton } from "@/ui/NavButton";
import { RUN_KEY } from "@/systems/RunState";
import { rollHeroSkills, instantiateHeroSkill, type HeroSkillTemplate } from "@/data/heroSkills";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";
import { addBackground } from "@/ui/sceneBg";
import { playStackExpandIntro } from "@/ui/introAnim";
import type { RunState } from "@/types/game";

export type HeroPickSource = "runStart" | "elite" | "boss";

interface HeroPickInit {
  /** Where the player got here from — drives the post-pick destination. */
  source: HeroPickSource;
  /** Floor + node hint for elite/boss flows that need to know where to go next. */
  next?: string;
  /** Boss-flow only — true when this pick is the LAST step of finishing the
   *  current floor (drives "advance floor" semantics in continueOn). */
  advanceFloor?: boolean;
}

/**
 * 3-of-pool Hero Skill picker. Reused for:
 *   - run start (after class pick, before first map)
 *   - elite victory (replaces the regular card reward)
 *   - boss victory (after the Humanity perk pick)
 *
 * The player picks one (or skips), and we route on. No cap on owned hero
 * skills — they stack like Balatro Jokers.
 */
export class HeroPickScene extends Phaser.Scene {
  private init_: HeroPickInit = { source: "runStart" };
  private picks: HeroSkillTemplate[] = [];

  constructor() { super("HeroPick"); }

  init(data: HeroPickInit) {
    this.init_ = data;
  }

  create() {
    gateSceneInput(this);
    const { width, height } = this.scale;
    const run = this.game.registry.get(RUN_KEY) as RunState;

    // Pixel-art crypt chamber + the same amber halo for visual continuity.
    addBackground(this, "bg-menu", { dim: 0.42 });
    const bg = this.add.graphics();
    for (let r = 380; r > 0; r -= 14) {
      bg.fillStyle(C.amber, 0.005).fillCircle(width / 2, height / 2 - 60, r);
    }

    // Header — copy adapts to the source so the player knows why they're here.
    const titles: Record<HeroPickSource, [string, string]> = {
      runStart: ["A Spark of Will", "Choose your Hero Skill."],
      elite:    ["The Elite Falls",  "Choose a Hero Skill — granted in their place."],
      boss:     ["A Mortal Spark",   "Choose a Hero Skill."],
    };
    const [titleStr, subStr] = titles[this.init_.source];
    this.add.text(width / 2, 60, titleStr, {
      fontFamily: "Lora", fontSize: "32px", color: S.amber, fontStyle: "bold",
    }).setOrigin(0.5);
    this.add.text(width / 2, 102, subStr, {
      fontFamily: "Lora", fontSize: "18px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5);
    // Boss kills bake in a permanent +1 action/turn (granted in continueOn) —
    // tell the player so the power spike doesn't feel invisible.
    if (this.init_.source === "boss") {
      this.add.text(width / 2, 128, "The floor falls — ◆ +1 action per turn, henceforth.", {
        fontFamily: "Lora", fontSize: "16px", color: S.amber, fontStyle: "bold",
      }).setOrigin(0.5);
    }

    // Roll 3 — excludes any the player already owns.
    const ownedIds = run.heroActions.map((h) => h.id);
    this.picks = rollHeroSkills(ownedIds, 3);

    // Lay out the 3 panels in a row, centred.
    const panelW = 320;
    const panelH = 250;
    const spacing = 40;
    const total = this.picks.length * panelW + (this.picks.length - 1) * spacing;
    const startX = (width - total) / 2 + panelW / 2;
    const panels = this.picks.map((skill, i) => {
      const cx = startX + i * (panelW + spacing);
      return {
        c: this.renderPanel(cx, height / 2, panelW, panelH, skill, run),
        x: cx,
        y: height / 2,
      };
    });

    // Skip — bottom-centre.
    const skip = this.add.text(width / 2, height - 50, "Refuse and walk on →", {
      fontFamily: "Lora", fontSize: "20px", color: S.dim,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    skip.on("pointerover", () => skip.setColor(S.amber));
    skip.on("pointerout",  () => skip.setColor(S.dim));
    skip.on("pointerdown", () => this.continueOn(run));

    this.events.off("androidback");
    this.events.on("androidback", () => this.continueOn(run));

    // Panels fly to centre stacked, then fan out; input stays gated until they
    // land (markSceneReady fires in the intro's completion callback).
    playStackExpandIntro(this, panels, () => markSceneReady(this));
  }

  /**
   * Build one pickable panel (icon + name + description + Pick button) as a
   * Container positioned at its resting centre (cx, cy), with all children in
   * local coords so the whole panel can be tweened as one by the intro.
   */
  private renderPanel(
    cx: number, cy: number, w: number, h: number,
    skill: HeroSkillTemplate, run: RunState,
  ): Phaser.GameObjects.Container {
    const panel = this.add.container(cx, cy);

    const g = this.add.graphics();
    g.fillStyle(C.ink, 0.94).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    g.lineStyle(2, C.amber, 0.85).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);

    // Top stripe — coloured by active vs passive so the kind is unmistakable.
    const isPassive = skill.kind === "passive";
    const stripeColor = isPassive ? C.ghost : C.amber;
    g.fillStyle(stripeColor, 0.18).fillRoundedRect(-w / 2, -h / 2, w, 32, 12);
    panel.add(g);

    panel.add(this.add.text(0, -h / 2 + 16, isPassive ? "PASSIVE" : "ACTIVE", {
      fontFamily: "Lora", fontSize: "13px",
      color: isPassive ? S.ghost : S.amber, fontStyle: "bold",
    }).setOrigin(0.5));

    // Name.
    panel.add(this.add.text(0, -h / 2 + 56, skill.name, {
      fontFamily: "Lora", fontSize: "22px", color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5));

    // Description, wrapped.
    panel.add(this.add.text(0, -4, skill.description, {
      fontFamily: "Lora", fontSize: "14px", color: S.cream,
      align: "center", wordWrap: { width: w - 32 },
    }).setOrigin(0.5));

    // Pick button — bottom.
    const btnY = h / 2 - 30;
    const btnW = w - 40;
    const btnH = 40;
    const btnBg = this.add.rectangle(0, btnY, btnW, btnH, C.purple).setStrokeStyle(2, C.amber);
    const btnText = this.add.text(0, btnY, "Take this Skill", {
      fontFamily: "Lora", fontSize: "16px", color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5);
    const zone = this.add.zone(0, btnY, btnW, btnH).setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => btnBg.setFillStyle(C.bloodHi));
    zone.on("pointerout",  () => btnBg.setFillStyle(C.purple));
    zone.on("pointerdown", () => {
      run.heroActions.push(instantiateHeroSkill(skill));
      btnText.setText("✓");
      this.continueOn(run);
    });
    panel.add([btnBg, btnText, zone]);

    return panel;
  }

  /** Route to the next scene based on what brought us here. */
  private continueOn(run: RunState) {
    switch (this.init_.source) {
      case "runStart":
        // First map of the run.
        this.scene.start("Map");
        return;
      case "elite":
        // Elite victory replaces the regular card reward — straight back to Map.
        this.scene.start("Map");
        return;
      case "boss":
        // Boss flow: HumanityScene → this → next floor (or Victory after the
        // Heart of Rot on floor 8). We own the floor-advance step now (used to
        // live in HumanityScene) so the player can SEE the pick land before
        // transitioning out.
        //
        // Felling a floor boss permanently grants +1 action per turn for the
        // rest of the run — a baked-in power spike (NOT a perk), stacking on
        // top of whatever perks have already bumped baseActionsPerTurn.
        run.baseActionsPerTurn += 1;
        run.floor += 1;
        run.map = null;
        run.superCardUnlockedThisRun = false;
        if (run.floor > 8) {
          // Heart of Rot felled — the run is won.
          this.scene.start("Victory");
        } else if (run.floor === 4) {
          // Throne room cleared → Cursed Forest biome. Play the narrative
          // beat before the first forest map.
          this.scene.start("ForestTransition");
        } else {
          this.scene.start("Map");
        }
        return;
    }
  }
}

// Silence unused-import warnings for the nav helper — kept for potential
// future "Back" wiring without forcing a re-import.
export { makeNavButton as _makeNavButton };
