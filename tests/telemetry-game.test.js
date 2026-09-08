const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));

// Exercise the production game hooks in an isolated browser-shaped context.
// This deliberately does not load the optional presentation adapter.
function loadGame(search = "", options = {}) {
  const listeners = {}, elements = {}, storage = new Map(), writes = [], warnings = [];
  let randomCalls = 0, randomState = 751;
  const element = id => ({
    textContent: "", hidden: id !== "startScreen", style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    focus() {},
    addEventListener(type, callback) { listeners[`${id}:${type}`] = callback; }
  });
  elements.gameCanvas = {
    ...element("canvas"), width: 800, height: 600,
    getContext() { return { clearRect() {}, fillRect() {}, fillText() {}, save() {}, restore() {} }; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
  };
  const context = {
    Date, URLSearchParams,
    location: { search }, innerWidth: 1000, innerHeight: 800, devicePixelRatio: 1,
    console: { log() {}, warn(...args) { warnings.push(args); } },
    Math: Object.assign(Object.create(Math), { random() {
      randomCalls++;
      randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
      return randomState / 4294967296;
    } }),
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, String(value)); writes.push([key, String(value)]); }
    },
    document: {
      getElementById(id) { return elements[id] ||= element(id); },
      addEventListener(type, callback) { listeners[type] = callback; }
    },
    requestAnimationFrame() {}
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  for (const file of ["settlement.js", "encounters.js", "telemetry.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  options.beforeGame?.(context);
  vm.runInContext(fs.readFileSync(path.join(root, "game.js"), "utf8") + `
    globalThis.__testGame = {
      player, enemies, bullets, weapon, keys,
      resetGame, update, startWave, startBossEncounter, completeBossEncounter,
      enterIntermission, openAbandon, closeAbandon, abandonRun,
      handleBulletEnemyCollisions, handlePlayerEnemyCollisions,
      handleBulletBossCollisions, handleBossPlayerCollision,
      chooseUpgrade, updateLevel, takeDamage, settleRun, observeTelemetry,
      get telemetry() { return playtestTelemetry; },
      get state() {
        return { score, level, xp, isChoosingUpgrade, isGameOver, isVictory,
          isAbandoned, runPhase, stageIndex, stageRuntime, currentWave,
          waveRuntime, bossRuntime, boss, intermissionTimer, stageClearTimer,
          runSettlementState, lastSettlement, saveData };
      },
      setState(values) {
        if ("xp" in values) xp = values.xp;
        if ("level" in values) level = values.level;
        if ("isChoosingUpgrade" in values) isChoosingUpgrade = values.isChoosingUpgrade;
        if ("boss" in values) boss = values.boss;
      }
    };
  `, context, { filename: "game.js" });
  return Object.assign(context.__testGame, {
    context, listeners, elements, storage, writes, warnings,
    getRandomCalls: () => randomCalls,
    start() { listeners["playButton:click"](); }
  });
}

function enemy(game, overrides = {}) {
  return {
    type: "normal", waveId: game.state.currentWave.id,
    x: 100, y: 100, width: 20, height: 20,
    hp: 1, maxHp: 1, speed: 0, damage: 1, ...overrides
  };
}

function bullet(overrides = {}) {
  return { x: 100, y: 100, width: 10, height: 10,
    directionX: 0, directionY: 0, speed: 0, damage: 1, ...overrides };
}

function finishWave(game) {
  game.state.waveRuntime.nextSpawnGroupIndex = game.state.currentWave.spawnGroups.length;
  game.enemies.length = 0;
  game.update(0);
  assert.equal(game.state.runPhase, "INTERMISSION");
}

function finishByAbandon(game) {
  game.openAbandon();
  game.abandonRun();
}

function current(game) { return game.telemetry.getCurrentRun(); }
function session(game) { return game.telemetry.getSessionReport(); }
function lastRun(game) { return session(game).runs.at(-1); }
function currentEncounter(game) { return current(game).encounters.at(-1); }

test("game telemetry is opt-in, does not initialize a Run on page load, and consumes no RNG", () => {
  const normal = loadGame(), enabled = loadGame("?playtest=1");
  assert.equal(normal.telemetry?.enabled ?? false, false);
  let detailsRead = false;
  normal.observeTelemetry("recordDamage", () => { detailsRead = true; throw new Error("disabled details"); });
  assert.equal(detailsRead, false);
  assert.equal(enabled.telemetry.enabled, true);
  assert.equal(enabled.getRandomCalls(), 0);
  assert.equal(current(enabled), null);
  assert.equal(session(enabled).runs.length, 0);
  normal.start(); enabled.start();
  assert.equal(enabled.getRandomCalls(), normal.getRandomCalls());
  assert.equal(current(enabled).runSequence, 1);
  assert.equal(current(enabled).encounters.length, 1);
  assert.equal(session(enabled).runs.length, 0);
});

test("Wave start snapshots exact definition, analysis, Player and existing weapon state", () => {
  const game = loadGame("?playtest=1"); game.start();
  const encounter = currentEncounter(game), wave = game.state.currentWave;
  assert.equal(encounter.type, "wave");
  for (const key of ["stageId", "waveIndex", "templateId", "threatBudget", "maxActiveThreat"]) {
    assert.equal(encounter[key], wave[key]);
  }
  assert.equal(encounter.waveId, wave.id);
  assert.equal(encounter.generatedThreat, wave.analysis.threat);
  assert.deepEqual(plain(encounter.analysis), plain(wave.analysis));
  assert.equal(encounter.startHp, 5);
  assert.equal(encounter.playerLevelStart, 1);
  assert.deepEqual(plain(encounter.playerStart.weapon), { damage: 1, bulletSpeed: 480, bulletSize: 10 });
  assert.equal(encounter.playerStart.playerXp, 0);
  assert.equal(encounter.spawnGroups.length, wave.spawnGroups.length);
  assert.equal(encounter.configuredSpawnFloor, wave.spawnGroups.reduce((sum, group) => sum + group.delay, 0));
  assert.equal(Object.isFrozen(wave), true);
});

test("identical RNG and input produce identical combat, generated Waves, checkpoints and save writes", () => {
  function exercise(game) {
    game.start();
    const waves = [], checkpoints = [];
    for (let index = 0; index < 5; index++) {
      waves.push(plain(game.state.currentWave));
      game.listeners.keydown({ key: "d" });
      game.update(0.05);
      game.listeners.keyup({ key: "d" });
      game.listeners["canvas:mousemove"]({ clientX: 10, clientY: 10 });
      game.listeners["canvas:click"]();
      game.update(0.025);
      game.enemies.length = 0;
      game.bullets.length = 0;
      game.enemies.push(enemy(game));
      game.bullets.push(bullet());
      game.handleBulletEnemyCollisions();
      if (game.state.isChoosingUpgrade) game.chooseUpgrade("2");
      finishWave(game);
      checkpoints.push(plain(game.state.runSettlementState.securedCheckpoint));
      game.update(4);
    }
    assert.equal(game.state.runPhase, "BOSS_ACTIVE");
    game.state.boss.x = 100; game.state.boss.y = 100;
    game.bullets.push(bullet({ damage: 50 }));
    game.handleBulletBossCollisions();
    game.completeBossEncounter();
    game.update(1.25); game.update(0);
    return plain({ player: game.player, weapon: game.weapon, state: game.state,
      enemies: game.enemies, bullets: game.bullets, keys: game.keys,
      waves, checkpoints, writes: game.writes, rngCalls: game.getRandomCalls() });
  }
  const normal = loadGame(), enabled = loadGame("?playtest=1");
  assert.deepEqual(exercise(enabled), exercise(normal));
  const run = lastRun(enabled);
  assert.equal(run.victory, true);
  assert.equal(run.encounters.length, 6);
  assert.equal(run.encounters.every(encounter => encounter.outcome === "clear"), true);
  for (const encounter of run.encounters) {
    assert.equal(typeof encounter.encounterElapsedTime, "number");
    assert.equal(encounter.actualClearTime, encounter.encounterElapsedTime);
    assert.equal(typeof encounter.clearTimeRatio, "number");
    assert.equal(encounter.clearTimeRatio,
      encounter.actualClearTime / encounter.analysis.expectedClearTime);
  }
});

test("Level-Up and Abandon confirmation freeze combat measurements and Intermission has its own timer", () => {
  const game = loadGame("?playtest=1"); game.start();
  game.player.hp = 1;
  game.update(0.1);
  const before = plain(currentEncounter(game));
  assert.equal(before.minimumHpRatio, 0.2);
  assert.equal(before.timeAtOrBelow30PercentHp, 0.1);
  assert.equal(game.state.score, 0);
  game.setState({ isChoosingUpgrade: true }); game.update(60);
  assert.deepEqual(plain(currentEncounter(game)), before);
  game.setState({ isChoosingUpgrade: false });
  game.openAbandon(); game.update(120);
  assert.deepEqual(plain(currentEncounter(game)), before);
  game.closeAbandon();
  finishWave(game);
  const combatTime = current(game).totalActiveCombatTime;
  game.update(1.5);
  assert.equal(current(game).totalActiveCombatTime, combatTime);
  assert.equal(current(game).totalIntermissionTime, 1.5);
  game.openAbandon(); game.update(50);
  assert.equal(current(game).totalIntermissionTime, 1.5);
});

test("real Spawn Group hooks distinguish configured delay from pressure and record release time", () => {
  const game = loadGame("?playtest=1"); game.start(); game.update(0);
  game.enemies.forEach(value => { value.speed = 0; });
  const runtime = game.state.waveRuntime;
  const nextIndex = runtime.nextSpawnGroupIndex;
  const delay = game.state.currentWave.spawnGroups[nextIndex].delay;
  game.update(delay - 0.25);
  assert.equal(currentEncounter(game).pressureBlockedTime, 0);
  assert.equal(currentEncounter(game).pressureBlockedEvents, 0);
  game.update(0.5); game.update(0.5);
  assert.equal(runtime.nextSpawnGroupIndex, nextIndex);
  assert.equal(currentEncounter(game).pressureBlockedTime, 0.75);
  assert.equal(currentEncounter(game).pressureBlockedEvents, 1);
  game.openAbandon(); game.update(30); game.closeAbandon();
  assert.equal(currentEncounter(game).pressureBlockedTime, 0.75);
  // The corrected Basic second Group carries Threat 4, so the first Group must
  // leave the field before the existing pressure gate can release it.
  game.enemies.length = 0;
  game.update(0);
  assert.equal(runtime.nextSpawnGroupIndex, nextIndex + 1);
  const encounter = currentEncounter(game);
  assert.equal(encounter.actualLastGroupReleaseTime, runtime.elapsedTime);
  assert.equal(encounter.groupReleaseTimes.at(-1).groupIndex, nextIndex);
  assert.equal(encounter.peakActiveEnemyCount, 4);
  assert.equal(encounter.peakActiveThreat, 4);
  assert.equal(encounter.averageActiveEnemyCount, 4);
  assert.equal(encounter.averageActiveThreat, 4);
});

test("shot and successful hit hooks preserve collision results, kill credits and contact removals", () => {
  const game = loadGame("?playtest=1"); game.start();
  game.listeners["canvas:click"]();
  assert.equal(game.bullets.length, 1);
  game.bullets.length = 0;
  game.enemies.push(enemy(game, { hp: 2 }));
  game.bullets.push(bullet()); game.handleBulletEnemyCollisions();
  assert.equal(game.enemies[0].hp, 1);
  assert.equal(game.state.score, 0);
  game.bullets.push(bullet()); game.handleBulletEnemyCollisions();
  assert.equal(game.enemies.length, 0);
  game.enemies.push(enemy(game, { type: "fast", x: game.player.x, y: game.player.y }));
  game.handlePlayerEnemyCollisions();
  const encounter = currentEncounter(game);
  assert.equal(encounter.shotsFired, 1);
  assert.equal(encounter.bulletHits, 2);
  assert.equal(encounter.killsByEnemyType.normal, 1);
  assert.equal(encounter.nonKillRemovalsByEnemyType.fast, 1);
  assert.equal(encounter.damageTaken, 1);
  assert.equal(encounter.minimumHp, 4);
  assert.equal(encounter.minimumHpRatio, 0.8);
  assert.equal(game.state.score, 1);
  assert.equal(game.state.xp, 1);
  assert.equal(game.state.saveData.statistics.totalKills, 1);
});

test("fatal contact includes its removal before Death snapshot and finalizes only once", () => {
  const game = loadGame("?playtest=1"); game.start();
  game.player.hp = 1;
  game.enemies.push(enemy(game, { x: game.player.x, y: game.player.y }));
  game.update(0.2);
  const report = plain(lastRun(game)), encounter = report.encounters[0];
  assert.equal(report.endReason, "death");
  assert.equal(encounter.outcome, "death");
  assert.equal(encounter.nonKillRemovalsByEnemyType.normal, 1);
  assert.equal(encounter.killsByEnemyType.normal || 0, 0);
  assert.equal(encounter.damageTaken, 1);
  assert.equal(encounter.minimumHp, 0);
  assert.equal(encounter.endHp, 0);
  assert.equal(encounter.encounterElapsedTime, 0.2);
  assert.equal(encounter.actualClearTime, null);
  assert.equal(encounter.clearTimeRatio, null);
  const exported = JSON.parse(JSON.stringify(game.telemetry.getSessionReport()));
  assert.equal(exported.runs[0].encounters[0].actualClearTime, null);
  assert.equal(exported.runs[0].encounters[0].clearTimeRatio, null);
  assert.equal(game.state.score, 0);
  assert.equal(game.state.xp, 0);
  game.update(5); game.settleRun("death");
  assert.equal(session(game).runs.length, 1);
  assert.deepEqual(plain(lastRun(game)), report);
});

test("last kill that opens Level-Up retains the same encounter until the resumed Wave Clear", () => {
  const game = loadGame("?playtest=1"); game.start();
  game.state.waveRuntime.nextSpawnGroupIndex = game.state.currentWave.spawnGroups.length;
  game.enemies.push(enemy(game)); game.bullets.push(bullet());
  game.setState({ xp: 4 }); game.update(0);
  assert.equal(game.state.isChoosingUpgrade, true);
  assert.notEqual(currentEncounter(game).outcome, "clear");
  game.update(45); game.listeners.keydown({ key: "1" }); game.update(0);
  const finished = plain(currentEncounter(game));
  assert.equal(finished.outcome, "clear");
  assert.equal(finished.playerLevelEnd, 2);
  assert.equal(typeof finished.encounterElapsedTime, "number");
  assert.equal(finished.actualClearTime, 0);
  assert.equal(typeof finished.clearTimeRatio, "number");
  game.update(1);
  assert.equal(current(game).encounters.length, 1);
  assert.deepEqual(plain(currentEncounter(game)), finished);
});

test("each existing prototype Upgrade records its identifier and resulting stats", () => {
  const game = loadGame("?playtest=1"); game.start();
  for (const key of ["1", "2", "3"]) {
    game.setState({ xp: 100, isChoosingUpgrade: false });
    game.updateLevel();
    game.listeners.keydown({ key });
  }
  const history = current(game).upgradeHistory;
  assert.equal(history.length, 3);
  assert.equal(new Set(history.map(entry => entry.upgradeId)).size, 3);
  assert.deepEqual(plain(history.at(-1).weapon), { damage: 2, bulletSpeed: 580, bulletSize: 12 });
  assert.equal(history.every(entry => entry.playerLevel >= 2), true);
  assert.equal(history[0].weapon.bulletSpeed, 480);
});

test("Abandon records the partial current Wave while observing the exact secured-checkpoint Settlement", () => {
  const game = loadGame("?playtest=1"); game.start();
  game.enemies.push(enemy(game)); game.bullets.push(bullet());
  game.handleBulletEnemyCollisions(); finishWave(game); game.update(4);
  const checkpoint = plain(game.state.runSettlementState.securedCheckpoint);
  game.enemies.push(enemy(game)); game.bullets.push(bullet());
  game.handleBulletEnemyCollisions(); game.update(0.1);
  finishByAbandon(game);
  const run = lastRun(game);
  assert.equal(run.endReason, "abandon");
  assert.equal(run.encounters.length, 2);
  assert.equal(run.encounters[1].outcome, "abandon");
  assert.equal(run.encounters[1].killsByEnemyType.normal, 1);
  assert.equal(run.encounters[1].encounterElapsedTime, 0.1);
  assert.equal(run.encounters[1].actualClearTime, null);
  assert.equal(run.encounters[1].clearTimeRatio, null);
  assert.equal(game.state.runSettlementState.score, 2);
  assert.equal(game.state.lastSettlement.finalScore, 1);
  assert.deepEqual(plain(game.state.runSettlementState.securedCheckpoint), checkpoint);
  assert.equal(run.settlement.settlementSource, "secured-checkpoint");
  assert.deepEqual(plain(run.settlement.result), plain(game.state.lastSettlement));
  assert.deepEqual(plain(run.settlement.securedCheckpoint), checkpoint);
});

test("early Abandon has a report and preserves the absence of a secured Settlement", () => {
  const game = loadGame("?playtest=1"); game.start();
  finishByAbandon(game);
  assert.equal(game.state.lastSettlement, null);
  assert.equal(lastRun(game).endReason, "abandon");
  assert.equal(lastRun(game).encounters[0].outcome, "abandon");
  assert.equal(lastRun(game).settlement.result, null);
  assert.equal(game.state.saveData.progression.points, 0);
});

test("Boss has a separate encounter, preserves the 30-second reference, and pauses with gameplay", () => {
  const game = loadGame("?playtest=1"); game.start();
  finishWave(game); game.startBossEncounter();
  game.state.boss.speed = 0;
  game.update(0.5);
  const before = plain(currentEncounter(game));
  game.setState({ isChoosingUpgrade: true }); game.update(60);
  assert.deepEqual(plain(currentEncounter(game)), before);
  game.setState({ isChoosingUpgrade: false });
  game.state.boss.x = 100; game.state.boss.y = 100;
  game.bullets.push(bullet({ damage: 50 })); game.handleBulletBossCollisions();
  game.completeBossEncounter(); game.completeBossEncounter();
  const encounter = currentEncounter(game);
  assert.equal(encounter.type, "boss");
  assert.equal(encounter.bossId, "boss-1");
  assert.equal(encounter.templateId, undefined);
  assert.equal(encounter.analysis.expectedClearTime, 30);
  assert.equal(encounter.encounterElapsedTime, 0.5);
  assert.equal(encounter.actualClearTime, 0.5);
  assert.equal(encounter.clearTimeRatio, 0.5 / 30);
  assert.equal(encounter.bulletHits, 1);
  assert.equal(encounter.outcome, "clear");
  assert.equal(current(game).encounters.length, 2);

  const abandoned = loadGame("?playtest=1"); abandoned.start();
  finishWave(abandoned); abandoned.startBossEncounter();
  abandoned.state.boss.speed = 0;
  abandoned.update(0.4); finishByAbandon(abandoned);
  const unfinishedBoss = lastRun(abandoned).encounters.at(-1);
  assert.equal(unfinishedBoss.type, "boss");
  assert.equal(unfinishedBoss.outcome, "abandon");
  assert.equal(unfinishedBoss.encounterElapsedTime, 0.4);
  assert.equal(unfinishedBoss.actualClearTime, null);
  assert.equal(unfinishedBoss.clearTimeRatio, null);
});

test("Settlement observes the pipeline result once and telemetry never enters persistent Save", () => {
  let settlementCalls = 0;
  const game = loadGame("?playtest=1", { beforeGame(context) {
    const original = context.RunSettlement.calculateSettlement;
    context.RunSettlement = { ...context.RunSettlement,
      calculateSettlement(...args) {
        settlementCalls++;
        return { ...original(...args), observedTestMarker: "pipeline-result" };
      }
    };
  } });
  game.start(); game.takeDamage(5);
  assert.equal(settlementCalls, 1);
  const run = lastRun(game);
  assert.equal(run.settlement.result.observedTestMarker, "pipeline-result");
  assert.deepEqual(plain(run.settlement.result), plain(game.state.lastSettlement));
  game.settleRun("death");
  assert.equal(settlementCalls, 1);
  assert.equal(game.writes.every(([key]) => key === "canva-war-save"), true);
  for (const [, value] of game.writes) {
    const save = JSON.parse(value);
    assert.deepEqual(Object.keys(save).sort(), ["progression", "statistics", "unlocks", "version"]);
    assert.equal(/telemetry|runSequence|playtest|upgradeHistory/.test(value), false);
  }
});

test("completed Run snapshots and exported JSON remain stable through New Runs", () => {
  const game = loadGame("?playtest=1"); game.start(); game.takeDamage(5);
  const first = plain(lastRun(game));
  const exported = lastRun(game);
  exported.finalPlayerHp = 999;
  exported.encounters[0].analysis.expectedClearTime = 999;
  game.listeners.keydown({ key: "r" });
  game.weapon.damage = 20;
  game.update(0.1); finishByAbandon(game);
  assert.equal(session(game).runs.length, 2);
  assert.equal(current(game).completed, true);
  assert.deepEqual(plain(session(game).runs[0]), first);
  assert.equal(session(game).runs[1].runSequence, 2);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(session(game))));
});

test("telemetry observer and context-construction failures cannot stop gameplay or Settlement", () => {
  const game = loadGame("?playtest=1", { beforeGame(context) {
    const original = context.PlaytestTelemetry.createTelemetry;
    context.PlaytestTelemetry = { ...context.PlaytestTelemetry, createTelemetry(...args) {
      return { ...original(...args),
        recordEncounterFrame() { throw new Error("broken observer"); },
        finishRun() { throw new Error("broken finalizer"); }
      };
    } };
  } });
  game.start();
  assert.doesNotThrow(() => game.observeTelemetry("recordDamage", () => { throw new Error("broken context"); }));
  game.keys.d = true;
  assert.doesNotThrow(() => game.update(0.1));
  assert.equal(game.player.x, 404);
  assert.doesNotThrow(() => game.takeDamage(5));
  assert.equal(game.state.isGameOver, true);
  assert.notEqual(game.state.lastSettlement, null);
  assert.equal(JSON.parse(game.storage.get("canva-war-save")).progression.points, game.state.saveData.progression.points);
  assert.equal(game.warnings.length > 0, true);
});
