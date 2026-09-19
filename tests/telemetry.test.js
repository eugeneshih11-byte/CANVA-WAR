const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
require("../encounters.js");
require("../telemetry.js");
const E = globalThis.Encounters, T = globalThis.PlaytestTelemetry;
const copy = value => JSON.parse(JSON.stringify(value));
const player = { playerHp: 10, playerMaxHp: 10, playerSpeed: 240, playerLevel: 2, playerXp: 3,
  weapon: { damage: 2, fireRate: 4, bulletSpeed: 410, bulletSize: 8,
    projectileCount: 1, spreadDegrees: 0, pierce: 0 },
  build: { upgrades: { "rapid-fire": 0, "split-shot": 0 } } };
const configuration = { enemies: E.ENEMIES, maxActiveEnemies: E.CONFIG.maxActiveEnemies,
  threatCurve: E.STAGES[0].threatCurve, clearTime: E.CONFIG.clearTime };
const wave = { id: "stage-1-wave-1", stageId: "stage-1", battlefieldId: "stage-1-field-a",
  waveIndex: 0, templateId: "basic",
  threatBudget: 8, maxActiveThreat: 4.5,
  spawnGroups: [
    { delay: 0, enemies: [{ type: "normal", count: 3 }] },
    { delay: 2.5, enemies: [{ type: "normal", count: 3 }] }
  ], analysis: { threat: 6, expectedClearTime: 17.5, expectedBaseScore: 6, performanceAllowance: 0, scoreCapacity: 6 } };
function create(options = {}) {
  return T.createTelemetry({ enabled: true, configuration,
    environment: { viewport: { width: 1000, height: 800 }, playtestMode: true },
    now: () => "2026-09-08T00:00:00.000Z", ...options });
}
function start(options) {
  const telemetry = create(options);
  telemetry.startRun({ player });
  telemetry.startEncounter({ type: "wave", definition: wave, player });
  return telemetry;
}
function frame(telemetry, values = {}) {
  telemetry.recordEncounterFrame({ deltaTime: 1, activeEnemyCount: 0, activeThreat: 0,
    hp: 10, maxHp: 10, nextSpawnGroupIndex: 2, groupDelayElapsed: 0, ...values });
}
const currentEncounter = telemetry => telemetry.getCurrentRun().encounters.at(-1);

