const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const gamePath = path.join(__dirname, "..", "game.js");
const gameSource = fs.readFileSync(gamePath, "utf8");
const settlementSource = fs.readFileSync(path.join(__dirname, "..", "settlement.js"), "utf8");
const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

const testHook = `
globalThis.__gameTest = {
  player,
  enemies,
  bullets,
  weapon,
  keys,
  listeners: globalThis.__listeners,
  elements: globalThis.__elements,
  resetGame,
  startWave, startBossEncounter, completeBossEncounter, updateLevel, openAbandon, closeAbandon, abandonRun,
  encounters: Encounters,
  setAwards(hook) { getEncounterAwards = hook; },
  setReward(hook) { handleStageReward = hook; },
  update,
  createDefaultSaveData,
  loadSave,
  saveGame,
  handleBulletEnemyCollisions,
  handleBulletBossCollisions,
  handleBossPlayerCollision,
  updateBossDamageCooldown,
  getSaveData() {
    return saveData;
  },
  setSaveData(value) {
    saveData = value;
  },
  storage: globalThis.__storage,
  settlement: RunSettlement,
  settleRun,
  getRunSettlementState() {
    return runSettlementState;
  },
  getLastSettlement() {
    return lastSettlement;
  },
  getState() {
    return {
      boss,
      hasBossSpawned,
      isBossDefeated,
      bossDamageCooldown,
      isGameStarted,
      isGameOver,
      isVictory,
      isChoosingUpgrade,
      score,
      level,
      xp,
      previousXpRequirement,
      xpToNextLevel,
      runPhase, stageIndex, stageRuntime, currentWave, waveRuntime, bossRuntime, intermissionTimer, stageClearTimer, isAbandoned
    };
  },
  setState(values) {
    if ("boss" in values) boss = values.boss;
    if ("hasBossSpawned" in values) hasBossSpawned = values.hasBossSpawned;
    if ("isBossDefeated" in values) isBossDefeated = values.isBossDefeated;
    if ("bossDamageCooldown" in values) bossDamageCooldown = values.bossDamageCooldown;
    if ("isGameStarted" in values) isGameStarted = values.isGameStarted;
    if ("isGameOver" in values) isGameOver = values.isGameOver;
    if ("isVictory" in values) isVictory = values.isVictory;
    if ("isChoosingUpgrade" in values) isChoosingUpgrade = values.isChoosingUpgrade;
    if ("score" in values) score = values.score;
    if ("level" in values) level = values.level;
    if ("xp" in values) xp = values.xp;
    if ("previousXpRequirement" in values) previousXpRequirement = values.previousXpRequirement;
    if ("xpToNextLevel" in values) xpToNextLevel = values.xpToNextLevel;
  }
};
`;

function loadGame(initialStorage = {}) {
  const listeners = {};
  const storage = new Map(Object.entries(initialStorage));
  const createElement = (id) => ({
    textContent: "",
    hidden: id === "gameInterface",
    classList: {
      values: new Set(),
      add(name) { this.values.add(name); },
      remove(name) { this.values.delete(name); },
      contains(name) { return this.values.has(name); }
    },
    addEventListener(type, handler) {
      listeners[`${id}:${type}`] = handler;
    }
  });
  const canvas = {
    width: 800,
    height: 600,
    getContext() {
      return {
        clearRect() {}, fillRect() {}, fillText() {}, save() {}, restore() {}
      };
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 600 };
    },
    addEventListener(type, handler) {
      listeners[`canvas:${type}`] = handler;
    }
  };
  const elements = {
    gameCanvas: canvas,
    startScreen: createElement("startScreen"),
    gameInterface: createElement("gameInterface"),
    playButton: createElement("playButton"),
    hpValue: createElement("hpValue"),
    scoreValue: createElement("scoreValue"),
    levelValue: createElement("levelValue"),
    xpValue: createElement("xpValue")
  };
  const context = {
    Math: Object.assign(Object.create(Math), { random: () => 0.25 }),
    console,
    __listeners: listeners,
    __elements: elements,
    __storage: storage,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
      clear() {
        storage.clear();
      }
    },
    document: {
      getElementById(id) {
        return elements[id] ||= createElement(id);
      },
      addEventListener(type, handler) {
        listeners[type] = handler;
      }
    },
    requestAnimationFrame() {}
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(settlementSource, context, { filename: "settlement.js" });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "encounters.js"), "utf8"), context);
  vm.runInContext(gameSource + testHook, context, { filename: gamePath });
  return context.__gameTest;
}

