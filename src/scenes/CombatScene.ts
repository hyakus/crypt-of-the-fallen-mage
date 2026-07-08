import Phaser from "phaser";
import { C, S } from "@/ui/palette";
import { makeCardSprite, makeCardBackSprite, makeEnemyCardBackSprite, makeEnemyActionCard, CARD_W, CARD_H } from "@/ui/CardSprite";
import { makeNavButton } from "@/ui/NavButton";
import { vstack } from "@/ui/layout";
import {
  startCombat, drawCards, playCard, endPlayerTurn,
  applyHeroEffect, firePassives,
  type EnemyTemplate,
} from "@/systems/CombatEngine";
import { ENEMIES, pickEnemyForNode } from "@/systems/Enemies";
import type { CombatState, HeroAction } from "@/types/game";
import type { RunState } from "@/types/game";
import { RUN_KEY } from "@/systems/RunState";
import { addShards } from "@/systems/MetaState";
import { gateSceneInput, markSceneReady } from "@/ui/sceneReady";
import { activeStatuses, statusRingColor, STATUS_INFO } from "@/ui/statusInfo";
import type { StatusEffects } from "@/types/game";

interface CombatInit {
  source: "dream" | "map";
  enemyId?: string;            // dream / debug
  nodeKind?: "combat" | "elite" | "boss";
  isTutorial?: boolean;
}

export class CombatScene extends Phaser.Scene {
  private state!: CombatState;
  private enemy!: EnemyTemplate;
  private deckBeforeCombat!: string[];

  private handSprites: Phaser.GameObjects.Container[] = [];
  private handZones: Phaser.GameObjects.Zone[] = [];
  private enemyHandSprites: Phaser.GameObjects.Container[] = [];
  private playPileSprite: Phaser.GameObjects.Container | null = null;
  private playPileShadow: Phaser.GameObjects.Rectangle | null = null;
  // Hand has two display modes — "active" sits at the canonical position,
  // "standby" parks the fan 60% off the bottom of the screen so the central
  // play area is clear. Player taps the hand to activate, taps elsewhere
  // to dismiss back to standby (see backdropTapZone below).
  private handMode: "standby" | "active" = "active";
  private backdropTapZone: Phaser.GameObjects.Zone | null = null;
  // Pile-preview state. We don't track WHAT'S on the pile (it could be a
  // player card sprite OR an enemy-action card sprite); we just grow
  // whatever sprite is currently sitting on the pile. Simpler than
  // re-creating a preview, and naturally supports both kinds.
  private pilePreviewBackdrop: Phaser.GameObjects.Rectangle | null = null;
  /** Zone over the pile that fires the preview. Toggled interactive only
   *  when there's actually a card on the pile (see setPileCard). */
  private pileZone: Phaser.GameObjects.Zone | null = null;
  // Combat log toasts — slide in from the left, auto-expire. The Log button
  // opens a modal with the full history (state.log entries that have
  // already streamed past).
  private toasts: Phaser.GameObjects.Container[] = [];
  private lastShownLogIndex = 0;
  private static readonly TOAST_TOP_Y = 80;
  private static readonly TOAST_SLOT_H = 38;
  private static readonly TOAST_MAX = 3;
  /** Sit BELOW the radial menu / auto-end-turn (6000+) and their pulse halo
   *  (5990) so the End Turn / Draw buttons always win the visual race when
   *  the toast stack reaches down toward the right-side button column. */
  private static readonly TOAST_DEPTH = 5800;
  /** Halo + tween for the "out of plays — click the deck" pulse. */
  // Radial menu state — opened by clicking the deck
  private radialOpen = false;
  private radialButtons: Phaser.GameObjects.Container[] = [];
  private radialBackdrop: Phaser.GameObjects.Zone | null = null;
  // Auto End Turn — pops out of the deck on its own when actions hit zero,
  // tucks back in if a Hero skill restores actions. Independent of the radial.
  private autoEndTurnOpen = false;
  private autoEndTurnButton: Phaser.GameObjects.Container | null = null;
  private autoEndTurnZone: Phaser.GameObjects.Zone | null = null;
  private autoEndTurnHalo: Phaser.GameObjects.Rectangle | null = null;
  private autoEndTurnHaloTween: Phaser.Tweens.Tween | null = null;
  // Deck halo — same look as the End Turn halo, but only used for the
  // narrow "you have actions left but nothing in hand — click to Draw" case.
  private deckHalo: Phaser.GameObjects.Rectangle | null = null;
  private deckHaloTween: Phaser.Tweens.Tween | null = null;
  // Last-seen HP per side, used to detect drops in refresh() and pulse the
  // matching HP text so the player notices a hit landing.
  private lastPlayerHp = -1;
  private lastEnemyHp = -1;
  // Same idea for shields — drop = absorbed a hit; rise = newly raised.
  // Each gets a different flash so the player can tell them apart.
  private lastPlayerShield = -1;
  private lastEnemyShield = -1;
  // Player empowered pill — shown above the portrait when active.
  private playerEmpoweredBadge!: Phaser.GameObjects.Container;
  private playerEmpoweredNumber!: Phaser.GameObjects.Text;
  private lastPlayerEmpowered = -1;
  // Set once the outcome (win/loss) has been scheduled, so refresh() can
  // run repeatedly during the defeat animation without re-queueing it.
  private outcomeQueued = false;
  // Card-play gesture state. The flow:
  //   - pointerdown on a card starts a hold timer
  //   - if the user releases before HOLD_MS, no play (filters accidental taps
  //     when the hand is large and crowded)
  //   - once the timer fires, holdGestureActive flips true and the play
  //     arrow appears on whichever card the pointer is currently over
  //   - while held + active, pointerover on a different card transfers the
  //     arrow (drag-to-cycle)
  //   - pointerup over a card with an active gesture plays that card
  // Tracking the "currently hovered" index separately from "armed" lets the
  // hold timer find the right card to arm if the finger drifted during the
  // delay window.
  private static readonly HOLD_MS = 50;
  private armedCardIndex: number | null = null;
  private hoveredCardIndex: number | null = null;
  private holdGestureActive = false;
  // Browser setTimeout handle, not a Phaser TimerEvent — Phaser's time plugin
  // has been known to stall on scenes reached via game.scene.start outside
  // the normal flow (Vite HMR test paths). Browser clock is bulletproof.
  private holdTimer: number | null = null;
  // Date.now() stamp captured at pointerdown on any hand zone. pointerup
  // computes (now - holdStartedAt) and plays the card under the finger if
  // it's ≥ HOLD_MS. This is the authoritative source for the play decision
  // — order-independent of the global pointerup cleanup, so even if the
  // safety net clears holdGestureActive first, the play still fires.
  private holdStartedAt = 0;
  private playerHpNumber!: Phaser.GameObjects.Text;
  // HP pills wrapped in containers so the column layout (vstack) can position
  // them as a unit. The text refs above still point at the inner number text.
  private playerHpBadge!: Phaser.GameObjects.Container;
  private enemyHpBadge!: Phaser.GameObjects.Container;
  // Portrait graphics + name text held as fields so the player-defeat
  // animation can dim them (eyes go out, name fades) symmetric to the
  // enemy-defeat HP-flash + hand-fall choreography.
  private playerPortraitG!: Phaser.GameObjects.Graphics;
  private playerPortrait!: Phaser.GameObjects.Container;
  private playerNameText: Phaser.GameObjects.Text | null = null;
  // Final centre Y of the portrait after column layout — read by
  // renderHeroActions so the hero-skill button lands inside the portrait
  // regardless of how the column above it shifts.
  private portraitCenterY = 0;
  // Per-mount scaled copies of the PORTRAIT_* static constants. The statics
  // are sized for the 800-tall desktop design; on smartphones the design is
  // 400 tall and these need to halve so the portrait fits the smaller
  // canvas. renderHeroActions + makeHeroActionButton read these instead of
  // the statics directly.
  private scaledPortraitW = 0;
  private scaledPortraitH = 0;
  // Start-of-combat showpiece: the alchemical sigil rendered as a Phaser
  // Plane — a textured quad with real 3D model transforms.
  // playStartOfCombat animates its modelRotation around the Y axis
  // (horizontal spin) and X axis (tip toward the camera) for a genuine 3D
  // entrance, replacing the older scaleX/scaleY fake-3D approximation.
  // The bg graphics is tracked too so the sweep-in pass skips it (it covers
  // the whole canvas — would look terrible swept).
  private sigilImage: Phaser.GameObjects.Plane | null = null;
  private bgGraphics!: Phaser.GameObjects.Graphics;
  // Per-floor pixel-art level scenery, full-bleed behind the sigil. Excluded
  // from the start-of-combat sweep (like bgGraphics) so it stays put.
  private levelBg: Phaser.GameObjects.Image | null = null;
  // Player deck face — graphics that switch between "stacked cards" (draw
  // pile has cards) and "ghost outline" (draw pile empty). Updated by refresh().
  // The player deck visual is a tiny stack of real card-back sprites so that
  // the deck artwork matches whatever flies out of it (shuffle, deal, flip).
  // `playerDeckFace` is the top card the player clicks; the two layers behind
  // give it depth. `playerDeckGhost` is a hollow outline shown when the draw
  // pile is dry — the card-back stack hides, the outline appears.
  private playerDeckFace!: Phaser.GameObjects.Container;
  private playerDeckBackLayers: Phaser.GameObjects.Container[] = [];
  private playerDeckGhost!: Phaser.GameObjects.Graphics;
  /** Enemy deck top-card sprite (top-right). Stored so the enemy reshuffle
   *  animation can thump it as its cards land, mirroring the player deck. */
  private enemyDeckFace?: Phaser.GameObjects.Container;
  private playerHpTick = { v: 0 };
  private playerShieldBadge!: Phaser.GameObjects.Container;
  private playerShieldNumber!: Phaser.GameObjects.Text;
  private enemyNameText!: Phaser.GameObjects.Text;
  private enemyIntentText: Phaser.GameObjects.Text | null = null;
  private enemyHpNumber!: Phaser.GameObjects.Text;
  private enemyHpTick = { v: 0 };
  private enemyShieldBadge!: Phaser.GameObjects.Container;
  private enemyShieldNumber!: Phaser.GameObjects.Text;
  // HP-cross status indicator. The cross itself stays red (HP identity);
  // these visualise active statuses ON that actor: `ring` is a pulsing
  // coloured outline around the cross when statuses are present, `badge`
  // is a small count chip at the cross's top-right showing how many.
  // Tapping the whole HP pill (containers are made interactive in
  // makeHpBadge) opens a panel via openStatusPanel.
  private playerHpCross!: Phaser.GameObjects.Text;
  private enemyHpCross!: Phaser.GameObjects.Text;
  private playerStatusRing!: Phaser.GameObjects.Graphics;
  private enemyStatusRing!: Phaser.GameObjects.Graphics;
  private playerStatusRingTween: Phaser.Tweens.Tween | null = null;
  private enemyStatusRingTween: Phaser.Tweens.Tween | null = null;
  private playerStatusBadge!: Phaser.GameObjects.Container;
  private enemyStatusBadge!: Phaser.GameObjects.Container;
  private playerStatusBadgeText!: Phaser.GameObjects.Text;
  private enemyStatusBadgeText!: Phaser.GameObjects.Text;
  // Snapshot of last-rendered status values per side. Used by refresh() to
  // detect newly-applied or stacked effects — any key whose value rises is
  // a "took hold" event and pops the cross. Null = first refresh, no diff.
  private lastPlayerStatuses: StatusEffects | null = null;
  private lastEnemyStatuses: StatusEffects | null = null;
  // Currently-open status panel (modal). Tapping the backdrop closes it.
  private statusPanel: Phaser.GameObjects.Container | null = null;
  private statusPanelBackdrop: Phaser.GameObjects.Zone | null = null;
  // Hero-skills popup panel — opened by tapping the portrait. Lists all
  // owned hero skills with active vs passive distinction; active rows are
  // tap-to-fire, passives are display-only with auto/fired labels.
  private heroSkillsPanel: Phaser.GameObjects.Container | null = null;
  private heroSkillsBackdrop: Phaser.GameObjects.Zone | null = null;
  // Tabbed Hero Skills panel state: which tab is showing, the scrolling
  // content container + its clip mask, scroll-related zones (tabs + drag),
  // and the current scroll offset (0 = top, negative = scrolled down).
  private heroSkillsTab: "active" | "passive" = "active";
  private heroSkillsMaskG: Phaser.GameObjects.Graphics | null = null;
  private heroSkillsZones: Phaser.GameObjects.Zone[] = [];
  // Active-skill "Use" hit zones live at the scene level (so they always win
  // input priority over the scroll drag-zone) but must follow the scrolling
  // content — `base` is their unscrolled world-Y offset from the panel.
  private heroSkillsButtons: { zone: Phaser.GameObjects.Zone; base: number }[] = [];
  private heroSkillsScroll = 0;
  private drawPileText!: Phaser.GameObjects.Text;
  private discardPileText!: Phaser.GameObjects.Text;
  /** Pip-cluster center, set in create(). */
  private actionsPipsCenterX = 0;
  private actionsPipsCenterY = 0;
  /** Active pip objects + their tweens (cleared & rebuilt each refresh). */
  private pipObjects: Phaser.GameObjects.Text[] = [];
  private pipTweens: Phaser.Tweens.Tween[] = [];
  private comboText!: Phaser.GameObjects.Text;
  private lastDisplayedCardsPlayed = 0;
  /** Discard size last time refresh() ran. We detect a shuffle as
   *  prev > 0 && now == 0 (the engine's recycleDeck empties discard into
   *  draw in one go), and trigger playShuffleAnimation accordingly. */
  private lastDiscardCount = 0;
  /** Enemy cosmetic hand size last time refresh() ran. The engine burns one
   *  card per enemy turn and resets cardsInHand back UP to handSize when the
   *  hand empties — a reshuffle. A jump upward is our signal to fly the
   *  enemy's spent cards back into THEIR deck (the mirror of the player
   *  reshuffle: each side reclaims its own cards into its own deck). */
  private lastEnemyCardsInHand = 0;
  /** Hand card-id multiset last seen by refresh(). Used to detect cards
   *  newly drawn mid-combat (not present in the previous hand) so we can
   *  fly them in from the player deck instead of popping them in cold.
   *  null on first refresh so the opening-deal animation handles seed
   *  cards uncontested. */
  private lastHandIds: string[] | null = null;

  constructor() { super("Combat"); }

  init(data: CombatInit) {
    const run = this.game.registry.get(RUN_KEY) as RunState;
    this.deckBeforeCombat = [...run.deck];
    if (data.enemyId) {
      this.enemy = ENEMIES[data.enemyId];
    } else if (data.nodeKind) {
      this.enemy = pickEnemyForNode(run.floor, data.nodeKind);
    } else {
      this.enemy = ENEMIES.cryptRat;
    }
    this.state = startCombat(run.deck, run.hp, run.maxHp, this.enemy, run.baseActionsPerTurn);
    // Apply combat-start shield from perks (Iron Skin).
    if (run.combatStartShield > 0) {
      this.state.player.shield = run.combatStartShield;
    }
    // Reset hero actions for this fight. With the redesigned hero system the
    // player can own many skills (no cap); every once-per-fight passive +
    // active gets its used-flag reset here so the new fight starts clean.
    run.heroActions.forEach((ha) => { ha.usedThisFight = false; });
    // combatStart passives fire BEFORE the opening hand so e.g. "+1 card on
    // combat start" lands as part of the deal, not as a draw afterwards.
    firePassives(this.state, run, "combatStart");
    // Turn-1 also fires the turnStart + onLowHp passives — without this the
    // very first turn of every fight silently skips them (engine's normal
    // turnStart pathway lives at the END of endPlayerTurn, which runs AFTER
    // each player turn, so turn 1 never gets it). Playtest caught this:
    // Bloodlust Pact's Empowered didn't appear until turn 2.
    firePassives(this.state, run, "turnStart");
    firePassives(this.state, run, "onLowHp");
    // Opening hand size — bumped by the "Studied Hand" meta perk.
    const openingHand = run.metaPerks.includes("meta_studied_hand") ? 4 : 3;
    drawCards(this.state, openingHand);
    // Seed the HP tick wrappers with the starting values so the first refresh
    // doesn't animate from zero up to full HP.
    this.playerHpTick.v = this.state.player.hp;
    this.enemyHpTick.v = this.state.enemy.hp;
    // Reset per-fight tracking — Phaser reuses scene instances, so these
    // would otherwise carry over from the previous combat. outcomeQueued
    // is the dangerous one: a stale `true` blocks the victory screen
    // entirely on subsequent fights.
    this.outcomeQueued = false;
    this.lastPlayerHp = -1;
    this.lastEnemyHp = -1;
    this.lastPlayerShield = -1;
    this.lastEnemyShield = -1;
    this.lastPlayerEmpowered = -1;
    this.lastDisplayedCardsPlayed = 0;
    this.lastShownLogIndex = 0;
    this.toasts.forEach((t) => t.destroy());
    this.toasts = [];
    // Status snapshots — null forces the first refresh to seed the snapshot
    // without firing the "took hold" pop on whatever the fight starts with.
    this.lastPlayerStatuses = null;
    this.lastEnemyStatuses = null;
    // Any panel left open from a previous fight points at destroyed
    // game objects — null the refs so create() builds clean state.
    this.statusPanel = null;
    this.statusPanelBackdrop = null;
    this.playerStatusRingTween = null;
    this.enemyStatusRingTween = null;
    // Opening-animation state. On a reused scene instance (every combat after
    // the first) these carry the PREVIOUS fight's values and make the new
    // fight's opening misbehave:
    //   - handMode "standby" → the opening deal caches standby rest positions
    //     and flies the starting hand off the bottom of the screen.
    //   - lastHandIds non-null → the first refresh() diffs the new seed hand
    //     against the old fight's final hand and spuriously "draws" cards in
    //     mid-sigil (a card appearing before the deal).
    //   - lastDiscardCount > 0 → the first refresh() reads discard==0 as a
    //     reshuffle and plays a phantom shuffle animation.
    // The opening sequence assumes all three at their fresh defaults.
    this.handMode = "active";
    this.lastHandIds = null;
    this.lastDiscardCount = 0;
    // Seed the enemy hand tracker to its starting size so the first refresh()
    // doesn't read the initial full hand as an upward jump (phantom reshuffle).
    this.lastEnemyCardsInHand = this.state.enemy.cardsInHand ?? 0;
    // Pile sprite refs point at objects destroyed by the previous fight's
    // scene shutdown. Leaving them non-null makes setPileCard tween a dead
    // object on the first card played in fights after the first. create()
    // builds a fresh (empty) pile, so clearing them here is correct.
    this.playPileSprite = null;
    this.playPileShadow = null;
  }