test("Playtest Mode requires the explicit playtest=1 query value", () => {
  for (const search of [undefined, "", "?playtest=0", "?playtest=true", "?other=1", "?playtest=11"]) {
    assert.equal(T.isEnabled(search), false);
  }
  assert.equal(T.isEnabled("?playtest=1"), true);
  assert.equal(T.isEnabled("?debug=yes&playtest=1"), true);
});
test("behavior telemetry records interpretable metrics once per action or hazard", () => {
  const telemetry = start();
  telemetry.recordInterceptorAttempt({ enemyId: 1, actionId: "1:1" });
  telemetry.recordInterceptorAttempt({ enemyId: 1, actionId: "1:1" });
  telemetry.recordInterceptorCommit({ enemyId: 1, actionId: "1:1" });
  telemetry.recordInterceptorContact({ enemyId: 1, actionId: "1:1" });
  telemetry.recordInterceptorMiss({ enemyId: 2, actionId: "2:1" });
  telemetry.recordInterceptorInterrupted({ enemyId: 3, actionId: "3:1" });
  telemetry.recordDenierCast({ enemyId: 4, actionId: "4:1" });
  telemetry.recordDenierHazardCreated({ hazardId: 10 });
  telemetry.recordDenierHazardCreated({ hazardId: 10 });
  telemetry.recordDenierHazardContact({ hazardId: 10, entryId: "entry-1" });
  telemetry.recordDenierHazardContact({ hazardId: 10, entryId: "entry-1" });
  telemetry.recordDenierHazardDamage({ hazardId: 10 });
  telemetry.recordDenierHazardDamage({ hazardId: 10 });
  telemetry.recordBehaviorFrame({ activeHazardTime: 0.5, supportActiveTime: 1, affectedEnemyTime: 2 });
  telemetry.recordBehaviorFrame({ activeHazardTime: 0.25, supportActiveTime: 0.5, affectedEnemyTime: 0.75 });
  telemetry.recordSupportAffectedAction();
  telemetry.recordSupportLinkCreated({ linkId: "support-1:1" });
  telemetry.recordSupportLinkCreated({ linkId: "support-1:1" });
  telemetry.recordFastStrikeTelegraph();
  telemetry.recordTankSlamTelegraph(); telemetry.recordTankSlamImpact();
  telemetry.recordGunnerBurst();
  telemetry.recordArtilleryWarning(); telemetry.recordArtilleryImpact();
  telemetry.recordTrapperArm(); telemetry.recordTrapperTrigger();
  telemetry.recordTetherConnect(); telemetry.recordTetherBreak();
  telemetry.recordEnemyIntroduction({ enemyType: "interceptor" });
  telemetry.recordEnemyIntroduction({ enemyType: "interceptor" });
  const encounter = currentEncounter(telemetry);
  assert.deepEqual(encounter.interceptor, { attempts: 1, chargeCommits: 1, chargeContacts: 1,
    missedCharges: 1, interruptedTelegraphs: 1 });
  assert.deepEqual(encounter.denier, { casts: 1, hazardsCreated: 1, hazardContacts: 1,
    hazardDamageEvents: 2, activeHazardTime: 0.75 });
  assert.deepEqual(encounter.support, { activeTime: 1.5, affectedEnemyTime: 2.75,
    affectedSpecialActions: 1, linksCreated: 1 });
  assert.deepEqual(encounter.fast, { telegraphs: 1 });
  assert.deepEqual(encounter.tank, { telegraphs: 1, impacts: 1 });
  assert.deepEqual(encounter.gunner, { bursts: 1, rangeBlockedTime: 0,
    losBlockedTime: 0, telegraphs: 0, telegraphCancels: 0 });
  assert.deepEqual(encounter.artillery, { warnings: 1, impacts: 1 });
  assert.deepEqual(encounter.trapper, { arms: 1, triggers: 1 });
  assert.deepEqual(encounter.tether, { connects: 1, breaks: 1 });
  assert.deepEqual(telemetry.getCurrentRun().enemyIntroductionsShown, ["interceptor"]);
});
test("Battlefield navigation diagnostics are encounter-scoped counters", () => {
  const telemetry = start();
  telemetry.recordPathRequest();
  telemetry.recordPathRequest();
  telemetry.recordPathFailure();
  telemetry.recordNavigationFallback();
  telemetry.recordPlayerObstacleContact();
  telemetry.recordForcedRepath();
  telemetry.recordForcedRepath();
  telemetry.recordStuckRecovery({ noProgressDuration: 0.8 });
  telemetry.recordStuckRecovery({ noProgressDuration: 1.1 });
  frame(telemetry, { deltaTime: 2, enemyOffscreenCount: 3, cameraHasTerrain: false });
  const encounter = currentEncounter(telemetry);
  assert.equal(encounter.battlefieldId, "stage-1-field-a");
  assert.equal(encounter.pathRequests, 2);
  assert.equal(encounter.pathFailures, 1);
  assert.equal(encounter.navigationFallbacks, 1);
  assert.equal(encounter.playerObstacleContacts, 1);
  assert.equal(encounter.forcedRepaths, 2);
  assert.equal(encounter.stuckRecoveries, 2);
  assert.equal(encounter.maxNoProgressDuration, 1.1);
  assert.equal(encounter.enemyOffscreenEngagementTime, 6);
  assert.equal(encounter.cameraEmptyTerrainTime, 2);
});
test("disabled telemetry performs no recording, input copying or diagnostics", () => {
  const poison = new Proxy({}, { get() { throw new Error("input read"); } });
  const telemetry = T.createTelemetry({ configuration: poison, warn() { assert.fail("warned in normal mode"); } });
  assert.equal(telemetry.enabled, false);
  for (const [name, method] of Object.entries(telemetry)) {
    if (typeof method === "function") assert.equal(method(poison), null, name);
  }
});
test("telemetry consumes neither randomness nor storage and leaves input data unchanged", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "telemetry.js"), "utf8");
  let rngCalls = 0, storageCalls = 0;
  const math = Object.create(Math);
  math.random = () => { rngCalls++; throw new Error("RNG consumed"); };
  const sandbox = { Math: math, URLSearchParams, Date, console };
  Object.defineProperty(sandbox, "localStorage", { get() { storageCalls++; throw new Error("storage accessed"); } });
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const before = JSON.stringify({ wave, player, configuration });
  const telemetry = sandbox.PlaytestTelemetry.createTelemetry({ enabled: true, configuration });
  telemetry.startRun({ player });
  telemetry.startEncounter({ type: "wave", definition: wave, player });
  frame(telemetry, { activeThreat: 3, activeEnemyCount: 3 });
  telemetry.recordShot();
  telemetry.recordBulletHit({ enemyType: "normal", damage: 2 });
  telemetry.finishRun({ endReason: "death", player });
  assert.ok(telemetry.getSessionReport().runs.length === 1);
  assert.equal(rngCalls, 0);
  assert.equal(storageCalls, 0);
  assert.equal(JSON.stringify({ wave, player, configuration }), before);
  assert.doesNotMatch(source, /calculatePoints|calculateSettlement|Math\.random|localStorage/);
});
test("starting a Run creates one active observation and no completed session Run", () => {
  const telemetry = create();
  assert.equal(telemetry.getCurrentRun(), null);
  telemetry.startRun({ player });
  const run = telemetry.getCurrentRun();
  assert.equal(run.runSequence, 1);
  assert.equal(run.completed, false);
  assert.deepEqual(run.playerStart, player);
  assert.deepEqual(run.encounters, []);
  assert.equal(telemetry.getRunReport().runs.length, 1);
  assert.equal(telemetry.getSessionReport().runs.length, 0);
});
test("Wave context copies Stage, Wave, Template, Threat, composition and analysis", () => {
  const telemetry = start(), encounter = currentEncounter(telemetry);
  assert.equal(encounter.type, "wave");
  assert.equal(encounter.stageId, "stage-1");
  assert.equal(encounter.waveIndex, 0);
  assert.equal(encounter.waveId, wave.id);
  assert.equal(encounter.templateId, "basic");
  assert.equal(encounter.threatBudget, 8);
  assert.equal(encounter.generatedThreat, 6);
  assert.equal(encounter.maxActiveThreat, 4.5);
  assert.deepEqual(encounter.enemyComposition, { normal: 6 });
  assert.deepEqual(encounter.spawnGroups[1], { groupIndex: 1, delay: 2.5,
    enemies: [{ type: "normal", count: 3 }], enemyCount: 3, threat: 3 });
  assert.deepEqual(encounter.analysis, wave.analysis);
  assert.equal(encounter.configuredSpawnFloor, 2.5);
  assert.equal(telemetry.getCurrentRun().waveReached, 1);
});
test("active timing ignores wall-clock/UI pauses and tracks Intermission separately", () => {
  let clock = 0;
  const telemetry = start({ now: () => new Date(clock).toISOString() });
  frame(telemetry, { deltaTime: 2 });
  clock += 120000; // Reading reports while a UI is paused must not advance simulation time.
  assert.equal(currentEncounter(telemetry).encounterElapsedTime, 2);
  assert.equal(currentEncounter(telemetry).actualClearTime, null);
  assert.equal(currentEncounter(telemetry).clearTimeRatio, null);
  telemetry.getRunReport();
  frame(telemetry, { deltaTime: 3 });
  telemetry.finishEncounter({ outcome: "clear", player });
  telemetry.recordIntermission({ deltaTime: 4 });
  const run = telemetry.getCurrentRun();
  assert.equal(run.totalActiveCombatTime, 5);
  assert.equal(run.totalIntermissionTime, 4);
  assert.equal(typeof run.encounters[0].encounterElapsedTime, "number");
  assert.equal(run.encounters[0].encounterElapsedTime, 5);
  assert.equal(typeof run.encounters[0].actualClearTime, "number");
  assert.equal(run.encounters[0].actualClearTime, 5);
  assert.equal(typeof run.encounters[0].clearTimeRatio, "number");
  assert.equal(run.encounters[0].clearTimeRatio, 5 / 17.5);
  assert.equal(run.encounters[0].activeCombatTime, 5);
});
test("Active Threat and Enemy averages weight elapsed seconds, with exposure by type", () => {
  const telemetry = start();
  frame(telemetry, { deltaTime: 1, activeEnemyCount: 4, activeThreat: 6, enemiesByType: { normal: 3, tank: 1 } });
  frame(telemetry, { deltaTime: 3, activeEnemyCount: 2, activeThreat: 2, enemiesByType: { normal: 2 } });
  const encounter = currentEncounter(telemetry);
  assert.equal(encounter.averageActiveEnemyCount, 2.5);
  assert.equal(encounter.averageActiveThreat, 3);
  assert.equal(encounter.peakActiveEnemyCount, 4);
  assert.equal(encounter.peakActiveThreat, 6);
  assert.deepEqual(encounter.enemySecondsByType, { normal: 9, tank: 1 });
});
test("zero-duration unfinished encounters have finite averages and null clear fields", () => {
  const encounter = currentEncounter(start());
  assert.equal(encounter.averageActiveEnemyCount, 0);
  assert.equal(encounter.averageActiveThreat, 0);
  assert.equal(encounter.encounterElapsedTime, 0);
  assert.equal(encounter.actualClearTime, null);
  assert.equal(encounter.clearTimeRatio, null);
  const telemetry = start();
  frame(telemetry, { deltaTime: NaN });
  frame(telemetry, { deltaTime: -1 });
  assert.equal(currentEncounter(telemetry).encounterElapsedTime, 0);
  assert.equal(currentEncounter(telemetry).actualClearTime, null);
});
test("pressure blocking starts only in the part of a frame after the relative delay", () => {
  const telemetry = start();
  frame(telemetry, { deltaTime: 2, activeEnemyCount: 3, activeThreat: 3, nextSpawnGroupIndex: 1, groupDelayElapsed: 0 });
  assert.equal(currentEncounter(telemetry).pressureBlockedTime, 0);
  frame(telemetry, { deltaTime: 1, activeEnemyCount: 3, activeThreat: 3, nextSpawnGroupIndex: 1, groupDelayElapsed: 2 });
  assert.equal(currentEncounter(telemetry).pressureBlockedTime, 0.5);
  assert.equal(currentEncounter(telemetry).pressureBlockedEvents, 1);
  frame(telemetry, { deltaTime: 2, activeEnemyCount: 3, activeThreat: 3, nextSpawnGroupIndex: 1, groupDelayElapsed: 3 });
  const encounter = currentEncounter(telemetry);
  assert.equal(encounter.pressureBlockedTime, 2.5);
  assert.equal(encounter.pressureBlockedEvents, 1);
  assert.equal(encounter.threatBlockedTime, 2.5);
  assert.equal(encounter.enemyCountBlockedTime, 0);
});
test("a delay reached at frame end records readiness without fictional blocked duration", () => {
  const telemetry = start();
  frame(telemetry, { deltaTime: 0.5, activeThreat: 3, nextSpawnGroupIndex: 1, groupDelayElapsed: 2 });
  assert.equal(currentEncounter(telemetry).pressureBlockedTime, 0);
  assert.equal(currentEncounter(telemetry).pressureBlockedEvents, 1);
  frame(telemetry, { deltaTime: 0.25, activeThreat: 3, nextSpawnGroupIndex: 1, groupDelayElapsed: 2.5 });
  assert.equal(currentEncounter(telemetry).pressureBlockedTime, 0.25);
});
test("pressure count cap is observed independently and union waiting is not double-counted", () => {
  const telemetry = start({ configuration: { ...configuration, maxActiveEnemies: 4 } });
  frame(telemetry, { deltaTime: 2, activeEnemyCount: 2, activeThreat: 0,
    nextSpawnGroupIndex: 1, groupDelayElapsed: 3 });
  frame(telemetry, { deltaTime: 1, activeEnemyCount: 3, activeThreat: 3,
    nextSpawnGroupIndex: 1, groupDelayElapsed: 5 });
  const encounter = currentEncounter(telemetry);
  assert.equal(encounter.pressureBlockedTime, 3);
  assert.equal(encounter.threatBlockedTime, 1);
  assert.equal(encounter.enemyCountBlockedTime, 3);
  assert.equal(encounter.pressureBlockedEvents, 1);
});
test("group release times deduplicate, reset blocking and capture post-spawn peaks", () => {
  const telemetry = start();
  frame(telemetry, { nextSpawnGroupIndex: 0, activeThreat: 3 });
  telemetry.recordGroupRelease({ groupIndex: 0, elapsedTime: 4, activeEnemyCount: 5, activeThreat: 4.4 });
  telemetry.recordGroupRelease({ groupIndex: 0, elapsedTime: 9, activeEnemyCount: 99, activeThreat: 99 });
  frame(telemetry, { nextSpawnGroupIndex: 1, groupDelayElapsed: 3, activeThreat: 3 });
  telemetry.recordGroupRelease({ groupIndex: 1, elapsedTime: 12, activeEnemyCount: 3, activeThreat: 3 });
  telemetry.recordGroupRelease({ groupIndex: -1, elapsedTime: 20 });
  telemetry.recordGroupRelease({ groupIndex: 99, elapsedTime: 20 });
  const encounter = currentEncounter(telemetry);
  assert.equal(encounter.pressureBlockedEvents, 2);
  assert.equal(encounter.peakActiveEnemyCount, 5);
  assert.equal(encounter.peakActiveThreat, 4.4);
  assert.deepEqual(encounter.groupReleaseTimes, [{ groupIndex: 0, elapsedTime: 4 }, { groupIndex: 1, elapsedTime: 12 }]);
  assert.equal(encounter.lastSpawnGroupReleaseTime, 12);
  assert.equal(encounter.actualLastGroupReleaseTime, 12);
});
test("damage counts actual HP loss, hit frequency, sources and minimum HP immediately", () => {
  const telemetry = start();
  telemetry.recordDamage({ amount: 7, hp: 3, maxHp: 10, enemyType: "tank" });
  telemetry.recordDamage({ amount: 2, hp: 1, maxHp: 10, enemyType: "normal" });
  telemetry.recordDamage({ amount: 0, hp: 1, maxHp: 10, enemyType: "boss" });
  const encounter = currentEncounter(telemetry);
  assert.equal(encounter.damageTaken, 9);
  assert.equal(encounter.damageEvents, 2);
  assert.equal(encounter.minimumHp, 1);
  assert.equal(encounter.minimumHpRatio, 0.1);
  assert.equal(encounter.endHp, 1);
  assert.deepEqual(encounter.damageByEnemyType, { tank: 7, normal: 2 });
  assert.deepEqual(encounter.damageEventsByEnemyType, { tank: 1, normal: 1 });
});
test("30-percent threshold uses pre-frame HP and excludes paused duration", () => {
  const telemetry = start();
  frame(telemetry, { deltaTime: 4, hp: 3.1 });
  frame(telemetry, { deltaTime: 2, hp: 3 });
  frame(telemetry, { deltaTime: 3, hp: 1 });
  telemetry.getCurrentRun();
  const encounter = currentEncounter(telemetry);
  assert.equal(encounter.timeAtOrBelow30PercentHp, 5);
  assert.equal(encounter.minimumHpRatio, 0.1);
  assert.deepEqual(encounter.analysis, wave.analysis);
  assert.equal(telemetry.getCurrentRun().settlement, null);
});
test("attack events, projectiles, successful bullet hits, kills and contact removals remain distinct", () => {
  const telemetry = start();
  telemetry.recordAttack();
  for (let i = 0; i < 3; i++) telemetry.recordShot();
  telemetry.recordBulletHit({ enemyType: "normal", damage: 2 });
  telemetry.recordBulletHit({ enemyType: "tank", damage: 2 });
  telemetry.recordEnemyKill({ enemyType: "normal" });
  telemetry.recordEnemyRemoval({ enemyType: "tank", reason: "contact" });
  const encounter = currentEncounter(telemetry);
  assert.equal(encounter.attackEvents, 1);
  assert.equal(encounter.shotsFired, 3);
  assert.equal(encounter.bulletHits, 2);
  assert.deepEqual(encounter.bulletHitsByEnemyType, { normal: 1, tank: 1 });
  assert.deepEqual(encounter.bulletDamageByEnemyType, { normal: 2, tank: 2 });
  assert.deepEqual(encounter.killsByEnemyType, { normal: 1 });
  assert.deepEqual(encounter.nonKillRemovalsByEnemyType, { tank: 1 });
  assert.deepEqual(encounter.nonKillRemovalsByReason, { contact: 1 });
});
test("recordAttackEvent remains a compatible alias for one attack discharge", () => {
  const telemetry = start();
  telemetry.recordAttackEvent();
  assert.equal(currentEncounter(telemetry).attackEvents, 1);
  assert.equal(currentEncounter(telemetry).shotsFired, 0);
});
test("Player and upgrade snapshots preserve resolved stats and formal build values as plain data", () => {
  const telemetry = start();
  const weapon = { damage: 3, fireRate: 4.8, bulletSpeed: 410, bulletSize: 8,
    projectileCount: 3, spreadDegrees: 12, pierce: 1 };
  const upgradedPlayer = { playerHp: 9, playerMaxHp: 11, playerSpeed: 259.2, playerLevel: 3 };
  const build = { upgrades: { "rapid-fire": 1, "split-shot": 2 }, resolver() { return weapon; } };
  telemetry.recordUpgrade({ playerLevel: 3, upgradeId: "split-shot", upgradeName: "Split Shot",
    upgradeStack: 2, weapon, player: upgradedPlayer, build });
  weapon.damage = 100;
  upgradedPlayer.playerSpeed = 1;
  build.upgrades["split-shot"] = 0;
  const run = telemetry.getCurrentRun(), encounter = run.encounters[0];
  assert.deepEqual(encounter.playerStart, player);
  assert.equal(encounter.playerLevelStart, 2);
  assert.equal(encounter.playerLevelEnd, 3);
  assert.deepEqual(run.upgradeHistory[0], { playerLevel: 3, upgradeId: "split-shot", upgradeName: "Split Shot",
    upgradeStack: 2, weapon: { damage: 3, fireRate: 4.8, bulletSpeed: 410, bulletSize: 8,
      projectileCount: 3, spreadDegrees: 12, pierce: 1 },
    player: { playerHp: 9, playerMaxHp: 11, playerSpeed: 259.2, playerLevel: 3 },
    build: { upgrades: { "rapid-fire": 1, "split-shot": 2 } }, encounterIndex: 0, activeCombatTime: 0 });
  assert.equal(typeof run.upgradeHistory[0].build.resolver, "undefined");
});
test("Upgrade choice history preserves offers separately from selected Upgrade history", () => {
  const telemetry = start();
  const offeredUpgradeIds = ["rapid-fire", "split-shot", "vitality"];
  telemetry.recordUpgradeChoice({ playerLevel: 3, offeredUpgradeIds, selectedUpgradeId: "split-shot" });
  telemetry.recordUpgrade({ playerLevel: 3, upgradeId: "split-shot", upgradeName: "Split Shot" });
  offeredUpgradeIds[0] = "changed";
  const run = telemetry.getCurrentRun();
  assert.deepEqual(run.upgradeChoiceHistory, [{ playerLevel: 3,
    offeredRewards: ["rapid-fire", "split-shot", "vitality"].map(id => ({ id, category: null, weaponId: null })),
    selectedRewardId: "split-shot", rewardRng: null }]);
  assert.equal(run.upgradeHistory.length, 1);
  assert.equal(run.upgradeHistory[0].upgradeId, "split-shot");
  assert.equal(Object.hasOwn(run.upgradeHistory[0], "offeredUpgradeIds"), false);
});
test("Build telemetry reconstructs loadout, categorized rewards, Evolution, Combo, RNG, and final Build", () => {
  const telemetry = create();
  const initialBuild = { sharedUpgrades: { "rapid-fire": 2 }, weaponModsByWeaponId: {
    "arc-blade": { "wide-arc": 2 } }, weaponEvolutionByWeaponId: {}, passives: {}, discoveredCombos: [] };
  telemetry.startRun({ player: { ...player, loadout: { slotA: "arc-blade", slotB: "starter" },
    build: initialBuild, rewardRng: { seed: 42, state: 42 } } });
  telemetry.startEncounter({ type: "wave", definition: wave, player });
  telemetry.recordUpgradeChoice({ playerLevel: 2,
    offeredRewards: [{ id: "cyclone-blade", category: "weapon-evolution", weaponId: "arc-blade" }],
    selectedRewardId: "cyclone-blade", rewardRng: { seed: 42, state: 1083814273 } });
  const evolved = { ...initialBuild, weaponEvolutionByWeaponId: { "arc-blade": "cyclone-blade" } };
  telemetry.recordUpgrade({ playerLevel: 2, upgradeId: "cyclone-blade", rewardCategory: "weapon-evolution",
    weaponId: "arc-blade", rankBefore: 0, rankAfter: 1, build: evolved });
  telemetry.recordEvolutionAcquisition({ evolutionId: "cyclone-blade", weaponId: "arc-blade", build: evolved });
  const finalBuild = { ...evolved, passives: { "swift-feet": 2 }, discoveredCombos: ["blade-dance"] };
  telemetry.recordComboDiscovery({ comboId: "blade-dance", comboName: "Blade Dance", build: finalBuild });
  telemetry.finishRun({ endReason: "death", player: { ...player, build: finalBuild } });
  const run = telemetry.getSessionReport().runs[0];
  assert.deepEqual(run.startingLoadout, { slotA: "arc-blade", slotB: "starter" });
  assert.deepEqual(run.upgradeChoiceHistory[0].rewardRng, { seed: 42, state: 1083814273 });
  assert.equal(run.upgradeHistory[0].rewardCategory, "weapon-evolution");
  assert.equal(run.upgradeHistory[0].weaponId, "arc-blade");
  assert.deepEqual(run.evolutionAcquisitions.map(entry => entry.evolutionId), ["cyclone-blade"]);
  assert.deepEqual(run.comboDiscoveries.map(entry => entry.comboId), ["blade-dance"]);
  assert.deepEqual(run.finalBuildSummary, finalBuild);
});
test("Wave Clear finalizes exactly once and later hooks cannot change it", () => {
  const telemetry = start();
  frame(telemetry, { deltaTime: 5 });
  telemetry.finishEncounter({ outcome: "clear", player: { ...player, playerLevel: 3 } });
  const finished = telemetry.getCurrentRun().encounters[0];
  telemetry.finishEncounter({ outcome: "death", player });
  telemetry.recordShot();
  frame(telemetry, { deltaTime: 10 });
  assert.equal(telemetry.getCurrentRun().encounters.length, 1);
  assert.deepEqual(telemetry.getCurrentRun().encounters[0], finished);
  assert.equal(finished.outcome, "clear");
  assert.equal(finished.playerLevelEnd, 3);
});
test("Death closes one partial Encounter and one Run with actual final HP", () => {
  const telemetry = start();
  frame(telemetry, { deltaTime: 7 });
  telemetry.recordDamage({ amount: 10, hp: 0, maxHp: 10, enemyType: "normal" });
  telemetry.finishRun({ endReason: "death", player: { ...player, playerHp: 0 } });
  telemetry.finishRun({ endReason: "death", player });
  const run = telemetry.getSessionReport().runs[0];
  assert.equal(telemetry.getSessionReport().runs.length, 1);
  assert.equal(run.encounters.length, 1);
  assert.equal(run.encounters[0].outcome, "death");
  assert.equal(typeof run.encounters[0].encounterElapsedTime, "number");
  assert.equal(run.encounters[0].encounterElapsedTime, 7);
  assert.equal(run.encounters[0].actualClearTime, null);
  assert.equal(run.encounters[0].clearTimeRatio, null);
  assert.equal(run.encounters[0].activeCombatTime, 7);
  assert.equal(run.encounters[0].endHp, 0);
  assert.equal(run.finalPlayerHp, 0);
  assert.equal(run.completed, true);
  assert.equal(run.victory, false);
});
test("Abandon keeps partial observations and copies exact checkpoint Settlement without arithmetic", () => {
  const telemetry = start();
  const settlement = { endReason: "abandon", settlementSource: "securedCheckpoint",
    result: { finalScore: 12, efficientScoreCapacity: 321, effectiveScore: 456.789, points: 12345 },
    sourceState: { score: 12, scoreBreakdown: { enemyKill: 12 }, progress: { clearedWaves: 1 } },
    securedCheckpoint: { score: 12, arbitraryPlaceholder: "preserve" } };
  const before = copy(settlement);
  frame(telemetry, { deltaTime: 3 });
  telemetry.recordEnemyKill({ enemyType: "normal" });
  telemetry.finishRun({ endReason: "abandon", player, settlement });
  assert.deepEqual(settlement, before);
  settlement.result.points = -1;
  settlement.securedCheckpoint.score = 999;
  const run = telemetry.getCurrentRun();
  assert.equal(run.encounters[0].outcome, "abandon");
  assert.equal(typeof run.encounters[0].encounterElapsedTime, "number");
  assert.equal(run.encounters[0].encounterElapsedTime, 3);
  assert.equal(run.encounters[0].actualClearTime, null);
  assert.equal(run.encounters[0].clearTimeRatio, null);
  assert.deepEqual(run.settlement, before);
});
test("Boss is separate from Wave Template observations and retains its analysis placeholder", () => {
  const telemetry = start();
  telemetry.finishEncounter({ outcome: "clear", player });
  telemetry.startEncounter({ type: "boss", definition: E.BOSSES["boss-1"], stageId: "stage-1", waveIndex: 5, player });
  telemetry.recordBossChargeAttempt();
  telemetry.recordBossChargeAttempt();
  telemetry.recordBossChargeContact();
  telemetry.recordBossObstruction();
  telemetry.recordBossObstruction();
  frame(telemetry, { deltaTime: 15, activeEnemyCount: 1,
    bossOffscreen: true, cameraHasTerrain: false });
  telemetry.recordBulletHit({ enemyType: "boss", damage: 2 });
  telemetry.finishEncounter({ outcome: "clear", player });
  telemetry.finishRun({ endReason: "victory", player });
  const run = telemetry.getCurrentRun(), boss = run.encounters[1];
  assert.equal(boss.type, "boss");
  assert.equal(boss.bossId, "boss-1");
  assert.equal(Object.hasOwn(boss, "templateId"), false);
  assert.equal(Object.hasOwn(boss, "spawnGroups"), false);
  assert.deepEqual(boss.analysis, E.BOSSES["boss-1"].analysis);
  assert.equal(boss.analysis.expectedClearTime, 15);
  assert.equal(boss.chargeAttempts, 2);
  assert.equal(boss.chargeContacts, 1);
  assert.equal(boss.bossObstructionEvents, 2);
  assert.equal(boss.bossOffscreenTime, 15);
  assert.equal(boss.cameraEmptyTerrainTime, 15);
  assert.equal(typeof boss.encounterElapsedTime, "number");
  assert.equal(boss.encounterElapsedTime, 15);
  assert.equal(typeof boss.actualClearTime, "number");
  assert.equal(boss.actualClearTime, 15);
  assert.equal(typeof boss.clearTimeRatio, "number");
  assert.equal(boss.clearTimeRatio, 1);
  assert.equal(boss.outcome, "clear");
  assert.equal(run.bossReached, true);
  assert.equal(run.victory, true);
});
test("unfinished Boss uses elapsed time while clear-only fields remain null", () => {
  const telemetry = create();
  telemetry.startRun({ player });
  telemetry.startEncounter({ type: "boss", definition: E.BOSSES["boss-1"],
    stageId: "stage-1", waveIndex: 5, player });
  frame(telemetry, { deltaTime: 4, activeEnemyCount: 1 });
  telemetry.finishRun({ endReason: "death", player: { ...player, playerHp: 0 } });
  const boss = telemetry.getSessionReport().runs[0].encounters[0];
  assert.equal(boss.outcome, "death");
  assert.equal(typeof boss.encounterElapsedTime, "number");
  assert.equal(boss.encounterElapsedTime, 4);
  assert.equal(boss.activeCombatTime, 4);
  assert.equal(boss.actualClearTime, null);
  assert.equal(boss.clearTimeRatio, null);
});
test("report input/output copies prevent later gameplay and callers changing history", () => {
  const mutableWave = copy(wave), mutablePlayer = copy(player), mutableConfig = copy(configuration);
  const environment = { viewport: { width: 1000, height: 800 } };
  const telemetry = create({ configuration: mutableConfig, environment });
  telemetry.startRun({ player: mutablePlayer });
  telemetry.startEncounter({ type: "wave", definition: mutableWave, player: mutablePlayer });
  mutableWave.spawnGroups[0].enemies[0].count = 99;
  mutablePlayer.weapon.damage = 99;
  mutableConfig.clearTime.normal = 99;
  environment.viewport.width = 99;
  telemetry.finishRun({ endReason: "death", player });
  const original = telemetry.getSessionReport();
  const changed = telemetry.getSessionReport();
  changed.runs[0].encounters[0].playerStart.weapon.damage = -1;
  changed.runs[0].encounters[0].spawnGroups[0].enemies[0].count = -1;
  changed.configuration.clearTime.normal = -1;
  telemetry.startRun({ player: { ...player, playerHp: 1 } });
  assert.deepEqual(telemetry.getSessionReport(), original);
  assert.equal(original.runs[0].encounters[0].playerStart.weapon.damage, 2);
  assert.equal(original.runs[0].encounters[0].spawnGroups[0].enemyCount, 3);
  assert.equal(original.configuration.clearTime.normal, 0.4);
  assert.equal(original.environment.viewport.width, 1000);
});
test("session history caps completed Runs at 20 and sequence remains monotonic", () => {
  const telemetry = create();
  for (let i = 0; i < 25; i++) {
    telemetry.startRun({ player });
    telemetry.finishRun({ endReason: "abandon", player });
  }
  const runs = telemetry.getSessionReport().runs;
  assert.equal(runs.length, 20);
  assert.equal(runs[0].runSequence, 6);
  assert.equal(runs.at(-1).runSequence, 25);
  telemetry.startRun({ player });
  assert.equal(telemetry.getCurrentRun().runSequence, 26);
  assert.equal(telemetry.getSessionReport().runs.length, 20);
});
test("unexpected new Run preserves unfinished observations as run-ended-other", () => {
  const telemetry = start();
  frame(telemetry, { deltaTime: 3, hp: 4 });
  telemetry.startRun({ player });
  const previous = telemetry.getSessionReport().runs[0];
  assert.equal(previous.endReason, "run-ended-other");
  assert.equal(previous.encounters[0].outcome, "run-ended-other");
  assert.equal(previous.encounters[0].encounterElapsedTime, 3);
  assert.equal(previous.encounters[0].actualClearTime, null);
  assert.equal(previous.encounters[0].clearTimeRatio, null);
  assert.equal(previous.finalPlayerHp, 4);
  assert.equal(previous.settlement, null);
  assert.equal(telemetry.getCurrentRun().runSequence, 2);
});
test("recording, snapshot and warning failures stay inside telemetry boundaries", () => {
  const warnings = [];
  const telemetry = start({ warn: (message, error) => warnings.push([message, error.message]) });
  const circular = {}; circular.self = circular;
  assert.doesNotThrow(() => telemetry.startEncounter({ type: "wave", definition: circular, player }));
  assert.equal(currentEncounter(telemetry).waveId, wave.id);
  assert.doesNotThrow(() => telemetry.finishRun({ endReason: "death", player, settlement: circular }));
  assert.equal(telemetry.getCurrentRun().completed, false);
  telemetry.finishRun({ endReason: "death", player });
  assert.equal(telemetry.getCurrentRun().completed, true);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0][0], /start encounter failed/);
  const badLogger = start({ warn() { throw new Error("logger failed"); } });
  assert.doesNotThrow(() => badLogger.startEncounter({ definition: circular }));
  const badClock = start({ now() { throw new Error("clock failed"); }, warn() {} });
  assert.equal(badClock.getRunReport().generatedAt, null);
  const exportFailure = start({ now: () => 1n, warn: () => {} });
  assert.equal(exportFailure.getRunReport(), null);
});
test("Run and session report envelopes are versioned, serializable plain data", () => {
  const telemetry = start();
  frame(telemetry, { deltaTime: 2 });
  telemetry.finishRun({ endReason: "death", player });
  const report = telemetry.getSessionReport();
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.generatedAt, "2026-09-08T00:00:00.000Z");
  assert.deepEqual(Object.keys(report).sort(), ["configuration", "environment", "generatedAt", "runs", "schemaVersion"]);
  const exported = JSON.parse(JSON.stringify(report));
  assert.deepEqual(exported, report);
  assert.equal(exported.runs[0].encounters[0].encounterElapsedTime, 2);
  assert.equal(exported.runs[0].encounters[0].actualClearTime, null);
  assert.equal(exported.runs[0].encounters[0].clearTimeRatio, null);
  assert.equal(exported.runs[0].encounters[0].attackEvents, 0);
  assert.deepEqual(telemetry.getRunReport(), report);
});