function startGame(game) {
  game.listeners["playButton:click"]();
}

function makeBoss(overrides = {}) {
  return {
    x: 100,
    y: 100,
    width: 100,
    height: 100,
    speed: 0,
    hp: 50,
    maxHp: 50,
    ...overrides
  };
}

function makeBullet(overrides = {}) {
  return {
    x: 100,
    y: 100,
    width: 10,
    height: 10,
    speed: 0,
    damage: 1,
    directionX: 0,
    directionY: 0,
    ...overrides
  };
}

function assertResetState(game) {
  const state = game.getState();
  assert.deepEqual(
    { x: game.player.x, y: game.player.y, hp: game.player.hp },
    { x: 380, y: 280, hp: 5 }
  );
  assert.equal(game.enemies.length, 0);
  assert.equal(game.bullets.length, 0);
  assert.deepEqual({ ...game.keys }, { w: false, a: false, s: false, d: false });
  assert.equal(state.score, 0);
  assert.deepEqual(
    { level: state.level, xp: state.xp, previous: state.previousXpRequirement, next: state.xpToNextLevel },
    { level: 1, xp: 0, previous: 3, next: 5 }
  );
  assert.deepEqual({ ...game.weapon }, { damage: 1, bulletSpeed: 480, bulletSize: 10 });
  assert.equal(state.boss, null);
  assert.equal(state.hasBossSpawned, false);
  assert.equal(state.isBossDefeated, false);
  assert.equal(state.bossDamageCooldown, 0);
  assert.equal(state.isGameStarted, true);
  assert.equal(state.isGameOver, false);
  assert.equal(state.isVictory, false);
  assert.equal(state.isChoosingUpgrade, false);
}

function makeDirtyRun(game, endState) {
  game.player.x = 10;
  game.player.y = 20;
  game.player.hp = 1;
  game.enemies.push({});
  game.bullets.push({});
  Object.assign(game.keys, { w: true, a: true, s: true, d: true });
  Object.assign(game.weapon, { damage: 9, bulletSpeed: 900, bulletSize: 20 });
  game.setState({
    boss: makeBoss(),
    hasBossSpawned: true,
    isBossDefeated: true,
    bossDamageCooldown: 0.5,
    isGameStarted: true,
    isGameOver: endState === "gameOver",
    isVictory: endState === "victory",
    isChoosingUpgrade: true,
    score: 99,
    level: 5,
    xp: 20,
    previousXpRequirement: 21,
    xpToNextLevel: 34
  });
}

function testInputReset() {
  const game = loadGame();
  startGame(game);
  Object.assign(game.keys, { w: true, a: true, s: true, d: true });
  game.resetGame();
  assert.deepEqual({ ...game.keys }, { w: false, a: false, s: false, d: false });
}

function testUpgradePause() {
  const game = loadGame();
  startGame(game);
  game.player.x = 100;
  game.player.y = 100;
  game.keys.w = true;
  game.setState({ isChoosingUpgrade: true });
  game.update(1);
  assert.deepEqual({ x: game.player.x, y: game.player.y, groupDelayElapsed: game.getState().waveRuntime.groupDelayElapsed }, { x: 100, y: 100, groupDelayElapsed: 0 });

  const enemy = { x: 200, y: 100, width: 20, height: 20, hp: 1, maxHp: 1, speed: 0, type: "normal" };
  const bossBullet = makeBullet({ x: 100, y: 100, damage: 1 });
  const enemyBullet = makeBullet({ x: 200, y: 100, damage: 1 });
  game.enemies.push(enemy);
  game.bullets.push(bossBullet, enemyBullet);
  game.setState({ boss: makeBoss({ hp: 1 }), xp: 4, xpToNextLevel: 5, previousXpRequirement: 3, isChoosingUpgrade: false });
  game.update(0);

  assert.equal(game.getState().isChoosingUpgrade, true);
  assert.equal(game.getState().boss.hp, 1);
  assert.equal(game.bullets.includes(bossBullet), true);
}