  create() {
    // Block all scene input until the opening sigil/sweep/deal finishes.
    // Released from animateOpeningDeal's final delayedCall below.
    gateSceneInput(this);

    const { width, height } = this.scale;

    // Vertical scale factor — every hardcoded Y offset and portrait box
    // dimension in this scene was sized for the 800-tall desktop design.
    // On smartphones (DESIGN_HEIGHT=400) we multiply by VS to keep the layout
    // proportional. UI elements like cards (CARD_W/H) and fonts stay at
    // their design-pixel sizes deliberately: that's what makes them ~2×
    // bigger on a phone screen, since the canvas itself is half-density.
    const VS = height / 800;
    // Portrait box is UNSCALED — its width matches the (also-unscaled)
    // PILL_W=200 of the HP/shield pills directly beneath it, so the whole
    // left column reads as a single coherent stack. The portrait's vertical
    // position is now decided by vstack (anchored to the canvas bottom) so
    // we no longer need PORTRAIT_Y_OFFSET.
    const portW = CombatScene.PORTRAIT_W;
    const portH = CombatScene.PORTRAIT_H;
    this.scaledPortraitW = portW;
    this.scaledPortraitH = portH;

    // Background — drawn natively in Phaser and STATIC: the sigil image on
    // top of this is animated (3D-spin entrance), and we don't want the
    // battlefield bg to scale with it. So everything here is committed to a
    // single Graphics layer and never tweened. Composition:
    //   1. Solid bgSoft fill (the dark base).
    //   2. Amber radial halo built from many concentric low-alpha circles —
    //      same trick as DreamScene's ghost-blue halo / BattleSummary's
    //      amber halo: dozens of overlapping 0.005-alpha rings produce a
    //      smooth gradient that reads as a warm aura at the centre.
    //   3. Edge vignette: a few large semi-transparent rectangles biased
    //      toward each edge so the corners darken without an obvious seam.
    // Combat keeps the older quiet gradient-only background instead of the
    // per-floor pixel-art backdrop. The pixel art read as visually busy
    // behind the cards and the central sigil — the gradient + amber halo
    // (drawn below) lets the cards, sigil, hand fan, and HUD chrome stay
    // the focus. `levelBg` is left null so playStartOfCombat's sweep pass
    // is a no-op for it, same as the old code path.
    this.levelBg = null;

    const bg = this.add.graphics();
    bg.fillStyle(C.bgSoft, 0.28).fillRect(0, 0, width, height);
    for (let r = 460; r > 0; r -= 14) {
      bg.fillStyle(C.amber, 0.005).fillCircle(width / 2, height / 2, r);
    }
    // Subtle edge vignette via four feathered bands. Lots of small steps
    // approximate a radial fall-off without needing a shader.
    const VIG_STEPS = 18;
    for (let i = 0; i < VIG_STEPS; i++) {
      const t = i / VIG_STEPS;
      const alpha = 0.04 * t * t; // squared so corners darken stronger
      const inset = (1 - t) * Math.min(width, height) * 0.45;
      bg.fillStyle(0x000000, alpha);
      // Top band
      bg.fillRect(0, 0, width, inset * 0.25);
      // Bottom band
      bg.fillRect(0, height - inset * 0.25, width, inset * 0.25);
      // Left band
      bg.fillRect(0, 0, inset * 0.25, height);
      // Right band
      bg.fillRect(width - inset * 0.25, 0, inset * 0.25, height);
    }
    this.bgGraphics = bg;
    // Arcane combat backdrop — alchemical summoning sigil behind the cards.
    // Sized to COVER the canvas while preserving the SVG's native aspect
    // ratio: whichever canvas dimension would otherwise leave the image
    // smaller gets the image scaled up to fill it, with the other dimension
    // extending beyond canvas bounds (cropped naturally). This keeps the
    // concentric rings + hexagram circular on every phone aspect (20:9
    // landscape stretched the rings into ovals under setDisplaySize). The
    // surrounding warm halo painted on `bg` above covers whatever the image
    // doesn't reach. Skip gracefully if the texture isn't there.
    if (this.textures.exists("combat-backdrop")) {
      // Phaser.GameObjects.Plane: a textured quad that supports real 3D
      // model transforms (modelRotation, modelScale, modelPosition).
      // playStartOfCombat rotates it around Y (horizontal spin) and X (tip)
      // for a genuine 3D entrance — the quad foreshortens through
      // perspective, rather than fake-3D scaleX/scaleY.
      //
      // Cells = 1×1 (single quad, no grid). The Plane constructor sets up
      // a default perspective camera matching the scene's canvas, so we
      // skip setOrtho/setPerspective and just rely on the default. The
      // visible plane is THEN scaled at the GameObject level (setScale)
      // to cover the canvas while preserving the SVG aspect — same cover-
      // fit math as the old Image setDisplaySize.
      const plane = this.add.plane(width / 2, height / 2, "combat-backdrop", undefined, 1, 1);
      plane.setSizeToFrame();
      const src = this.textures.get("combat-backdrop").getSourceImage();
      const imgW = (src as { width: number }).width;
      const imgH = (src as { height: number }).height;
      const imgAspect = imgW / imgH;
      const canvasAspect = width / height;
      let coverW: number;
      let coverH: number;
      if (canvasAspect > imgAspect) {
        coverW = width;
        coverH = width / imgAspect;
      } else {
        coverH = height;
        coverW = height * imgAspect;
      }
      plane.setScale(coverW / imgW, coverH / imgH);
      // Render the back face so the sigil doesn't disappear at the edge-on
      // moment mid-spin (sigil is symmetric — the mirrored back reads as
      // the same artwork).
      plane.hideCCW = false;
      this.sigilImage = plane;
    }
    // The old purple "dungeon floor" stripe at 55% height was visually
    // splitting the layout when enemy/player aren't mirrored anymore;
    // dropped per UX feedback.

    // Player "portrait" mini at bottom-left, ~1.8× bigger than before. The
    // box doubles as the Hero Skill button when one is owned — the skill
    // name + effect live inside it, and the whole box becomes tappable.
    // Without a skill, it falls back to just showing "Mortimer" under the eyes.
    //
    // Built into a Container so the vstack layout below can position the
    // whole portrait as one unit. All children draw relative to (0, 0); the
    // container's setPosition then anchors the box's centre.
    const portrait = this.add.container(0, 0);
    const pg = this.add.graphics();
    pg.fillStyle(C.ink, 1).fillRoundedRect(-portW / 2, -portH / 2, portW, portH, 14 * VS);
    pg.fillStyle(C.amber, 0.7).fillCircle(-40, -10, 7);
    pg.fillStyle(C.amber, 0.7).fillCircle(40, -10, 7);
    portrait.add(pg);
    this.playerPortraitG = pg;
    this.playerPortrait = portrait;
    const run0 = this.game.registry.get(RUN_KEY) as RunState;
    if (run0.heroActions.length === 0) {
      this.playerNameText = this.add.text(0, 20, "Mortimer", {
        fontFamily: "Lora", fontSize: "20px", color: S.cream,
      }).setOrigin(0.5);
      portrait.add(this.playerNameText);
    } else {
      this.playerNameText = null;
    }
    // Hero skill renders inside the portrait — see renderHeroActions.

    // UI texts. Both HUD columns are laid out declaratively with `vstack`
    // (see src/ui/layout.ts) — items declare their heights and the stack
    // re-flows around them. This replaces the previous web of magic-number
    // y-offsets, where every pill size / font tweak risked introducing an
    // overlap somewhere downstream.
    const run = this.game.registry.get(RUN_KEY) as RunState;

    // Enemy HUD (top-centre): [intent?] → name → HP → shield? → status.
    // The intent line only exists when the player owns the "Knowing Eye"
    // meta perk; the shield pill is hidden when shield = 0. `relayoutHud()`
    // re-runs vstack whenever optional pills toggle visibility.
    const hasIntent = run.metaPerks.includes("meta_knowing_eye");
    if (hasIntent) {
      this.enemyIntentText = this.add.text(0, 0, "", {
        fontFamily: "Lora", fontSize: "20px", color: S.amber, fontStyle: "italic",
      }).setOrigin(0.5);
    }
    this.enemyNameText = this.add.text(0, 0, "", {
      fontFamily: "Lora", fontSize: "26px", color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5);
    this.makeHpBadge(false);
    this.makeShieldBadge();

    // Player HUD (bottom-left, centred on the portrait column): anchored to
    // the BOTTOM of the canvas and grows upward. Order top→bottom:
    // empowered? → portrait → HP → shield?
    // The old inline status text ("Burn 3 · Stun 1") that lived under the
    // HP pill is gone — status presence now reads off the HP cross (a
    // pulsing coloured ring + count badge), and the full per-effect list
    // opens by tapping the HP pill. See openStatusPanel.
    this.makeEmpoweredBadge();
    this.makeHpBadge(true);
    this.makeShieldBadge(true);

    this.relayoutHud();

    // Pile counts live INSIDE the deck visual, BELOW the central ☾ sigil on
    // the card-back artwork. The sigil sits at the deck centre (~±9 px tall
    // at deck scale), so the draw count is offset ~30 px below centre to
    // clear it without colliding.
    const deckCx = this.playerDeckPos.x;
    const deckCy = this.playerDeckPos.y;
    this.drawPileText    = this.add.text(deckCx, deckCy + 30 * VS, "", { fontFamily: "Lora", fontSize: "18px", color: S.parchHi, fontStyle: "bold" }).setOrigin(0.5).setDepth(52);
    this.discardPileText = this.add.text(deckCx, deckCy + 54 * VS, "", { fontFamily: "Lora", fontSize: "14px", color: S.dim }).setOrigin(0.5).setDepth(52);

    // Combo counter — pops in above the player hand so it's at the centre of
    // attention right after a play, and doesn't collide with the pile.
    this.comboText = this.add.text(width / 2, height - 290 * VS, "", {
      fontFamily: "Lora", fontSize: "42px", color: S.amber, fontStyle: "bold",
      align: "center",
    }).setOrigin(0.5).setAlpha(0).setDepth(2500);

    // "Log" button — opens the full message history. Originally a plain
    // "[ Log ]" text label, but on Android the small text-only hit target
    // was unreliable to tap. Promoted to a proper pill (same chrome as
    // every other nav button via makeNavButton) so it has a real touch
    // target with visible padding. Anchored to the top-right above the
    // toast stack so the chrome stays grouped.
    const logBtnW = 90;
    const logBtnH = 36;
    const logBtnCx = width - 20 - logBtnW / 2;
    // Log button sits a bit higher than the toasts (with a gap above for
    // safe-area). The toast TOP itself was pushed down further so the
    // little air-gap between the button and the toast stack reads cleaner.
    const logBtnCy = 44;
    makeNavButton(this, logBtnCx, logBtnCy, logBtnW, logBtnH, "Log", S.parchHi,
      () => this.openLogHistory(),
      "16px",
    ).depth(CombatScene.TOAST_DEPTH);

    // Bottom-of-screen control band, sitting under the fanned hand.
    //   [ ACTIONS  ◆ ◆ ◆ ]            [ End Turn ]
    const bandY = height - 40;

    this.add.text(width / 2, bandY - 20, "ACTIONS", {
      fontFamily: "Lora", fontSize: "18px", color: S.dim,
    }).setOrigin(0.5).setDepth(2000);
    this.actionsPipsCenterX = width / 2;
    this.actionsPipsCenterY = bandY + 10;

    // Player deck visual (bottom-right). Clickable — opens the radial menu.
    // Built from real card-back sprites (forest-green + ☾) so the deck reads
    // as cards rather than a plain coloured rectangle, and any face-down card
    // that flies in or out of the deck visually matches its source. Two
    // offset layers behind the face give the "stacked cards" depth read.
    // When the draw pile empties, refresh() hides the stack and shows the
    // ghost outline graphic created below.
    const deckW = CombatScene.DECK_W;
    const deckH = CombatScene.DECK_H;
    const deckBackScale = deckW / CARD_W;
    const back2 = makeCardBackSprite(this, deckCx + 10, deckCy + 12, { scale: deckBackScale })
      .setAlpha(0.55).setDepth(46);
    const back1 = makeCardBackSprite(this, deckCx + 5, deckCy + 6, { scale: deckBackScale })
      .setAlpha(0.8).setDepth(48);
    this.playerDeckBackLayers = [back2, back1];
    this.playerDeckFace = makeCardBackSprite(this, deckCx, deckCy, { scale: deckBackScale })
      .setDepth(50);
    // Ghost outline shown when the draw pile is empty. A dashed-feel hollow
    // rectangle sized to the deck footprint — matches the old "dry deck"
    // affordance.
    this.playerDeckGhost = this.add.graphics().setDepth(50);
    this.playerDeckGhost.lineStyle(2, C.iron, 0.6);
    this.playerDeckGhost.strokeRoundedRect(deckCx - deckW / 2, deckCy - deckH / 2, deckW, deckH, 6);
    this.playerDeckGhost.setVisible(false);
    const deckZone = this.add.zone(deckCx, deckCy, deckW + 20, deckH + 20)
      .setInteractive({ useHandCursor: true }).setDepth(100);
    // makeCardBackSprite already bakes deckBackScale into its internal graphics,
    // so the container's own scale starts at 1 — hover/thump tweens animate
    // from there rather than from deckBackScale.
    deckZone.on("pointerover", () => {
      this.tweens.add({ targets: this.playerDeckFace, scale: 1.08, duration: 90, ease: "Cubic.Out" });
    });
    deckZone.on("pointerout", () => {
      this.tweens.add({ targets: this.playerDeckFace, scale: 1.0, duration: 90, ease: "Cubic.Out" });
    });
    deckZone.on("pointerdown", () => this.onDeckClick());

    // Enemy deck: a small card-back (scale 0.4, smaller than the 0.55
    // enemy hand cards) sitting at the same y as the hand fan baseline
    // (90) and to the LEFT of the Log button. Black field with the enemy's
    // amber silhouette stamped on it — matches the hand fan, which uses
    // the same artwork so the deal animation reads as one visual identity.
    const enemySil = this.enemy.silhouette ?? "skull";
    this.enemyDeckFace = makeEnemyCardBackSprite(this, this.enemyDeckPos.x, this.enemyDeckPos.y, enemySil, { scale: 0.4 })
      .setDepth(50);

    this.renderHeroActions();

    // Global pointerup safety net — runs AFTER any per-zone pointerup.
    // Crucially does NOT mutate gesture state (cancelHoldGesture, disarmAll)
    // because Phaser doesn't promise an order between scene-level and
    // per-object listeners; if this fired first and wiped holdStartedAt,
    // the per-zone pointerup would read 0 and refuse to play, which is
    // exactly the "release doesn't play after dragging" bug we're fixing.
    // Per-zone handlers already do gesture-state cleanup on the cases that
    // matter; this only handles the "released in dead space, no per-zone
    // handler fired" case via a deferred sweep that's safe to run twice.
    this.input.on("pointerup", () => {
      // Defer one tick so per-zone handlers have already run (and consumed
      // the gesture state into their local heldMs snapshot). Then it's
      // safe to wipe state + hide any lingering arrows. Browser-clock
      // setTimeout 0 instead of Phaser time plugin for the same stall-
      // resistance reason holdTimer uses it.
      window.setTimeout(() => {
        this.cancelHoldGesture();
        this.disarmAll();
        for (const s of this.handSprites) this.hidePlayArrow(s);
      }, 0);
    });

    // Backdrop tap zone — full screen, low depth. Catches taps that don't
    // hit any other interactive object (card zone, deck zone, pill, log,
    // etc.). In ACTIVE hand mode, that tap demotes the hand back to
    // standby. In STANDBY it's a no-op — the player has to tap on a card
    // to bring the hand up.
    {
      const { width, height } = this.scale;
      this.backdropTapZone = this.add.zone(0, 0, width, height)
        .setOrigin(0, 0)
        .setInteractive()
        .setDepth(-100);
      this.backdropTapZone.on("pointerdown", () => {
        if (this.handMode === "active" && this.state.outcome === "ongoing") {
          this.setHandMode("standby");
        }
      });
    }

    // Pile tap zone — tapping the central play pile re-opens whatever
    // sprite is currently on top (player card OR enemy action card) in a
    // simple grow + dim preview. Depth high enough to beat the hand
    // backdrop but low enough that radial menus / modals still win.
    // Starts disabled — there's no card on the pile at combat start, so
    // taps in that region should fall through to the hand backdrop. We
    // toggle the zone on/off from setPileCard / refresh as the pile state
    // changes.
    {
      const pilePos = this.pilePos;
      const pileZone = this.add.zone(pilePos.x, pilePos.y, CARD_W * 0.7, CARD_H * 0.7)
        .setDepth(900);
      pileZone.on("pointerdown", () => {
        // Belt-and-suspenders: also no-op if hand isn't in standby, so we
        // don't compete with in-hand interactions.
        if (this.handMode !== "standby") return;
        if (!this.playPileSprite) return;
        this.openPilePreview();
      });
      this.pileZone = pileZone;
    }

    this.refresh();
    this.playStartOfCombat();
  }

  /**
   * Start-of-combat showpiece. Plays before the regular deal:
   *   1. The arcane sigil — already centred on screen — starts as a near-
   *      invisible vertical line (scaleX → 0) and "spins horizontally" by
   *      animating scaleX through a full edge-to-face-to-edge cycle. Just
   *      before the spin completes, it ALSO begins rotating around its
   *      horizontal axis (scaleY animating), so the sigil flattens out from
   *      "edge-on rotated coin" into the familiar top-down disc.
   *   2. While the sigil resolves, the HUD chrome (player portrait + pills,
   *      enemy HUD, deck visual) sweeps in from the screen edges — each
   *      element is moved off-screen on its position-appropriate side, then
   *      tweened back to its create-time position.
   *   3. Once both have landed, the existing `animateOpeningDeal` flies the
   *      cards out of the decks into their fans.
   *
   * Layered timing (in ms):
   *   0–1300   sigil 3D spin
   *   900–1500 HUD sweep-in
   *   1500+    card deal (existing)
   */
  private playStartOfCombat() {
    // Input is already gated for the duration of this opening — see
    // gateSceneInput(this) at the top of create(). No listener fires until
    // animateOpeningDeal's final delayedCall calls markSceneReady.
    const { width, height } = this.scale;

    // --- 1. Classify every game object into "fixed" (bg/sigil) vs sweepable
    //        UI, AND choose a sweep direction for each sweepable based on
    //        its position in the canvas. ---
    type Sweep = "L" | "R" | "T" | "B";
    const sweepables: { obj: Phaser.GameObjects.GameObject & { x: number; y: number; alpha: number }; fx: number; fy: number; dir: Sweep }[] = [];
    // Centre-screen objects (cards in hand, combo text) aren't swept from
    // the sides — but they still need to be HIDDEN at the start so they
    // don't flash visible while the sigil spins. animateOpeningDeal sets
    // their alpha back to 1 when the deal kicks in.
    const centreHide: (Phaser.GameObjects.GameObject & { alpha: number })[] = [];
    // Hand sprites (player + enemy) are owned by animateOpeningDeal — it
    // teleports them to the deck and tweens them out into the fan. If they
    // were in the sweepables loop, the sweep would briefly drop them at
    // their final fan positions before the deal teleported them to the deck,
    // producing the "enemy hand visible before sigil ends" bug. Exclude them
    // here and hide them explicitly below.
    const handSpriteSet = new Set<Phaser.GameObjects.GameObject>([
      ...this.handSprites,
      ...this.enemyHandSprites,
    ]);
    for (const obj of this.children.list) {
      if (obj === this.bgGraphics) continue;
      if (obj === this.sigilImage) continue;
      if (obj === this.levelBg) continue;
      // Skip the animated fx flicker layer that rides on top of the level
      // backdrop. It's full-bleed and centred, which means without this
      // guard it'd end up in `centreHide` (alpha forced to 0) and never get
      // restored — the flames would disappear for the whole fight.
      if (obj.getData && obj.getData("__fxLayer")) continue;
      if (handSpriteSet.has(obj)) continue;
      // Game objects in Phaser have x/y/alpha if they're spatial. Skip the
      // ones that don't (rare, but possible for plain emitters / shaders).
      const o = obj as Phaser.GameObjects.GameObject & { x?: unknown; y?: unknown; alpha?: unknown };
      if (typeof o.x !== "number" || typeof o.y !== "number") continue;
      const spatial = obj as Phaser.GameObjects.GameObject & { x: number; y: number; alpha: number };
      const fx = spatial.x;
      const fy = spatial.y;
      // Direction: whichever edge the object is nearest to (using thirds).
      let dir: Sweep;
      if (fx < width * 0.35) dir = "L";
      else if (fx > width * 0.65) dir = "R";
      else if (fy < height * 0.35) dir = "T";
      else if (fy > height * 0.65) dir = "B";
      else { centreHide.push(spatial); continue; }
      sweepables.push({ obj: spatial, fx, fy, dir });
    }

    // --- 2. Stash sweepables off-screen and invisible; hide centre stuff
    //        in-place so cards/combo text don't blink during the sigil
    //        animation. ---
    for (const s of sweepables) {
      switch (s.dir) {
        case "L": s.obj.x = s.fx - width;  break;
        case "R": s.obj.x = s.fx + width;  break;
        case "T": s.obj.y = s.fy - height; break;
        case "B": s.obj.y = s.fy + height; break;
      }
      s.obj.alpha = 0;
    }
    for (const obj of centreHide) obj.alpha = 0;
    // Player & enemy card sprites are tracked separately from this.children
    // for various reasons; hide them too so they don't flash at their fan
    // positions before animateOpeningDeal teleports them back to the deck.
    for (const c of this.handSprites)      c.setAlpha(0);
    for (const c of this.enemyHandSprites) c.setAlpha(0);

    // --- 3. Sigil entrance: 2D pulse + brief clockwise spin, then settle.
    //        Replaces the previous 3D-rotation entrance (which felt
    //        disconnected from the rest of the scene). No more
    //        modelRotation games — we lock the plane flat (modelRotation
    //        zero) and animate the regular 2D rotation + scale instead.
    //
    //        Phase 1 (700 ms, Cubic.Out): fade in + grow from 0.6× to
    //        1.15× of rest scale while rotating one full turn clockwise.
    //        The decel ease makes it land with weight.
    //        Phase 2 (280 ms, Sine.InOut): settle from 1.15× back down to
    //        the rest scale — the disc "breathing" into its final pose.
    const sigil = this.sigilImage;
    if (sigil) {
      sigil.modelRotation.set(0, 0, 0);
      const restSx = sigil.scaleX;
      const restSy = sigil.scaleY;
      sigil.rotation = 0;
      sigil.setScale(restSx * 0.6, restSy * 0.6);
      sigil.setAlpha(0);
      this.tweens.add({
        targets: sigil,
        scaleX: restSx * 1.15,
        scaleY: restSy * 1.15,
        rotation: Math.PI * 2,   // one full clockwise turn
        alpha: 1,
        duration: 700,
        ease: "Cubic.Out",
        onComplete: () => {
          // 2π is visually 0; snap to 0 so future ops don't accumulate
          // float drift on the rotation property.
          sigil.rotation = 0;
          this.tweens.add({
            targets: sigil,
            scaleX: restSx,
            scaleY: restSy,
            duration: 280,
            ease: "Sine.InOut",
          });
        },
      });
    }

    // --- 4. HUD sweep — starts after sigil has been spinning long enough
    //        to read as "magic happens", finishes by the time the deal
    //        kicks off. Slight per-object jitter so the chrome doesn't all
    //        snap into place at the exact same frame. ---
    const SWEEP_DELAY = 900;
    const SWEEP_DURATION = 520;
    for (const s of sweepables) {
      this.tweens.add({
        targets: s.obj,
        x: s.fx,
        y: s.fy,
        alpha: 1,
        duration: SWEEP_DURATION,
        delay: SWEEP_DELAY + Math.random() * 120,
        ease: "Cubic.Out",
      });
    }

    // --- 5. Card deal. The existing animateOpeningDeal expects the hand
    //        sprites to be at their rest positions (it caches those before
    //        flinging them to the deck); we trigger it AFTER the sweep
    //        lands so cards aren't visible in their hand positions during
    //        the sigil moment. animateOpeningDeal sets alpha=1 itself, so
    //        the hand-sprites' alpha=0 from step 2 doesn't matter once the
    //        deal kicks in.
    this.time.delayedCall(SWEEP_DELAY + SWEEP_DURATION + 80, () => this.animateOpeningDeal());
  }

  private animateOpeningDeal() {
    const playerDeckX = this.playerDeckPos.x;
    const playerDeckY = this.playerDeckPos.y;
    const enemyDeckX = this.enemyDeckPos.x;
    const enemyDeckY = this.enemyDeckPos.y;

    // No interactions until the deal completes.
    this.handZones.forEach((z) => z.disableInteractive());

    // ───── STEP 1 ─────────────────────────────────────────────────────────
    // Enemy deal: every card in the enemy's hand teleports to the enemy
    // deck and tweens out to its rest position in the fan. So the hand
    // grows visibly, instead of starting "already there" with one bogus
    // card-back flicked at it.
    const enemyStaggerMs = 90;
    const enemyCardMs = 280;
    this.enemyHandSprites.forEach((sprite, i) => {
      const restX = sprite.x;
      const restY = sprite.y;
      const restRot = sprite.rotation;

      sprite.x = enemyDeckX;
      sprite.y = enemyDeckY;
      sprite.rotation = 0;
      sprite.setScale(0.3);
      // Stay invisible until THIS card's tween begins. Otherwise every
      // pre-deal card sits stacked at the deck at alpha=1 for the duration
      // of its stagger delay — visible "hovering under the deck" before the
      // fly-out. The tween bumps alpha to 1 over its first beat as part of
      // the fly-out so the card "materializes off the deck".
      sprite.setAlpha(0);

      this.tweens.add({
        targets: sprite,
        x: restX,
        y: restY,
        rotation: restRot,
        // Container scale 1.0 — NOT 0.55. The card-back's INTERNALS are
        // already pre-drawn at the 0.55 cardScale that renderEnemyHand
        // passed to makeEnemyCardBackSprite, so the container's rest scale
        // is 1. Setting this to 0.55 here baked a second factor of 0.55 on
        // top, leaving the post-deal cards at visual ~0.30 — then the next
        // refresh() (e.g. the player draws and renderEnemyHand rebuilds)
        // gave fresh sprites at container 1.0 / visual 0.55, which read as
        // the enemy hand SUDDENLY GROWING by ~1.8× on every player draw.
        scale: 1.0,
        alpha: 1,
        duration: enemyCardMs,
        delay: 60 + i * enemyStaggerMs,
        ease: "Cubic.Out",
      });
    });
    const enemyDoneMs =
      60 + Math.max(0, this.enemyHandSprites.length - 1) * enemyStaggerMs + enemyCardMs;

    // ───── STEP 2 ─────────────────────────────────────────────────────────
    // Player deal — starts a beat after the enemy finishes (160ms gap so
    // the eye registers "enemy is done, now me").
    const playerStartMs = enemyDoneMs + 160;
    const playerStaggerMs = 180;
    const playerCardMs = 360;
    this.handSprites.forEach((sprite, i) => {
      const restX = sprite.x;
      const restY = sprite.y;
      const restRot = sprite.rotation;

      sprite.x = playerDeckX;
      sprite.y = playerDeckY;
      sprite.rotation = 0;
      sprite.setScale(0.4);
      // Same fix as the enemy deal: alpha=0 until the tween's delay elapses,
      // alpha=1 during the fly-out. Without this, every card beyond the first
      // sits visibly stacked on the deck through its stagger gap before its
      // own tween starts — looks like "card N hovering on the deck for a beat".
      sprite.setAlpha(0);

      this.tweens.add({
        targets: sprite,
        x: restX,
        y: restY,
        rotation: restRot,
        scale: 1.0,
        alpha: 1,
        duration: playerCardMs,
        delay: playerStartMs + i * playerStaggerMs,
        ease: "Cubic.Out",
      });
    });

    // Re-arm hand zones once the LAST player card has landed, then tuck
    // the freshly-dealt hand into standby — the player gets a brief look
    // at their starting hand from the deal, then taps to bring it back up
    // when they're ready to play. Consistent with how the hand behaves
    // after every play / end-turn.
    const totalMs =
      playerStartMs + Math.max(0, this.handSprites.length - 1) * playerStaggerMs + playerCardMs + 50;
    this.time.delayedCall(totalMs, () => {
      this.handZones.forEach((z) => z.setInteractive({ useHandCursor: true }));
      // Deal is done — scene is now ready for player input.
      markSceneReady(this);
      // Small grace pause so the player visually registers their hand
      // before it slides away — 300 ms feels long enough to read, short
      // enough not to feel like a hang.
      this.time.delayedCall(300, () => this.setHandMode("standby"));
    });
  }

  private renderHeroActions() {
    const run = this.game.registry.get(RUN_KEY) as RunState;
    if (run.heroActions.length === 0) return;

    const x = CombatScene.PLAYER_PILL_CX;
    const y = this.portraitCenterY;
    const W = this.scaledPortraitW;
    const H = this.scaledPortraitH;

    // Small "✦ N" badge floating at the portrait's top-right corner — at-a-
    // glance count of owned hero skills. Tap the portrait to open the list.
    const bx = x + W / 2 - 14;
    const by = y - H / 2 + 14;
    const badge = this.add.container(bx, by).setDepth(70);
    const badgeBg = this.add.graphics();
    badgeBg.fillStyle(C.amber, 1).fillCircle(0, 0, 14);
    badgeBg.lineStyle(2, C.ink, 1).strokeCircle(0, 0, 14);
    const badgeText = this.add.text(0, 0, `✦ ${run.heroActions.length}`, {
      fontFamily: "Lora", fontSize: "12px", color: S.ink, fontStyle: "bold",
    }).setOrigin(0.5);
    badge.add([badgeBg, badgeText]);

    // The portrait itself is the hit target. Tap → open list.
    const zone = this.add.zone(x, y, W, H)
      .setInteractive({ useHandCursor: true })
      .setDepth(60);
    zone.on("pointerover", () => badge.setScale(1.12));
    zone.on("pointerout",  () => badge.setScale(1));
    zone.on("pointerdown", () => this.openHeroSkillsPanel());
  }

  /**
   * Open the owned-hero-skills viewer. Split into two tabs — Actives and
   * Passives — so each list stays short and readable; if a list still
   * overflows the height-capped panel it scrolls (drag within the list).
   * Active skills are tappable (fire, mark usedThisFight); passives are
   * display-only. Tapping the backdrop closes it.
   */
  private openHeroSkillsPanel() {
    if (this.statusPanel) return; // don't fight the status panel
    const run = this.game.registry.get(RUN_KEY) as RunState;
    if (run.heroActions.length === 0) return;
    if (this.heroSkillsPanel) { this.closeHeroSkillsPanel(); return; }

    const { width, height } = this.scale;
    // Backdrop persists across tab switches.
    const backdrop = this.add.zone(0, 0, width, height)
      .setOrigin(0, 0).setInteractive().setDepth(8000);
    backdrop.on("pointerdown", () => this.closeHeroSkillsPanel());
    this.heroSkillsBackdrop = backdrop;

    // Default to whichever tab actually has content (prefer Actives).
    this.heroSkillsTab = run.heroActions.some((h) => h.kind !== "passive")
      ? "active" : "passive";
    this.buildHeroSkillsBody(run);
  }

  /** Tear down the current panel body (keeps the backdrop) before a rebuild. */
  private teardownHeroSkillsBody() {
    for (const z of this.heroSkillsZones) z.destroy();
    this.heroSkillsZones = [];
    for (const b of this.heroSkillsButtons) b.zone.destroy();
    this.heroSkillsButtons = [];
    if (this.heroSkillsMaskG) { this.heroSkillsMaskG.destroy(); this.heroSkillsMaskG = null; }
    if (this.heroSkillsPanel) {
      this.tweens.killTweensOf(this.heroSkillsPanel);
      this.heroSkillsPanel.destroy();
      this.heroSkillsPanel = null;
    }
  }

  /** Build (or rebuild, on tab switch) the panel body for the current tab. */
  private buildHeroSkillsBody(run: RunState) {
    this.teardownHeroSkillsBody();

    const { width, height } = this.scale;
    const panelW = Math.min(440, width - 40);
    const headerH = 32;
    const tabH = 34;
    const footerH = 20;
    const rowVPad = 10, nameSize = 15, nameH = 20, nameDescGap = 4;
    const rightReserve = 100, tagW = 30, leftPad = 16;
    const descMaxWidth = panelW - leftPad - tagW - rightReserve;

    const actives = run.heroActions.filter((h) => h.kind !== "passive");
    const passives = run.heroActions.filter((h) => h.kind === "passive");
    const list = this.heroSkillsTab === "passive" ? passives : actives;

    // Measure each row's wrapped-description height (verbose passives wrap to
    // several lines).
    const rowHeights = list.map((ha) => {
      const probe = this.add.text(0, 0, ha.description, {
        fontFamily: "Lora", fontSize: "12px", wordWrap: { width: descMaxWidth },
      }).setVisible(false);
      const descH = probe.height;
      probe.destroy();
      return rowVPad + nameH + nameDescGap + descH + rowVPad;
    });
    const contentNeeded = Math.max(48, rowHeights.reduce((a, b) => a + b, 0));

    // Cap the panel height to the screen; overflow scrolls.
    const maxPanelH = height - 56;
    const viewportMax = maxPanelH - headerH - tabH - footerH;
    const viewportH = Math.min(contentNeeded, Math.max(60, viewportMax));
    const panelH = headerH + tabH + viewportH + footerH;
    const scrollable = contentNeeded > viewportH + 0.5;

    const portrait = this.playerHpBadge.x;
    let py = this.portraitCenterY - panelH / 2 - 30;
    py = Phaser.Math.Clamp(py, panelH / 2 + 12, height - panelH / 2 - 12);
    const px = Phaser.Math.Clamp(portrait, panelW / 2 + 12, width - panelW / 2 - 12);

    const panel = this.add.container(px, py).setDepth(8010);
    const panelBg = this.add.graphics();
    panelBg.fillStyle(C.ink, 0.97).fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
    panelBg.lineStyle(2, C.amber, 0.85).strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
    panel.add(panelBg);
    panel.add(this.add.text(0, -panelH / 2 + headerH / 2, "Hero Skills", {
      fontFamily: "Lora", fontSize: "15px", color: S.amber, fontStyle: "bold",
    }).setOrigin(0.5));

    // Tabs.
    const tabY = -panelH / 2 + headerH + tabH / 2;
    const tabW = panelW / 2 - 14;
    this.addHeroTab(panel, px, py, -panelW / 4, tabY, tabW, `✦ Actives (${actives.length})`,
      this.heroSkillsTab === "active",
      () => { this.heroSkillsTab = "active"; this.buildHeroSkillsBody(run); });
    this.addHeroTab(panel, px, py, panelW / 4, tabY, tabW, `◯ Passives (${passives.length})`,
      this.heroSkillsTab === "passive",
      () => { this.heroSkillsTab = "passive"; this.buildHeroSkillsBody(run); });

    // Scrolling content viewport.
    const vpTopLocal = -panelH / 2 + headerH + tabH;
    const maskTop = py + vpTopLocal;
    const content = this.add.container(0, vpTopLocal);
    panel.add(content);

    if (list.length === 0) {
      content.add(this.add.text(0, viewportH / 2,
        this.heroSkillsTab === "passive" ? "No passive skills yet." : "No active skills yet.", {
          fontFamily: "Lora", fontSize: "13px", color: S.dim, fontStyle: "italic",
        }).setOrigin(0.5));
    } else {
      let rowTop = 0;
      list.forEach((ha, i) => {
        if (i > 0) {
          const div = this.add.graphics();
          div.lineStyle(1, C.amber, 0.18).beginPath();
          div.moveTo(-panelW / 2 + 12, rowTop);
          div.lineTo(panelW / 2 - 12, rowTop);
          div.strokePath();
          content.add(div);
        }
        this.renderHeroSkillRow(content, panelW, rowTop, rowHeights[i], ha,
          { leftPad, tagW, descMaxWidth, rowVPad, nameSize, nameH, nameDescGap, rightReserve },
          { px, py, vpTopLocal });
        rowTop += rowHeights[i];
      });
    }

    // Clip the content to the viewport rect (world coords).
    const maskG = this.make.graphics({}, false);
    maskG.fillStyle(0xffffff).fillRect(px - panelW / 2, maskTop, panelW, viewportH);
    content.setMask(maskG.createGeometryMask());
    this.heroSkillsMaskG = maskG;

    // Keep content + scene-level "Use" zones in sync with the scroll offset,
    // and disable any button currently scrolled out of the viewport.
    const reflow = () => {
      content.y = vpTopLocal + this.heroSkillsScroll;
      for (const b of this.heroSkillsButtons) {
        const wy = py + this.heroSkillsScroll + b.base;
        b.zone.y = wy;
        const vis = wy >= maskTop + 6 && wy <= maskTop + viewportH - 6;
        if (vis) b.zone.setInteractive({ useHandCursor: true });
        else b.zone.disableInteractive();
      }
    };

    this.heroSkillsScroll = 0;
    const scrollMin = scrollable ? -(contentNeeded - viewportH) : 0;
    if (scrollable) {
      // Drag-to-scroll zone sits BELOW the panel (depth 8005) so the scene-
      // level "Use" zones (8050) and tab zones (8060) keep input priority;
      // it only catches drags on empty list area.
      const dragZone = this.add.zone(px, maskTop + viewportH / 2, panelW, viewportH)
        .setInteractive().setDepth(8005);
      this.input.setDraggable(dragZone);
      let startY = 0, startScroll = 0;
      dragZone.on("dragstart", (p: Phaser.Input.Pointer) => {
        startY = p.y; startScroll = this.heroSkillsScroll;
      });
      dragZone.on("drag", (p: Phaser.Input.Pointer) => {
        this.heroSkillsScroll = Phaser.Math.Clamp(startScroll + (p.y - startY), scrollMin, 0);
        reflow();
      });
      this.heroSkillsZones.push(dragZone);
    }

    const footer = scrollable ? "drag to scroll · tap outside to close" : "tap outside to close";
    panel.add(this.add.text(0, panelH / 2 - footerH / 2, footer, {
      fontFamily: "Lora", fontSize: "10px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5));

    reflow(); // set initial scroll-dependent button visibility

    panel.setAlpha(0).setScale(0.94);
    this.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: 160, ease: "Back.Out" });
    this.heroSkillsPanel = panel;
  }

  /** A single tab button. Visual lives in the panel; hit zone is scene-level. */
  private addHeroTab(
    panel: Phaser.GameObjects.Container,
    worldX: number, worldY: number, lx: number, ly: number, w: number,
    label: string, active: boolean, onClick: () => void,
  ) {
    const h = 26, r = 6;
    const g = this.add.graphics();
    g.fillStyle(active ? C.amber : C.bgSoft, active ? 0.92 : 1)
      .fillRoundedRect(lx - w / 2, ly - h / 2, w, h, r);
    g.lineStyle(2, C.amber, active ? 1 : 0.35)
      .strokeRoundedRect(lx - w / 2, ly - h / 2, w, h, r);
    panel.add(g);
    panel.add(this.add.text(lx, ly, label, {
      fontFamily: "Lora", fontSize: "12px",
      color: active ? S.ink : S.dim, fontStyle: "bold",
    }).setOrigin(0.5));
    if (!active) {
      const z = this.add.zone(worldX + lx, worldY + ly, w, h)
        .setInteractive({ useHandCursor: true }).setDepth(8060);
      z.on("pointerdown", onClick);
      this.heroSkillsZones.push(z);
    }
  }

  private renderHeroSkillRow(
    content: Phaser.GameObjects.Container,
    panelW: number, rowTop: number, rowH: number,
    ha: HeroAction,
    lay: { leftPad: number; tagW: number; descMaxWidth: number;
           rowVPad: number; nameSize: number; nameH: number;
           nameDescGap: number; rightReserve: number },
    vp: { px: number; py: number; vpTopLocal: number },
  ) {
    const isPassive = ha.kind === "passive";
    const isUsed = ha.usedThisFight;
    const stripeColor = isPassive ? C.ghost : C.amber;

    // Top-anchored layout — name flush with row top, description directly
    // below. Coords are local to the scrolling `content` container.
    const tagX = -panelW / 2 + lay.leftPad;
    const nameX = tagX + lay.tagW;
    const nameY = rowTop + lay.rowVPad;
    const descY = nameY + lay.nameH + lay.nameDescGap;

    const tag = this.add.text(tagX, nameY, isPassive ? "◯" : "✦", {
      fontFamily: "Lora", fontSize: "18px",
      color: isUsed ? S.dim : (isPassive ? S.ghost : S.amber),
      fontStyle: "bold",
    }).setOrigin(0, 0);
    content.add(tag);

    const name = this.add.text(nameX, nameY, ha.name, {
      fontFamily: "Lora", fontSize: `${lay.nameSize}px`,
      color: isUsed ? S.dim : S.parchHi, fontStyle: "bold",
    }).setOrigin(0, 0);
    const desc = this.add.text(nameX, descY, ha.description, {
      fontFamily: "Lora", fontSize: "12px",
      color: isUsed ? S.dim : S.cream,
      wordWrap: { width: lay.descMaxWidth },
    }).setOrigin(0, 0);
    content.add([name, desc]);

    // Right-edge action — vertically centred in the row.
    const rightX = panelW / 2 - lay.rightReserve / 2;
    const rightY = rowTop + rowH / 2;
    if (isPassive) {
      const label = this.add.text(rightX, rightY, "auto", {
        fontFamily: "Lora", fontSize: "12px", color: S.ghost, fontStyle: "italic",
      }).setOrigin(0.5);
      content.add(label);
      if (ha.oncePerFight && isUsed) {
        content.add(this.add.text(rightX, rightY + 14, "fired", {
          fontFamily: "Lora", fontSize: "10px", color: S.dim, fontStyle: "italic",
        }).setOrigin(0.5));
      }
    } else {
      // Active skill — visual button (scrolls with content)…
      const btnW = 80, btnH = 36;
      const btnBg = this.add.graphics();
      btnBg.fillStyle(isUsed ? C.iron : C.purple, 1)
        .fillRoundedRect(rightX - btnW / 2, rightY - btnH / 2, btnW, btnH, 6);
      btnBg.lineStyle(2, isUsed ? C.ironHi : stripeColor, 0.9)
        .strokeRoundedRect(rightX - btnW / 2, rightY - btnH / 2, btnW, btnH, 6);
      const btnText = this.add.text(rightX, rightY, isUsed ? "spent" : "Use", {
        fontFamily: "Lora", fontSize: "13px",
        color: isUsed ? S.dim : S.parchHi, fontStyle: "bold",
      }).setOrigin(0.5);
      content.add([btnBg, btnText]);
      if (!isUsed) {
        // …with a scene-level hit zone (kept above the scroll drag-zone) that
        // `reflow()` repositions/disables as the content scrolls. Fires on
        // pointerup with a small distance gate so a scroll-drag never triggers.
        const zone = this.add.zone(vp.px + rightX, vp.py + vp.vpTopLocal + rightY, btnW, btnH)
          .setInteractive({ useHandCursor: true })
          .setDepth(8050);
        zone.on("pointerup", (p: Phaser.Input.Pointer) => {
          if (p.getDistance() > 10) return;
          if (ha.usedThisFight || this.state.outcome !== "ongoing") return;
          const run = this.game.registry.get(RUN_KEY) as RunState;
          ha.usedThisFight = true;
          applyHeroEffect(this.state, ha.effect, run);
          this.closeHeroSkillsPanel();
          this.refresh();
        });
        this.heroSkillsButtons.push({ zone, base: vp.vpTopLocal + rightY });
      }
    }
  }

  private closeHeroSkillsPanel() {
    const panel = this.heroSkillsPanel;
    const backdrop = this.heroSkillsBackdrop;
    this.heroSkillsPanel = null;
    this.heroSkillsBackdrop = null;
    // Drop tab/drag zones, scene-level "Use" zones, and the clip mask.
    for (const z of this.heroSkillsZones) z.destroy();
    this.heroSkillsZones = [];
    for (const b of this.heroSkillsButtons) b.zone.destroy();
    this.heroSkillsButtons = [];
    if (this.heroSkillsMaskG) { this.heroSkillsMaskG.destroy(); this.heroSkillsMaskG = null; }
    if (backdrop) {
      backdrop.disableInteractive();
      backdrop.destroy();
    }
    if (panel) {
      this.tweens.killTweensOf(panel);
      this.tweens.add({
        targets: panel, alpha: 0, scale: 0.94,
        duration: 110, ease: "Cubic.In",
        onComplete: () => panel.destroy(),
      });
    }
  }

  // Radial menu: clicking the deck opens this. Two options pop out in an arc
  // around the deck — Draw (1 ◆) and End Turn — and tween back in on close.
  private openRadialMenu() {
    if (this.radialOpen) return;
    this.radialOpen = true;
    const { width, height } = this.scale;
    const deckX = this.playerDeckPos.x;
    const deckY = this.playerDeckPos.y;

    // Backdrop catches clicks outside the menu = close.
    this.radialBackdrop = this.add.zone(0, 0, width, height)
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(5500);
    this.radialBackdrop.on("pointerdown", () => this.closeRadialMenu());

    const totalActions = this.state.playsRemainingThisTurn + this.state.bonusActions;
    const canDraw = totalActions > 0 &&
      (this.state.drawPile.length > 0 || this.state.discardPile.length > 0);

    // Options arc out up-and-to-the-left of the deck. Offsets bumped to
    // account for the 1.5× button size (was 140×52, now 210×78).
    const opts: Array<{ dx: number; dy: number; label: string; sub: string; enabled: boolean; onClick: () => void }> = [
      {
        dx: -110, dy: -160, label: "Draw",     sub: "1 ◆",
        enabled: canDraw, onClick: () => this.doDraw(),
      },
      {
        dx: -230, dy: -60, label: "End Turn", sub: "",
        enabled: this.state.outcome === "ongoing", onClick: () => this.onEndTurn(),
      },
    ];

    this.radialButtons = opts.map((opt, i) => {
      const targetX = deckX + opt.dx;
      const targetY = deckY + opt.dy;
      const c = this.add.container(deckX, deckY).setDepth(6000);

      const fill = opt.enabled ? C.purple : C.iron;
      const stroke = opt.enabled ? C.amber : C.ironHi;
      const bg = this.add.rectangle(0, 0, 210, 78, fill).setStrokeStyle(3, stroke);
      const lbl = this.add.text(0, opt.sub ? -12 : 0, opt.label, {
        fontFamily: "Lora", fontSize: "24px",
        color: opt.enabled ? S.parchHi : S.dim, fontStyle: "bold",
      }).setOrigin(0.5);
      c.add([bg, lbl]);
      if (opt.sub) {
        const sub = this.add.text(0, 17, opt.sub, {
          fontFamily: "Lora", fontSize: "17px",
          color: opt.enabled ? S.amber : S.dim,
        }).setOrigin(0.5);
        c.add(sub);
      }
      c.setSize(210, 78);
      c.setScale(0.3);
      c.setAlpha(0);

      // External zone at the TARGET position. Container animates in but the
      // hit area stays put — no tween-vs-input race. Zone is wired only after
      // the button has finished arriving so a fast click can't trigger a
      // not-yet-visible button.
      const zone = this.add.zone(targetX, targetY, 225, 90).setDepth(6500);
      c.setData("zone", zone);

      if (opt.enabled) {
        zone.on("pointerover", () => bg.setFillStyle(C.bloodHi));
        zone.on("pointerout",  () => bg.setFillStyle(fill));
        zone.on("pointerdown", () => {
          this.closeRadialMenu();
          opt.onClick();
        });
      }

      // Pulse the End Turn button when it's the only viable option — same
      // visual language as the deck pulse on the map for "click this".
      const shouldPulse = opt.enabled && opt.label === "End Turn" && !canDraw;

      this.tweens.add({
        targets: c,
        x: targetX, y: targetY,
        scale: 1, alpha: 1,
        duration: 220,
        ease: "Back.Out",
        delay: i * 50,
        onComplete: () => {
          if (opt.enabled) zone.setInteractive({ useHandCursor: true });
          if (shouldPulse) {
            this.tweens.add({
              targets: c,
              scale: 1.08,
              yoyo: true,
              repeat: -1,
              duration: 700,
              ease: "Sine.InOut",
            });
          }
        },
      });

      return c;
    });
  }

  private closeRadialMenu() {
    if (!this.radialOpen) return;
    this.radialOpen = false;
    const deckX = this.playerDeckPos.x;
    const deckY = this.playerDeckPos.y;

    this.radialBackdrop?.destroy();
    this.radialBackdrop = null;

    this.radialButtons.forEach((btn) => {
      this.tweens.killTweensOf(btn);
      const z = btn.getData("zone") as Phaser.GameObjects.Zone | undefined;
      z?.destroy();
      this.tweens.add({
        targets: btn,
        x: deckX, y: deckY,
        scale: 0.3, alpha: 0,
        duration: 140,
        ease: "Cubic.In",
        onComplete: () => btn.destroy(),
      });
    });
    this.radialButtons = [];
  }

  /**
   * Auto-pop the End Turn button out of the deck. Same look/animation as the
   * radial's End Turn entry, but lives independently so it can persist while
   * the radial isn't open. Driven from refresh() when actions hit zero.
   */
  private openAutoEndTurn() {
    if (this.autoEndTurnOpen) return;
    this.autoEndTurnOpen = true;

    const deckX = this.playerDeckPos.x;
    const deckY = this.playerDeckPos.y;
    const targetX = deckX - 230;
    const targetY = deckY - 60;

    const c = this.add.container(deckX, deckY).setDepth(6000);
    const bg = this.add.rectangle(0, 0, 210, 78, C.purple).setStrokeStyle(3, C.amber);
    const lbl = this.add.text(0, 0, "End Turn", {
      fontFamily: "Lora", fontSize: "24px",
      color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5);
    c.add([bg, lbl]);
    c.setSize(210, 78);
    c.setScale(0.3);
    c.setAlpha(0);

    const zone = this.add.zone(targetX, targetY, 225, 90).setDepth(6500);
    zone.on("pointerover", () => bg.setFillStyle(C.bloodHi));
    zone.on("pointerout",  () => bg.setFillStyle(C.purple));
    zone.on("pointerdown", () => {
      this.closeAutoEndTurn();
      this.onEndTurn();
    });

    this.autoEndTurnButton = c;
    this.autoEndTurnZone = zone;

    this.tweens.add({
      targets: c,
      x: targetX, y: targetY, scale: 1, alpha: 1,
      duration: 220, ease: "Back.Out",
      onComplete: () => {
        zone.setInteractive({ useHandCursor: true });
        // Halo pulse — same breathing amber outline that used to live on
        // the deck, now framing the button that's actually actionable.
        const halo = this.add.rectangle(targetX, targetY, 222, 92, 0xffffff, 0)
          .setStrokeStyle(3, C.amberHi).setDepth(5990);
        this.autoEndTurnHalo = halo;
        this.autoEndTurnHaloTween = this.tweens.add({
          targets: halo,
          scale: { from: 1.0, to: 1.18 },
          alpha:  { from: 0.85, to: 0.18 },
          yoyo: true, repeat: -1,
          duration: 850, ease: "Sine.InOut",
        });
      },
    });
  }

  private closeAutoEndTurn() {
    if (!this.autoEndTurnOpen) return;
    this.autoEndTurnOpen = false;
    const deckX = this.playerDeckPos.x;
    const deckY = this.playerDeckPos.y;

    const c = this.autoEndTurnButton;
    const z = this.autoEndTurnZone;
    if (this.autoEndTurnHaloTween) { this.autoEndTurnHaloTween.stop(); this.autoEndTurnHaloTween = null; }
    if (this.autoEndTurnHalo) { this.autoEndTurnHalo.destroy(); this.autoEndTurnHalo = null; }
    if (z) z.destroy();
    this.autoEndTurnButton = null;
    this.autoEndTurnZone = null;
    if (!c) return;

    this.tweens.killTweensOf(c);
    this.tweens.add({
      targets: c,
      x: deckX, y: deckY, scale: 0.3, alpha: 0,
      duration: 140, ease: "Cubic.In",
      onComplete: () => c.destroy(),
    });
  }

  /**
   * Pulse the deck — used only when the player has actions but nothing in
   * hand to play, signalling "click here to Draw". Mirrors the End Turn
   * halo's look so the two pulses feel like the same UI language.
   */
  private startDeckPulse() {
    if (this.deckHalo) return;
    this.deckHalo = this.add.rectangle(this.playerDeckPos.x, this.playerDeckPos.y, 120, 160, 0xffffff, 0)
      .setStrokeStyle(3, C.amberHi).setDepth(45);
    this.deckHaloTween = this.tweens.add({
      targets: this.deckHalo,
      scale: { from: 1.0, to: 1.22 },
      alpha:  { from: 0.85, to: 0.18 },
      yoyo: true, repeat: -1,
      duration: 850, ease: "Sine.InOut",
    });
  }

  private stopDeckPulse() {
    if (this.deckHaloTween) { this.deckHaloTween.stop(); this.deckHaloTween = null; }
    if (this.deckHalo) { this.deckHalo.destroy(); this.deckHalo = null; }
  }

  /**
   * Quick scale + brightness pulse on an HP readout — fires when the side
   * takes damage so the eye catches the hit landing. Cheap tween, yoyo back
   * to rest. Killing existing tweens first so rapid hits don't pile up.
   */
  private pulseHpText(text: Phaser.GameObjects.Text) {
    this.tweens.killTweensOf(text);
    text.setScale(1);
    text.setColor(S.bloodHi);
    this.tweens.add({
      targets: text,
      scale: 1.35,
      duration: 110,
      ease: "Cubic.Out",
      yoyo: true,
      onComplete: () => {
        text.setScale(1);
        text.setColor(S.blood);
      },
    });
  }

  /**
   * Camera rumble on a hit landing. Tiny scales (0.003–0.012 of camera size)
   * keep it tactile rather than nauseating; bigger hits shake longer + harder.
   */
  private rumble(damage: number) {
    const intensity = Math.min(0.012, 0.003 + damage * 0.0008);
    const duration = Math.min(220, 90 + damage * 8);
    this.cameras.main.shake(duration, intensity);
  }

  /**
   * Shield change feedback — bright ghost-cyan flash on the shield text, plus
   * an expanding ring at the side's anchor. "gained" gets a bigger pop than
   * "absorbed" so the two feel different at a glance.
   */
  private flashShield(
    badge: Phaser.GameObjects.Container,
    ringX: number,
    ringY: number,
    kind: "gained" | "absorbed",
  ) {
    this.tweens.killTweensOf(badge);
    badge.setScale(1);
    badge.setAlpha(1);
    const icon = badge.getData("icon") as Phaser.GameObjects.Text | undefined;
    icon?.setColor("#a8e1f3");
    this.tweens.add({
      targets: badge,
      scale: kind === "gained" ? 1.25 : 1.15,
      duration: kind === "gained" ? 150 : 90,
      ease: "Cubic.Out",
      yoyo: true,
      onComplete: () => {
        badge.setScale(1);
        icon?.setColor(S.ghost);
      },
    });

    const ring = this.add.circle(ringX, ringY, 22, 0, 0)
      .setStrokeStyle(3, 0x6db7d6, 1)
      .setDepth(40);
    this.tweens.add({
      targets: ring,
      scale: kind === "gained" ? 2.6 : 2.0,
      alpha: 0,
      duration: kind === "gained" ? 420 : 280,
      ease: "Cubic.Out",
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Sync a shield badge to the current value: writes the number, toggles
   * visibility (hidden when shield is 0), and runs flashShield on changes.
   * The visible-before-flash dance ensures a 0→N gain animates from the
   * arriving badge and an N→0 absorb shows the flash before vanishing.
   */
  private updateShieldBadge(
    badge: Phaser.GameObjects.Container,
    num: Phaser.GameObjects.Text,
    value: number,
    last: number,
    ringX: number,
    ringY: number,
  ) {
    num.setText(`${value}`);
    if (last < 0) {
      const wasVisible = badge.visible;
      badge.setVisible(value > 0);
      if (badge.visible !== wasVisible) this.relayoutHud();
      return;
    }
    if (value === last) return;
    const kind = value > last ? "gained" : "absorbed";
    const wasVisible = badge.visible;
    badge.setVisible(true);
    if (badge.visible !== wasVisible) this.relayoutHud();
    this.flashShield(badge, ringX, ringY, kind);
    if (value === 0) {
      this.time.delayedCall(220, () => {
        badge.setVisible(false);
        this.relayoutHud();
      });
    }
  }

  /**
   * Re-run the column layout for both HUDs. Called from `create()` and any
   * code path that toggles an optional pill's visibility (shield gained /
   * dropped, empowered changed). Centralising the layout here means callers
   * never have to know the y of any individual pill.
   */
  private relayoutHud() {
    const { width, height } = this.scale;
    const ex = width / 2;
    const hpH = CombatScene.HP_PILL_H;
    const subH = CombatScene.SUB_PILL_H;
    const GAP = 8;

    vstack(
      [
        { item: this.enemyIntentText!, height: 26, hidden: !this.enemyIntentText },
        { item: this.enemyNameText,    height: 34 },
        { item: this.enemyHpBadge,     height: hpH },
        { item: this.enemyShieldBadge, height: subH, hidden: !this.enemyShieldBadge.visible },
      ],
      { centerX: ex, anchorY: 18, gap: GAP, align: "top" },
    );

    const placed = vstack(
      [
        { item: this.playerEmpoweredBadge, height: subH, hidden: !this.playerEmpoweredBadge.visible },
        { item: this.playerPortrait,       height: CombatScene.PORTRAIT_H },
        { item: this.playerHpBadge,        height: hpH },
        { item: this.playerShieldBadge,    height: subH, hidden: !this.playerShieldBadge.visible },
      ],
      { centerX: CombatScene.PLAYER_PILL_CX, anchorY: height - 14, gap: GAP, align: "bottom" },
    );
    this.portraitCenterY = placed[1] ?? this.portraitCenterY;
  }

  /**
   * Build an HP badge — an ink rounded rectangle with a red ✚ cross and an
   * HP number. Stashes the number text on the right field (enemy or player)
   * so refresh() can update it.
   */
  // Pill dimensions bumped ~1.7× so they read clearly on a phone screen.
  // PILL_W also drives the player's left-edge column (portrait + pills line up).
  private static readonly PILL_W = 200;
  private static readonly HP_PILL_H = 50;
  private static readonly SUB_PILL_H = 36;
  // Portrait is now LANDSCAPE — same width as the pill column underneath,
  // ~100 tall. Sits flush above the HP pill so the whole left edge reads
  // as a single column: empowered → portrait → HP → shield → status.
  private static readonly PORTRAIT_W = 200;
  private static readonly PORTRAIT_H = 100;
  private static readonly PORTRAIT_X = 30; // left inset (safe-area)
  // Player pill column x — centered on the portrait so they line up.
  private static readonly PLAYER_PILL_CX = CombatScene.PORTRAIT_X + CombatScene.PORTRAIT_W / 2;
  // Deck visual dimensions (player + enemy decks both use these).
  private static readonly DECK_W = 100;
  private static readonly DECK_H = 140;

  private makeHpBadge(isPlayer = false): Phaser.GameObjects.Container {
    const w = CombatScene.PILL_W;
    const h = CombatScene.HP_PILL_H;
    const container = this.add.container(0, 0);
    const bg = this.add.graphics();
    bg.fillStyle(C.ink, 0.92);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(3, C.blood, 0.9);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    container.add(bg);

    // Status ring — drawn behind the cross so the cross "sits inside" the
    // pulsing outline. Cleared/redrawn from refreshStatusIndicator whenever
    // the active-status set changes (colour shifts with positive/negative
    // dominance; hidden entirely when nothing's active).
    const crossX = -w / 2 + 26;
    const ring = this.add.graphics();
    ring.setVisible(false);
    container.add(ring);

    const cross = this.add.text(crossX, 0, "✚", {
      fontFamily: "Lora", fontSize: "30px", color: S.blood, fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(cross);

    // Count badge — small circle at the cross's top-right. Shows N for N
    // active statuses. Hidden when none. Positioned in container-local
    // coords so vstack layout doesn't desync it from the cross.
    const badge = this.add.container(crossX + 14, -14);
    const badgeBg = this.add.graphics();
    badgeBg.fillStyle(C.amber, 1).fillCircle(0, 0, 9);
    badgeBg.lineStyle(2, C.ink, 1).strokeCircle(0, 0, 9);
    const badgeText = this.add.text(0, 0, "", {
      fontFamily: "Lora", fontSize: "13px", color: S.ink, fontStyle: "bold",
    }).setOrigin(0.5);
    badge.add([badgeBg, badgeText]);
    badge.setVisible(false);
    container.add(badge);

    // Number sits right of centre, leaving cross room on the left edge.
    const num = this.add.text(24, 0, "", {
      fontFamily: "Lora", fontSize: "26px", color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(num);

    // Whole pill is the tap target — opens the per-actor status panel.
    // Container needs an explicit size + interactive hit area for Phaser's
    // input system to recognise pointer events on it. useHandCursor lets
    // the desktop pointer signal "tappable" anywhere over the pill, not
    // just over the cross — the cross is the visual cue, the whole pill is
    // the affordance.
    container.setSize(w, h);
    container.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    container.on("pointerdown", () => this.openStatusPanel(isPlayer));

    if (isPlayer) {
      this.playerHpNumber = num;
      this.playerHpBadge = container;
      this.playerHpCross = cross;
      this.playerStatusRing = ring;
      this.playerStatusBadge = badge;
      this.playerStatusBadgeText = badgeText;
    } else {
      this.enemyHpNumber = num;
      this.enemyHpBadge = container;
      this.enemyHpCross = cross;
      this.enemyStatusRing = ring;
      this.enemyStatusBadge = badge;
      this.enemyStatusBadgeText = badgeText;
    }
    return container;
  }

  /**
   * Sync the HP-cross status indicator (ring + count badge) for one side to
   * the actor's current StatusEffects. Called from refresh() after combat
   * state mutates.
   *
   * Three behaviours:
   *  - Active statuses → draw a coloured ring around the cross and a count
   *    badge at the top-right. Ring colour follows statusRingColor (negative
   *    statuses dominate; otherwise the first positive).
   *  - No active statuses → hide both ring and badge.
   *  - Any status value rose since last refresh → pop the cross (scale-out
   *    + amber flash + a brief ring scale-pulse) so the player notices the
   *    new effect taking hold.
   *
   * The pop is purely visual; engine state changes already happened by the
   * time refresh() runs. lastPlayerStatuses/lastEnemyStatuses snapshots gate
   * the diff so unchanged refreshes don't re-pop.
   */
  private refreshStatusIndicator(isPlayer: boolean) {
    const status = isPlayer ? this.state.player.status : this.state.enemy.status;
    const ring = isPlayer ? this.playerStatusRing : this.enemyStatusRing;
    const badge = isPlayer ? this.playerStatusBadge : this.enemyStatusBadge;
    const badgeText = isPlayer ? this.playerStatusBadgeText : this.enemyStatusBadgeText;
    const cross = isPlayer ? this.playerHpCross : this.enemyHpCross;
    const lastSnap = isPlayer ? this.lastPlayerStatuses : this.lastEnemyStatuses;
    const ringTweenKey = isPlayer ? "playerStatusRingTween" : "enemyStatusRingTween";

    const active = activeStatuses(status);
    const ringColor = statusRingColor(status);
    const crossX = -CombatScene.PILL_W / 2 + 26;

    // Did any value rise since last refresh? (Including 0 → N "took hold".)
    let anyRose = false;
    if (lastSnap) {
      for (const k of Object.keys(status) as (keyof StatusEffects)[]) {
        if (status[k] > lastSnap[k]) { anyRose = true; break; }
      }
    }

    if (ringColor !== null && active.length > 0) {
      ring.clear();
      ring.lineStyle(2, ringColor, 1);
      ring.strokeCircle(crossX, 0, 22);
      ring.setVisible(true);

      // Pulse loop — same breathing cadence as the End Turn halo / deck
      // pulse so the visual language stays consistent. Killed and rebuilt
      // only when the active state TRANSITIONS so colour swaps don't
      // re-trigger the pulse from scratch each refresh.
      const existingTween = this[ringTweenKey];
      if (!existingTween || !existingTween.isPlaying()) {
        ring.setAlpha(1);
        ring.setScale(1);
        this[ringTweenKey] = this.tweens.add({
          targets: ring,
          alpha: { from: 0.95, to: 0.35 },
          duration: 950,
          yoyo: true,
          repeat: -1,
          ease: "Sine.InOut",
        });
      }

      badge.setVisible(true);
      badgeText.setText(`${active.length}`);
      // Badge tint matches ring colour so multi-status reads as a single
      // coherent indicator rather than a mismatched chip.
      const bg = badge.list[0] as Phaser.GameObjects.Graphics;
      bg.clear();
      bg.fillStyle(ringColor, 1).fillCircle(0, 0, 9);
      bg.lineStyle(2, C.ink, 1).strokeCircle(0, 0, 9);
    } else {
      ring.setVisible(false);
      badge.setVisible(false);
      const existingTween = this[ringTweenKey];
      if (existingTween) {
        existingTween.stop();
        this[ringTweenKey] = null;
      }
    }

    // "Took hold" pop — runs after the visibility update above so the ring
    // and badge are in place when the pop reveals them. Beefier than a
    // plain scale tween: the cross flashes amber and scales out further,
    // and the ring "lands" with an outward expand. Without all three
    // beats it was too easy to miss the first burn/freeze of the fight
    // (the reported "first burn didn't update the cross" bug).
    if (anyRose) {
      this.tweens.killTweensOf(cross);
      cross.setScale(1);
      cross.setColor(S.amber);
      this.tweens.add({
        targets: cross,
        scale: 1.55,
        duration: 180,
        yoyo: true,
        ease: "Cubic.Out",
        onComplete: () => {
          cross.setScale(1);
          cross.setColor(S.blood);
        },
      });
      if (ring.visible) {
        // Outward expand from the cross — reads as "the new effect snaps
        // into place around the cross." The breathing pulse resumes from
        // onComplete so the ring doesn't sit frozen at scale 1 afterward.
        this.tweens.add({
          targets: ring,
          scale: { from: 0.5, to: 1 },
          alpha: { from: 0, to: 1 },
          duration: 240,
          ease: "Back.Out",
          onComplete: () => {
            ring.setScale(1);
            if (active.length > 0 && (!this[ringTweenKey] || !this[ringTweenKey]!.isPlaying())) {
              this[ringTweenKey] = this.tweens.add({
                targets: ring,
                alpha: { from: 0.95, to: 0.35 },
                duration: 950,
                yoyo: true,
                repeat: -1,
                ease: "Sine.InOut",
              });
            }
          },
        });
      }
    }

    // Update the snapshot for next refresh's diff.
    const snap: StatusEffects = { ...status };
    if (isPlayer) this.lastPlayerStatuses = snap;
    else this.lastEnemyStatuses = snap;
  }

  /**
   * "Status fired" feedback — runs for each entry the engine pushed into
   * state.statusTriggers (burn ticked, regen healed, reflect returned
   * damage, etc.). Distinct from the "took hold" pop in refreshStatusIndicator:
   *   - took-hold: the value WENT UP (just applied / stacked)
   *   - trigger:   the engine ACTIVELY USED the effect this beat
   *
   * Visual beats:
   *   1. cross color flashes to the status's color, scale-pumps to 1.4
   *   2. a small status glyph (the per-status icon) rises from the cross
   *      position and fades — a one-shot "this just fired" sigil
   *   3. ring briefly brightens
   *
   * Stagger multiple triggers on the same side so a turn with both burn
   * and stun reads as two distinct beats rather than one muddied flash.
   */
  private playStatusTrigger(isPlayer: boolean, key: keyof StatusEffects, delay: number) {
    const info = STATUS_INFO[key];
    if (!info) return;
    const cross = isPlayer ? this.playerHpCross : this.enemyHpCross;
    const ring = isPlayer ? this.playerStatusRing : this.enemyStatusRing;
    const badge = isPlayer ? this.playerHpBadge : this.enemyHpBadge;
    // Rising glyph is added at SCENE root (not the pill container) so it's
    // free to leave the pill's bounds without being clipped by the badge's
    // depth ordering.
    const startX = badge.x + (-CombatScene.PILL_W / 2 + 26);
    const startY = badge.y;

    this.time.delayedCall(delay, () => {
      // Cross flash.
      this.tweens.killTweensOf(cross);
      cross.setScale(1);
      cross.setColor(info.textColor);
      this.tweens.add({
        targets: cross,
        scale: 1.4,
        duration: 140,
        yoyo: true,
        ease: "Cubic.Out",
        onComplete: () => {
          cross.setScale(1);
          cross.setColor(S.blood);
        },
      });
      // Ring brighten.
      if (ring.visible) {
        this.tweens.killTweensOf(ring);
        ring.setScale(1);
        ring.setAlpha(1);
        this.tweens.add({
          targets: ring,
          scale: { from: 1, to: 1.35 },
          alpha: { from: 1, to: 0.4 },
          duration: 280,
          ease: "Cubic.Out",
          onComplete: () => {
            ring.setScale(1);
            // Resume the breathing pulse so the ring doesn't sit at half-alpha.
            const ringTweenKey = isPlayer ? "playerStatusRingTween" : "enemyStatusRingTween";
            const existing = this[ringTweenKey];
            if (existing) { existing.stop(); }
            this[ringTweenKey] = this.tweens.add({
              targets: ring,
              alpha: { from: 0.95, to: 0.35 },
              duration: 950,
              yoyo: true,
              repeat: -1,
              ease: "Sine.InOut",
            });
          },
        });
      }
      // Rising sigil — the status's icon glyph floats up from the cross
      // and fades. A small particle-style cue for "this effect just
      // happened" that's visible even when the cross flash is missed.
      const sigil = this.add.text(startX, startY, info.icon, {
        fontFamily: "Lora", fontSize: "28px", color: info.textColor, fontStyle: "bold",
        stroke: "#0b0a16", strokeThickness: 3,
      }).setOrigin(0.5).setDepth(7000);
      this.tweens.add({
        targets: sigil,
        y: startY - 48,
        scale: { from: 0.8, to: 1.4 },
        alpha: { from: 1, to: 0 },
        duration: 620,
        ease: "Cubic.Out",
        onComplete: () => sigil.destroy(),
      });
    });
  }

  /**
   * Drain state.statusTriggers — one playStatusTrigger per entry, staggered
   * so multiple fires in one turn read as a sequence. Called from refresh()
   * after refreshStatusIndicator (so the snapshot is up to date and the
   * ring is visible at the right colour before triggers play on it).
   */
  private drainStatusTriggers() {
    const triggers = this.state.statusTriggers;
    if (!triggers || triggers.length === 0) return;
    // 110ms gap between triggers — long enough for the first cross flash
    // to register before the next, short enough not to feel like a queue.
    const STAGGER = 110;
    triggers.forEach((t, i) => {
      this.playStatusTrigger(t.actor === "player", t.key, i * STAGGER);
    });
    this.state.statusTriggers = [];
  }

  /**
   * Open a small panel listing every active status on one actor, anchored
   * to that actor's HP pill. Tapping the dim backdrop closes it. Re-tapping
   * the same pill while a panel is open closes it (toggle). Re-tapping the
   * OTHER side's pill swaps to that actor's panel.
   *
   * Shows a friendly "No active effects" empty state — matches the user's
   * spec ("shows any effects or none if no effects are active").
   */
  private openStatusPanel(isPlayer: boolean) {
    // Toggle: tapping the same actor while the panel is open closes it.
    const alreadyOpenForThisActor = this.statusPanel?.getData("isPlayer") === isPlayer;
    this.closeStatusPanel();
    if (alreadyOpenForThisActor) return;

    const status = isPlayer ? this.state.player.status : this.state.enemy.status;
    const actorName = isPlayer ? this.state.player.name : this.state.enemy.name;
    const active = activeStatuses(status);
    const badge = isPlayer ? this.playerHpBadge : this.enemyHpBadge;
    const { width, height } = this.scale;

    // Backdrop catches clicks outside the panel = close. Sits below the
    // panel but above all gameplay chrome.
    const backdrop = this.add.zone(0, 0, width, height)
      .setOrigin(0, 0).setInteractive().setDepth(8000);
    backdrop.on("pointerdown", () => this.closeStatusPanel());
    this.statusPanelBackdrop = backdrop;

    // Panel sized to its contents — header + N rows + footer. Width fits the
    // smartphone canvas (533 tall, ~853 wide); rows wrap their descriptions
    // so verbose ones still read.
    const panelW = 360;
    const headerH = 36;
    const rowH = active.length > 0 ? 56 : 30;
    const footerH = 14;
    const panelH = headerH + rowH * Math.max(active.length, 1) + footerH;

    // Anchor near the tapped pill but always fully on-screen. Bias above the
    // pill for the player (HP pill sits at bottom of canvas → panel rises
    // up), below the pill for the enemy (HP pill sits at top → panel drops
    // down).
    let py: number;
    if (isPlayer) py = badge.y - panelH / 2 - 60;
    else py = badge.y + panelH / 2 + 60;
    py = Phaser.Math.Clamp(py, panelH / 2 + 12, height - panelH / 2 - 12);
    const px = Phaser.Math.Clamp(badge.x, panelW / 2 + 12, width - panelW / 2 - 12);

    const panel = this.add.container(px, py).setDepth(8010);
    const panelBg = this.add.graphics();
    panelBg.fillStyle(C.ink, 0.97).fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
    panelBg.lineStyle(2, C.amber, 0.85).strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 10);
    panel.add(panelBg);

    const title = this.add.text(0, -panelH / 2 + headerH / 2, `${actorName} — Effects`, {
      fontFamily: "Lora", fontSize: "16px", color: S.amber, fontStyle: "bold",
    }).setOrigin(0.5);
    panel.add(title);

    if (active.length === 0) {
      const empty = this.add.text(0, -panelH / 2 + headerH + rowH / 2, "No active effects.", {
        fontFamily: "Lora", fontSize: "16px", color: S.dim, fontStyle: "italic",
      }).setOrigin(0.5);
      panel.add(empty);
    } else {
      const rowTop = -panelH / 2 + headerH;
      const value = status as unknown as Record<string, number>;
      active.forEach((info, i) => {
        const rowY = rowTop + i * rowH + rowH / 2;
        // Row divider — thin amber line under each row except the last.
        if (i > 0) {
          const div = this.add.graphics();
          div.lineStyle(1, C.amber, 0.18).beginPath();
          div.moveTo(-panelW / 2 + 12, rowY - rowH / 2);
          div.lineTo(panelW / 2 - 12, rowY - rowH / 2);
          div.strokePath();
          panel.add(div);
        }
        // Icon + name on the left line, description wrapped below.
        const icon = this.add.text(-panelW / 2 + 18, rowY - 10, info.icon, {
          fontFamily: "Lora", fontSize: "22px", color: info.textColor, fontStyle: "bold",
        }).setOrigin(0, 0.5);
        const name = this.add.text(-panelW / 2 + 48, rowY - 10, `${info.name} ${value[info.key]}`, {
          fontFamily: "Lora", fontSize: "16px", color: S.parchHi, fontStyle: "bold",
        }).setOrigin(0, 0.5);
        const desc = this.add.text(-panelW / 2 + 48, rowY + 10, info.describe(value[info.key]), {
          fontFamily: "Lora", fontSize: "13px", color: S.dim,
          wordWrap: { width: panelW - 64 },
        }).setOrigin(0, 0.5);
        panel.add([icon, name, desc]);
      });
    }

    // Footer hint — "tap anywhere to close".
    const hint = this.add.text(0, panelH / 2 - footerH / 2 - 2, "tap to close", {
      fontFamily: "Lora", fontSize: "10px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5);
    panel.add(hint);

    panel.setData("isPlayer", isPlayer);
    panel.setAlpha(0);
    panel.setScale(0.94);
    this.tweens.add({
      targets: panel,
      alpha: 1, scale: 1,
      duration: 160, ease: "Back.Out",
    });
    this.statusPanel = panel;
  }

  private closeStatusPanel() {
    const panel = this.statusPanel;
    const backdrop = this.statusPanelBackdrop;
    this.statusPanel = null;
    this.statusPanelBackdrop = null;
    if (backdrop) {
      backdrop.disableInteractive();
      backdrop.destroy();
    }
    if (panel) {
      this.tweens.killTweensOf(panel);
      this.tweens.add({
        targets: panel,
        alpha: 0, scale: 0.94,
        duration: 110, ease: "Cubic.In",
        onComplete: () => panel.destroy(),
      });
    }
  }

  /**
   * Build a shield badge — same shape language as the HP pill but smaller
   * and cyan, with a ⛨ icon. Wrapped in a container so flashShield can
   * scale the whole thing and we can hide it when shield drops to zero.
   */
  private makeShieldBadge(isPlayer = false): void {
    const w = CombatScene.PILL_W;
    const h = CombatScene.SUB_PILL_H;
    const container = this.add.container(0, 0);
    const bg = this.add.graphics();
    bg.fillStyle(C.ink, 0.92);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(3, C.ghost, 0.9);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    container.add(bg);

    // Match the HP pill's icon/number x-positions so the two pills feel like
    // a coherent set when stacked.
    const icon = this.add.text(-w / 2 + 26, 0, "⛨", {
      fontFamily: "Lora", fontSize: "22px", color: S.ghost, fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(icon);

    const num = this.add.text(24, 0, "", {
      fontFamily: "Lora", fontSize: "22px", color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(num);

    container.setVisible(false);
    container.setData("icon", icon);
    if (isPlayer) {
      this.playerShieldBadge = container;
      this.playerShieldNumber = num;
    } else {
      this.enemyShieldBadge = container;
      this.enemyShieldNumber = num;
    }
  }

  /**
   * Build an Empowered pill — same shape language as the HP/shield pills but
   * amber-themed, with a ✦ glyph. Sits above the portrait so it can never
   * overlap the other pills, and hidden when empowered is 0.
   */
  private makeEmpoweredBadge(): Phaser.GameObjects.Container {
    const w = CombatScene.PILL_W;
    const h = CombatScene.SUB_PILL_H;
    const container = this.add.container(0, 0);
    const bg = this.add.graphics();
    bg.fillStyle(C.ink, 0.92);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(3, C.amber, 0.9);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    container.add(bg);

    const icon = this.add.text(-w / 2 + 26, 0, "✦", {
      fontFamily: "Lora", fontSize: "22px", color: S.amber, fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(icon);

    const num = this.add.text(24, 0, "", {
      fontFamily: "Lora", fontSize: "22px", color: S.parchHi, fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(num);

    container.setVisible(false);
    container.setData("icon", icon);
    this.playerEmpoweredBadge = container;
    this.playerEmpoweredNumber = num;
    return container;
  }

  /**
   * Sync the empowered pill to current value — visibility, number, and a
   * quick amber flash + scale pop when it changes. Mirrors updateShieldBadge.
   */
  private updateEmpoweredBadge(value: number, last: number) {
    const badge = this.playerEmpoweredBadge;
    const num = this.playerEmpoweredNumber;
    num.setText(`+${value}`);
    if (last < 0) {
      const wasVisible = badge.visible;
      badge.setVisible(value > 0);
      if (badge.visible !== wasVisible) this.relayoutHud();
      return;
    }
    if (value === last) return;
    const wasVisible = badge.visible;
    badge.setVisible(true);
    if (badge.visible !== wasVisible) this.relayoutHud();
    this.tweens.killTweensOf(badge);
    badge.setScale(1);
    const icon = badge.getData("icon") as Phaser.GameObjects.Text | undefined;
    icon?.setColor("#ffd86e");
    this.tweens.add({
      targets: badge,
      scale: value > last ? 1.25 : 1.15,
      duration: value > last ? 150 : 90,
      yoyo: true,
      ease: "Cubic.Out",
      onComplete: () => {
        badge.setScale(1);
        icon?.setColor(S.amber);
      },
    });
    if (value === 0) {
      this.time.delayedCall(220, () => {
        badge.setVisible(false);
        this.relayoutHud();
      });
    }
  }

  /**
   * Tween a displayed HP value to its target, one HP per ~55ms. Killing any
   * existing tween on the wrapper so back-to-back hits restart cleanly.
   * Clamps to 0 — never show negatives even when overkill rolls in.
   */
  private animateHpTick(
    tick: { v: number },
    label: Phaser.GameObjects.Text,
    target: number,
    fmt: (v: number) => string = (v) => `${v}`,
  ) {
    const clamped = Math.max(0, target);
    if (tick.v === clamped) {
      label.setText(fmt(clamped));
      return;
    }
    this.tweens.killTweensOf(tick);
    const distance = Math.abs(tick.v - clamped);
    this.tweens.add({
      targets: tick,
      v: clamped,
      duration: distance * 55,
      ease: "Linear",
      onUpdate: () => {
        label.setText(fmt(Math.round(tick.v)));
      },
      onComplete: () => {
        tick.v = clamped;
        label.setText(fmt(clamped));
      },
    });
  }

  private refresh() {
    const { width } = this.scale;
    // HUD
    this.enemyNameText.setText(this.enemy.name);
    this.animateHpTick(this.enemyHpTick, this.enemyHpNumber, this.state.enemy.hp);
    if (this.lastEnemyHp >= 0 && this.state.enemy.hp < this.lastEnemyHp) {
      const dmg = this.lastEnemyHp - this.state.enemy.hp;
      this.pulseHpText(this.enemyHpNumber);
      this.rumble(dmg);
    }
    this.lastEnemyHp = this.state.enemy.hp;
    // Flash ring anchored to the badge's current laid-out position rather
    // than a hardcoded coordinate, so it tracks wherever the column lands.
    this.updateShieldBadge(
      this.enemyShieldBadge,
      this.enemyShieldNumber,
      this.state.enemy.shield,
      this.lastEnemyShield,
      this.enemyShieldBadge.x,
      this.enemyShieldBadge.y,
    );
    this.lastEnemyShield = this.state.enemy.shield;
    this.refreshStatusIndicator(false);
    // Knowing Eye perk: show the enemy's telegraphed intent text.
    if (this.enemyIntentText) {
      this.enemyIntentText.setText(this.state.enemy.intent ? this.state.enemy.intent.text : "");
    }
    this.renderEnemyHand();

    this.animateHpTick(
      this.playerHpTick,
      this.playerHpNumber,
      this.state.player.hp,
      (v) => `${v} / ${this.state.player.maxHp}`,
    );
    if (this.lastPlayerHp >= 0 && this.state.player.hp < this.lastPlayerHp) {
      const dmg = this.lastPlayerHp - this.state.player.hp;
      this.pulseHpText(this.playerHpNumber);
      this.rumble(dmg);
    }
    this.lastPlayerHp = this.state.player.hp;
    this.updateShieldBadge(
      this.playerShieldBadge,
      this.playerShieldNumber,
      this.state.player.shield,
      this.lastPlayerShield,
      this.playerShieldBadge.x,
      this.playerShieldBadge.y,
    );
    this.lastPlayerShield = this.state.player.shield;
    this.updateEmpoweredBadge(this.state.player.status.empowered, this.lastPlayerEmpowered);
    this.lastPlayerEmpowered = this.state.player.status.empowered;
    this.refreshStatusIndicator(true);

    // Drain engine-emitted trigger events AFTER the indicators have settled
    // into their new state — the trigger flash runs on the up-to-date ring.
    this.drainStatusTriggers();

    this.drawPileText.setText(`Draw: ${this.state.drawPile.length}`);
    this.discardPileText.setText(`Discard: ${this.state.discardPile.length}`);

    // Shuffle detection: engine.recycleDeck moves the whole discard back
    // into the draw pile in one tick, so a transition from "discard had
    // cards" to "discard is empty" is the signal to play the animation.
    // Use the previous discard count so the animation card count matches
    // exactly what was shuffled in.
    if (this.lastDiscardCount > 0 && this.state.discardPile.length === 0) {
      this.playShuffleAnimation(this.lastDiscardCount);
    }
    this.lastDiscardCount = this.state.discardPile.length;

    // Enemy-side reshuffle, mirroring the player's. The central pile holds
    // both sides' played cards, so when the enemy's cosmetic hand empties the
    // engine resets cardsInHand back UP to handSize — that upward jump means
    // the enemy has reclaimed their spent cards. Fly enemy card-backs into
    // the enemy deck (top-right) so each side's cards return to their OWN
    // deck rather than all motion happening at the player deck. handSize must
    // exceed 1, else a 1-card hand "reshuffles" every turn (net no change,
    // visually just noise) and there's no upward jump to detect anyway.
    const enemyCards = this.state.enemy.cardsInHand ?? 0;
    const enemyHandSize = this.state.enemy.handSize ?? 0;
    if (enemyHandSize > 1 && enemyCards > this.lastEnemyCardsInHand) {
      this.playEnemyShuffleAnimation(enemyHandSize);
    }
    this.lastEnemyCardsInHand = enemyCards;

    // Empty draw pile → ghost outline. Hides the card-back stack (face +
    // depth layers) and reveals the iron-rim hollow rectangle so the player
    // sees "deck is dry" at a glance.
    const empty = this.state.drawPile.length === 0;
    if (this.playerDeckFace) {
      this.playerDeckFace.setVisible(!empty);
      this.playerDeckBackLayers.forEach((b) => b.setVisible(!empty));
      this.playerDeckGhost.setVisible(empty);
    }
    this.refreshActionPips();

    // Combo banner: trigger whenever cardsPlayedThisTurn ticks past 1.
    if (
      this.state.cardsPlayedThisTurn > this.lastDisplayedCardsPlayed &&
      this.state.cardsPlayedThisTurn >= 2
    ) {
      this.flashCombo(this.state.cardsPlayedThisTurn);
    }
    // Arcane Surge — fires EVERY time the chain crosses a multiple of 4
    // (4, 8, 12 …), refunding a free action each time so a long chain keeps
    // paying off. Detected by the cards-played count crossing a /4 boundary
    // since the last refresh.
    if (
      Math.floor(this.state.cardsPlayedThisTurn / 4) >
        Math.floor(this.lastDisplayedCardsPlayed / 4) &&
      this.state.outcome === "ongoing"
    ) {
      this.triggerComboSurge();
    }
    this.lastDisplayedCardsPlayed = this.state.cardsPlayedThisTurn;

    // Stream any newly-appended log entries as toasts on the left.
    if (this.state.log.length > this.lastShownLogIndex) {
      const fresh = this.state.log.slice(this.lastShownLogIndex);
      fresh.forEach((line) => this.spawnToast(line));
      this.lastShownLogIndex = this.state.log.length;
    }

    // No-moves indicator. Auto End Turn covers the "out of actions" case;
    // deck pulse covers the narrower "actions left but hand is empty —
    // click to Draw" case so the player isn't left wondering.
    const outOfPlays = this.state.playsRemainingThisTurn + this.state.bonusActions <= 0;
    const outOfCards = this.state.hand.length === 0;
    const canDraw = this.state.drawPile.length + this.state.discardPile.length > 0;
    const ongoing = this.state.outcome === "ongoing";
    if (ongoing && outOfCards && !outOfPlays && canDraw) this.startDeckPulse();
    else this.stopDeckPulse();

    // Auto End Turn: pop out when actions hit zero, tuck back in if restored.
    // Skipped while the radial is open so the two never duplicate visually.
    if (ongoing && outOfPlays && !this.radialOpen && !this.autoEndTurnOpen) {
      this.openAutoEndTurn();
    } else if (this.autoEndTurnOpen && (!outOfPlays || !ongoing)) {
      this.closeAutoEndTurn();
    }

    // Redraw hand in a fanned arc. Cards are positioned along a circle so the
    // middle card is highest and edges curve down; each card is rotated to
    // point outward from the fan's virtual pivot below the screen.
    this.handSprites.forEach((s) => s.destroy());
    this.handZones.forEach((z) => z.destroy());
    this.handSprites = [];
    this.handZones = [];
    const cardCount = this.state.hand.length;
    const handCenterX = width / 2;
    // Pull the y anchor from the handMode-aware getter so a refresh during
    // standby (e.g. card drawn while hand parked) re-spawns cards at the
    // correct off-screen rest.
    const handBaseY = this.handBaseY;
    const totalArcDeg = Math.min(36, cardCount * 8);
    const arcRadius = 500;
    // Precompute every card's fan-x in one pass so each card's hit zone can
    // size itself against its actual neighbors. This is what makes the zones
    // tile cleanly (each zone's left/right boundary lands exactly at the
    // midpoint with its neighbor, end cards extend out to their full visible
    // width). Previously zones were a flat 1.4×CARD_W everywhere — so the
    // rightmost zone covered most of every middle card's center, and since
    // depth ordering picks the rightmost-i zone in overlaps, taps aimed at
    // middle cards silently routed to the wrong card.
    const fanXs: number[] = [];
    for (let k = 0; k < cardCount; k++) {
      const a = cardCount > 1
        ? -totalArcDeg / 2 + (k / (cardCount - 1)) * totalArcDeg
        : 0;
      fanXs.push(handCenterX + arcRadius * Math.sin((a * Math.PI) / 180));
    }

    this.state.hand.forEach((card, i) => {
      // VISUAL — non-interactive. The sprite animates freely on hover; the
      // hit detection lives on a static Zone next to it (see below). This
      // is what kills the hover flicker — the click target never moves.
      const sprite = makeCardSprite(this, card, 0, 0, { interactive: false });

      const angleDeg = cardCount > 1
        ? -totalArcDeg / 2 + (i / (cardCount - 1)) * totalArcDeg
        : 0;
      const angleRad = (angleDeg * Math.PI) / 180;
      const x = handCenterX + arcRadius * Math.sin(angleRad);
      const y = handBaseY + arcRadius * (1 - Math.cos(angleRad));

      sprite.x = x;
      sprite.y = y;
      sprite.rotation = angleRad;
      sprite.setData("restX", x);
      sprite.setData("restY", y);
      sprite.setData("restRotation", angleRad);
      const baseDepth = 10 + i;
      sprite.setData("baseDepth", baseDepth);
      sprite.setDepth(baseDepth);
      this.handSprites.push(sprite);

      // INTERACTION — invisible Zone for hit detection. Vertical extent is
      // generous (1.35×CARD_H) so the hover-lift (+40px / 1.15× scale)
      // doesn't drift the pointer out and trigger pointerout/in flicker.
      //
      // Horizontal extent matches the VISUALLY VISIBLE slice of each card.
      // In an overlapping fan, card i has depth 10+i — so card i+1 (higher
      // depth) sits ON TOP of card i and covers its right side from
      // x_(i+1) - CARD_W/2 onward. The visible portion of card i is therefore
      // its OWN left edge to the NEXT card's left edge:
      //   visible(i) = [x_i - CARD_W/2,  x_(i+1) - CARD_W/2]   (i < n-1)
      //   visible(n-1) = [x_(n-1) - CARD_W/2,  x_(n-1) + CARD_W/2]
      // First-pass we tried tiling by midpoints-of-centers, which is shifted
      // half a slice to the RIGHT of where the user actually sees each card
      // — so a tap landing on the visible part of a middle card kept hitting
      // the previous neighbor's zone instead. This tiles on the visible slice.
      const outerReach = CARD_W * 0.6;
      const leftBound = i > 0
        ? fanXs[i] - CARD_W / 2
        : fanXs[i] - outerReach;
      const rightBound = i < cardCount - 1
        ? fanXs[i + 1] - CARD_W / 2
        : fanXs[i] + outerReach;
      const zoneW = Math.max(40, rightBound - leftBound);
      const zoneCx = (leftBound + rightBound) / 2;
      const zone = this.add.zone(zoneCx, y - 25, zoneW, CARD_H * 1.35)
        .setInteractive({ useHandCursor: true });
      // Stash the tiled center so setHandMode's slide tween knows where to
      // park the zone (it's NOT the same as the card's x — card x sits on
      // the fan curve, zoneCx sits at the midpoint between neighbors).
      zone.setData("zoneCx", zoneCx);
      // Depth = i so rightmost zone wins input picks in overlapping fans,
      // which matches the visual stack order (rightmost on top).
      zone.setDepth(50 + i);
      zone.on("pointerover", (pointer: Phaser.Input.Pointer) => {
        this.liftHandSprite(sprite, i);
        this.hoveredCardIndex = i;
        // Drag-to-cycle: while a hold gesture is active and the finger is
        // still down, sliding from one card to another transfers the
        // armed-state — the arrow follows the finger so the player can
        // SEE which card will be played on release.
        if (pointer.isDown && this.holdGestureActive) {
          this.armCardAt(i);
        }
      });
      zone.on("pointerout", () => {
        this.lowerHandSprite(sprite);
        if (this.hoveredCardIndex === i) this.hoveredCardIndex = null;
        // Card no longer under finger → hide its arrow. armCardAt will
        // re-show it on the NEXT card entered (if the gesture is still
        // active) or nowhere (if finger is now in dead space).
        if (this.armedCardIndex === i) this.disarmCard(i);
      });
      // Hold-to-play. A quick down-up no longer plays the card — that was
      // too easy to do accidentally with a crowded hand. The player must
      // hold for HOLD_MS first; the arrow only appears once the hold
      // qualifies, at which point sliding cycles between cards and
      // releasing-on-a-card plays it. In STANDBY the press just lifts the
      // hand to active.
      zone.on("pointerdown", () => {
        if (this.handMode === "standby") {
          if (this.state.outcome === "ongoing") {
            this.setHandMode("active");
          }
          return;
        }
        this.cancelHoldGesture();
        this.holdStartedAt = Date.now();
        this.holdTimer = window.setTimeout(() => {
          this.holdTimer = null;
          this.holdGestureActive = true;
          // Arm whatever card the finger is over at the moment the hold
          // qualifies — might still be the card they pressed, or one
          // they've drifted onto during the delay.
          if (this.hoveredCardIndex !== null) {
            this.armCardAt(this.hoveredCardIndex);
          }
        }, CombatScene.HOLD_MS);
      });
      zone.on("pointerup", () => {
        // Snapshot the elapsed hold time BEFORE any cleanup so the play
        // decision survives whatever the global pointerup safety net does
        // first. Decoupled from holdGestureActive entirely — order doesn't
        // matter, only "was the pointer down for ≥ HOLD_MS when it came up
        // on this card".
        const heldMs = this.holdStartedAt > 0 ? Date.now() - this.holdStartedAt : 0;
        this.cancelHoldGesture();
        this.disarmAll();
        if (this.handMode === "standby") return;
        if (heldMs >= CombatScene.HOLD_MS) this.onPlayCard(i);
      });
      this.handZones.push(zone);
    });

    // Newly-drawn cards: anything in the current hand whose id wasn't
    // matched in the previous hand multiset. Match-by-pop so duplicates
    // resolve correctly (two strikes in old + one strike in new = one
    // matched, one removed, not "both matched").
    const currentIds = this.state.hand.map((c) => c.id);
    if (this.lastHandIds !== null) {
      const remainingPrev = [...this.lastHandIds];
      const newIndices: number[] = [];
      currentIds.forEach((id, i) => {
        const idx = remainingPrev.indexOf(id);
        if (idx >= 0) remainingPrev.splice(idx, 1);
        else newIndices.push(i);
      });
      if (newIndices.length > 0) this.animateDrawnCards(newIndices);
    }
    this.lastHandIds = currentIds;

    if (this.state.outcome !== "ongoing" && !this.outcomeQueued) {
      this.outcomeQueued = true;
      if (this.state.outcome === "won") {
        this.playEnemyDefeatThenOutcome();
      } else if (this.state.outcome === "lost") {
        this.playPlayerDefeatThenOutcome();
      } else {
        this.handleOutcome();
      }
    }
  }

  /**
   * Render the enemy's hand as a face-DOWN fan at the top of the screen.
   * Mirrors the player's fan (concave-down — middle card lowest, edges curve
   * up). Same card size, same arc math. Called from refresh() so it tracks
   * the enemy's `cardsInHand` as they play.
   */
  private renderEnemyHand() {
    this.enemyHandSprites.forEach((s) => s.destroy());
    this.enemyHandSprites = [];

    const cardCount = this.state.enemy.cardsInHand ?? 0;
    if (cardCount <= 0) return;

    const { width } = this.scale;
    // Offset to top-right so the centered HP/shield/status column stays
    // unobscured and the play pile at y=330 (centre) has clearance. Anchored
    // to the deck position so spacing stays consistent across resolutions.
    const handCenterX = width - 380;
    const handBaseY = 90;
    const arcRadius = 420;
    const totalArcDeg = Math.min(20, cardCount * 4.5);
    const cardScale = 0.55;

    for (let i = 0; i < cardCount; i++) {
      const angleDeg = cardCount > 1
        ? -totalArcDeg / 2 + (i / (cardCount - 1)) * totalArcDeg
        : 0;
      const angleRad = (angleDeg * Math.PI) / 180;

      // Inverted fan: pivot ABOVE handBaseY, so edges curve UP (toward screen top).
      const x = handCenterX + arcRadius * Math.sin(angleRad);
      const y = handBaseY - arcRadius * (1 - Math.cos(angleRad));

      const sprite = makeEnemyCardBackSprite(this, x, y, this.enemy.silhouette ?? "skull", { scale: cardScale });
      // Rotated to match the arc tangent. Mirror direction so the enemy fan
      // visually opens "downward" toward the player.
      sprite.rotation = -angleRad;
      sprite.setDepth(20 + i);
      this.enemyHandSprites.push(sprite);
    }
  }

  /** Deck click handler — toggles the radial menu (Draw / End Turn). */
  private onDeckClick() {
    if (this.state.outcome !== "ongoing") return;
    // If End Turn is already floating (auto-popped), the deck click is a
    // no-op — no point re-animating the same button alongside itself.
    if (this.autoEndTurnOpen) return;
    if (this.radialOpen) this.closeRadialMenu();
    else this.openRadialMenu();
  }

  /**
   * Draw action — invoked from the radial menu's Draw button. Consumes 1
   * action (bonus first), draws 1 card, animates it in from the deck.
   */
  private doDraw() {
    if (this.state.outcome !== "ongoing") return;
    const totalActions = this.state.playsRemainingThisTurn + this.state.bonusActions;
    if (totalActions <= 0) return;
    if (this.state.drawPile.length === 0 && this.state.discardPile.length === 0) {
      this.state.log.push("No cards left in the deck.");
      this.refresh();
      return;
    }
    if (this.state.bonusActions > 0) this.state.bonusActions -= 1;
    else this.state.playsRemainingThisTurn -= 1;

    const drewN = drawCards(this.state, 1);
    if (drewN <= 0) {
      this.state.log.push("The deck is empty.");
      this.refresh();
      return;
    }

    // The bespoke "fly newest card from deck" animation that used to live
    // here is now redundant — refresh()'s multiset diff sees the new card
    // and routes it through animateDrawnCards, which does the same deck→
    // hand fly with the right targets. Keeping a second animation here was
    // *causing* the bug: refresh() ran first and teleported the new sprite
    // to the deck, then this block read sprite.x/y (now deck coords) and
    // tweened deck → deck — i.e. no movement.
    this.refresh();
  }

  /**
   * Current y-anchor for the middle card of the player hand fan.
   *   active  → height - 210 (the original "starting" position)
   *   standby → height + 26  (puts ~60% of every card below the screen)
   * Edge cards arc DOWN from this anchor by `arcRadius*(1 - cos(angle))`,
   * so in standby the visible portion is the top edge of the fan.
   */
  private get handBaseY(): number {
    return this.handMode === "active"
      ? this.scale.height - 210
      : this.scale.height + 26;
  }

  /**
   * Toggle the hand between standby ↔ active. Tweens every card sprite + its
   * hit zone to the new arc position so the transition reads smoothly.
   * Also re-stamps each sprite's restX/restY data so the lift/lower hover
   * handlers return to the right place.
   */
  private setHandMode(mode: "standby" | "active") {
    if (this.handMode === mode) return;
    this.handMode = mode;

    // Toggle the pile-preview tap zone in lockstep with the hand. The pile
    // zone sits at depth 900 (so it beats the play-pile sprite at depth 5
    // and any modal-adjacent chrome below 900), but when the hand is in
    // ACTIVE mode the middle card of the fan lands at screen centre —
    // right under the pile zone. Phaser routes pointer events to the
    // highest-depth interactive zone first, so without disabling pileZone
    // here, taps on the middle card silently dead-end in the pile zone's
    // "if (handMode !== 'standby') return" early-out and never reach the
    // hand zone underneath. Standby mode → pile preview tappable again.
    if (this.playPileSprite) {
      if (mode === "active") this.pileZone?.disableInteractive();
      else this.pileZone?.setInteractive({ useHandCursor: true });
    }

    const { width } = this.scale;
    const cardCount = this.state.hand.length;
    if (cardCount === 0) return;
    const handCenterX = width / 2;
    const handBaseY = this.handBaseY;
    const totalArcDeg = Math.min(36, cardCount * 8);
    const arcRadius = 500;

    for (let i = 0; i < cardCount; i++) {
      const angleDeg = cardCount > 1
        ? -totalArcDeg / 2 + (i / (cardCount - 1)) * totalArcDeg
        : 0;
      const angleRad = (angleDeg * Math.PI) / 180;
      const x = handCenterX + arcRadius * Math.sin(angleRad);
      const y = handBaseY + arcRadius * (1 - Math.cos(angleRad));

      const sprite = this.handSprites[i];
      if (sprite) {
        sprite.setData("restX", x);
        sprite.setData("restY", y);
        sprite.setData("restRotation", angleRad);
        // Cancel any in-flight lift before the global slide so the hover
        // state doesn't leave a card stranded mid-tween.
        this.tweens.killTweensOf(sprite);
        this.tweens.add({
          targets: sprite,
          x, y, rotation: angleRad, scale: 1,
          duration: 260, ease: "Cubic.Out",
        });
      }
      const zone = this.handZones[i];
      if (zone) {
        // Use the tiled center stored at zone-creation time. The card's x
        // (on the fan curve) is NOT the same as the zone's tiled centre —
        // tweening to `x` here would knock the zones off their non-overlap
        // tiling and re-create the "rightmost zone eats middle taps" bug
        // every time the hand slides between standby and active.
        const zoneCx = (zone.getData("zoneCx") as number | undefined) ?? x;
        this.tweens.killTweensOf(zone);
        this.tweens.add({
          targets: zone,
          x: zoneCx, y: y - 25,
          duration: 260, ease: "Cubic.Out",
        });
      }
    }
  }

  private liftHandSprite(sprite: Phaser.GameObjects.Container, handIndex: number) {
    this.tweens.killTweensOf(sprite);
    sprite.setAlpha(1);
    const baseDepth = (sprite.getData("baseDepth") as number | undefined) ?? 0;
    sprite.setDepth(baseDepth + 1000);
    const restY = (sprite.getData("restY") as number | undefined) ?? sprite.y;
    // Fade the card if it can't currently be played — no actions, or a
    // once-per-turn card that's already fired this turn. Lift still happens
    // so you can read it.
    const playable = this.isCardPlayable(handIndex);
    this.tweens.add({
      targets: sprite,
      y: restY - 40,
      scale: 1.15,
      rotation: 0,
      alpha: playable ? 1 : 0.45,
      duration: 140,
      ease: "Cubic.Out",
    });
    this.showEmpoweredPreview(sprite, handIndex);
  }

  /**
   * If the player has Empowered active and the hovered card deals damage,
   * rewrite the "Deal X damage" portion of the description to show the
   * boosted total, recolor it amber, and pulse the text — so the player
   * sees how much harder this attack will hit before committing.
   */
  private showEmpoweredPreview(sprite: Phaser.GameObjects.Container, handIndex: number) {
    const empowered = this.state.player.status.empowered;
    if (empowered <= 0) return;
    const card = this.state.hand[handIndex];
    if (!card || !card.effect.damage || card.effect.damage <= 0) return;
    const desc = sprite.getData("descText") as Phaser.GameObjects.Text | undefined;
    const original = sprite.getData("descOriginal") as string | undefined;
    if (!desc || !original) return;

    const boosted = card.effect.damage + empowered;
    // Replace "Deal N damage" — works regardless of what follows it.
    const newText = original.replace(/Deal \d+ damage/, `Deal ${boosted} damage`);
    desc.setText(newText);
    desc.setColor(S.amber);
    this.tweens.killTweensOf(desc);
    desc.setScale(1);
    this.tweens.add({
      targets: desc,
      scale: 1.12,
      duration: 380,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });

    // Frame the card in the same amber as the Empowered pill, and stamp a
    // matching ✦ glyph in the top-LEFT corner so the empowered state is
    // unmistakable at a glance — not just a number swap.
    if (!sprite.getData("empFrame")) {
      const w = CARD_W;
      const h = CARD_H;
      const frame = this.add.graphics();
      frame.lineStyle(4, C.amber, 1);
      frame.strokeRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 7);
      sprite.add(frame);
      const icon = this.add.text(-w / 2 + 16, -h / 2 + 17, "✦", {
        fontFamily: "Lora", fontSize: "18px", color: S.amber, fontStyle: "bold",
      }).setOrigin(0.5);
      sprite.add(icon);
      sprite.setData("empFrame", frame);
      sprite.setData("empIcon", icon);
    }

    // Pulse the Empowered pill in lockstep with the desc text — same params,
    // started at the same time, so they read as visually linked. Kills any
    // residual flash from updateEmpoweredBadge so they don't fight.
    this.tweens.killTweensOf(this.playerEmpoweredBadge);
    this.playerEmpoweredBadge.setScale(1);
    this.tweens.add({
      targets: this.playerEmpoweredBadge,
      scale: 1.12,
      duration: 380,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

  private clearEmpoweredPreview(sprite: Phaser.GameObjects.Container) {
    const desc = sprite.getData("descText") as Phaser.GameObjects.Text | undefined;
    const original = sprite.getData("descOriginal") as string | undefined;
    if (desc && original) {
      this.tweens.killTweensOf(desc);
      desc.setText(original);
      desc.setColor(S.ink);
      desc.setScale(1);
    }
    const frame = sprite.getData("empFrame") as Phaser.GameObjects.Graphics | undefined;
    const icon = sprite.getData("empIcon") as Phaser.GameObjects.Text | undefined;
    frame?.destroy();
    icon?.destroy();
    sprite.setData("empFrame", null);
    sprite.setData("empIcon", null);

    // Stop the linked pill pulse and snap it back to rest.
    if (this.playerEmpoweredBadge) {
      this.tweens.killTweensOf(this.playerEmpoweredBadge);
      this.playerEmpoweredBadge.setScale(1);
    }
  }

  /** Decks are split to the OPPOSITE sides of their respective hands so
   *  each side reads as a coherent "deck + hand" pair without crowding.
   *    - Enemy deck (top-LEFT corner) is on the opposite side of the enemy
   *      hand fan (top-right).
   *    - Player deck (bottom-RIGHT corner) is far from the player hand fan
   *      (bottom-centre) AND clear of the player portrait (bottom-left).
   *  The play pile sits centred between the two, near the canvas middle. */
  private get enemyDeckPos() {
    // Vertically in line with the enemy hand baseline (y=90) so the deck
    // and the fan share the same horizon. Horizontally tucked between the
    // hand's right tip (~width-257) and the Log button's left edge
    // (~width-110): width-150 lands a deck-half-width (0.4 scale → 36 px)
    // on either side of either neighbour.
    return { x: this.scale.width - 150, y: 90 };
  }
  private get playerDeckPos() {
    return { x: this.scale.width - 110, y: this.scale.height - 140 };
  }
  /** Perfectly centred. The player hand has a 'standby' position (mostly
   *  off-screen) so the central area stays clear until the player taps to
   *  bring the hand up — pile no longer fights for that space. */
  private get pilePos() {
    return { x: this.scale.width / 2, y: this.scale.height / 2 };
  }
  /** Pile size — shrinks on smartphone canvases so the played card image
   *  fits between the (compact) enemy HUD and the player hand fan without
   *  dominating the screen. PILE_SCALE alias preserved for existing reads. */
  private get pileScale() { return this.scale.height < 600 ? 0.54 : 0.84; }
  private get PILE_SCALE() { return this.pileScale; }

  /**
   * Replace whatever's on the play pile with `newSprite`. The previous pile
   * card fades out and is destroyed. A fresh shadow drops in behind. Shared
   * by both the player-card-played path and the enemy-card-revealed path.
   */
  private setPileCard(newSprite: Phaser.GameObjects.Container) {
    const { x: pileX, y: pileY } = this.pilePos;

    // Fade out previous
    if (this.playPileSprite) {
      const oldSprite = this.playPileSprite;
      const oldShadow = this.playPileShadow;
      this.tweens.killTweensOf(oldSprite);
      this.tweens.add({
        targets: oldSprite,
        alpha: 0,
        scale: 0.95,
        duration: 180,
        onComplete: () => {
          oldSprite.destroy();
          oldShadow?.destroy();
        },
      });
    }

    // Pile depth deliberately LOW (below the hand sprite range of 10+i).
    // Otherwise the played card would float over the player hand and
    // partially obscure their next decision. Hand cards always read first.
    const shadow = this.add.rectangle(pileX + 5, pileY + 7, CARD_W * this.PILE_SCALE, CARD_H * this.PILE_SCALE, 0x000000, 0.45)
      .setDepth(4);
    shadow.setAlpha(0);
    this.tweens.add({ targets: shadow, alpha: 0.45, duration: 220, delay: 60 });

    this.playPileSprite = newSprite;
    this.playPileShadow = shadow;
    newSprite.setDepth(5);

    // Now that there's something on the pile, light up the tap zone (it
    // starts disabled in create()). Use hand cursor on desktop. Guarded
    // against the active-hand case — if the player is mid-action with the
    // hand fan lifted, the middle card of the fan sits at the pile's
    // centre, and a re-enable here would resurrect the tap-eating bug
    // setHandMode just patched. setHandMode will re-enable the pile zone
    // when the hand drops back to standby.
    if (this.handMode === "standby") {
      this.pileZone?.setInteractive({ useHandCursor: true });
    }
  }

  /** Player card → pile. Sprite already exists (the hand card just clicked). */
  /**
   * Card-back "shuffle" effect for when the engine recycles the discard
   * back into the draw pile. Spawns N translucent card-backs scattered
   * around the play pile and tweens them, one after the other, into the
   * player deck position — so the player sees their cards re-enter the
   * deck instead of the discard count silently teleporting to draw.
   *
   * Count matches the cards that were just reshuffled exactly (the
   * discard size captured before the recycle ran).
   */
  private playShuffleAnimation(cardCount: number) {
    if (cardCount <= 0) return;
    const { x: deckX, y: deckY } = this.playerDeckPos;
    // Cap the on-screen count so a giant deck doesn't spawn 30 cards.
    const visibleCount = Math.min(cardCount, 12);
    const stagger = 60;
    // Cards puff out a short distance from the deck and fly back in. Original
    // implementation scattered them across the play pile (~70–140 px from
    // CENTRE of screen), which was way too far — reads as "cards yeeted across
    // the table". Pulling the scatter centre back to the deck and the radius
    // down keeps the motion local to the deck while still being visible
    // enough that the animation isn't subliminal.
    for (let i = 0; i < visibleCount; i++) {
      // Polar scatter around the DECK — angle around full circle, radius
      // between 36 and 70 px. Reads as cards spilling briefly out of the
      // deck and tucking themselves back in.
      const angle = Math.random() * Math.PI * 2;
      const dist = 36 + Math.random() * 34;
      const startX = deckX + Math.cos(angle) * dist;
      const startY = deckY + Math.sin(angle) * dist * 0.7; // squashed vertically — feels more like a tabletop spill than a sphere
      const card = makeCardBackSprite(this, startX, startY, { scale: 0.42 });
      // Above the pile sprite (depth 5) and below hand sprites (10+), so
      // the in-flight cards read on top of the static board chrome but
      // don't clobber any open hand fan.
      card.setDepth(8);
      card.setAlpha(0);
      card.setRotation((Math.random() - 0.5) * 0.36);

      // Quick fade-in so each card "lands" rather than abruptly popping in.
      this.tweens.add({
        targets: card,
        alpha: 1,
        duration: 140,
        delay: i * stagger,
      });
      // Travel back to the deck — pace matched to the shorter distance so
      // the cards don't dawdle. Visible shrink as they arrive sells the
      // "tucking into the stack" read.
      this.tweens.add({
        targets: card,
        x: deckX,
        y: deckY,
        scale: 0.32,
        rotation: 0,
        duration: 240,
        delay: i * stagger + 80,
        ease: "Cubic.In",
        onComplete: () => card.destroy(),
      });
    }
    // A single tiny "thump" pulse on the deck face when the first card
    // would land, reinforcing that the cards are arriving HERE.
    this.tweens.add({
      targets: this.playerDeckFace,
      scale: 1.12,
      duration: 110,
      delay: stagger + 240,
      yoyo: true,
      ease: "Cubic.Out",
    });
  }

  /**
   * Enemy-side mirror of playShuffleAnimation: when the enemy's cosmetic hand
   * empties and reshuffles, fly their spent card-backs (the enemy silhouette
   * artwork, so they match the deck they came from) back into the enemy deck
   * (top-right) instead of the player deck. Keeps the "each side reclaims its
   * own cards" read symmetric between the two decks.
   */
  private playEnemyShuffleAnimation(cardCount: number) {
    if (cardCount <= 0) return;
    const { x: deckX, y: deckY } = this.enemyDeckPos;
    const sil = this.enemy.silhouette ?? "skull";
    const visibleCount = Math.min(cardCount, 12);
    const stagger = 60;
    for (let i = 0; i < visibleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 36 + Math.random() * 34;
      const startX = deckX + Math.cos(angle) * dist;
      const startY = deckY + Math.sin(angle) * dist * 0.7;
      const card = makeEnemyCardBackSprite(this, startX, startY, sil, { scale: 0.4 });
      card.setDepth(8);
      card.setAlpha(0);
      card.setRotation((Math.random() - 0.5) * 0.36);

      this.tweens.add({
        targets: card,
        alpha: 1,
        duration: 140,
        delay: i * stagger,
      });
      this.tweens.add({
        targets: card,
        x: deckX,
        y: deckY,
        scale: 0.3,
        rotation: 0,
        duration: 240,
        delay: i * stagger + 80,
        ease: "Cubic.In",
        onComplete: () => card.destroy(),
      });
    }
    if (this.enemyDeckFace) {
      this.tweens.add({
        targets: this.enemyDeckFace,
        scale: 1.12,
        duration: 110,
        delay: stagger + 240,
        yoyo: true,
        ease: "Cubic.Out",
      });
    }
  }

  /**
   * Animate cards at the given hand indices flying in from the player
   * deck, identical look-and-feel to the opening-deal arrival. Each card's
   * `restX/restY/restRotation` data (set by refresh) is the target — we
   * teleport the sprite to the deck and tween it back.
   * Cards are staggered so two-card draws read as one… two… not as a
   * single blob arriving.
   */
  private animateDrawnCards(indices: number[]) {
    const { width } = this.scale;
    const { x: deckX, y: deckY } = this.playerDeckPos;
    const stagger = 90;
    // Recompute each card's authoritative rest position from scratch using
    // the *current* handMode. We don't trust sprite.getData("restX/Y") —
    // a play→draw cycle can leave the cached data pointing at the previous
    // mode's coordinates, and a follow-up setHandMode would re-kill the
    // tween before it had a chance to fire (the reported "stuck on deck"
    // bug). Also write the fresh values back to the sprite data so any
    // subsequent lift / setHandMode reads stay in sync.
    const cardCount = this.state.hand.length;
    const handCenterX = width / 2;
    const handBaseY = this.handBaseY;
    const totalArcDeg = Math.min(36, cardCount * 8);
    const arcRadius = 500;

    indices.forEach((idx, n) => {
      const sprite = this.handSprites[idx];
      if (!sprite) return;
      const angleDeg = cardCount > 1
        ? -totalArcDeg / 2 + (idx / (cardCount - 1)) * totalArcDeg
        : 0;
      const angleRad = (angleDeg * Math.PI) / 180;
      const targetX = handCenterX + arcRadius * Math.sin(angleRad);
      const targetY = handBaseY + arcRadius * (1 - Math.cos(angleRad));

      sprite.setData("restX", targetX);
      sprite.setData("restY", targetY);
      sprite.setData("restRotation", angleRad);

      this.tweens.killTweensOf(sprite);
      sprite.x = deckX;
      sprite.y = deckY;
      sprite.rotation = 0;
      sprite.setScale(0.4);
      sprite.setAlpha(1);
      this.tweens.add({
        targets: sprite,
        x: targetX, y: targetY, rotation: angleRad, scale: 1,
        duration: 320,
        delay: n * stagger,
        ease: "Cubic.Out",
      });
    });
  }

  private animateCardToPile(sprite: Phaser.GameObjects.Container, _card: import("@/types/cards").Card) {
    const { x: pileX, y: pileY } = this.pilePos;
    this.setPileCard(sprite);
    this.tweens.killTweensOf(sprite);
    sprite.setAlpha(1);
    this.tweens.add({
      targets: sprite,
      x: pileX,
      y: pileY,
      rotation: 0,
      scale: this.PILE_SCALE,
      duration: 320,
      ease: "Cubic.Out",
    });
  }

  /**
   * Grow whatever's currently on the pile into a centred, readable
   * preview. Works for both player cards (a real makeCardSprite container)
   * and enemy action cards (a makeEnemyActionCard container) because we
   * just tween the existing sprite up — no need to know its kind.
   *
   * Dim backdrop catches a tap to close. Idempotent.
   */
  private openPilePreview() {
    if (!this.playPileSprite || this.pilePreviewBackdrop) return;
    const sprite = this.playPileSprite;
    const { width, height } = this.scale;
    const baseDepth = 9000;

    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive()
      .setDepth(baseDepth);
    this.tweens.add({ targets: dim, fillAlpha: 0.72, duration: 200, ease: "Cubic.Out" });
    this.pilePreviewBackdrop = dim;

    const rest = { x: sprite.x, y: sprite.y, scale: sprite.scale, depth: sprite.depth };
    sprite.setDepth(baseDepth + 1);
    this.tweens.killTweensOf(sprite);
    this.tweens.add({
      targets: sprite,
      x: width / 2,
      y: height / 2,
      scale: 1.4,
      duration: 280,
      ease: "Cubic.Out",
    });

    const close = () => {
      if (this.pilePreviewBackdrop !== dim) return;
      this.pilePreviewBackdrop = null;
      dim.disableInteractive();
      this.tweens.add({
        targets: dim, fillAlpha: 0,
        duration: 160, ease: "Cubic.In",
        onComplete: () => dim.destroy(),
      });
      // The pile sprite may have been swapped during preview (rare). Only
      // restore the pose if it's still the one we lifted up.
      if (this.playPileSprite === sprite) {
        this.tweens.add({
          targets: sprite,
          x: rest.x, y: rest.y, scale: rest.scale,
          duration: 200, ease: "Cubic.In",
          onComplete: () => sprite.setDepth(rest.depth),
        });
      }
    };
    dim.on("pointerdown", close);
  }

  /**
   * Enemy card → pile. A card-back flies from the enemy hand position,
   * grows as it arrives, then "reveals" into a face-up enemy action card.
   * Triggered from onEndTurn after the engine has resolved the enemy's intent.
   */
  private animateEnemyPlay(intent: { kind: "attack" | "defend" | "buff"; value: number; text: string }) {
    const { x: pileX, y: pileY } = this.pilePos;
    const enemyHandY = 90;
    const startX = this.scale.width / 2;

    // Phantom card-back — independent of the enemyHandSprites array (which
    // has already been refreshed to the new smaller fan). Uses the enemy
    // silhouette artwork so the card flying to the pile matches the deck it
    // came from.
    const phantom = makeEnemyCardBackSprite(this, startX, enemyHandY, this.enemy.silhouette ?? "skull", { scale: 0.55 });
    phantom.setDepth(550);

    this.tweens.add({
      targets: phantom,
      x: pileX,
      y: pileY,
      scale: this.PILE_SCALE,
      duration: 360,
      ease: "Cubic.Out",
      onComplete: () => {
        phantom.destroy();
        const face = makeEnemyActionCard(this, pileX, pileY, intent);
        face.setScale(this.PILE_SCALE);
        this.setPileCard(face);
      },
    });
  }

  /**
   * Arm a specific card during a hold gesture — moves the play arrow from
   * whatever was previously armed onto the new card. Idempotent. Used by
   * pointerover (drag-to-cycle) and by the hold-timer fire (initial arm).
   */
  private armCardAt(index: number) {
    if (this.armedCardIndex === index) return;
    if (this.armedCardIndex !== null) {
      const prev = this.handSprites[this.armedCardIndex];
      if (prev) this.hidePlayArrow(prev);
    }
    const sprite = this.handSprites[index];
    if (!sprite) { this.armedCardIndex = null; return; }
    this.armedCardIndex = index;
    this.showPlayArrow(sprite);
  }

  /** Disarm a specific card. Called by pointerout when the finger leaves it. */
  private disarmCard(index: number) {
    if (this.armedCardIndex !== index) return;
    const sprite = this.handSprites[index];
    if (sprite) this.hidePlayArrow(sprite);
    this.armedCardIndex = null;
  }

  /** Disarm whatever is currently armed (gesture end / cancel). */
  private disarmAll() {
    if (this.armedCardIndex === null) return;
    const sprite = this.handSprites[this.armedCardIndex];
    if (sprite) this.hidePlayArrow(sprite);
    this.armedCardIndex = null;
  }

  /** Cancel an in-flight hold timer and reset the gesture flag. Also wipes
   *  the holdStartedAt stamp so a subsequent stray pointerup can't bogusly
   *  trigger a play from a long-ago press. */
  private cancelHoldGesture() {
    if (this.holdTimer !== null) { window.clearTimeout(this.holdTimer); this.holdTimer = null; }
    this.holdGestureActive = false;
    this.holdStartedAt = 0;
  }

  /**
   * Pulsing ▲ above a held card — "release here to play". Added as a child
   * of the sprite container so it travels with the lift tween and rotates
   * with the card. Idempotent: re-calling while shown is a no-op.
   */
  private showPlayArrow(sprite: Phaser.GameObjects.Container) {
    if (sprite.getData("playArrow")) return;
    const restY = -CARD_H / 2 - 24;
    const arrow = this.add.text(0, restY + 16, "▲", {
      fontFamily: "Lora", fontSize: "44px", color: S.amber, fontStyle: "bold",
      stroke: "#0b0a16", strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);
    sprite.add(arrow);
    sprite.setData("playArrow", arrow);
    this.tweens.add({
      targets: arrow,
      alpha: 1,
      y: restY,
      duration: 160,
      ease: "Back.Out",
      onComplete: () => {
        this.tweens.add({
          targets: arrow,
          y: restY - 10,
          yoyo: true,
          repeat: -1,
          duration: 480,
          ease: "Sine.InOut",
        });
      },
    });
  }

  private hidePlayArrow(sprite: Phaser.GameObjects.Container) {
    const arrow = sprite.getData("playArrow") as Phaser.GameObjects.Text | undefined;
    if (!arrow) return;
    sprite.setData("playArrow", null);
    this.tweens.killTweensOf(arrow);
    this.tweens.add({
      targets: arrow,
      alpha: 0,
      duration: 100,
      onComplete: () => arrow.destroy(),
    });
  }

  private lowerHandSprite(sprite: Phaser.GameObjects.Container) {
    this.tweens.killTweensOf(sprite);
    const baseDepth = (sprite.getData("baseDepth") as number | undefined) ?? 0;
    sprite.setDepth(baseDepth);
    const restX = (sprite.getData("restX") as number | undefined) ?? sprite.x;
    const restY = (sprite.getData("restY") as number | undefined) ?? sprite.y;
    const restRot = (sprite.getData("restRotation") as number | undefined) ?? 0;
    this.tweens.add({
      targets: sprite,
      x: restX,
      y: restY,
      rotation: restRot,
      scale: 1.0,
      alpha: 1,
      duration: 120,
      ease: "Cubic.Out",
    });
    this.clearEmpoweredPreview(sprite);
  }

  /**
   * Whether the card at hand `index` is currently playable. Combines all the
   * reasons a click might be a no-op so the hover-fade and the play-guard
   * stay in sync.
   */
  private isCardPlayable(index: number): boolean {
    const card = this.state.hand[index];
    if (!card) return false;
    if (this.state.outcome !== "ongoing") return false;
    if (this.state.playsRemainingThisTurn + this.state.bonusActions <= 0) return false;
    if (card.effect.onceEachTurn && this.state.cardIdsPlayedThisTurn.includes(card.id)) return false;
    return true;
  }

  private onPlayCard(index: number) {
    if (!this.isCardPlayable(index)) return;
    const card = this.state.hand[index]!;

    // Capture the sprite BEFORE refresh() destroys it so we can animate it
    // to the central play pile.
    const playedSprite: Phaser.GameObjects.Container | undefined = this.handSprites[index];
    if (playedSprite) {
      this.handSprites.splice(index, 1);
    }
    if (this.handZones[index]) {
      this.handZones[index].destroy();
      this.handZones.splice(index, 1);
    }

    // Remove the card from hand. If it has returnToHand, push it back after
    // effects resolve — otherwise it goes to discard.
    this.state.hand.splice(index, 1);

    // Bonus is consumed first — player sees fire pip vanish, then baseline.
    if (this.state.bonusActions > 0) {
      this.state.bonusActions -= 1;
    } else {
      this.state.playsRemainingThisTurn -= 1;
    }
    playCard(this.state, card, this.deckBeforeCombat);

    if (card.effect.returnToHand) {
      this.state.hand.push(card);
    } else {
      this.state.discardPile.push(card);
    }

    if (playedSprite) this.animateCardToPile(playedSprite, card);
    this.refresh();
    // Defer the auto-standby so any draw animation triggered by the card
    // effect has time to play out fully. Without this delay the
    // immediately-issued setHandMode("standby") kills the in-flight draw
    // tween via its killTweensOf loop, and the new card just sits on top
    // of the deck (the reported bug).
    //
    // 600 ms covers a 3-card draw at 320 ms tween + 180 ms stagger with
    // headroom; if the player has already manually re-activated the
    // hand by then (e.g. tapping to play another card), we honour that
    // and skip the dismiss.
    this.time.delayedCall(600, () => {
      if (this.state.outcome === "ongoing" && this.handMode === "active") {
        this.setHandMode("standby");
      }
    });
  }

  private onEndTurn() {
    if (this.state.outcome !== "ongoing") return;
    const run = this.game.registry.get(RUN_KEY) as RunState;

    // Tuck the hand away so the player can clearly see the enemy's play
    // and any status/HP effects landing.
    this.setHandMode("standby");

    // Capture the intent BEFORE the engine resolves it — endPlayerTurn
    // advances the intent pointer to next turn, and we want to animate
    // what was JUST played, not what's coming.
    const playedIntent = this.state.enemy.intent;
    const wasStunned = this.state.enemy.status.stun > 0;

    endPlayerTurn(this.state, this.enemy.pattern, run.baseActionsPerTurn, run.shieldCarryover, run);
    this.lastDisplayedCardsPlayed = 0; // turn just ended; reset combo memory
    this.refresh();

    if (playedIntent && !wasStunned && this.state.outcome === "ongoing") {
      this.animateEnemyPlay(playedIntent);
    }
  }

  /**
   * Render the action pips:
   *   slot count   = run.baseActionsPerTurn (always visible — filled or empty)
   *   bonus pips   = playsRemainingThisTurn - baselineSlots (when > 0, with
   *                  a fire-flicker animation; no slot — they're temporary)
   * Bonus is consumed before baseline visually (so the rightmost bonus pip
   * vanishes first when you play a card).
   */
  private refreshActionPips() {
    const run = this.game.registry.get(RUN_KEY) as RunState;
    const baseline = Math.max(1, run.baseActionsPerTurn);
    const filled = Math.max(0, Math.min(this.state.playsRemainingThisTurn, baseline));
    const empty = baseline - filled;
    const bonus = Math.max(0, this.state.bonusActions);

    // Tear down the previous pips and their tweens.
    this.pipTweens.forEach((t) => t.stop());
    this.pipTweens = [];
    this.pipObjects.forEach((p) => p.destroy());
    this.pipObjects = [];

    // Layout: pips evenly spaced, group centered on (actionsPipsCenterX, Y).
    const pipFontPx = 24;
    const spacing = 8;
    const totalPips = baseline + bonus;
    if (totalPips === 0) return;
    const cellW = pipFontPx + spacing;
    const groupW = totalPips * cellW - spacing;
    const startX = this.actionsPipsCenterX - groupW / 2 + pipFontPx / 2;
    const y = this.actionsPipsCenterY;

    // Filled baseline slots
    for (let i = 0; i < filled; i++) {
      const x = startX + i * cellW;
      const p = this.add.text(x, y, "◆", {
        fontFamily: "Lora", fontSize: `${pipFontPx}px`, color: S.amber,
      }).setOrigin(0.5).setDepth(2000);
      this.pipObjects.push(p);
    }
    // Empty baseline slots
    for (let i = 0; i < empty; i++) {
      const x = startX + (filled + i) * cellW;
      const p = this.add.text(x, y, "◇", {
        fontFamily: "Lora", fontSize: `${pipFontPx}px`, color: S.dim,
      }).setOrigin(0.5).setDepth(2000);
      this.pipObjects.push(p);
    }
    // Bonus pips — with fire flicker
    for (let i = 0; i < bonus; i++) {
      const x = startX + (baseline + i) * cellW;
      const p = this.add.text(x, y, "◆", {
        fontFamily: "Lora", fontSize: `${pipFontPx}px`, color: "#ff8c33",
        stroke: "#ffd27a", strokeThickness: 1,
      }).setOrigin(0.5).setDepth(2000);
      this.pipObjects.push(p);

      // Each bonus pip flickers on a slightly different phase so the row
      // looks like a row of candles rather than a synchronised metronome.
      const phaseOffset = i * 90;
      const t1 = this.tweens.add({
        targets: p,
        scale: { from: 1.0, to: 1.22 },
        yoyo: true,
        repeat: -1,
        duration: 360,
        delay: phaseOffset,
        ease: "Sine.InOut",
      });
      const t2 = this.tweens.add({
        targets: p,
        alpha: { from: 1.0, to: 0.78 },
        yoyo: true,
        repeat: -1,
        duration: 280,
        delay: phaseOffset + 30,
        ease: "Sine.InOut",
      });
      // Tiny vertical wobble — flame flickering up.
      const t3 = this.tweens.add({
        targets: p,
        y: { from: y, to: y - 2 },
        yoyo: true,
        repeat: -1,
        duration: 220,
        delay: phaseOffset + 50,
        ease: "Sine.InOut",
      });
      this.pipTweens.push(t1, t2, t3);
    }
  }

  /**
   * Spawn a left-side toast for a combat log line. Newest at the top of the
   * stack; existing toasts slide down to make room. Each auto-expires after
   * ~3.5s. The stack is capped at TOAST_MAX so a long combo doesn't fill the
   * screen — overflow ejects the oldest first.
   */
  private spawnToast(message: string) {
    const toastW = 260;
    const toastH = 32;
    const { width } = this.scale;
    const targetX = width - toastW - 20;
    const startX = width + 20; // slides in from the right edge
    const container = this.add.container(startX, CombatScene.TOAST_TOP_Y).setDepth(CombatScene.TOAST_DEPTH);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRoundedRect(0, -toastH / 2, toastW, toastH, 6);
    bg.lineStyle(2, C.amber, 0.55);
    bg.strokeRoundedRect(0, -toastH / 2, toastW, toastH, 6);
    container.add(bg);

    const text = this.add.text(toastW / 2, 0, message, {
      fontFamily: "Lora", fontSize: "12px", color: S.parchHi,
      align: "center", wordWrap: { width: toastW - 16 },
    }).setOrigin(0.5);
    container.add(text);

    this.toasts.unshift(container);
    // Reposition every active toast to its current slot.
    this.toasts.forEach((t, i) => {
      this.tweens.add({
        targets: t,
        y: CombatScene.TOAST_TOP_Y + i * CombatScene.TOAST_SLOT_H,
        duration: 220,
        ease: "Cubic.Out",
      });
    });
    // Slide the new toast in from off-screen left.
    this.tweens.add({
      targets: container,
      x: targetX,
      duration: 260,
      ease: "Cubic.Out",
    });
    // Auto-expire after ~3.5s.
    this.time.delayedCall(3500, () => this.removeToast(container));
    // Cap the stack — drop the oldest if we're over the limit.
    while (this.toasts.length > CombatScene.TOAST_MAX) {
      const oldest = this.toasts[this.toasts.length - 1];
      this.removeToast(oldest);
    }
  }

  private removeToast(container: Phaser.GameObjects.Container) {
    const idx = this.toasts.indexOf(container);
    if (idx === -1) return;
    this.toasts.splice(idx, 1);
    this.tweens.killTweensOf(container);
    this.tweens.add({
      targets: container,
      x: container.x - 80,
      alpha: 0,
      duration: 240,
      ease: "Cubic.In",
      onComplete: () => container.destroy(),
    });
    // Shift remaining toasts up to fill the gap.
    this.toasts.forEach((t, i) => {
      this.tweens.add({
        targets: t,
        y: CombatScene.TOAST_TOP_Y + i * CombatScene.TOAST_SLOT_H,
        duration: 220,
        ease: "Cubic.Out",
      });
    });
  }

  /**
   * Open a left-side log panel that slides in from off-screen. Doesn't take
   * the whole viewport — just enough room for the log lines, with a clear
   * separator between each. Click the dim backdrop to dismiss.
   */
  private openLogHistory() {
    const { width, height } = this.scale;
    const baseDepth = 9000;

    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0)
      .setOrigin(0, 0).setInteractive().setDepth(baseDepth);
    this.tweens.add({ targets: dim, fillAlpha: 0.6, duration: 160 });

    // Left-aligned narrow panel — wide enough for full-sentence log lines.
    const panelW = 380;
    const panelTop = 60;
    const panelBottom = height - 60;
    const panelH = panelBottom - panelTop;
    const restX = 20;
    const startX = -panelW - 20;

    // Wrap all panel content in a container so we slide one thing in.
    const panel = this.add.container(startX, 0).setDepth(baseDepth + 1);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.82);
    bg.fillRoundedRect(0, panelTop, panelW, panelH, 10);
    bg.lineStyle(2, C.amber, 0.85);
    bg.strokeRoundedRect(0, panelTop, panelW, panelH, 10);
    panel.add(bg);

    panel.add(this.add.text(panelW / 2, panelTop + 22, "Combat Log", {
      fontFamily: "Lora", fontSize: "18px", color: S.amber,
    }).setOrigin(0.5));

    panel.add(this.add.text(panelW / 2, panelBottom - 18, "Click anywhere to close", {
      fontFamily: "Lora", fontSize: "11px", color: S.dim, fontStyle: "italic",
    }).setOrigin(0.5));

    // Render each log line as its own row with a faint separator below.
    // Latest at the bottom (closest to recent events). Older entries scroll
    // off the top if there are too many; this keeps things simple.
    const rowH = 24;
    const innerTop = panelTop + 48;
    const innerBottom = panelBottom - 36;
    const maxRows = Math.floor((innerBottom - innerTop) / rowH);
    const lines = this.state.log.slice(-maxRows);
    lines.forEach((line, i) => {
      const y = innerTop + i * rowH + rowH / 2;
      const row = this.add.text(16, y, line, {
        fontFamily: "Lora", fontSize: "12px", color: S.parchHi,
        wordWrap: { width: panelW - 32 },
      }).setOrigin(0, 0.5);
      panel.add(row);
      // Separator under each row except the last one.
      if (i < lines.length - 1) {
        const sep = this.add.graphics();
        sep.lineStyle(1, C.amber, 0.25);
        sep.lineBetween(16, y + rowH / 2 - 2, panelW - 16, y + rowH / 2 - 2);
        panel.add(sep);
      }
    });

    this.tweens.add({
      targets: panel, x: restX,
      duration: 280, ease: "Cubic.Out",
    });

    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      dim.disableInteractive();
      this.tweens.add({
        targets: panel, x: startX,
        duration: 180, ease: "Cubic.In",
        onComplete: () => panel.destroy(),
      });
      this.tweens.add({
        targets: dim, fillAlpha: 0,
        duration: 180, onComplete: () => dim.destroy(),
      });
    };
    dim.on("pointerdown", close);
  }

  private flashCombo(count: number) {
    // Color & intensity scale with the chain length.
    const tier = Math.min(4, count - 1); // 1..4
    const color =
      tier === 1 ? S.amber :
      tier === 2 ? "#f5cb6d" :
      tier === 3 ? "#e8b94f" :
      "#c23a3a"; // 5+ chain — feral
    const punctuation = tier <= 1 ? "!" : tier === 2 ? "!!" : "!!!";
    const text =
      count <= 4 ? `Combo ×${count}${punctuation}`
                 : `MASSIVE COMBO ×${count}${punctuation}`;

    this.comboText
      .setText(text)
      .setColor(color)
      .setAlpha(0)
      .setScale(0.6);

    this.tweens.add({
      targets: this.comboText,
      alpha: { from: 0, to: 1 },
      scale: { from: 0.6, to: 1.15 },
      duration: 120,
      ease: "Back.Out",
      onComplete: () => {
        this.tweens.add({
          targets: this.comboText,
          scale: 1.0,
          duration: 100,
        });
        this.tweens.add({
          targets: this.comboText,
          alpha: 0,
          duration: 350,
          delay: 700,
        });
      },
    });
  }

  /**
   * Combo payoff — "Arcane Surge". Quick, splashy, and a small real
   * advantage: the summoning sigil flares, the screen pulses gold, and the
   * player is refunded one action so a hot streak can keep going. Fires every
   * time the chain crosses a multiple of 4 (4, 8, 12 …) — see the caller in
   * refresh().
   */
  private triggerComboSurge() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Mechanical reward: refund an action this turn, then repaint the pips.
    this.state.bonusActions += 1;
    this.state.log.push("✦ Arcane Surge! +1 action.");
    this.refreshActionPips();

    // Two expanding shockwave rings from the sigil centre.
    const makeRing = (col: number, w: number, toScale: number, dur: number, delay: number) => {
      const ring = this.add.graphics().setDepth(950);
      ring.lineStyle(w, col, 1).strokeCircle(0, 0, 18);
      ring.setPosition(cx, cy).setScale(0.3).setAlpha(0.95);
      this.tweens.add({
        targets: ring, scale: toScale, alpha: 0, duration: dur, delay,
        ease: "Cubic.Out", onComplete: () => ring.destroy(),
      });
    };
    makeRing(0xf5cb6d, 5, 7, 480, 0);
    makeRing(0xe2a93e, 3, 5, 440, 90);

    // Brief warm screen pulse.
    const flash = this.add.rectangle(cx, cy, width, height, 0xf5cb6d, 0).setDepth(949);
    this.tweens.add({
      targets: flash, alpha: { from: 0.18, to: 0 }, duration: 300,
      onComplete: () => flash.destroy(),
    });

    // Floating gold callout.
    const label = this.add.text(cx, cy - 40, "✦ ARCANE SURGE ✦\n+1 action", {
      fontFamily: "Lora", fontSize: "22px", color: "#f5cb6d", align: "center",
      fontStyle: "bold", stroke: "#3a1d04", strokeThickness: 4,
    }).setOrigin(0.5).setDepth(951).setAlpha(0).setScale(0.6);
    this.tweens.add({
      targets: label, alpha: 1, scale: 1.1, y: cy - 56, duration: 170, ease: "Back.Out",
      onComplete: () => this.tweens.add({
        targets: label, alpha: 0, y: cy - 84, duration: 380, delay: 420,
        onComplete: () => label.destroy(),
      }),
    });

    // A small impact kick.
    this.cameras.main.shake(120, 0.004);
  }

  /**
   * Enemy-falls beat: gives the killing blow room to land. Lets the played
   * card finish travelling to the pile, then collapses the enemy hand,
   * red-flashes + shrinks the HP text, and fades the rest. Calls
   * handleOutcome() once the choreography is done, which pauses Combat and
   * launches the Victory summary over the frozen tableau.
   */
  private playEnemyDefeatThenOutcome() {
    // 1. Wait for the player's last card to arrive at the pile (animateCardToPile
    //    runs ~320ms; a small pad ensures it visually rests there first).
    this.time.delayedCall(360, () => {
      // 2. HP number flash + scale + fade (the "killing blow" register).
      this.tweens.killTweensOf(this.enemyHpNumber);
      this.enemyHpNumber.setColor(S.bloodHi);
      this.tweens.add({
        targets: [this.enemyHpNumber, this.enemyNameText],
        scale: 1.6,
        alpha: 0,
        duration: 620,
        ease: "Cubic.In",
      });
      // Adjacent enemy chrome fades out so the area "empties out".
      this.tweens.add({
        targets: [this.enemyShieldBadge],
        alpha: 0,
        duration: 320,
      });
      // 3. Drop the enemy hand cards — staggered fall + rotation + fade.
      this.enemyHandSprites.forEach((sprite, i) => {
        const spin = (i % 2 === 0 ? -1 : 1) * (0.4 + Math.random() * 0.4);
        this.tweens.add({
          targets: sprite,
          y: sprite.y + 260,
          rotation: sprite.rotation + spin,
          alpha: 0,
          duration: 720,
          delay: i * 55,
          ease: "Cubic.In",
        });
      });
      // 4. Hand the result off to the Victory screen.
      this.time.delayedCall(780, () => this.handleOutcome());
    });
  }

  /**
   * Mortimer-falls beat — symmetric to playEnemyDefeatThenOutcome, but the
   * choreography reflects the wizard going down rather than the enemy
   * collapsing: HP flashes blood and shrinks to nothing, his shield + status
   * fade, his hand falls out of his grasp (staggered, spinning, fading), the
   * portrait dims so the amber "eyes" go out, the name fades, and the
   * camera takes a single blood-red flash before tipping toward black. Once
   * the choreography lands, handleOutcome() routes to the GameOver scene.
   */
  private playPlayerDefeatThenOutcome() {
    // 1. Pad so the killing blow (enemy's attack animation) visually resolves
    //    before the death beat begins.
    this.time.delayedCall(360, () => {
      // 2. HP number — blood flash, scale up, fade away (the "killing blow"
      //    register, mirroring the enemy beat exactly).
      this.tweens.killTweensOf(this.playerHpNumber);
      this.playerHpNumber.setColor(S.bloodHi);
      this.tweens.add({
        targets: this.playerHpNumber,
        scale: 1.6,
        alpha: 0,
        duration: 620,
        ease: "Cubic.In",
      });
      // 3. Shield fade. Empowered badge too if it's been drawn.
      this.tweens.add({
        targets: [this.playerShieldBadge],
        alpha: 0,
        duration: 320,
      });
      // 4. Player hand — staggered fall + spin + fade, exact mirror of the
      //    enemy-hand collapse. Mortimer's grip loosens, his cards scatter.
      this.handSprites.forEach((sprite, i) => {
        const spin = (i % 2 === 0 ? -1 : 1) * (0.4 + Math.random() * 0.4);
        this.tweens.add({
          targets: sprite,
          y: sprite.y + 260,
          rotation: sprite.rotation + spin,
          alpha: 0,
          duration: 720,
          delay: i * 55,
          ease: "Cubic.In",
        });
      });
      // 5. The amber eyes go out: dim the portrait graphics to near-black so
      //    the two glowing dots fade into the ink-fill backplate.
      this.tweens.add({
        targets: this.playerPortraitG,
        alpha: 0.25,
        duration: 760,
        ease: "Cubic.In",
      });
      if (this.playerNameText) {
        this.tweens.add({
          targets: this.playerNameText,
          alpha: 0,
          duration: 760,
          ease: "Cubic.In",
        });
      }
      // 6. Camera punch — single blood flash, then a slow tip toward black so
      //    the scene transition into GameOver feels like Mortimer losing
      //    consciousness. Phaser's flash() is `(duration, r, g, b, force)`.
      this.cameras.main.flash(140, 139, 29, 34, true);
      this.tweens.add({
        targets: this.cameras.main,
        alpha: 0.3,
        duration: 820,
        delay: 140,
        ease: "Cubic.In",
      });
      // 7. Hand off to GameOver once the choreography lands.
      this.time.delayedCall(960, () => this.handleOutcome());
    });
  }

  private handleOutcome() {
    const run = this.game.registry.get(RUN_KEY) as RunState;
    if (this.state.outcome === "won") {
      run.hp = this.state.player.hp;
      const data = this.scene.settings.data as CombatInit;
      // Award gold (tutorial gets a smaller token amount; non-tutorial varies)
      const gold = data?.isTutorial ? 0 : (10 + Math.floor(Math.random() * 6));
      if (gold > 0) run.gold += gold;
      // Post-battle heal:
      //   - combat: +8 HP capped at max
      //   - elite:  full heal to max (the elite is the rewarded path; players
      //     who brave it should enter the boss room healthy enough to actually
      //     use the second hero skill they earn there)
      //   - boss / tutorial: skipped (boss heals are handled by the next floor;
      //     tutorial is its own narrative beat)
      const nodeKind = data?.nodeKind ?? "combat";
      let healed = 0;
      if (!data?.isTutorial && nodeKind !== "boss") {
        const before = run.hp;
        run.hp = nodeKind === "elite"
          ? run.maxHp
          : Math.min(run.maxHp, run.hp + 8);
        healed = run.hp - before;
      }
      // Crystal shards — meta-progression currency. Drip-fed to keep the
      // shop's first purchase a few runs away. Regular combat: 25% chance
      // of 1; elite: 1 guaranteed; boss: 2.
      let shards = 0;
      if (!data?.isTutorial) {
        if (nodeKind === "boss") shards = 2;
        else if (nodeKind === "elite") shards = 1;
        else if (Math.random() < 0.25) shards = 1;
      }
      if (shards > 0) addShards(shards);
      // Every win — tutorial or not — goes through the summary screen.
      // Launch (not start) so Combat stays rendered underneath as a frozen
      // tableau — the summary fades in over it instead of clunking in.
      this.scene.pause();
      this.scene.launch("BattleSummary", {
        stats: this.state.stats,
        enemyName: this.enemy.name,
        gold,
        healed,
        shards,
        isTutorial: data?.isTutorial,
        nodeKind,
      });
    } else if (this.state.outcome === "lost") {
      this.scene.start("GameOver");
    }
  }
}


