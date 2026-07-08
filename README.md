# Crypt of the Fallen Mage

> A deck-building rogue-lite. A wizard wakes up dead. A goddess offers him four decks. He climbs.

**Status:** v0.2 — full game loop playable end-to-end with all major systems wired. Placeholder art (everything drawn from code), no audio yet.

## Quick start (Mac)

```sh
cd crypt-of-the-fallen-mage
npm install            # one-time
npm run dev            # opens http://localhost:5173
```

That's it — the game runs in your browser. Edit any `.ts` file and Vite hot-reloads.

Other scripts:

```sh
npm run typecheck      # strict TS check, no emit
npm run build          # production bundle in dist/
npm run preview        # serve the built dist/
```

## What's in the game

### Main menu

- **Continue Run** *(appears only if you have a saved run)* — picks up exactly where you left off
- **Begin a New Run** — full intro: Dream → Goddess speaks → class pick → tutorial fight → floor 1
- **Quick Run (skip dream)** — straight to class pick, then floor 1 (no tutorial fight)
- **Card Gallery** — browse all 126 cards filtered by class

A confirmation modal protects an existing save from being clobbered by mistake.

### Class selection

The Goddess offers four decks in the dream. Each builds a 5-card themed starter:

| Class | Plays like | Starter |
|---|---|---|
| **Sorcerer** | Spells, status effects, draw-card chains | Magic Missile, Mage Armor, Spark, Faint Bolt, Quickening |
| **Warrior** | Reliable damage + sturdy shields | Slash, Block, Iron Will, Stale Breath, Quickening |
| **Barbarian** | Risk/reward, snowballs hard | Rage Strike, Reckless Block, Frenzy, Rusted Slash, Quickening |
| **Battle Mage** | Hybrid — every card does a bit of both | Flame Sword, Mystic Armor, Spell Weapon, Tattered Ward, Quickening |

Every starter includes **Quickening** so you can experiment with action stacking from turn 1.

### Combat

- **Fanned hand** — cards arc on a circle, hover lifts and grows the focused card; static hit zones underneath so hovering never flickers regardless of card movement
- **Enemy hand** — face-down card fan at the top; visibly shrinks each turn as they play
- **Action economy** — baseline action *slots* (◆ filled / ◇ empty, always visible) plus **bonus actions** earned from `extraPlay` / `grantActions` cards (separate fire-flicker pips with their own animation; consumed before baseline)
- **Click the deck** to manually draw a card at the cost of 1 action
- **Play pile** in the centre — cards animate from your hand to the pile face-up, then the enemy's card-back flies from their hand and reveals face-up on top of it
- **Combo counter** pops in above the hand when you chain 2+ cards in one turn; scales / colour-shifts at higher chains; reads "MASSIVE COMBO ×5" past 4
- **Hero action buttons** on the left side of combat — one-per-fight abilities granted by perks (Draw 2 / Brace / Strike / Heal / Regen)
- **Status effects:** burn, freeze, stun, regen, empowered, reflect, counter, phoenix-revive
- **Card mechanics:** multi-hit, pierce-shield, synergy bonuses (scales with class count in deck), conditional bonuses (HP thresholds), **Sequence N** (bonus if this is your Nth-or-later card this turn), **Echo** (replays your last non-echo card)
- **Battle summary** after every win — damage dealt/taken, cards played, best combo, combos triggered, turns. Tutorial victory unlocks a 4-line Goddess monologue.

### Map

Branching node graph per floor. Pick your path:

| Node | What it is |
|---|---|
| **Combat** ⚔ | Standard fight; pick 1 of 3 cards as reward |
| **Elite** ☠ | Tougher fight; rare-weighted reward |
| **Shop** $ | Buy cards / pay to destroy a card |
| **Grave** ⚱ | Destroy a card from your deck (free once per floor) |
| **Forge** ⚒ | Fuse 2 cards into 1 of 21 predefined fusions |
| **Shrine** ✦ | Heal, or trade HP for max HP |
| **Boss** ♛ | Gates the next floor → Humanity perk pick |

3 floors total: **The Crypt → The Castle Halls → The Throne Room**. Beat Gorgonzola on floor 3 to win the run.

### Humanity perks (boss reward)

Beating a floor boss gives you a **smidge of humanity back** — pick 1 of 3 random perks (or skip). 13 perks in the pool:

**Passives**
- Hardened — +8 max HP, full heal
- Heavy Purse — +30 gold
- Wayshrines / Wandering Forge — +1 shrine / forge on the next floor
- Iron Skin — +3 shield at the start of every combat
- Quickening / Steady Hand / Disciplined — three flavour-variants of +1 ◆ baseline action per turn *(stacking gets dangerous; +3 baseline = 4 plays/turn at floor 3)*

**Hero actions** *(one-per-fight buttons in combat)*
- Second Wind — draw 2
- Brace — +5 shield
- Strike — deal 5 damage
- Steady Breath — heal 4
- Reclaim — gain Regen 2 (3 turns)

### Save / Resume

The full `RunState` is auto-saved to `localStorage` (key `crypt-fallen-mage:run-v1`) every time you enter the Map. So:

- Mid-combat refresh → loads back at the map *just before* you picked that node; you re-fight the encounter
- Mid-shop refresh → back to map (intentional anti-save-scum)
- Death or final-boss victory → save cleared