function testBossBulletDamageAndFormalCompletion() {
  const game = loadGame();
  startGame(game);
  game.startBossEncounter();
  const bullet = makeBullet({ damage: 2 });
  game.bullets.push(bullet);
  game.setState({ boss: makeBoss({ hp: 5 }) });
  game.handleBulletBossCollisions();
  assert.equal(game.getState().boss.hp, 3);
  assert.equal(game.bullets.length, 0);

  game.bullets.push(makeBullet({ damage: 3 }));
  game.handleBulletBossCollisions();
  assert.equal(game.getState().boss.hp, 0);
  assert.equal(game.getSaveData().progression.defeatedBosses.length, 0);
  game.completeBossEncounter();
  const state = game.getState();
  assert.equal(state.boss, null);
  assert.equal(state.isBossDefeated, true);
  assert.equal(state.isVictory, false);
  assert.deepEqual(
    Array.from(game.getSaveData().progression.defeatedBosses),
    ["boss-1"]
  );
  assert.deepEqual(
    JSON.parse(game.storage.get("canva-war-save")).progression.defeatedBosses,
    ["boss-1"]
  );

  game.setState({ boss: makeBoss({ hp: 1 }) });
  game.bullets.push(makeBullet({ damage: 1 }));
  game.handleBulletBossCollisions();
  assert.deepEqual(
    Array.from(game.getSaveData().progression.defeatedBosses),
    ["boss-1"]
  );
  game.keys.d = true;
  const playerX = game.player.x;
  game.update(1);
  assert.equal(game.player.x, playerX);
  assert.equal(game.getState().runPhase, "STAGE_CLEAR");
}

function testBossContactCooldown() {
  const game = loadGame();
  startGame(game);
  game.player.x = 100;
  game.player.y = 100;
  game.player.hp = 5;
  game.setState({ boss: makeBoss(), bossDamageCooldown: 0 });
  game.handleBossPlayerCollision();
  assert.equal(game.player.hp, 4);
  game.handleBossPlayerCollision();
  assert.equal(game.player.hp, 4);
  game.updateBossDamageCooldown(1);
  game.handleBossPlayerCollision();
  assert.equal(game.player.hp, 3);
}

function testVictoryStopsUpdates() {
  const game = loadGame();
  startGame(game);
  game.player.x = 100;
  game.player.y = 100;
  game.keys.d = true;
  game.setState({ isVictory: true });
  game.update(1);
  assert.deepEqual({ x: game.player.x, y: game.player.y, groupDelayElapsed: game.getState().waveRuntime.groupDelayElapsed }, { x: 100, y: 100, groupDelayElapsed: 0 });
}

function testRestartFromGameOverAndVictory() {
  for (const endState of ["gameOver", "victory"]) {
    const game = loadGame();
    startGame(game);
    makeDirtyRun(game, endState);
    game.listeners.keydown({ key: "r" });
    assertResetState(game);
  }
}

function testStartScreenAndPlay() {
  const game = loadGame();
  assert.equal(game.getState().isGameStarted, false);
  assert.equal(game.elements.startScreen.hidden, false);
  assert.equal(game.elements.gameInterface.hidden, true);
  game.keys.d = true;
  game.update(1);
  assert.equal(game.player.x, 380);

  makeDirtyRun(game, "gameOver");
  startGame(game);
  assertResetState(game);
  assert.equal(game.elements.startScreen.hidden, true);
  assert.equal(game.elements.gameInterface.hidden, false);
  assert.equal(game.elements.hpValue.textContent, "5 / 5");
  assert.equal(game.elements.scoreValue.textContent, 0);
  assert.equal(game.elements.levelValue.textContent, 1);
  assert.equal(game.elements.xpValue.textContent, "0 / 5");
  assert.equal(game.getSaveData().statistics.totalRuns, 1);
  assert.equal(
    JSON.parse(game.storage.get("canva-war-save")).statistics.totalRuns,
    1
  );
}

function testInitialPageMarkup() {
  assert.match(indexSource, /<section id="gameInterface" class="game-screen" hidden>/);
  assert.match(indexSource, /href="style\.css\?v=2"/);
  assert.match(indexSource, /<title>CANVA WAR<\/title>/);
  assert.match(indexSource, /<h1>CANVA WAR<\/h1>/);
}

