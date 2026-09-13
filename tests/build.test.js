const test = require("node:test");
const assert = require("node:assert/strict");
const Weapons = require("../weapons.js");
const RunBuild = require("../build.js");

const close = (actual, expected, tolerance = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected}`);
const state = stacks => RunBuild.createBuildState(stacks);

test("new Build has one zero stack entry for every formal Upgrade", () => {
  assert.deepEqual(state(), { upgradeStacks: {
    "rapid-fire": 0, "heavy-shot": 0, "split-shot": 0, vitality: 0, "swift-feet": 0
  } });
  assert.deepEqual(RunBuild.UPGRADE_LIST.map(upgrade => [upgrade.id, upgrade.maxStacks]), [
    ["rapid-fire", 4], ["heavy-shot", 4], ["split-shot", 2], ["vitality", 3], ["swift-feet", 4]
  ]);
  assert.equal(Object.isFrozen(RunBuild.UPGRADES), true);
  assert.equal(Object.isFrozen(RunBuild.UPGRADES["split-shot"].effects.damageMultipliers), true);
  assert.equal(Object.isFrozen(RunBuild.PLAYER_BASE_STATS), true);
});

test("Starter resolves to Damage 2, Fire Rate 4, and one projectile", () => {
  const resolved = RunBuild.resolveWeaponStats(Weapons.STARTER, state());
  assert.equal(resolved.damage, 2);
  assert.equal(resolved.fireRate, 4);
  assert.equal(resolved.projectileCount, 1);
  assert.equal(resolved.bulletSpeed, 480);
  assert.equal(resolved.bulletSize, 10);
  assert.equal(resolved.spreadDegrees, 0);
  assert.equal(resolved.pierce, 0);
});

test("Rapid Fire multiplies Fire Rate by 1.20 per stack", () => {
  close(RunBuild.resolveWeaponStats(Weapons.STARTER,
    state({ "rapid-fire": 1 })).fireRate, 4 * 1.2);
  close(RunBuild.resolveWeaponStats(Weapons.STARTER,
    state({ "rapid-fire": 3 })).fireRate, 4 * 1.2 ** 3);
});

test("Heavy Shot adds Damage and bullet size and multiplies Fire Rate by 0.92", () => {
  const resolved = RunBuild.resolveWeaponStats(Weapons.STARTER, state({ "heavy-shot": 2 }));
  assert.equal(resolved.damage, 4);
  assert.equal(resolved.bulletSize, 12);
  close(resolved.fireRate, 4 * 0.92 ** 2);
});

test("Rapid Fire and Heavy Shot Fire Rate modifiers combine multiplicatively", () => {
  const resolved = RunBuild.resolveWeaponStats(Weapons.STARTER,
    state({ "rapid-fire": 1, "heavy-shot": 1 }));
  close(resolved.fireRate, 4 * 1.2 * 0.92);
  close(resolved.fireRate, 4.416);
});

test("resolved Fire Rate is clamped to the centralized technical cap", () => {
  const overclockedBase = { ...Weapons.STARTER, fireRate: 20 };
  assert.equal(RunBuild.resolveWeaponStats(overclockedBase, state({ "rapid-fire": 4 })).fireRate, 12);
});

test("Split Shot stack one creates two projectiles at 0.75 damage", () => {
  const resolved = RunBuild.resolveWeaponStats(Weapons.STARTER, state({ "split-shot": 1 }));
  assert.equal(resolved.projectileCount, 2);
  assert.equal(resolved.spreadDegrees, 12);
  assert.equal(resolved.damage, 1.5);
});

test("Split Shot stack two creates three projectiles at 0.65 damage", () => {
  const resolved = RunBuild.resolveWeaponStats(Weapons.STARTER, state({ "split-shot": 2 }));
  assert.equal(resolved.projectileCount, 3);
  assert.equal(resolved.spreadDegrees, 12);
  assert.equal(resolved.damage, 1.3);
});

test("Heavy Shot additive damage resolves before Split Shot multiplier", () => {
  const resolved = RunBuild.resolveWeaponStats(Weapons.STARTER,
    state({ "heavy-shot": 2, "split-shot": 1 }));
  assert.equal(resolved.damage, 3);
  assert.equal(resolved.projectileCount, 2);
});

test("Swift Feet multiplies base speed by 1.08 per stack", () => {
  const resolved = RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS,
    state({ "swift-feet": 3 }));
  close(resolved.speed, 240 * 1.08 ** 3);
  assert.equal(resolved.maxHp, 5);
});

test("Vitality adds one max HP per stack", () => {
  const resolved = RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS,
    state({ vitality: 3 }));
  assert.equal(resolved.maxHp, 8);
  assert.equal(resolved.speed, 240);
});

test("resolution does not mutate Weapon, Player, Build, or immutable definitions", () => {
  const weapon = { ...Weapons.STARTER };
  const player = { ...RunBuild.PLAYER_BASE_STATS, width: 40 };
  const build = state({ "rapid-fire": 2, "heavy-shot": 2, "split-shot": 1,
    vitality: 1, "swift-feet": 1 });
  const before = JSON.parse(JSON.stringify({ weapon, player, build }));
  RunBuild.resolveWeaponStats(weapon, build);
  RunBuild.resolvePlayerStats(player, build);
  assert.deepEqual({ weapon, player, build }, before);
  assert.equal(Weapons.STARTER.damage, 2);
  assert.equal(RunBuild.PLAYER_BASE_STATS.speed, 240);
});

test("choice generation returns three unique equally eligible Upgrades", () => {
  const choices = RunBuild.generateUpgradeChoices(state(), 3, () => 0);
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices.map(choice => choice.id)).size, 3);
  assert.deepEqual(choices.map(choice => choice.id), ["rapid-fire", "heavy-shot", "split-shot"]);
});

test("choice generation is deterministic with injected RNG", () => {
  const make = () => Weapons.createSeededRng(8675309);
  const first = RunBuild.generateUpgradeChoices(state(), 3, make()).map(choice => choice.id);
  const second = RunBuild.generateUpgradeChoices(state(), 3, make()).map(choice => choice.id);
  assert.deepEqual(first, second);
});

test("maxed Upgrades are excluded and fewer than three returns every eligible Upgrade", () => {
  const nearlyMaxed = state({
    "rapid-fire": 4, "heavy-shot": 4, "split-shot": 2, vitality: 3, "swift-feet": 3
  });
  const choices = RunBuild.generateUpgradeChoices(nearlyMaxed, 3, () => {
    throw new Error("RNG is unnecessary when all eligible choices fit");
  });
  assert.deepEqual(choices.map(choice => choice.id), ["swift-feet"]);
  assert.equal(RunBuild.canSelectUpgrade(nearlyMaxed, "rapid-fire"), false);
  assert.equal(RunBuild.canSelectUpgrade(nearlyMaxed, "swift-feet"), true);
});

test("all-maxed Build returns no choices without consulting RNG", () => {
  const maxed = state({
    "rapid-fire": 4, "heavy-shot": 4, "split-shot": 2, vitality: 3, "swift-feet": 4
  });
  assert.deepEqual(RunBuild.generateUpgradeChoices(maxed, 3, () => {
    throw new Error("all-maxed choice generation must not call RNG");
  }), []);
});

test("Upgrade application is pure and cannot exceed maxStacks", () => {
  const before = state({ "rapid-fire": 3 });
  const applied = RunBuild.applyUpgrade(before, "rapid-fire");
  assert.equal(applied.applied, true);
  assert.equal(applied.buildState.upgradeStacks["rapid-fire"], 4);
  assert.equal(before.upgradeStacks["rapid-fire"], 3);
  const blocked = RunBuild.applyUpgrade(applied.buildState, "rapid-fire");
  assert.equal(blocked.applied, false);
  assert.equal(blocked.buildState.upgradeStacks["rapid-fire"], 4);
  assert.notEqual(blocked.buildState, applied.buildState);
});

test("Vitality heals exactly one HP and caps at newly resolved max HP", () => {
  const hurt = RunBuild.applyUpgrade(state(), "vitality", { playerHp: 2 });
  assert.equal(hurt.playerHp, 3);
  assert.equal(RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, hurt.buildState).maxHp, 6);
  const full = RunBuild.applyUpgrade(state(), "vitality", { playerHp: 5 });
  assert.equal(full.playerHp, 6);
  const capped = RunBuild.applyUpgrade(state(), "vitality", { playerHp: 6 });
  assert.equal(capped.playerHp, 6);
});

test("Swift Feet selection never changes base Player speed", () => {
  const before = { ...RunBuild.PLAYER_BASE_STATS };
  const applied = RunBuild.applyUpgrade(state(), "swift-feet", { playerHp: 5 });
  assert.equal(applied.applied, true);
  close(RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, applied.buildState).speed, 259.2);
  assert.deepEqual(RunBuild.PLAYER_BASE_STATS, before);
});

test("Heavy Shot selection never changes the Starter Weapon definition", () => {
  const before = { ...Weapons.STARTER };
  const applied = RunBuild.applyUpgrade(state(), "heavy-shot");
  assert.equal(RunBuild.resolveWeaponStats(Weapons.STARTER, applied.buildState).damage, 3);
  assert.deepEqual(Weapons.STARTER, before);
});

test("Weapon compatibility excludes nonsensical Split Shot interpretations", () => {
  const arc = Weapons.DEFINITIONS["arc-blade"];
  const launcher = Weapons.DEFINITIONS.launcher;
  assert.equal(RunBuild.isUpgradeCompatible(arc, "split-shot"), false);
  assert.equal(RunBuild.isUpgradeCompatible(launcher, "split-shot"), false);
  assert.equal(RunBuild.isUpgradeCompatible(arc, "heavy-shot"), true);
  assert.equal(RunBuild.isUpgradeCompatible(arc, "vitality"), true);
  const arcChoices = RunBuild.generateUpgradeChoices(state({ "rapid-fire": 4, "heavy-shot": 4 }), 3, () => 0, arc);
  assert.deepEqual(arcChoices.map(choice => choice.id), ["vitality", "swift-feet"]);
  assert.equal(RunBuild.applyUpgrade(state(), "split-shot", { baseWeapon: arc }).applied, false);
});