test("combat-pass telemetry observes density, onboarding, collision, loadout, and per-Weapon outcomes", () => {
  const telemetry = create();
  const loadoutPlayer = { ...player, loadout: { slotA: "launcher", slotB: "arc-blade",
    activeWeapon: "launcher", activeSlot: "A" } };
  telemetry.startRun({ player: loadoutPlayer });
  telemetry.startEncounter({ type: "wave", definition: { ...wave,
    eligibleEnemyTypes: ["normal", "fast"] }, player: loadoutPlayer });
  telemetry.recordContinuousFrame({ deltaTime: 1,
    fill: { capacityArea: 448584, visibleFill: 0.2, spawnReservedFill: 0.03,
      returnReservedFill: 0.01, reservedFill: 0.04, projectedFill: 0.24 },
    controller: { normalCredit: 5, comingCredit: 7, comingCommittedArea: 11,
      comingPeakProjectedFill: 0.52, spawnHistory: ["normal"], waveProgressArmed: true,
      nRef: 8, target: 16, progress: 3, settlingDuration: 0,
      waveProgressReadinessStableTime: 0.5,
      waveProgressReadinessBlockedReason: "armed", pendingReservations: [] },
    lifecycleCounts: { ACTIVE: 9 }, effectiveOpeningTarget: 0.2, managedCount: 12 });
  telemetry.recordDispatchPulse({ reservationsCommitted: 2 });
  telemetry.recordSpawnTypeRejected({ reason: "managed-cap" });
  telemetry.recordSpawnTypeRejected({ type: "tank", reason: "fill" });
  telemetry.recordWaveComing({ startFill: 0.25, selectedDelta: 0.27,
    delta: 0.27, target: 0.52, budgetArea: 121118 });
  telemetry.recordEnemyEligibility({ eligibleTypes: ["normal", "fast", "tank", "gunner"],
    newlyUnlockedTypes: ["tank", "gunner"], newlyIntroducedTypes: ["tank"],
    introductionSuppressedTypes: ["gunner"] });
  telemetry.recordPlayerEnemyOverlap({ penetration: 18, corrections: 4 });
  telemetry.recordEnemyEnemyOverlap({ overlapEvents: 3, separationCorrections: 7, maxPenetration: 22 });
  telemetry.recordGunnerRangeBlocked({ duration: 1.25 });
  telemetry.recordGunnerLosBlocked({ duration: 0.5 });
  telemetry.recordGunnerTelegraph();
  telemetry.recordGunnerTelegraphCancel();
  telemetry.recordGunnerBurst();
  telemetry.recordWeaponSwitch({ activeWeapon: "arc-blade" });
  telemetry.recordWeaponAttack({ weaponId: "launcher" });
  telemetry.recordWeaponProjectile({ weaponId: "launcher" });
  telemetry.recordWeaponHit({ weaponId: "launcher", damage: 2 });
  telemetry.recordWeaponKill({ weaponId: "launcher" });
  telemetry.recordWeaponPierce({ weaponId: "launcher" });
  telemetry.recordWeaponExplosion({ weaponId: "launcher", targetCount: 3 });
  telemetry.recordLauncherAttack({ chainReactionActive: true });
  telemetry.recordLauncherExplosion({ effectKind: "primary", targetCount: 3,
    chainReactionActive: true });
  telemetry.recordLauncherExplosion({ effectKind: "cluster", targetCount: 2,
    chainReactionActive: true });
  telemetry.recordLauncherExplosion({ effectKind: "cluster", targetCount: 1,
    chainReactionActive: true });
  telemetry.recordLauncherExplosion({ effectKind: "cluster", targetCount: 0,
    chainReactionActive: true });
  telemetry.recordLauncherExplosion({ effectKind: "siege-bloom", targetCount: 4,
    chainReactionActive: true });
  telemetry.recordArcBladeSweep({ weaponId: "launcher", targetCount: 2 });
  telemetry.recordBurstShot({ weaponId: "launcher" });
  frame(telemetry, { deltaTime: 2 });

  const encounter = currentEncounter(telemetry);
  assert.deepEqual(encounter.configuredFillBand, { minimum: 0.15, target: 0.2, maximum: 0.25, ceiling: 0.7 });
  assert.equal(encounter.effectiveOpeningTarget, 0.2);
  assert.equal(encounter.waveProgressReadinessStableTime, 0.5);
  assert.equal(encounter.waveProgressReadinessBlockedReason, "armed");
  assert.equal(encounter.managedRegularEnemyCount, 12);
  assert.equal(encounter.peakManagedRegularEnemyCount, 12);
  assert.equal(encounter.dispatchPulseCount, 1);
  assert.deepEqual(encounter.reservationsCommittedByPulse, [2]);
  assert.equal(encounter.spawnBlockedByManagedCap, 1);
  assert.equal(encounter.spawnBlockedByFill, 1);
  assert.equal(encounter.waveComingStartFill, 0.25);
  assert.equal(encounter.waveComingSelectedDelta, 0.27);
  assert.equal(encounter.waveComingTarget, 0.52);
  assert.equal(encounter.waveComingPeakProjectedFill, 0.52);
  assert.deepEqual(encounter.eligibleEnemyTypes, ["normal", "fast", "tank", "gunner"]);
  assert.deepEqual(encounter.newlyIntroducedTypes, ["tank"]);
  assert.equal(encounter.playerEnemyOverlapEvents, 1);
  assert.equal(encounter.maxPlayerEnemyPenetration, 18);
  assert.equal(encounter.playerEnemySeparationCorrections, 4);
  assert.equal(encounter.enemyEnemyOverlapEvents, 3);
  assert.equal(encounter.enemyEnemySeparationCorrections, 7);
  assert.equal(encounter.maxEnemyEnemyPenetration, 22);
  assert.deepEqual(encounter.gunner, { bursts: 1, rangeBlockedTime: 1.25,
    losBlockedTime: 0.5, telegraphs: 1, telegraphCancels: 1 });
  assert.equal(encounter.weaponSlotA, "launcher");
  assert.equal(encounter.weaponSlotB, "arc-blade");
  assert.equal(encounter.activeWeapon, "arc-blade");
  assert.equal(encounter.weaponSwitchCount, 1);
  assert.deepEqual(encounter.weaponMetrics.launcher, { attacks: 1, projectiles: 1, hits: 1,
    damage: 2, kills: 1, pierceEvents: 1, explosionTargets: 3,
    arcBladeTargets: 2, burstShots: 1, killsPerActiveCombatSecond: 0.5 });
  assert.deepEqual(encounter.launcherEffects, { primaryAttacks: 1, primaryExplosions: 1,
    primaryExplosionTargets: 3, clusterExplosions: 3, clusterExplosionTargets: 3,
    siegeBloomBlasts: 1, siegeBloomTargets: 4,
    chainReactionCommittedAttacks: 1, chainReactionClusterExplosions: 3 });
});