function testSaveDefaultsAndRoundTrip() {
  const game = loadGame();
  const defaultSave = game.createDefaultSaveData();
  assert.deepEqual(JSON.parse(JSON.stringify(defaultSave)), {
    version: 2,
    progression: { highestStage: 1, defeatedBosses: [], points: 0 },
    unlocks: { weapons: ["starter"], equipment: [] },
    statistics: { totalRuns: 0, totalKills: 0 }
  });
  assert.equal(game.getSaveData().version, 2);

  defaultSave.statistics.totalRuns = 3;
  game.setSaveData(defaultSave);
  game.saveGame();
  assert.deepEqual(
    JSON.parse(JSON.stringify(game.loadSave())),
    JSON.parse(JSON.stringify(defaultSave))
  );
}

function testVersionOneSaveMigratesPoints() {
  const legacySave = {
    version: 1,
    progression: { highestStage: 1, defeatedBosses: [] },
    unlocks: { weapons: ["starter"], equipment: [] },
    statistics: { totalRuns: 2, totalKills: 3 }
  };
  const game = loadGame({ "canva-war-save": JSON.stringify(legacySave) });
  assert.deepEqual(JSON.parse(JSON.stringify(game.getSaveData())), {
    ...legacySave,
    version: 2,
    progression: { ...legacySave.progression, points: 0 }
  });
}

function completeWave(settlement, state, clearScore = 100, performanceScore = 25) {
  settlement.completeEncounter(state, {
    type: "wave",
    clearScoreType: settlement.SCORE_TYPES.WAVE_CLEAR,
    clearScore,
    performanceBonuses: [{
      type: settlement.SCORE_TYPES.FLAWLESS_WAVE,
      score: performanceScore,
      record: { wave: state.progress.completedWaves + 1 }
    }]
  });
}

function testWaveCheckpointIncludesClearAndPerformanceScore() {
  const game = loadGame();
  const { settlement } = game;
  const state = settlement.createRunSettlementState();
  settlement.awardScore(state, settlement.SCORE_TYPES.ENEMY_KILL, 10);
  completeWave(settlement, state, 100, 25);

  assert.equal(state.score, 135);
  assert.equal(state.securedCheckpoint.score, 135);
  assert.equal(state.securedCheckpoint.scoreBreakdown.base.waveClear, 100);
  assert.equal(state.securedCheckpoint.scoreBreakdown.performance.flawlessWave, 25);
  assert.equal(state.securedCheckpoint.performanceRecords.flawlessWaves.length, 1);
}

function testSettlementEndReasonSelection() {
  const game = loadGame();
  const { settlement } = game;
  const state = settlement.createRunSettlementState();
  completeWave(settlement, state, 100, 25);
  settlement.awardScore(state, settlement.SCORE_TYPES.ENEMY_KILL, 40);

  assert.equal(
    settlement.selectSettlementState(state, settlement.RUN_END_REASONS.ABANDON).score,
    125
  );
  assert.equal(
    settlement.selectSettlementState(state, settlement.RUN_END_REASONS.DEATH).score,
    165
  );
  assert.equal(
    settlement.selectSettlementState(state, settlement.RUN_END_REASONS.VICTORY).score,
    165
  );
}

function testEarlyAbandonAndSnapshotIsolation() {
  const game = loadGame();
  const { settlement } = game;
  const state = settlement.createRunSettlementState();
  assert.equal(settlement.selectSettlementState(state, settlement.RUN_END_REASONS.ABANDON), null);
  assert.doesNotThrow(() => settlement.calculateSettlement(state));
  startGame(game);
  assert.doesNotThrow(() => game.settleRun(settlement.RUN_END_REASONS.ABANDON));
  assert.equal(game.getLastSettlement(), null);

  completeWave(settlement, state);
  state.performanceRecords.flawlessWaves[0].wave = 99;
  assert.equal(state.securedCheckpoint.performanceRecords.flawlessWaves[0].wave, 1);
}

