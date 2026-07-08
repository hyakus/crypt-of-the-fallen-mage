import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import { makeNavButton } from "@/ui/NavButton";
import { makeCardSprite, CARD_W } from "@/ui/CardSprite";
import { cardsByRarity, CARDS_BY_ID } from "@/data/cards";
import { RUN_KEY } from "@/systems/RunState";
import type { RunState, WellOutcome } from "@/types/game";
import type { Card } from "@/types/cards";
import { gateSceneInput, markSceneReady, markSceneReadyAfter } from "@/ui/sceneReady";
import { addBackground } from "@/ui/sceneBg";

/** Odds a pull turns up a lurking monster instead of treasure. */
const ENEMY_CHANCE = 0.4;
/** Per-card odds the well's treasure is a rare instead of a basic. */
const RARE_CHANCE = 0.35;

/**
 * A gamble node. The player can pull the bucket up or leave. Pulling reveals a
 * once-rolled, persisted outcome (run.wellStock keyed by node id):
 *   - "enemy": something lurks below → drops into an easy combat encounter.
 *   - "cards": treasure → choose one of three cards (rolled once; stable on
 *     re-entry until the player commits).
 * The well is re-enterable until the outcome is resolved (a card is taken /
 * the fight is triggered), after which it reads as drawn-dry.
 */
export class WellScene extends Phaser.Scene {
  /** Game objects belonging to the current phase, destroyed on phase change. */
  private phaseObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() { super("Well"); }

  create() {
    gateSceneInput(this);
    const run = this.game.registry.get(RUN_KEY) as RunState;
    const { width, height } = this.scale;
    this.phaseObjects = [];

    // Background — pixel-art well chamber with a faint watery ripple over it.
    addBackground(this, "bg-well", { dim: 0.4 });
    const g = this.add.graphics();
    for (let r = 220; r > 0; r -= 10) {
      g.fillStyle(C.ghost, 0.012);
      g.fillCircle(width / 2, height * 0.46, r);
    }

    this.add.text(width / 2, 60, "An old well.", {
      fontFamily: "Lora", fontSize: "26px", color: S.ghost,
    }).setOrigin(0.5);

    // Leave (corner nav) + hardware back → Map.
    makeNavButton(this, width - 130, 58, 200, 60, "← Map", S.parchHi, () =>
      this.scene.start("Map"), "24px",
    );
    this.events.off("androidback");
    this.events.on("androidback", () => this.scene.start("Map"));

    const outcome = this.loadOrRollWell(run);
    this.showIntro(run, outcome);

    markSceneReady(this);
  }

  // ── Persistence: roll the outcome once per well node ──────────────────────

  private loadOrRollWell(run: RunState): WellOutcome {
    if (!run.wellStock) run.wellStock = {};
    const key = run.currentNodeId ?? "__unkeyed__";
    const existing = run.wellStock[key];
    if (existing) return existing;
    const fresh = this.rollWell();
    run.wellStock[key] = fresh;
    return fresh;
  }

