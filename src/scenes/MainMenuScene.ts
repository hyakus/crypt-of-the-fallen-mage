import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import {
  freshRunState, RUN_KEY,
  hasSave, loadRun, clearRun, saveTimestamp,
} from "@/systems/RunState";
import { loadMeta } from "@/systems/MetaState";
import { metaPerkById } from "@/data/metaPerks";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";
import { addBackground } from "@/ui/sceneBg";

export class MainMenuScene extends Phaser.Scene {
  constructor() { super("MainMenu"); }

  create() {
    gateSceneInput(this);
    const { width, height } = this.scale;

    // Pixel-art crypt: Mortimer's open coffin under a shaft of pale light.
    addBackground(this, "bg-menu", { dim: 0.28 });
    const g = this.add.graphics();
    // Candlelight halo
    for (let r = 280; r > 0; r -= 20) {
      g.fillStyle(C.amber, 0.012);
      g.fillCircle(width / 2, height / 2 - 20, r);
    }

    // Anchored to the top of the canvas so the layout doesn't drop off the
    // bottom on shorter smartphone canvases (533 tall). The buttons stack
    // down from below the subtitle.
    this.add.text(width / 2, 40, "CRYPT OF THE", {
      fontFamily: "Lora", fontSize: "28px", color: S.cream,
    }).setOrigin(0.5);
    this.add.text(width / 2, 88, "FALLEN MAGE", {
      fontFamily: "Lora", fontSize: "48px", color: S.amber, fontStyle: "bold",
    }).setOrigin(0.5);
    this.add.text(width / 2, 132, "— a wizard's reclamation —", {
      fontFamily: "Lora", fontSize: "22px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5);

    const saveExists = hasSave();
    let y = 188;
    // Button height is 56, so step = 56 makes buttons exactly touch (sharing
    // their 2px stroked border). Step 59 gives a 3px visual gap between each
    // adjacent pair's borders — enough to read as a clean separation but
    // tight enough that all 5 buttons + the shard summary still fit on the
    // 533-tall smartphone canvas above the version line.
    const step = 59;

    if (saveExists) {
      const ts = saveTimestamp();
      const when = ts > 0 ? friendlyAgo(Date.now() - ts) : "earlier";
      this.button(width / 2, y, `Continue Run  (saved ${when})`, () => {
        if (loadRun(this.game)) {
          this.scene.start("Map");
        } else {
          // Save was corrupt and got cleared — fall back to a fresh run.
          this.game.registry.set(RUN_KEY, freshRunState());
          this.scene.start("Dream");
        }
      });
      y += step;
    }

    this.button(width / 2, y, "Begin a New Run", () => {
      this.confirmIfSaved(saveExists, () => {
        clearRun();
        this.game.registry.set(RUN_KEY, freshRunState());
        this.scene.start("Dream");
      });
    });
    y += step;

    this.button(width / 2, y, "Quick Run (skip dream)", () => {
      this.confirmIfSaved(saveExists, () => {
        clearRun();
        this.game.registry.set(RUN_KEY, freshRunState());
        this.scene.start("ClassSelect", { skipTutorial: true });
      });
    });
    y += step;

    this.button(width / 2, y, "Card Gallery (preview)", () => this.scene.start("Gallery"));
    y += step;

    this.button(width / 2, y, "Crystal Shrine (meta shop)", () => this.scene.start("MetaShop"));

    // Meta-progression summary — shows shard balance and owned perks.
    // Anchored relative to the BOTTOM of the canvas (not the button stack)
    // so the 533-tall smartphone canvas doesn't push it down onto the
    // version line. Version sits at the very bottom; summary 26 px above it.
    const meta = loadMeta();
    const ownedNames = meta.ownedPerks
      .map((id) => metaPerkById(id)?.name)
      .filter((n): n is string => !!n);
    const summary = ownedNames.length > 0
      ? `◆ ${meta.crystalShards} shards   ·   ${ownedNames.join(" · ")}`
      : `◆ ${meta.crystalShards} shards`;
    this.add.text(width / 2, height - 58, summary, {
      fontFamily: "Lora", fontSize: "18px", color: S.amber, align: "center",
      wordWrap: { width: 900 },
    }).setOrigin(0.5);

    this.add.text(width / 2, height - 24, "v0.1 · prototype · placeholders only",
      { fontFamily: "Lora", fontSize: "16px", color: S.dim }).setOrigin(0.5);

    markSceneReady(this);
  }

  private button(x: number, y: number, label: string, onClick: () => void) {
    const w = 420, h = 56;
    const g = this.add.graphics();
    g.fillStyle(C.purple, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    g.lineStyle(2, C.amber, 1).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);
    const t = this.add.text(x, y, label, { fontFamily: "Lora", fontSize: "18px", color: S.parchHi })
      .setOrigin(0.5);
    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => t.setColor(S.amber));
    zone.on("pointerout",  () => t.setColor(S.parchHi));
    zone.on("pointerdown", onClick);
    return { g, t, zone };
  }

  /** Confirm via a modal-ish overlay before clobbering an existing save. */
  private confirmIfSaved(saveExists: boolean, onProceed: () => void) {
    if (!saveExists) { onProceed(); return; }
    const { width, height } = this.scale;
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.78).setDepth(9000);
    const panel = this.add.rectangle(width / 2, height / 2, 540, 220, C.bgSoft, 1)
      .setStrokeStyle(2, C.blood).setDepth(9001);
    const q = this.add.text(width / 2, height / 2 - 50, "Overwrite the saved run?", {
      fontFamily: "Lora", fontSize: "20px", color: S.parchHi,
    }).setOrigin(0.5).setDepth(9002);
    const warn = this.add.text(width / 2, height / 2 - 18, "Mortimer's current journey will be lost.", {
      fontFamily: "Lora", fontSize: "20px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5).setDepth(9002);

    const cleanup = () => {
      dim.destroy(); panel.destroy(); q.destroy(); warn.destroy();
      yesBg.destroy(); yesT.destroy(); yesZ.destroy();
      noBg.destroy(); noT.destroy(); noZ.destroy();
    };

    const yesBg = this.add.rectangle(width / 2 - 90, height / 2 + 50, 140, 40, C.blood)
      .setStrokeStyle(2, C.amber).setDepth(9002);
    const yesT = this.add.text(width / 2 - 90, height / 2 + 50, "Overwrite", {
      fontFamily: "Lora", fontSize: "20px", color: S.parchHi,
    }).setOrigin(0.5).setDepth(9003);
    const yesZ = this.add.zone(width / 2 - 90, height / 2 + 50, 140, 40)
      .setInteractive({ useHandCursor: true }).setDepth(9004);
    yesZ.on("pointerdown", () => { cleanup(); onProceed(); });

    const noBg = this.add.rectangle(width / 2 + 90, height / 2 + 50, 140, 40, C.purple)
      .setStrokeStyle(2, C.amber).setDepth(9002);
    const noT = this.add.text(width / 2 + 90, height / 2 + 50, "Cancel", {
      fontFamily: "Lora", fontSize: "20px", color: S.parchHi,
    }).setOrigin(0.5).setDepth(9003);
    const noZ = this.add.zone(width / 2 + 90, height / 2 + 50, 140, 40)
      .setInteractive({ useHandCursor: true }).setDepth(9004);
    noZ.on("pointerdown", cleanup);
  }
}

function friendlyAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