function testSettlementMathIsSafeMonotonicAndDeterministic() {
  const game = loadGame();
  const { settlement } = game;
  const state = settlement.createRunSettlementState();
  state.progress.currentEncounter = { scoreAllowance: 200 };
  const capacity = settlement.calculateEfficientScoreCapacity(state);
  assert.equal(settlement.calculatePoints(0), 0);
  assert.equal(settlement.calculatePoints(0, {
    points: { baselinePoints: 100, referenceEffectiveScore: 1000, exponent: 0 }
  }), 0);
  assert.equal(settlement.calculatePoints(1000, {
    points: { baselinePoints: 100, referenceEffectiveScore: 1000, exponent: 0 }
  }) > 0, true);
  assert.equal(settlement.calculateEffectiveScore(50, capacity), 50);
  assert.equal(settlement.calculateEffectiveScore(capacity, capacity), capacity);
  assert.equal(settlement.calculateEffectiveScore(200, capacity, {
    antiFarming: { excessDiminishingRate: 0 }
  }), 200);

  const atCapacity = settlement.calculateEffectiveScore(capacity, capacity);
  const aboveCapacity = settlement.calculateEffectiveScore(capacity * 2, capacity);
  assert.equal(aboveCapacity > atCapacity, true);
  assert.equal(aboveCapacity - atCapacity < capacity, true);

  const largeScore = 1e9;
  const veryLargeScore = 1e12;
  assert.equal(
    settlement.calculateEffectiveScore(veryLargeScore, capacity) >
      settlement.calculateEffectiveScore(largeScore, capacity),
    true
  );

  let previousEffectiveScore = -1;
  let previousPoints = -1;
  for (let score = 0; score <= 10000; score += 25) {
    const effectiveScore = settlement.calculateEffectiveScore(score, capacity);
    const points = settlement.calculatePoints(effectiveScore);
    assert.equal(effectiveScore >= previousEffectiveScore, true);
    assert.equal(points >= previousPoints, true);
    previousEffectiveScore = effectiveScore;
    previousPoints = points;
  }

  assert.equal(Number.isFinite(settlement.calculateEffectiveScore(100, 0)), true);
  assert.equal(Number.isFinite(settlement.calculateEffectiveScore(100, Number.NaN)), true);
  const first = settlement.calculateSettlement(state);
  const second = settlement.calculateSettlement(state);
  assert.deepEqual(first, second);
}

function testResetClearsSettlementState() {
  const game = loadGame();
  startGame(game);
  const state = game.getRunSettlementState();
  game.settlement.awardScore(state, game.settlement.SCORE_TYPES.ENEMY_KILL, 50);
  game.settlement.secureSettlementCheckpoint(state);
  game.resetGame();
  const resetState = game.getRunSettlementState();
  assert.equal(resetState.score, 0);
  assert.equal(resetState.securedCheckpoint, null);
}

function testDeathSettlesCurrentRunAndAwardsPointsOnce() {
  const game = loadGame();
  startGame(game);
  const runState = game.getRunSettlementState();
  game.settlement.awardScore(runState, game.settlement.SCORE_TYPES.ENEMY_KILL, 1000);
  game.setState({ score: 1000 });
  game.player.hp = 1;
  game.enemies.push({ x: game.player.x, y: game.player.y, width: 20, height: 20, hp: 1, maxHp: 1, speed: 0, type: "normal" });
  game.update(0);

  const result = game.getLastSettlement();
  assert.equal(result.finalScore, 1000);
  assert.equal(game.getSaveData().progression.points, result.points);
  game.settleRun(game.settlement.RUN_END_REASONS.DEATH);
  assert.equal(game.getSaveData().progression.points, result.points);
}

function testCorruptedSaveFallsBackToDefaults() {
  const game = loadGame({ "canva-war-save": "{invalid json" });
  assert.deepEqual(
    JSON.parse(JSON.stringify(game.getSaveData())),
    JSON.parse(JSON.stringify(game.createDefaultSaveData()))
  );
}

function testInvalidSaveShapeFallsBackToDefaults() {
  const game = loadGame({
    "canva-war-save": JSON.stringify({ version: 2, progression: {}, unlocks: {}, statistics: {} })
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(game.getSaveData())),
    JSON.parse(JSON.stringify(game.createDefaultSaveData()))
  );
}

function testNormalEnemyKillsPersist() {
  const game = loadGame();
  startGame(game);
  const enemy = { x: 100, y: 100, width: 20, height: 20, hp: 1, maxHp: 1, speed: 0, type: "normal" };
  game.enemies.push(enemy);
  game.bullets.push(makeBullet({ x: 100, y: 100 }));
  game.handleBulletEnemyCollisions();
  assert.equal(game.getSaveData().statistics.totalKills, 1);
  assert.equal(JSON.parse(game.storage.get("canva-war-save")).statistics.totalKills, 1);

  game.enemies.push({ x: game.player.x, y: game.player.y, width: 20, height: 20, hp: 1, maxHp: 1, speed: 0, type: "normal" });
  game.update(0);
  assert.equal(game.getSaveData().statistics.totalKills, 1);
}

