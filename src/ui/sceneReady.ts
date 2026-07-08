import Phaser from "phaser";

/**
 * Scene input gating. Every scene calls `gateSceneInput(this)` at the very
 * top of `create()` — this disables the scene's input plugin, so NO listener
 * (hand zone, button, backdrop tap, hover, anything) fires until the scene
 * calls `markSceneReady(this)`.
 *
 * Why a scene-wide gate instead of per-handler `if (!ready) return;` guards:
 * per-handler guards work but every new interactive element is one more
 * place to remember the check — exactly the bug we hit in CombatScene's
 * opening (the hand's hit zones stayed live during the sigil/sweep/deal, so
 * a stray tap right after DreamScene's "tap to continue" landed on an
 * invisible card and dropped it onto a half-built board). One gate, one
 * release, impossible to forget per-handler.
 *
 * `markSceneReady` should be called from the onComplete of whatever
 * animation lands LAST in the scene's intro. For scenes with no intro, call
 * it at the end of `create()`.
 *
 * Phaser tears down a scene's time/input plugins on shutdown, so any
 * delayedCall holding markSceneReady won't fire after a transition — no
 * cross-scene leakage.
 */
export function gateSceneInput(scene: Phaser.Scene): void {
  scene.input.enabled = false;
}

export function markSceneReady(scene: Phaser.Scene): void {
  scene.input.enabled = true;
}

/**
 * Convenience: release input after a fixed delay. Use when the intro's
 * landing time is well-known and you don't want to thread the call through
 * a tween onComplete.
 */
export function markSceneReadyAfter(scene: Phaser.Scene, ms: number): void {
  scene.time.delayedCall(ms, () => markSceneReady(scene));
}
