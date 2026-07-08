import Phaser from "phaser";
import { C, S, classColor } from "@/ui/palette";
import { CARDS_BY_ID } from "@/data/cards";
import { makeCardSprite } from "@/ui/CardSprite";
import { RUN_KEY } from "@/systems/RunState";
import { starterDeckFor } from "@/systems/RunState";
import type { RunState } from "@/types/game";
import type { CardClass } from "@/types/cards";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";
import { addBackground } from "@/ui/sceneBg";

interface ClassOption {
  klass: CardClass;
  title: string;
  blurb: string;
  preview: string[]; // card ids to display
}

const OPTIONS: ClassOption[] = [
  {
    klass: "sorcerer",
    title: "Sorcerer",
    blurb: "Spells, status effects, and a brittle frame. Glass cannon. Synergies reward stacking spell cards.",
    preview: ["sorc_magic_missile", "sorc_mage_armor", "sorc_spark"],
  },
  {
    klass: "warrior",
    title: "Warrior",
    blurb: "Steady weapons and reliable shields. Forgiving baseline; honours those who hold the line.",
    preview: ["warr_slash", "warr_block", "warr_iron_will"],
  },
  {
    klass: "barbarian",
    title: "Barbarian",
    blurb: "Risk for reward. Trades HP for damage and tempo. Snowballs hard when it works.",
    preview: ["barb_rage_strike", "barb_reckless_block", "barb_frenzy"],
  },
  {
    klass: "battlemage",
    title: "Battle Mage",
    blurb: "Half sword, half spell. Each card does a little of both. Flexible tempo.",
    preview: ["bm_flame_sword", "bm_mystic_armor", "bm_spell_weapon"],
  },
];

export class ClassSelectScene extends Phaser.Scene {
  private skipTutorial = false;

  constructor() { super("ClassSelect"); }

  init(data: { skipTutorial?: boolean } = {}) {
    this.skipTutorial = !!data.skipTutorial;
  }

  create() {
    gateSceneInput(this);
    const { width, height } = this.scale;

    addBackground(this, "bg-menu", { dim: 0.42 });
    const bg = this.add.graphics();
    for (let r = 380; r > 0; r -= 14) {
      bg.fillStyle(C.amber, 0.005).fillCircle(width / 2, height / 2, r);
    }

    this.add.text(width / 2, 60, "The Goddess holds out four decks.", {
      fontFamily: "Lora", fontSize: "20px", color: S.parchHi, fontStyle: "italic",
    }).setOrigin(0.5);
    this.add.text(width / 2, 96, "“Choose the road back.”", {
      fontFamily: "Lora", fontSize: "22px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5);

    const colW = width / 4;
    OPTIONS.forEach((opt, i) => {
      const cx = colW * i + colW / 2;
      this.renderOption(cx, 140, opt);
    });

    this.add.text(width / 2, height - 38, "Tap a class to take its deck.", {
      fontFamily: "Lora", fontSize: "20px", color: S.dim,
    }).setOrigin(0.5);

    markSceneReady(this);
  }

  private renderOption(cx: number, top: number, opt: ClassOption) {
    // Compressed vertically again — at 1.5× smartphone scale the design
    // height is only 533, so the panel needs to clear the footer "Tap a
    // class…" hint at y=495. 340 keeps a clean gap there.
    const panelH = 340;
    const panelW = 260;
    const accent = classColor(opt.klass);

    // Panel
    const g = this.add.graphics();
    g.fillStyle(C.bg, 1).fillRoundedRect(cx - panelW / 2, top, panelW, panelH, 10);
    g.lineStyle(2, accent, 1).strokeRoundedRect(cx - panelW / 2, top, panelW, panelH, 10);
    g.fillStyle(accent, 0.08).fillRoundedRect(cx - panelW / 2, top, panelW, 40, 10);

    // Title
    this.add.text(cx, top + 22, opt.title, {
      fontFamily: "Lora", fontSize: "20px", color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5);

    // Blurb
    this.add.text(cx, top + 55, opt.blurb, {
      fontFamily: "Lora", fontSize: "16px", color: S.cream, align: "center",
      wordWrap: { width: panelW - 24 },
    }).setOrigin(0.5, 0);

    // 3 preview cards in a fanned-out hand. Centre card upright; left/right
    // tilted outward from a virtual pivot below the cards, so the silhouettes
    // sit clear of the blurb above and the CTA button below.
    const fanCenterY = top + 215;
    const fanCenterX = cx;
    const fanSpread = 56;     // horizontal distance from centre card to outer cards
    const fanAngle = 0.28;    // ~16° rotation outward for the edge cards
    const fanLift  = 8;       // outer cards sit a touch lower (arc)
    opt.preview.forEach((id, i) => {
      const card = CARDS_BY_ID[id];
      if (!card) return;
      // i = 0,1,2 → angle index −1, 0, +1
      const side = i - 1;
      const cy = fanCenterY + Math.abs(side) * fanLift;
      const cxCard = fanCenterX + side * fanSpread;
      const sprite = makeCardSprite(this, card, cxCard, cy, { scale: 0.5 });
      sprite.setRotation(side * fanAngle);
      // Lower-indexed cards underneath, centre on top — natural fan stack.
      sprite.setDepth(10 - Math.abs(side));
    });

    // CTA button
    const btnY = top + panelH - 25;
    const btnW = panelW - 30;
    const btnH = 40;
    const bg = this.add.rectangle(cx, btnY, btnW, btnH, accent, 1)
      .setStrokeStyle(2, C.amberHi);
    const label = this.add.text(cx, btnY, `Choose ${opt.title}`, {
      fontFamily: "Lora", fontSize: "18px", color: S.ink, fontStyle: "bold",
    }).setOrigin(0.5);
    const zone = this.add.zone(cx, btnY, btnW, btnH)
      .setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => { bg.fillColor = C.amberHi; label.setColor(S.ink); });
    zone.on("pointerout",  () => { bg.fillColor = accent;   label.setColor(S.ink); });
    zone.on("pointerdown", () => this.choose(opt.klass));
  }

  private choose(klass: CardClass) {
    const run = this.game.registry.get(RUN_KEY) as RunState;
    run.chosenClass = klass;
    run.deck = starterDeckFor(klass);
    // Tutorial flow keeps going through the Goddess fight first — the
    // HeroPickScene runs AFTER that fight (it's wired in CombatScene's
    // tutorial-win handler). Non-tutorial flow: pick a Hero Skill before
    // hitting the map. Either way, every run begins with exactly one
    // hero skill in the player's pocket.
    if (this.skipTutorial) {
      this.scene.start("HeroPick", { source: "runStart" });
    } else {
      this.scene.start("Combat", { source: "dream", enemyId: "goddess", isTutorial: true });
    }
  }
}