const tests = [
  ["initial page markup", testInitialPageMarkup],
  ["save defaults and round trip", testSaveDefaultsAndRoundTrip],
  ["version one save migrates points", testVersionOneSaveMigratesPoints],
  ["corrupted save falls back to defaults", testCorruptedSaveFallsBackToDefaults],
  ["invalid save shape falls back to defaults", testInvalidSaveShapeFallsBackToDefaults],
  ["start screen and Play", testStartScreenAndPlay],
  ["normal enemy kills persist", testNormalEnemyKillsPersist],
  ["wave checkpoint includes clear and performance score", testWaveCheckpointIncludesClearAndPerformanceScore],
  ["settlement end reason selection", testSettlementEndReasonSelection],
  ["early abandon and snapshot isolation", testEarlyAbandonAndSnapshotIsolation],
  ["settlement math is safe, monotonic, and deterministic", testSettlementMathIsSafeMonotonicAndDeterministic],
  ["reset clears settlement state", testResetClearsSettlementState],
  ["death settles current run and awards points once", testDeathSettlesCurrentRunAndAwardsPointsOnce],
  ["input reset", testInputReset],
  ["upgrade pause", testUpgradePause],
  ["boss bullet damage and formal completion", testBossBulletDamageAndFormalCompletion],
  ["boss contact cooldown", testBossContactCooldown],
  ["victory stops updates", testVictoryStopsUpdates],
  ["restart from Game Over and Victory", testRestartFromGameOverAndVictory]
];

for (const [name, test] of tests) {
  require("node:test")(name, test);
}

const test = require("node:test");
function finishWave(game) {
  for (let i = 0; i < 30 && game.getState().runPhase === "WAVE_ACTIVE"; i++) {
    game.update(0);
    // Simulate legitimate removals, independently of kill awards.
    game.enemies.length = 0;
    game.update(3);
  }
  assert.equal(game.getState().runPhase, "INTERMISSION");
}

test("finite five-Wave flow, movement-only intermission, Boss and reward to Victory", () => {
  const game = loadGame(); startGame(game);
  let rewardCalls = 0;
  game.setReward(context => { assert.equal(context.completed, true); rewardCalls++; });
  for (let index = 0; index < 5; index++) {
    assert.equal(game.getState().stageRuntime.waveIndex, index);
    game.bullets.push(makeBullet()); finishWave(game);
    assert.equal(game.bullets.length, 0);
    const snapshot = game.getRunSettlementState().securedCheckpoint;
    assert.equal(snapshot.progress.completedWaves, index + 1);
    game.listeners["canvas:click"](); assert.equal(game.bullets.length, 0);
    game.player.x = 380; const x = game.player.x; game.keys.d = true;
    game.update(0.1); assert.ok(game.player.x > x);
    game.setState({ isChoosingUpgrade: true });
    game.update(20); assert.equal(game.getState().intermissionTimer, 0.1);
    game.setState({ isChoosingUpgrade: false });
    game.update(3.8); assert.equal(game.getState().runPhase, "INTERMISSION");
    assert.equal(game.enemies.length, 0);
    game.update(0.11);
    assert.equal(game.getState().runPhase, index < 4 ? "WAVE_ACTIVE" : "BOSS_ACTIVE");
    assert.equal(game.keys.d, false);
    assert.equal(game.getState().hasBossSpawned, index === 4);
  }
  game.setState({ boss: makeBoss({ hp: 1 }) });
  game.bullets.push(makeBullet()); game.update(0);
  assert.equal(game.getState().runPhase, "STAGE_CLEAR");
  assert.equal(game.getState().bossRuntime.isComplete, true);
  assert.equal(game.getRunSettlementState().progress.completedBossEncounters, 1);
  assert.equal(game.getRunSettlementState().progress.completedStages, 1);
  const checkpoint = game.getRunSettlementState().securedCheckpoint;
  assert.deepEqual(Array.from(game.getSaveData().progression.defeatedBosses), ["boss-1"]);
  game.completeBossEncounter(); assert.equal(game.getRunSettlementState().securedCheckpoint, checkpoint);
  const before = JSON.stringify({ hp: game.player.hp, weapon: game.weapon, unlocks: game.getSaveData().unlocks });
  game.update(1.24); assert.equal(game.getState().runPhase, "STAGE_CLEAR");
  game.update(0.01); assert.equal(game.getState().runPhase, "STAGE_REWARD");
  game.update(0); assert.equal(rewardCalls, 1);
  assert.equal(game.getState().runPhase, "RUN_VICTORY");
  assert.equal(JSON.stringify({ hp: game.player.hp, weapon: game.weapon, unlocks: game.getSaveData().unlocks }), before);
  assert.equal(game.getLastSettlement().finalProgress.completedStages, 1);
  assert.equal(game.getRunSettlementState().securedCheckpoint, checkpoint);
});