test("Burst telemetry keeps committed sequence, Execution, follow-up, cancellation, and switch counters distinct", () => {
  const telemetry = create();
  telemetry.startRun({ player });
  telemetry.startEncounter({ type: "wave", definition: wave, player });
  telemetry.recordWeaponAttack({ weaponId: "burst" });
  telemetry.recordBurstAttackInitiated({ sequenceId: 41, shotsScheduled: 3, spacing: 0.06 });
  for (let shotIndex = 1; shotIndex <= 3; shotIndex++) {
    telemetry.recordWeaponProjectile({ weaponId: "burst" });
    telemetry.recordBurstShotFired({ weaponId: "burst", sequenceId: 41, shotIndex });
  }
  telemetry.recordExecutionRound({ sequenceId: 41, targetId: 77, bonusDamage: 4 });
  telemetry.recordExecutionFollowupScheduled({ sequenceId: 41, delay: 0.06 });
  telemetry.recordWeaponProjectile({ weaponId: "burst" });
  telemetry.recordExecutionFollowupFired({ weaponId: "burst", sequenceId: 41 });
  telemetry.recordDoubleTapHit({ damage: 4, killed: true });
  telemetry.recordBurstShotsCanceled({ count: 2 });
  telemetry.recordCommittedBurstWeaponSwitch({ sequenceId: 42 });

  const encounter = currentEncounter(telemetry);
  assert.deepEqual(encounter.burstEffects, {
    burstAttacksInitiated: 1, burstShotsScheduled: 3, burstShotsFired: 3,
    burstShotsCanceled: 2, executionRounds: 1, executionBonusDamage: 4,
    executionFollowupsScheduled: 1, executionFollowupsFired: 1,
    doubleTapHits: 1, doubleTapDamage: 4, doubleTapKills: 1,
    weaponSwitchDuringCommittedBurst: 1,
    recentSequences: [{ sequenceId: 41, spacing: 0.06, lastShotIndex: 3, executionTargetId: 77 }]
  });
  assert.equal(encounter.weaponMetrics.burst.attacks, 1);
  assert.equal(encounter.weaponMetrics.burst.projectiles, 4);
  assert.equal(encounter.weaponMetrics.burst.burstShots, 4);
});

