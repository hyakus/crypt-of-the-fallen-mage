import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import { cardsByRarity } from "@/data/cards";
import { makeCardSprite, playCardShine, playCardFlipReveal, CARD_W } from "@/ui/CardSprite";
import { makeNavButton } from "@/ui/NavButton";
import type { RunState } from "@/types/game";
import { RUN_KEY } from "@/systems/RunState";
import type { Card } from "@/types/cards";
import { gateSceneInput, markSceneReady, markSceneReadyAfter } from "@/ui/sceneReady";

interface RewardInit {
  gold: number;
  nodeKind: "combat" | "elite" | "boss";
}

/**
 * Post-combat reward picker. Caches the rolled picks + init on the scene
 * instance so the player can detour into DeckScene (View Deck) and return
 * to the SAME three cards instead of a re-roll. Cache is cleared on pick or
 * skip so the next reward (next fight) rolls fresh.
 */
export class RewardScene extends Phaser.Scene {
  private cachedPicks: Card[] | null = null;
  private cachedInit: RewardInit | null = null;
  // Set true before navigating to a sub-scene (e.g., Deck) so that when
  // Phaser re-enters create() we know it's a return, not a fresh fight.
  // Phaser preserves scene.settings.data across no-arg scene.start, so we
  // can't reliably distinguish fresh-vs-return by inspecting the data alone.
  private returningFromSubScene = false;

  constructor() { super("Reward"); }

  create(data: RewardInit) {
    gateSceneInput(this);
    const run = this.game.registry.get(RUN_KEY) as RunState;

    // Always refresh cachedInit if real data came through — this lets a
    // new fight overwrite the prior reward context.
    if (data && (data.gold !== undefined || data.nodeKind !== undefined)) {
      this.cachedInit = data;
    }
    const init = this.cachedInit;
    if (!init) {
      // Shouldn't happen, but fail-safe back to the map.
      this.scene.start("Map");
      return;
    }

    // Consume the return flag. If we're returning from a sub-scene, keep
    // the cached picks. Otherwise it's a genuine new reward → re-roll.
    const isReturn = this.returningFromSubScene;
    this.returningFromSubScene = false;
    if (!isReturn) {
      this.cachedPicks = null;
    }

    // Boss kills now go through Humanity (perk pick) instead of awarding
    // a super-power card here. RewardScene only handles non-boss rewards.
    if (init.nodeKind === "boss") {
      this.cachedPicks = null;
      this.cachedInit = null;
      this.scene.start("Humanity");
      return;
    }
    const { width, height } = this.scale;

    const g = this.add.graphics();
    g.fillStyle(C.bg, 1).fillRect(0, 0, width, height);

    this.add.text(width / 2, 60, "Victory.", {
      fontFamily: "Lora", fontSize: "28px", color: S.amber,
    }).setOrigin(0.5);
    this.add.text(width / 2, 100, `+${init.gold} gold.   Pick one card — or skip.`, {
      fontFamily: "Lora", fontSize: "14px", color: S.cream,
    }).setOrigin(0.5);

    // View Deck — opens DeckScene with a return path. Cached picks persist
    // across the detour so the player sees the same options on return.
    makeNavButton(this, width - 130, 58, 200, 60, "View Deck", S.parchHi, () => {
      this.returningFromSubScene = true;
      this.scene.start("Deck", { fromScene: "Reward" });
    }, "24px");

    // Roll picks only when entering fresh; otherwise reuse the cache.
    if (!this.cachedPicks) {
      this.cachedPicks = this.rollRewardCards(run, init.nodeKind);
    }
    const picks = this.cachedPicks;
    const cy = height / 2 + 10;
    const spacing = 180;
    const startX = width / 2 - spacing * (picks.length - 1) / 2;
    picks.forEach((c, i) => {
      const x = startX + i * spacing;
      const sprite = makeCardSprite(this, c, x, cy, { interactive: true });

      // Pick on release, not press — so an accidental drag (e.g. a swipe
      // on mobile) doesn't lock in a card.
      sprite.on("pointerup", (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() > 8) return;
        run.deck.push(c.id);
        this.cachedPicks = null;
        this.cachedInit = null;
        this.continueOn(run, init.nodeKind);
      });

      if (!isReturn) {
        // First entry. Every card slides in from off-screen left; rare-tier
        // cards then do an in-place horizontal flip (showing the card back
        // mid-flip) followed by the existing shine. Doing the flip AFTER
        // the slide is critical — running them together hides the flip under
        // the translation; sequenced, the player actually sees both beats.
        const zone = sprite.getData("zone") as Phaser.GameObjects.Zone | undefined;
        zone?.disableInteractive();
        const isRareTier = c.rarity === "rare" || c.rarity === "super" || c.rarity === "fusion";
        sprite.x = -CARD_W;
        sprite.setAlpha(0);
        this.tweens.add({
          targets: sprite,
          x,
          alpha: 1,
          duration: 420,
          delay: i * 140,
          ease: "Cubic.Out",
          onComplete: () => {
            if (isRareTier) {
              playCardFlipReveal(this, sprite, x, cy, {
                duration: 520,
                onComplete: () => {
                  zone?.setInteractive({ useHandCursor: true });
                  playCardShine(this, sprite);
                },
              });
            } else {
              zone?.setInteractive({ useHandCursor: true });
            }
          },
        });
      }
      // On return-from-deck, the sprite is already at its rest position and
      // interactive — no animation needed.
    });

    // Skip — generous hit area at the bottom centre.
    const skipReward = () => {
      this.cachedPicks = null;
      this.cachedInit = null;
      this.continueOn(run, init.nodeKind);
    };
    makeNavButton(this, width / 2, height - 70, 260, 60, "Skip reward →", S.dim, skipReward, "22px");

    // Hardware back behaves as Skip (it's the only forward path that doesn't
    // commit to a card).
    this.events.off("androidback");
    this.events.on("androidback", skipReward);

    // Release scene input once the cards have arrived. On return from
    // DeckScene the cards are already at rest, so release immediately;
    // on a fresh entry, wait for the last card's slide-in to land. The
    // per-card rare-tier flip is gated separately by the zone interactive
    // dance above.
    if (isReturn) {
      markSceneReady(this);
    } else {
      const lastSlideEndsAt = picks.length > 0
        ? (picks.length - 1) * 140 + 420
        : 0;
      markSceneReadyAfter(this, lastSlideEndsAt);
    }
  }

  private rollRewardCards(_run: RunState, nodeKind: "combat" | "elite" | "boss"): Card[] {
    const basics = cardsByRarity("basic");
    const rares  = cardsByRarity("rare");
    const out: Card[] = [];

    const rareChance =
      nodeKind === "elite" ? 0.6 :
      nodeKind === "boss"  ? 0.9 :
      0.25;

    for (let i = 0; i < 3; i++) {
      const pool = Math.random() < rareChance ? rares : basics;
      out.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return out;
  }

  private continueOn(_run: RunState, _nodeKind: string) {
    // Non-boss rewards just return to map. Boss path is handled above
    // by redirecting to HumanityScene which manages floor advancement.
    this.scene.start("Map");
  }
}