test("Level 5 is only build progression and pauses all Wave timing", () => {
  const game = loadGame(); startGame(game);
  game.setState({ level: 4, xp: 5 }); game.updateLevel();
  assert.equal(game.getState().level, 5); assert.equal(game.getState().boss, null);
  game.update(10);
  assert.equal(game.getState().waveRuntime.elapsedTime, 0);
  assert.equal(game.getState().waveRuntime.groupDelayElapsed, 0);
  assert.equal(game.getState().runPhase, "WAVE_ACTIVE");
});

test("contact removal tracks damage and living count without kill credit", () => {
  const game = loadGame(); startGame(game); game.update(0);
  const enemy = game.enemies[0];
  enemy.x = game.player.x; enemy.y = game.player.y;
  const count = game.getState().waveRuntime.aliveEnemyCount;
  game.update(0);
  assert.equal(game.getState().waveRuntime.aliveEnemyCount, count - 1);
  assert.equal(game.getState().waveRuntime.damageTaken, 1);
  assert.equal(game.getState().score, 0); assert.equal(game.getState().xp, 0);
  assert.equal(game.getSaveData().statistics.totalKills, 0);
});

test("simultaneous lethal Boss contact and bullet gives Death priority and no persistence", () => {
  const game = loadGame(); startGame(game); game.startBossEncounter();
  game.player.x = 100; game.player.y = 100; game.player.hp = 1;
  game.setState({ boss: makeBoss({ hp: 1 }) }); game.bullets.push(makeBullet());
  game.update(0);
  assert.equal(game.getState().runPhase, "RUN_DEAD");
  assert.equal(game.getState().isVictory, false);
  assert.equal(game.getState().isBossDefeated, false);
  assert.equal(game.getSaveData().progression.defeatedBosses.length, 0);
  assert.equal(game.getRunSettlementState().progress.completedBossEncounters, 0);
  assert.equal(game.getRunSettlementState().securedCheckpoint, null);
  assert.equal(game.getState().bossRuntime.damageTaken, 1);
});

test("Boss pause freezes timing and lethal HP alone never persists", () => {
  const game = loadGame(); startGame(game); game.startBossEncounter();
  game.setState({ isChoosingUpgrade: true }); game.update(5);
  assert.equal(game.getState().bossRuntime.elapsedTime, 0);
  game.setState({ isChoosingUpgrade: false, boss: makeBoss({ hp: 1 }) });
  game.bullets.push(makeBullet()); game.handleBulletBossCollisions();
  game.player.hp = 0; game.completeBossEncounter();
  assert.equal(game.getSaveData().progression.defeatedBosses.length, 0);
});

test("Wave awards and performance hooks run before the secured checkpoint", () => {
  const game = loadGame(); startGame(game);
  game.setAwards((type, runtime) => ({ type, clearScoreType: "waveClear", clearScore: 7,
    performanceBonuses: [{ type: "quickClear", score: 3, record: { elapsedTime: runtime.elapsedTime } }] }));
  finishWave(game);
  const snapshot = game.getRunSettlementState().securedCheckpoint;
  assert.equal(snapshot.score, 10); assert.equal(game.getState().score, 10);
  assert.equal(snapshot.scoreBreakdown.base.waveClear, 7);
  assert.equal(snapshot.scoreBreakdown.performance.quickClear, 3);
});