test("Piercer telemetry bounds traversal detail and keeps Rail Array and Kinetic aggregates distinct", () => {
  const telemetry = create();
  telemetry.startRun({ player });
  telemetry.startEncounter({ type: "wave", definition: wave, player });
  telemetry.recordWeaponAttack({ weaponId: "piercer" });
  telemetry.recordRailArrayAttack({ attackId: 77, projectileCount: 3 });
  for (let index = 0; index < 3; index++) {
    telemetry.recordWeaponProjectile({ weaponId: "piercer" });
    telemetry.recordRailArrayProjectile({ attackId: 77, projectileIndex: index });
  }
  for (let ordinal = 1; ordinal <= 14; ordinal++) {
    telemetry.recordPiercerTraversal({ attackId: 77, projectileIndex: 0,
      targetId: 9000 + ordinal, ordinal, multiplier: ordinal === 1 ? 1 : 1.2,
      bonusDamage: ordinal === 1 ? 0 : 0.5 });
  }

  const encounter = currentEncounter(telemetry);
  assert.equal(encounter.weaponMetrics.piercer.attacks, 1);
  assert.equal(encounter.weaponMetrics.piercer.projectiles, 3);
  assert.deepEqual(encounter.piercerEffects, {
    railArrayAttacks: 1,
    railArrayProjectiles: 3,
    kineticCascadeAmplifiedHits: 13,
    kineticCascadeBonusDamage: 6.5,
    maxDistinctTargetsHitBySingleProjectile: 14,
    recentTraversal: Array.from({ length: 12 }, (_, index) => ({
      attackId: 77, projectileIndex: 0, targetId: 9003 + index,
      ordinal: 3 + index, multiplier: 1.2
    }))
  });
});

