import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import type { CombatStats } from "@/types/game";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";

interface BattleSummaryInit {
  stats: CombatStats;
  enemyName: string;
  gold: number;
  /** HP restored after the fight (post-battle heal, capped at max). */
  healed?: number;
  /** Crystal shards dropped this fight (meta-progression currency). */
  shards?: number;
  /** Was this the Goddess sparring fight? Triggers the post-tutorial story. */
  isTutorial?: boolean;
  /** What scene to route to after Continue. */
  nodeKind?: "combat" | "elite" | "boss";
}

/**
 * Post-victory summary. Shows what happened in the fight; for the tutorial,
 * unfolds a short Goddess monologue page-by-page before the Continue button.
 */
export class BattleSummaryScene extends Phaser.Scene {
  private storyLines: string[] = [];
  private storyIdx = 0;
  private storyText?: Phaser.GameObjects.Text;
  private storyHint?: Phaser.GameObjects.Text;
  private continueZone?: Phaser.GameObjects.Zone;
  private summaryData: BattleSummaryInit = {
    stats: { damageDealt: 0, damageReceived: 0, cardsPlayed: 0, maxCombo: 0, totalCombos: 0, turns: 0 },
    enemyName: "?",
    gold: 0,
  };

  constructor() { super("BattleSummary"); }

  init(data: BattleSummaryInit) {
    this.summaryData = data;
    this.storyIdx = 0;
    this.storyLines = data.isTutorial ? this.tutorialStory() : [];
  }

  private tutorialStory(): string[] {
    return [
      "“You stood.”",
      "“Not whole — not yet — but standing. The crypt below knows your face now.”",
      "“And the man who stole it.”",
      "“Walk, Mortimer. The candle burns lower than you think.”",
    ];
  }