test("Abandon overlay pauses, cancels, and settles only the checkpoint", () => {
  const game = loadGame(); startGame(game);
  game.openAbandon(); game.update(100);
  assert.equal(game.getState().waveRuntime.elapsedTime, 0);
  game.listeners["canvas:click"](); assert.equal(game.bullets.length, 0);
  game.closeAbandon(); finishWave(game);
  game.settlement.awardScore(game.getRunSettlementState(), "enemyKill", 100);
  game.openAbandon(); game.update(100);
  assert.equal(game.getState().intermissionTimer, 0);
  game.abandonRun(); assert.equal(game.getState().isAbandoned, true);
  assert.equal(game.getLastSettlement().finalScore, 0);
  game.update(100); assert.equal(game.getState().intermissionTimer, 0);
  game.listeners.keydown({ key: "r" });
  assert.equal(game.getState().runPhase, "WAVE_ACTIVE");
  assert.equal(game.getState().isAbandoned, false);
  game.openAbandon(); game.abandonRun(); assert.equal(game.getLastSettlement(), null);
});

test("canonical reset clears encounter timers/history and preserves persistent meta", () => {
  const game = loadGame(); startGame(game);
  finishWave(game); game.update(4); game.update(1);
  game.startBossEncounter(); game.update(0.5);
  game.getSaveData().progression.points = 25;
  const saved = JSON.stringify(game.getSaveData());
  game.resetGame(); const state = game.getState();
  assert.equal(state.stageIndex, 0); assert.equal(state.stageRuntime.waveIndex, 0);
  assert.deepEqual(Array.from(state.stageRuntime.recentTemplates), ["basic"]);
  assert.equal(state.waveRuntime.nextSpawnGroupIndex, 0);
  assert.equal(state.waveRuntime.groupDelayElapsed, 0);
  assert.equal(state.waveRuntime.activeThreat, 0); assert.equal(state.waveRuntime.damageTaken, 0);
  assert.equal(state.intermissionTimer, 0); assert.equal(state.stageClearTimer, 0);
  assert.equal(state.bossRuntime, null); assert.equal(state.boss, null);
  assert.equal(JSON.stringify(game.getSaveData()), saved);
});

test("storage errors cannot stop combat or settlement", () => {
  const game = loadGame(); startGame(game);
  game.storage.set = () => { throw new Error("storage disabled"); };
  assert.doesNotThrow(() => game.saveGame());
  assert.doesNotThrow(() => game.settleRun("death"));
});
test("held movement repeats cannot leak across encounter transitions", () => {
  const game = loadGame(); startGame(game);
  game.listeners.keydown({ key: "d" }); assert.equal(game.keys.d, true);
  finishWave(game); assert.equal(game.keys.d, false);
  game.listeners.keydown({ key: "d", repeat: true }); assert.equal(game.keys.d, false);
  game.listeners.keyup({ key: "d" }); game.listeners.keydown({ key: "d", repeat: false });
  assert.equal(game.keys.d, true);
});

test("last kill opening an upgrade defers Wave Clear and checkpoint until resume", () => {
  const game = loadGame(); startGame(game);
  const runtime = game.getState().waveRuntime;
  runtime.nextSpawnGroupIndex = game.getState().currentWave.spawnGroups.length;
  game.enemies.push({ waveId: runtime.waveId, type: "normal", x: 100, y: 100, width: 20, height: 20, hp: 1, speed: 0 });
  game.bullets.push(makeBullet()); game.setState({ xp: 4 });
  game.update(0);
  assert.equal(game.getState().isChoosingUpgrade, true);
  assert.equal(runtime.aliveEnemyCount, 0);
  assert.equal(game.getState().runPhase, "WAVE_ACTIVE");
  assert.equal(game.getRunSettlementState().securedCheckpoint, null);
  game.update(5); assert.equal(runtime.elapsedTime, 0);
  game.listeners.keydown({ key: "1" }); game.update(0);
  assert.equal(game.getState().runPhase, "INTERMISSION");
  assert.equal(game.getRunSettlementState().securedCheckpoint.score, 1);
});

test("all invalid Points exponents retain the positive configured fallback", () => {
  const { settlement } = loadGame();
  const standard = settlement.calculatePoints(1234);
  for (const exponent of [0, -1, NaN, Infinity, undefined]) {
    const config = { points: { ...settlement.SETTLEMENT_CONFIG.points, exponent } };
    assert.equal(settlement.calculatePoints(1234, config), standard);
    assert.equal(settlement.calculatePoints(0, config), 0);
    assert.equal(settlement.calculatePoints(-1, config), 0);
  }
});
