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
      spawnTimer
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
    if ("spawnTimer" in values) spawnTimer = values.spawnTimer;
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
      return { left: 0, top: 0 };
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
    Math,
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
        return elements[id];
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
    xpToNextLevel: 34,
    spawnTimer: 1
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
  game.setState({ isChoosingUpgrade: true, spawnTimer: 0 });
  game.update(1);
  assert.deepEqual({ x: game.player.x, y: game.player.y, spawnTimer: game.getState().spawnTimer }, { x: 100, y: 100, spawnTimer: 0 });

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

function testBossBulletDamageAndContinuedGameplay() {
  const game = loadGame();
  startGame(game);
  const bullet = makeBullet({ damage: 2 });
  game.bullets.push(bullet);
  game.setState({ boss: makeBoss({ hp: 5 }) });
  game.handleBulletBossCollisions();
  assert.equal(game.getState().boss.hp, 3);
  assert.equal(game.bullets.length, 0);

  game.bullets.push(makeBullet({ damage: 3 }));
  game.handleBulletBossCollisions();
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
  assert.equal(game.player.x > playerX, true);
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
  game.setState({ isVictory: true, spawnTimer: 0 });
  game.update(1);
  assert.deepEqual({ x: game.player.x, y: game.player.y, spawnTimer: game.getState().spawnTimer }, { x: 100, y: 100, spawnTimer: 0 });
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
  ["boss bullet damage and continued gameplay", testBossBulletDamageAndContinuedGameplay],
  ["boss contact cooldown", testBossContactCooldown],
  ["victory stops updates", testVictoryStopsUpdates],
  ["restart from Game Over and Victory", testRestartFromGameOverAndVictory]
];

for (const [name, test] of tests) {
  test();
  console.log(`PASS ${name}`);
}
