const test = require("node:test");
const assert = require("node:assert/strict");
const Audio = require("../audio.js");

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}

class FakeNode { connect() {} }
class FakeGain extends FakeNode { constructor() { super(); this.gain = { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }; } }
class FakeOscillator extends FakeNode { constructor() { super(); this.frequency = {}; } start() {} stop() {} }
class FakeContext {
  constructor() { this.state = "suspended"; this.currentTime = 1; this.destination = {}; }
  createGain() { return new FakeGain(); }
  createOscillator() { return new FakeOscillator(); }
  createStereoPanner() { const node = new FakeNode(); node.pan = {}; return node; }
  async resume() { this.state = "running"; }
}

test("audio has no autoplay and unlock is gesture-driven", async () => {
  const manager = Audio.createAudioManager({ AudioContext: FakeContext, storage: storage() });
  assert.equal(manager.isUnlocked(), false);
  assert.equal(manager.play("playerFire"), false);
  assert.equal(await manager.unlock(), true);
  assert.equal(manager.play("playerFire"), true);
});

test("audio settings persist separately and master mute works", async () => {
  const store = storage();
  const manager = Audio.createAudioManager({ AudioContext: FakeContext, storage: store });
  await manager.unlock();
  manager.setSettings({ masterMuted: true, masterVolume: 0.4, sfxVolume: 0.3 });
  assert.equal(manager.play("victory"), false);
  assert.deepEqual(JSON.parse(store.values.get(Audio.SETTINGS_KEY)),
    { masterMuted: true, masterVolume: 0.4, sfxVolume: 0.3 });
  assert.notEqual(Audio.SETTINGS_KEY, "canva-war-save");
});

test("required cue mapping is complete and retrigger/concurrency suppress spam", async () => {
  const required = ["playerFire", "weaponHit", "enemyKill", "playerDamage", "levelUp", "waveComing",
    "enemyIntroduction", "bossIncoming", "death", "victory", "interceptorTelegraph", "interceptorCharge",
    "tankSlamTelegraph", "tankSlamImpact", "gunnerBurst", "artilleryWarning", "artilleryImpact", "denierCast",
    "supportLinkOn", "supportLinkOff", "trapperArm", "trapperTrigger", "tetherConnect", "tetherBreak"];
  assert.deepEqual(required.filter(name => !Audio.CUES[name]), []);
  const manager = Audio.createAudioManager({ AudioContext: FakeContext, storage: storage() });
  await manager.unlock();
  assert.equal(manager.play("weaponHit"), true);
  assert.equal(manager.play("weaponHit"), false);
});

test("world cue accepts camera-relative pan and UI cue remains non-spatial", async () => {
  const manager = Audio.createAudioManager({ AudioContext: FakeContext, storage: storage() });
  await manager.unlock();
  assert.equal(manager.play("gunnerBurst", { world: true, pan: -0.8 }), true);
  assert.equal(manager.play("levelUp"), true);
});

test("global voice priority preserves critical cues under low-priority saturation", async () => {
  const manager = Audio.createAudioManager({ AudioContext: FakeContext, storage: storage() });
  await manager.unlock();
  for (let index = 0; index < Audio.LIMITS.globalConcurrency; index++) {
    assert.equal(manager.play("playerFire", { concurrency: 20, retrigger: 0 }), true);
  }
  assert.equal(manager.play("playerFire", { concurrency: 20, retrigger: 0 }), false);
  assert.equal(manager.play("death"), true);
});
