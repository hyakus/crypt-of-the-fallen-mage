# Crypt of the Fallen Mage — Game Design Document

> Working title. Subtitle option: *"A Wizard's Reclamation"*.

## 1. Premise

You play **Mortimer Vex**, a court wizard who was slain while defending the King against **Gorgonzola the Unspoken**. Gorgonzola has dumped your decaying corpse in the castle's lowest dungeon to rot.

You wake — half-dead, half-something-else — in the crypt. A **Goddess** appears in a dream, hands you a starter deck of half-remembered spells and steel, and says:

> *"Fight me with this deck. Win, and you may yet drag yourself back to the material world. Lose, and the worms have you."*

The dream is the **tutorial fight**. From there, the player climbs out of the dungeon, level by level, until they face Gorgonzola.

## 2. Core loop

```
┌─ MAP ─────────────────────────┐
│  Choose next node on the path │ ──▶ COMBAT / SHOP / FORGE / GRAVE
└───────────────────────────────┘                   │
              ▲                                     │
              └───── reward (card / gold / heal) ◀──┘
```

A **run** is one attempt from dungeon floor 1 to the final boss. Death sends you back to the menu (rogue-lite — meta-unlocks persist, the run itself does not).

## 3. The game board (map phase)

- Each **floor** is a node graph with branching paths, drawn vertically. The player's piece advances upward.
- **4 encounters before the boss** (3 normal + boss). Between normal encounters, **side nodes** appear that the player picks on their chosen path.
- Node types:
  - **Combat** (skull icon) — standard fight, reward = pick 1 of 3 cards (weighted by rarity)
  - **Elite Combat** (red skull) — harder fight, better reward (rare-weighted)
  - **Shop** (coin icon) — spend gold on 3 random cards (each one-off, sold out after purchase) + a "destroy card" service for gold
  - **Grave / Destroy** (urn icon) — destroy 1 card from your deck, free
  - **Forge / Fuse** (anvil icon) — fuse 2 compatible cards into a fusion card (see §6)
  - **Shrine** (candle icon) — small heal + minor blessing (e.g. +1 max life-gem)
  - **Boss** (crown icon) — gates the next floor; reward includes a chance at your class's **super-power card**

- 3 floors total in v1. Each floor visually escalates: *Dungeon → Castle Halls → Throne Room*. Final boss is Gorgonzola on floor 3.

## 4. Combat