  create() {
    gateSceneInput(this);
    const { width, height } = this.scale;

    // Backdrop — translucent so the frozen Combat scene shows through. The
    // whole summary also fades in via camera alpha so it lands gently
    // instead of snapping over the fight.
    const g = this.add.graphics();
    g.fillStyle(C.bg, 0.72).fillRect(0, 0, width, height);
    for (let r = 360; r > 0; r -= 14) {
      g.fillStyle(C.amber, 0.005).fillCircle(width / 2, height / 2 - 60, r);
    }
    this.cameras.main.setAlpha(0);
    // Release input once the camera fade-in has landed — otherwise a tap
    // that started on the Combat scene right as it ended could land on a
    // summary-screen button that hadn't yet visually arrived.
    this.tweens.add({
      targets: this.cameras.main,
      alpha: 1,
      duration: 280,
      ease: "Cubic.Out",
      onComplete: () => markSceneReady(this),
    });

    // Header — pulled up so the stats panel + (optional) tutorial story
    // panel + gold-heal-shards line + Continue button all fit on the
    // smartphone canvas (533 tall).
    this.add.text(width / 2, 36, "VICTORY", {
      fontFamily: "Lora", fontSize: "36px", color: S.amber, fontStyle: "bold",
    }).setOrigin(0.5);
    this.add.text(width / 2, 70, `${this.summaryData.enemyName} falls.`, {
      fontFamily: "Lora", fontSize: "14px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5);

    // Stats panel
    this.renderStatsPanel();

    // Tutorial: story panel + click-to-advance, then a Continue button
    if (this.summaryData.isTutorial && this.storyLines.length > 0) {
      this.renderTutorialStory();
    } else {
      this.renderContinueButton(width / 2, height - 40);
    }
  }

  private renderStatsPanel() {
    const { width } = this.scale;
    const panelW = 460;
    // Compressed for the smartphone canvas — rows tightened to 28 px and
    // panel pulled up so the (optional) tutorial story panel + Continue
    // button below fit in 533 px without overflow.
    const panelH = 200;
    const px = width / 2 - panelW / 2;
    const py = 100;

    const g = this.add.graphics();
    g.fillStyle(C.bgSoft, 0.85).fillRoundedRect(px, py, panelW, panelH, 10);
    g.lineStyle(2, C.parchShade, 1).strokeRoundedRect(px, py, panelW, panelH, 10);

    const s = this.summaryData.stats;
    const rows: Array<[string, string, string]> = [
      ["⚔", "Damage dealt",       `${s.damageDealt}`],
      ["❤", "Damage taken",       `${s.damageReceived}`],
      ["♣", "Cards played",       `${s.cardsPlayed}`],
      ["✦", "Best combo",         `×${Math.max(1, s.maxCombo)}`],
      ["✺", "Combos triggered",   `${s.totalCombos}`],
      ["⏱", "Turns",              `${s.turns}`],
    ];

    const rowH = 28;
    const labelX = px + 70;
    const valueX = px + panelW - 60;
    rows.forEach(([icon, label, val], i) => {
      const y = py + 22 + i * rowH;
      this.add.text(px + 32, y, icon, {
        fontFamily: "Lora", fontSize: "20px", color: S.amber,
      }).setOrigin(0.5);
      this.add.text(labelX, y, label, {
        fontFamily: "Lora", fontSize: "16px", color: S.cream,
      }).setOrigin(0, 0.5);
      this.add.text(valueX, y, val, {
        fontFamily: "Lora", fontSize: "16px", color: S.parchHi, fontStyle: "bold",
      }).setOrigin(1, 0.5);
    });

    // Gold + heal + shard line
    const healed = this.summaryData.healed ?? 0;
    const shards = this.summaryData.shards ?? 0;
    const parts: string[] = [`+${this.summaryData.gold} gold`];
    if (healed > 0) parts.push(`✚ +${healed} HP`);
    if (shards > 0) parts.push(`◆ +${shards} shard${shards === 1 ? "" : "s"}`);
    // Tight against the panel since we're compressed for smartphone.
    this.add.text(width / 2, py + panelH + 22, parts.join("   "), {
      fontFamily: "Lora", fontSize: "18px", color: S.amber,
    }).setOrigin(0.5);
  }

  private renderTutorialStory() {
    const { width, height } = this.scale;
    // Pulled up + slimmed for smartphone — sits just below the gold/heal
    // line, well above the Continue button at height − 50.
    const py = 340;
    const panelW = 660;
    const panelH = 100;
    const px = width / 2 - panelW / 2;

    const g = this.add.graphics();
    g.fillStyle(C.purple, 0.3).fillRoundedRect(px, py, panelW, panelH, 10);
    g.lineStyle(2, C.amber, 0.6).strokeRoundedRect(px, py, panelW, panelH, 10);

    this.storyText = this.add.text(width / 2, py + panelH / 2, this.storyLines[0], {
      fontFamily: "Lora", fontSize: "16px", color: S.parchHi, fontStyle: "italic",
      align: "center", wordWrap: { width: panelW - 30 },
    }).setOrigin(0.5);

    this.storyHint = this.add.text(width / 2, py + panelH + 16, "▼ tap to continue", {
      fontFamily: "Lora", fontSize: "14px", color: S.dim,
    }).setOrigin(0.5);

    // Click anywhere advances the story; once exhausted, show Continue.
    this.input.once("pointerdown", () => this.advanceStory());

    // Pre-render the Continue button but disabled/hidden until story finishes.
    this.renderContinueButton(width / 2, height - 40, /*hidden*/ true);
  }

  private advanceStory() {
    this.storyIdx++;
    if (this.storyIdx < this.storyLines.length) {
      this.storyText?.setText(this.storyLines[this.storyIdx]);
      if (this.storyIdx === this.storyLines.length - 1) {
        this.storyHint?.setText("▼ tap for the final word");
      }
      this.input.once("pointerdown", () => this.advanceStory());
    } else {
      this.storyHint?.setText("");
      this.continueZone?.setInteractive({ useHandCursor: true });
      // Tells the listener attached in renderContinueButton to fade in.
      this.events.emit("storyDone");
    }
  }

  private renderContinueButton(x: number, y: number, hidden: boolean = false) {
    const w = 260, h = 48;
    const bg = this.add.rectangle(x, y, w, h, C.blood)
      .setStrokeStyle(2, C.amber).setDepth(2000);
    const label = this.add.text(x, y, "Continue →", {
      fontFamily: "Lora", fontSize: "18px", color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5).setDepth(2001);
    const zone = this.add.zone(x, y, w + 20, h + 20).setDepth(2500);
    if (!hidden) zone.setInteractive({ useHandCursor: true });
    if (hidden) { bg.setAlpha(0.35); label.setAlpha(0.35); }

    zone.on("pointerover", () => { bg.fillColor = C.bloodHi; });
    zone.on("pointerout",  () => { bg.fillColor = C.blood;   });
    zone.on("pointerdown", () => this.proceed());

    // If hidden, listen for storyDone to fade in
    if (hidden) {
      this.events.on("storyDone", () => {
        this.tweens.add({ targets: [bg, label], alpha: 1, duration: 240 });
      });
    }

    this.continueZone = zone;
  }

  private proceed() {
    // Combat is paused-and-launched beneath us; stop it before transitioning
    // so its scene state is torn down cleanly.
    if (this.scene.isPaused("Combat")) this.scene.stop("Combat");
    if (this.summaryData.isTutorial) {
      // Tutorial Goddess fight: run STARTS here. Player picks their first
      // Hero Skill (Balatro Joker) before stepping onto the map.
      this.scene.start("HeroPick", { source: "runStart" });
      return;
    }
    // Elite kills replace the card reward with a Hero Skill pick.
    if (this.summaryData.nodeKind === "elite") {
      this.scene.start("HeroPick", { source: "elite" });
      return;
    }
    // Boss and normal combat: Reward (which itself redirects bosses to Humanity → HeroPick).
    this.scene.start("Reward", {
      gold: this.summaryData.gold,
      nodeKind: this.summaryData.nodeKind ?? "combat",
    });
  }
}