Saves are versioned; old/corrupt JSON gets discarded gracefully. Works fine in private-browsing modes (`localStorage` failures are caught, game just won't persist).

## Project layout

```
crypt-of-the-fallen-mage/
├── index.html                  # Vite entry point
├── src/
│   ├── main.ts                 # Phaser config + scene registration + text-resolution monkey-patch
│   ├── data/
│   │   ├── cards.ts            # 126 card definitions (5 starter / 88 standard + 8 action-econ / 4 super / 21 fusion)
│   │   ├── fusions.ts          # 21 fusion recipes
│   │   └── perks.ts            # Humanity perks + hero-action templates
│   ├── systems/
│   │   ├── CombatEngine.ts     # card resolution, statuses, sequence, echo, turn loop, stat tracking
│   │   ├── Deck.ts             # shuffle, count-by-class, dominant-class
│   │   ├── MapGen.ts           # node graph + perk-aware extras injection
│   │   ├── Enemies.ts          # enemy stat blocks per floor
│   │   └── RunState.ts         # RunState type, starter decks, save/load helpers
│   ├── scenes/
│   │   ├── BootScene.ts        ├── MainMenuScene.ts     ├── DreamScene.ts
│   │   ├── ClassSelectScene.ts ├── CombatScene.ts       ├── BattleSummaryScene.ts
│   │   ├── MapScene.ts         ├── RewardScene.ts       ├── HumanityScene.ts
│   │   ├── ShopScene.ts        ├── GraveScene.ts        ├── ForgeScene.ts
│   │   ├── ShrineScene.ts      ├── GameOverScene.ts     ├── VictoryScene.ts
│   │   └── GalleryScene.ts
│   ├── ui/
│   │   ├── palette.ts          # color & font tokens
│   │   └── CardSprite.ts       # face card / card-back / enemy-action-card renderers
│   └── types/                  # TS interfaces (Card, CombatState, RunState, HeroAction, Perk…)
├── docs/
│   ├── GDD.md                  # game design document (some sections drifted from the code; treat as design intent)
│   └── ART_NOTES.md            # placeholder-→-real-art roadmap
└── capacitor.config.ts         # Android wrapper config
```

## Run on Android

Requires Android Studio with the Android SDK installed.

```sh
npm run cap:add:android        # one-time: add android platform to the project
npm run cap:sync               # rebuild web + sync to android
npm run cap:open:android       # open in Android Studio
npm run android                # all-in-one: build + sync + run on a device/emulator
```

Capacitor wraps the same code that's running in your browser into a native Android WebView app — you don't write Android-specific code unless you want to.

## Tuning the game

Almost all gameplay tuning is **data-only** — change a number, hot-reload, play:

- **Card numbers & effects** → [src/data/cards.ts](src/data/cards.ts)
- **Fusion recipes** → [src/data/fusions.ts](src/data/fusions.ts)
- **Humanity perks & hero actions** → [src/data/perks.ts](src/data/perks.ts)
- **Enemy HP / patterns / hand size** → [src/systems/Enemies.ts](src/systems/Enemies.ts)
- **Map shape & node weights** → [src/systems/MapGen.ts](src/systems/MapGen.ts)
- **Starter decks per class / starting HP / gold** → [src/systems/RunState.ts](src/systems/RunState.ts)
- **Colors / fonts** → [src/ui/palette.ts](src/ui/palette.ts)

## What's NOT in yet (honest list)

- **Real art** — every visual is code-drawn (cards, card-backs, enemy action cards, decks, all UI). See [docs/ART_NOTES.md](docs/ART_NOTES.md) for the swap-in path when real assets land.
- **Audio** — no SFX, no music.
- **Mid-game draw / shuffle animations** — opening hands and clicked-deck draws are animated, but the auto-draw at turn end and the reshuffle-on-empty are instant.
- **Super-power cards** — defined in `cards.ts` but unreachable since boss rewards switched to Humanity perks. Available to be repurposed (alternate boss reward path, event payout, deck unlock, etc.).
- **A few card flavor effects are described but not enforced** — search for `special:` in `cards.ts` (e.g. Mind Steal weakening the enemy's next attack, "+1 per missing HP" scaling). Cards still play their base numbers; the flavour bonus is text-only.
- **Meta-progression between runs** — `RunState` only persists *within* a run. No achievements / unlock journal / alternate starter decks yet (planned in GDD §9).
- **Difficulty modes & seed sharing** — single difficulty, fresh RNG every run.

None of these block the loop being playable.

## Design doc

[docs/GDD.md](docs/GDD.md) has the original pitch: tone, classes, synergies, fusion design, balance numbers, visual direction. **Treat it as intent**, not spec — several mechanics evolved during implementation (super cards became Humanity perks, action economy gained slot pips + bonus fire pips, save/resume was added, etc.).

## Architectural notes (for the curious)

- **Engine choice** — Phaser 3 + TypeScript + Vite + Capacitor. See [docs/GDD.md §11](docs/GDD.md) for the rationale (Mac in-browser dev, Capacitor wraps to Android with no code changes, card-heavy UI suits HTML5).
- **Text rendering** — `main.ts` monkey-patches `GameObjectFactory.prototype.text` to apply `setResolution(max(4, DPR × 2))` to every Text object. Combined with `image-rendering: auto` on the canvas, this keeps text crisp through FIT-scaling + hover-scale + DPR scaling.
- **Hover hit detection** — hand cards use invisible static `Zone`s at rest positions for input, decoupled from the animating sprite. Eliminates the lift-out-of-cursor flicker entirely.
- **Action economy** — `playsRemainingThisTurn` (baseline) and `bonusActions` are tracked separately on `CombatState`. Bonus is consumed before baseline so playing a `+1 action` card produces a visible fire pip you then spend, instead of just refilling baseline.
- **Pile reveals** — enemy plays animate a card-back from their hand to the pile, then swap to a face-up `EnemyActionCard` on arrival. Player plays animate the actual hand-card sprite to the pile (preserving the same card visual rather than creating a new one).