  private rollWell(): WellOutcome {
    const roll = Math.random();
    if (roll < ENEMY_CHANCE) {
      return { kind: "enemy", cardIds: [], resolved: false };
    }
    // Hero-skill payout — slice of the non-enemy pool. Keeps the
    // "stack jokers" loop alive for players who route around the elite,
    // without making the elite obsolete (well is still RNG, enemy still
    // possible). Probabilities: ENEMY 0.4, HERO_SKILL 0.2, CARDS 0.4.
    if (roll < ENEMY_CHANCE + 0.2) {
      return { kind: "heroSkill", cardIds: [], resolved: false };
    }
    const basics = cardsByRarity("basic");
    const rares = cardsByRarity("rare");
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const pool = Math.random() < RARE_CHANCE ? rares : basics;
      ids.push(pool[Math.floor(Math.random() * pool.length)].id);
    }
    return { kind: "cards", cardIds: ids, resolved: false };
  }

  // ── Phases ────────────────────────────────────────────────────────────────

  private clearPhase() {
    this.phaseObjects.forEach((o) => o.destroy());
    this.phaseObjects = [];
  }

  private showIntro(run: RunState, outcome: WellOutcome) {
    this.clearPhase();
    const { width, height } = this.scale;

    if (outcome.resolved) {
      this.phaseObjects.push(this.add.text(
        width / 2, height * 0.46,
        "The bucket comes up empty.\nWhatever was down there is gone.",
        {
          fontFamily: "Lora", fontSize: "18px", color: S.dim,
          align: "center", fontStyle: "italic", lineSpacing: 6,
        },
      ).setOrigin(0.5));
      this.phaseObjects.push(this.bigButton(
        width / 2, height - 120, 300, 72, "Leave", C.purple, S.parchHi,
        () => this.scene.start("Map"),
      ));
      return;
    }

    this.phaseObjects.push(this.add.text(
      width / 2, 104,
      "A frayed rope vanishes into the dark. Something is tied to the end.",
      { fontFamily: "Lora", fontSize: "14px", color: S.dim, fontStyle: "italic" },
    ).setOrigin(0.5));

    this.phaseObjects.push(this.bigButton(
      width / 2, height * 0.5 - 46, 360, 78, "Pull the bucket up", C.ghost, S.ink,
      () => this.pull(run, outcome),
    ));
    this.phaseObjects.push(this.bigButton(
      width / 2, height * 0.5 + 64, 360, 72, "Leave it be", C.purple, S.parchHi,
      () => this.scene.start("Map"),
    ));
  }

  private pull(run: RunState, outcome: WellOutcome) {
    if (outcome.kind === "enemy") {
      // Commit: the well is spent the moment the fight begins, so a re-entry
      // after the combat reads as drawn-dry.
      outcome.resolved = true;
      this.showEnemyReveal();
    } else if (outcome.kind === "heroSkill") {
      // Hero-skill outcome — committing routes straight to the picker.
      // Resolved so a re-entry reads as drawn-dry.
      outcome.resolved = true;
      this.scene.start("HeroPick", { source: "runStart" });
    } else {
      this.showCardChoice(run, outcome);
    }
  }

  private showEnemyReveal() {
    this.clearPhase();
    const { width, height } = this.scale;
    this.phaseObjects.push(this.add.text(
      width / 2, height * 0.42,
      "The rope thrashes — something alive comes up\nfrom the depths, clawing for the light!",
      {
        fontFamily: "Lora", fontSize: "18px", color: S.bloodHi,
        align: "center", fontStyle: "bold", lineSpacing: 6,
      },
    ).setOrigin(0.5));
    this.phaseObjects.push(this.bigButton(
      width / 2, height - 120, 320, 78, "Face it  →", C.blood, S.parchHi,
      () => this.scene.start("Combat", { source: "map", nodeKind: "combat" }),
    ));
  }

  private showCardChoice(run: RunState, outcome: WellOutcome) {
    this.clearPhase();
    const { width, height } = this.scale;
    const cards = outcome.cardIds
      .map((id) => CARDS_BY_ID[id])
      .filter(Boolean) as Card[];

    this.phaseObjects.push(this.add.text(
      width / 2, 104, "Treasure! Take one card — or leave it.",
      { fontFamily: "Lora", fontSize: "16px", color: S.amber },
    ).setOrigin(0.5));

    // Freeze input during the slide-in so a stray tap can't grab a card that
    // hasn't landed yet; release once the last one arrives.
    this.input.enabled = false;
    const cy = height / 2 + 10;
    const spacing = 180;
    const startX = width / 2 - (spacing * (cards.length - 1)) / 2;
    cards.forEach((c, i) => {
      const x = startX + i * spacing;
      const sprite = makeCardSprite(this, c, x, cy, { interactive: true });
      this.phaseObjects.push(sprite);
      const zone = sprite.getData("zone") as Phaser.GameObjects.Zone | undefined;
      if (zone) this.phaseObjects.push(zone);

      // Pick on release with a drag guard — matches RewardScene so a swipe
      // doesn't lock in a card.
      sprite.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() > 8) return;
        run.deck.push(c.id);
        outcome.resolved = true;
        this.scene.start("Map");
      });

      sprite.x = -CARD_W;
      sprite.setAlpha(0);
      this.tweens.add({
        targets: sprite, x, alpha: 1,
        duration: 380, delay: i * 110, ease: "Cubic.Out",
      });
    });

    this.phaseObjects.push(this.bigButton(
      width / 2, height - 64, 260, 60, "Leave it →", C.purple, S.dim,
      () => this.scene.start("Map"),
    ));

    const lastLandsAt = cards.length > 0 ? (cards.length - 1) * 110 + 380 : 0;
    markSceneReadyAfter(this, lastLandsAt);
  }

  /**
   * Touch-friendly button: a rounded-rect bg + label in a container, plus a
   * hit zone that fires on release with a drag guard. Returns the container;
   * destroying it also tears down the zone.
   */
  private bigButton(
    cx: number, cy: number, w: number, h: number,
    label: string, fillColor: number, textColor: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(cx, cy);
    const bg = this.add.graphics();
    bg.fillStyle(fillColor, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    bg.lineStyle(3, C.amber, 0.9);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    container.add(bg);
    container.add(this.add.text(0, 0, label, {
      fontFamily: "Lora", fontSize: "22px", color: textColor, fontStyle: "bold",
    }).setOrigin(0.5));

    const zone = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
    zone.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() > 8) return;
      onClick();
    });
    // Stash the zone on the container so phase cleanup (and tests) can reach
    // it; destroying the container tears the zone down with it.
    container.setData("zone", zone);
    container.once("destroy", () => zone.destroy());
    return container;
  }
}