test("Scatter telemetry records bounded reward, ordinal, fan, and Crossfire observations without gameplay state", () => {
  const telemetry = create();
  telemetry.startRun({ player });
  telemetry.startEncounter({ type: "wave", definition: wave, player });
  telemetry.recordScatterReward({ rewardId: "wide-pattern", rankBefore: 0, rankAfter: 1, resolvedSpacing: 17 });
  telemetry.recordScatterReward({ rewardId: "wide-pattern", rankBefore: 1, rankAfter: 2, resolvedSpacing: 20 });
  telemetry.recordScatterReward({ rewardId: "saturation-volley" });
  telemetry.recordCrossfireDiscovery();
  telemetry.recordScatterAttack({ attackId: 61, widePatternRank: 2, resolvedSpacing: 18,
    saturationVolley: true, crossfireAttack: false, normalProjectiles: 7, interleavedProjectiles: 0 });
  telemetry.recordScatterProjectile({ fan: "normal" });
  telemetry.recordScatterProjectile({ fan: "interleaved" });
  telemetry.recordScatterTraversal({ attackId: 61, projectileIndex: 1, targetId: 1,
    ordinal: 2, multiplier: 1.1, distinctTargetCount: 2, bonusDamage: 0.26 });
  telemetry.recordScatterTraversal({ attackId: 61, projectileIndex: 2, targetId: 2,
    ordinal: 3, multiplier: 1.2, distinctTargetCount: 3, bonusDamage: 0.52 });
  telemetry.recordScatterTraversal({ attackId: 61, projectileIndex: 3, targetId: 3,
    ordinal: 4, multiplier: 1.3, distinctTargetCount: 4, bonusDamage: 0.78 });
  telemetry.recordCrossfireArmed({ attackId: 61 });
  telemetry.recordCrossfireConsumed({ attackId: 62 });
  telemetry.recordScatterAttack({ attackId: 62, widePatternRank: 2, resolvedSpacing: 18,
    saturationVolley: true, crossfireAttack: true, normalProjectiles: 7, interleavedProjectiles: 7 });

  const metrics = currentEncounter(telemetry).scatterEffects;
  assert.deepEqual(metrics.widePatternRewards, [
    { rankBefore: 0, rankAfter: 1, resolvedSpacing: 17 },
    { rankBefore: 1, rankAfter: 2, resolvedSpacing: 20 }
  ]);
  assert.equal(metrics.saturationVolleyAcquisitions, 1);
  assert.equal(metrics.crossfireDiscoveries, 1);
  assert.equal(metrics.saturationVolleyAttacks, 2);
  assert.equal(metrics.ordinal2Hits, 1);
  assert.equal(metrics.ordinal3Hits, 1);
  assert.equal(metrics.ordinal4PlusHits, 1);
  assert.equal(metrics.saturationBonusDamage, 1.56);
  assert.equal(metrics.crossfireArmed, 1);
  assert.equal(metrics.crossfireConsumed, 1);
  assert.equal(metrics.crossfireAttacks, 1);
  assert.equal(metrics.normalFanProjectiles, 1);
  assert.equal(metrics.interleavedFanProjectiles, 1);
  assert.equal(metrics.recentAttacks[0].distinctTargetCount, 4);
  assert.equal(metrics.recentTraversal.length, 3);
});
