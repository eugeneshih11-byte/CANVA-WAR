const test = require("node:test");
const assert = require("node:assert/strict");
const Weapons = require("../weapons.js");
const RunBuild = require("../build.js");
const Continuous = require("../continuous-encounter.js");

const close = (actual, expected, tolerance = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected}`);
const state = source => RunBuild.createBuildState(source);
const loadout = ["starter", "arc-blade"];

test("new Build uses the formal Run-owned state model", () => {
  assert.deepEqual(state(), {
    sharedUpgrades: { "rapid-fire": 0, "heavy-shot": 0, "split-shot": 0 },
    weaponModsByWeaponId: {}, weaponEvolutionByWeaponId: {}, passives: {}, discoveredCombos: []
  });
  assert.equal(Object.isFrozen(RunBuild.SHARED_UPGRADES), true);
  assert.equal(Object.isFrozen(RunBuild.COMBOS["blade-dance"]), true);
  assert.deepEqual(RunBuild.BUILD_TAGS, ["Melee", "Projectile", "AoE", "Pierce", "Mobility", "Multi-hit"]);
});

test("Rapid Fire is one shared rank and resolves for both equipped compatible Weapons", () => {
  const build = state({ sharedUpgrades: { "rapid-fire": 2 } });
  assert.equal(RunBuild.getSharedUpgradeRank(build, "rapid-fire"), 2);
  close(RunBuild.resolveWeaponStats(Weapons.DEFINITIONS.starter, build).fireRate, 4 * 1.4);
  close(RunBuild.resolveWeaponStats(Weapons.DEFINITIONS["arc-blade"], build).fireRate, 1.5 * 1.4);
  assert.equal(Object.hasOwn(build.weaponModsByWeaponId, "starter"), false);
  assert.equal(Object.hasOwn(build.weaponModsByWeaponId, "arc-blade"), false);
});

test("attack-rate percentages resolve through one additive modifier bucket", () => {
  const build = state({ sharedUpgrades: { "rapid-fire": 2, "heavy-shot": 1 } });
  close(RunBuild.resolveWeaponStats(Weapons.STARTER, build).fireRate, 4 * (1 + 0.4 - 0.08));
});

test("Split Shot affects Starter, Scatter, and Piercer but no other Weapon", () => {
  const build = state({ sharedUpgrades: { "split-shot": 2 } });
  for (const id of ["starter", "scatter", "piercer"]) {
    assert.equal(RunBuild.resolveWeaponStats(Weapons.DEFINITIONS[id], build).projectileCount,
      Weapons.DEFINITIONS[id].projectileCount + 2);
    assert.equal(RunBuild.isUpgradeCompatible(Weapons.DEFINITIONS[id], "split-shot"), true);
  }
  for (const id of ["burst", "launcher", "arc-blade"]) {
    assert.equal(RunBuild.resolveWeaponStats(Weapons.DEFINITIONS[id], build).projectileCount,
      Weapons.DEFINITIONS[id].projectileCount);
    assert.equal(RunBuild.isUpgradeCompatible(Weapons.DEFINITIONS[id], "split-shot"), false);
  }
});

test("Player Damage owns production base damage and legacy Weapon damage is ignored", () => {
  const build = state({ sharedUpgrades: { "heavy-shot": 2 } });
  const player = RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, build);
  assert.equal(player.damage, 4);
  for (const base of [{ ...Weapons.DEFINITIONS.starter, damage: 99 },
    { ...Weapons.DEFINITIONS.piercer, damage: 0.1 }, { ...Weapons.DEFINITIONS["arc-blade"], damage: 500 }]) {
    assert.equal(RunBuild.resolveWeaponStats(base, build).damage, 4);
  }
  const split = state({ sharedUpgrades: { "heavy-shot": 2, "split-shot": 1 } });
  assert.equal(RunBuild.resolveWeaponStats({ ...Weapons.STARTER, damage: 999 }, split).damage, 3);
});

test("Vitality and Swift Feet preserve healing, HP, and additive speed intent", () => {
  const vitality = RunBuild.applyReward(state(), "vitality", { playerHp: 5, loadout });
  assert.equal(vitality.playerHp, 6);
  assert.equal(RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, vitality.buildState).maxHp, 6);
  const swift = state({ passives: { "swift-feet": 3 } });
  close(RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, swift).speed, 240 * 1.24);
});

test("Passive identity cap filters a fourth identity but permits owned rank-ups", () => {
  const capped = { ...state(), passives: { vitality: 1, "future-a": 1, "future-b": 1 } };
  assert.equal(RunBuild.canSelectReward(capped, "vitality", loadout), true);
  assert.equal(RunBuild.canSelectReward(capped, "swift-feet", loadout), false);
  const maxed = state({ passives: { vitality: 3 } });
  assert.equal(RunBuild.canSelectReward(maxed, "vitality", loadout), false);
});

test("Wide Arc is Arc Blade-only with exact 55 to 65 to 75 degree progression", () => {
  let build = state();
  assert.equal(RunBuild.resolveWeaponStats(Weapons.DEFINITIONS["arc-blade"], build).sweepHalfAngleDegrees, 55);
  assert.equal(RunBuild.canSelectReward(build, "wide-arc", ["starter"]), false);
  build = RunBuild.applyReward(build, "wide-arc", { loadout }).buildState;
  assert.equal(RunBuild.resolveWeaponStats(Weapons.DEFINITIONS["arc-blade"], build).sweepHalfAngleDegrees, 65);
  assert.equal(RunBuild.resolveWeaponStats(Weapons.STARTER, build).sweepHalfAngleDegrees, undefined);
  build = RunBuild.applyReward(build, "wide-arc", { loadout }).buildState;
  assert.equal(RunBuild.resolveWeaponStats(Weapons.DEFINITIONS["arc-blade"], build).sweepHalfAngleDegrees, 75);
});

test("Cyclone Blade is eligible only after Wide Arc II and Rapid Fire II", () => {
  let build = state();
  assert.equal(RunBuild.canSelectReward(build, "cyclone-blade", loadout), false);
  build = state({ sharedUpgrades: { "rapid-fire": 2 },
    weaponModsByWeaponId: { "arc-blade": { "wide-arc": 1 } } });
  assert.equal(RunBuild.canSelectReward(build, "cyclone-blade", loadout), false);
  build.weaponModsByWeaponId["arc-blade"]["wide-arc"] = 2;
  assert.equal(RunBuild.canSelectReward(build, "cyclone-blade", loadout), true);
  const acquired = RunBuild.applyReward(build, "cyclone-blade", { loadout }).buildState;
  assert.equal(RunBuild.getWeaponEvolution(acquired, "arc-blade"), "cyclone-blade");
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(n => RunBuild.getArcBladeSweep(acquired, n).fullSweep),
    [false, false, true, false, false, true]);
});

test("Blade Dance stays hidden, auto-discovers, and changes Cyclone cadence to every second attack", () => {
  let build = state({ sharedUpgrades: { "rapid-fire": 2 },
    weaponModsByWeaponId: { "arc-blade": { "wide-arc": 2 } }, passives: { "swift-feet": 1 } });
  build = RunBuild.applyReward(build, "cyclone-blade", { loadout }).buildState;
  assert.equal(RunBuild.hasDiscoveredCombo(build, "blade-dance"), false);
  assert.equal(RunBuild.REWARDS["blade-dance"], undefined);
  const result = RunBuild.applyReward(build, "swift-feet", { loadout });
  assert.deepEqual(result.discoveries.map(combo => combo.id), ["blade-dance"]);
  assert.equal(RunBuild.hasDiscoveredCombo(result.buildState, "blade-dance"), true);
  assert.deepEqual([1, 2, 3, 4].map(n => RunBuild.getArcBladeSweep(result.buildState, n).fullSweep),
    [false, true, false, true]);
});

test("reward choices remove maxed, incompatible, and premature entries without synergy weighting", () => {
  const build = state({ sharedUpgrades: { "rapid-fire": 4, "split-shot": 2 },
    passives: { vitality: 3, "swift-feet": 4 } });
  const legal = RunBuild.REWARD_LIST.filter(reward => RunBuild.canSelectReward(build, reward.id, ["starter"]))
    .map(reward => reward.id);
  assert.deepEqual(legal, ["heavy-shot"]);
  assert.deepEqual(RunBuild.generateRewardChoices(build, 3, () => {
    throw new Error("RNG is unnecessary when all legal choices fit");
  }, ["starter"]).map(reward => reward.id), legal);
});

test("Reward RNG is deterministic and isolated from Enemy type and position streams", () => {
  const rewardA = RunBuild.createRewardRng(12345), rewardB = RunBuild.createRewardRng(12345);
  const sequenceA = Array.from({ length: 6 }, () => rewardA());
  assert.deepEqual(sequenceA, Array.from({ length: 6 }, () => rewardB()));
  const choiceA = RunBuild.generateRewardChoices(state(), 3, RunBuild.createRewardRng(8080), loadout);
  const choiceB = RunBuild.generateRewardChoices(state(), 3, RunBuild.createRewardRng(8080), loadout);
  assert.deepEqual(choiceA.map(choice => choice.id), choiceB.map(choice => choice.id));
  const baseline = Continuous.createController({ waveCount: 5, seed: 9876 });
  const changed = Continuous.createController({ waveCount: 5, seed: 9876 });
  const rewardNoise = RunBuild.createRewardRng(99);
  Array.from({ length: 20 }, () => RunBuild.generateRewardChoices(state(), 3, rewardNoise, loadout));
  assert.deepEqual(Array.from({ length: 8 }, () => baseline.typeRng()),
    Array.from({ length: 8 }, () => changed.typeRng()));
  assert.deepEqual(Array.from({ length: 8 }, () => baseline.positionRng()),
    Array.from({ length: 8 }, () => changed.positionRng()));
  Array.from({ length: 25 }, () => changed.positionRng());
  const rewardsAfterPlacementRetries = RunBuild.createRewardRng(99);
  const rewardBaseline = RunBuild.createRewardRng(99);
  assert.deepEqual(Array.from({ length: 5 }, () => rewardBaseline()),
    Array.from({ length: 5 }, () => rewardsAfterPlacementRetries()));
});

test("Build application and resolution stay pure", () => {
  const before = state({ sharedUpgrades: { "rapid-fire": 1 } });
  const snapshot = JSON.stringify(before);
  const result = RunBuild.applyReward(before, "rapid-fire", { loadout });
  assert.equal(JSON.stringify(before), snapshot);
  assert.equal(RunBuild.getSharedUpgradeRank(result.buildState, "rapid-fire"), 2);
  assert.equal(Object.isFrozen(Weapons.DEFINITIONS), true);
});