### Setup
- Player and enemy each have **Life Gems** (HP, displayed as red gems). Reach 0 = die.
- Player starts a run with a **5-card starter deck** (one of each class's "scrap" basic, themed as half-remembered).
- At the start of every combat: the deck is shuffled. You draw **2 cards** for your opening hand.

### Turn structure
- Player turn: draw **1** card, then play **1** card per turn (most actions are a single card). Some cards have effects like *"play another card this turn"*.
- Enemy turn: enemy follows simple AI patterns (telegraphed intent shown above their portrait: sword icon = attack, shield = defend).
- When your **deck is empty and you cannot draw**, you **skip your turn** — and your discard pile shuffles back into a fresh deck. This means thin decks cycle their power cards faster but you also pay a turn for it.

### Card structure
Every card has:
- `id`, `name`, `class` (sorcerer / warrior / barbarian / battlemage / fusion), `rarity` (basic / rare / super / starter / fusion)
- `kind`: `attack` | `defend` | `utility`
- `attack` value, `defend` value, plus an `effect` (status, draw, regen, ignite, freeze, etc.)
- `synergy`: an optional bonus that depends on **how many cards of class X are in your current deck**

### Numbers (v1 baseline)
- Player starting HP: **30 gems**
- Floor 1 normal enemies: **18–22 HP**, hit for **2–4** / turn
- Elite floor 1: **35 HP**, hits **3–6**
- Floor 1 boss: **60 HP**
- Card costs: **no mana system in v1** — pacing comes from "1 card per turn" plus cards that grant extra plays.

## 5. The four classes (archetypes)

Synergies trigger on **count of cards of that class in the player's deck**. Mixing classes is allowed, but mono-class runs are rewarded.

| Class | Identity | Plays like |
|---|---|---|
| **Sorcerer** | Glass cannon. Spells, status effects, draw. | Combo-y, scales with class count. |
| **Warrior** | Steady. Reliable damage + shields. | Forgiving baseline. |
| **Barbarian** | High risk / high reward. Self-damage for spikes. | Snowballs hard. |
| **Battle Mage** | Hybrid attack+defend on the same card. | Tempo / flexible. |

Each class has:
- **11 Basic cards** (common reward pool)
- **11 Rare cards** (boss + elite + shop weighted)
- **1 Super-Power card** — unlocked by beating the floor boss; the *class with the most cards in your deck* at that moment is the one you get a super-power from. Super-power cards are run-defining and stay with you for the run.

Full card list: see [CARDS.md](CARDS.md).

## 6. Card fusions

Inspired by Vampire Survivors weapon evolutions. **Predefined** combos only — no procedural mashing.

At a **Forge node**, the player is offered any fusion they currently qualify for. Fusing consumes the 2 ingredient cards from the deck and adds the resulting **fusion card** instead.

Examples in v1 (full list in CARDS.md):
- *Fireball* + *Sword Stance* → **Inferno Blade** (5 dmg, applies Burn 2)
- *Block* + *Mage Armor* → **Aegis Bulwark** (8 shield, regen 1 next turn)
- *Wild Swing* + *Magic Missile* → **Arcane Berserker** (5 dmg + 1 per Barbarian or Sorcerer card)
- *Frost Bolt* + *Flame Sword* → **Tempered Frostflame** (3 dmg, freeze + burn)
- *Chain Lightning* + *Whirlwind* → **Storm Whirl** (3 dmg twice, chains once)
- *Recover* + *Mage Armor* → **Sanctified Ward** (5 shield, heal 3)

20 fusions planned, expandable.

## 7. Status effects (vocabulary)

- **Burn N** — at start of target's turn, take N damage. Decrements by 1 per turn.
- **Freeze N** — target skips next card draw for N turns.
- **Stun 1** — target skips one whole turn.
- **Bleed N** — N damage when target plays an attack card.
- **Regen N** — heal N at start of turn for N turns.
- **Rune** — buff token; next card +1 of its dominant stat.
- **Empowered N** — +N damage on next attack card.

## 8. Economy

- **Gold** — earned from combat (~5–10) and elites (~15–25), spent at shops.
- **Card removal** — free once per floor at a Grave node, paid at shops (escalating cost).
- **Heals** — Shrine restores ~25% max HP. Stacked heals get expensive at shops.

## 9. Meta-progression (rogue-lite layer)

Between runs, you keep:
- **Discovered cards** (logged in a journal — flavor / gallery only at first)
- **Defeated bosses** — each boss kill unlocks 1 alternate starter deck (e.g. "Veteran Warrior" deck after beating floor 1 boss)
- **Super-power cards** are *not* permanently unlocked — they remain "discover them by leaning into a class" each run, which is the whole point of the deck-archetype identity.

## 10. Visual identity

Tone: **dark fantasy**, **swords and sorcery**, **candle-lit**.

- Palette: parchment cream, candle-amber, dried blood red, blue ghost-fire, deep crypt purple/black.
- Cards drawn like **illuminated manuscript pages** — bordered, with the suit/class as an illuminated initial in the corner.
- Map drawn like a **hand-inked dungeon map** on parchment. Player piece = a small skull-and-candle icon.
- HUD: **wooden frames + iron rivets**. Life Gems are red rubies in a brass setting.
- Enemy art: silhouettes with glowing eyes against parchment background. Bosses are larger, painted-style.
- Audio (post-v1): low strings, distant bells, dry parchment page-turns for UI sfx.

### Asset plan
- **v1 (this scaffold):** SVG/code-drawn placeholder shapes (already wired up) — keeps the loop runnable without any external art dependency.
- **v2:** Free CC0 fantasy card art (Game-Icons.net for class icons, Public-Domain illuminated manuscript scans for borders) → swap into `public/art/`.
- **v3:** Commissioned or AI-generated bespoke art per card, dropped into the same asset slots without code changes.

## 11. Tech notes

- **Engine:** Phaser 3 (HTML5 / Canvas + WebGL).
- **Lang:** TypeScript, strict mode.
- **Bundler:** Vite (instant HMR on Mac).
- **Mobile wrapper:** Capacitor (Android target; iOS optional later).
- All card/fusion data is **pure data** (`src/data/*.ts`) so tuning is data-only, not code changes.

## 12. v1 scope checklist

- [x] Project scaffold
- [x] All 88 cards as data
- [x] Fusion recipes (20)
- [x] Game design doc
- [ ] Combat scene playable end-to-end (skeleton in place)
- [ ] Map scene playable (skeleton in place)
- [ ] Intro dream (tutorial fight scripted version of combat)
- [ ] Real art passes
- [ ] Audio
