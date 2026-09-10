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
  let document;
  const element = id => {
    let textContent = "";
    const node = {
      id, hidden: id !== "startScreen", style: {}, className: "", dataset: {},
      attributes: {}, children: [], eventListeners: {},
      clientWidth: 0, clientHeight: 0,
      classList: { add() {}, remove() {}, contains() { return false; } },
      get textContent() { return textContent; },
      set textContent(value) {
        textContent = String(value ?? "");
        if (textContent === "") node.children.length = 0;
      },
      focus() { document.activeElement = node; },
      setAttribute(name, value) { node.attributes[name] = String(value); },
      append(...children) { node.children.push(...children); },
      appendChild(child) { node.children.push(child); return child; },
      replaceChildren(...children) { node.children.splice(0, node.children.length, ...children); },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: node.clientWidth, height: node.clientHeight };
      },
      addEventListener(type, callback) {
        node.eventListeners[type] = callback;
        if (id) listeners[`${id}:${type}`] = callback;
      }
    };
    return node;
  };
  elements.gameCanvas = {
    ...element("canvas"), width: 800, height: 600,
    getContext() { return { clearRect() {}, fillRect() {}, fillText() {}, save() {}, restore() {} }; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
  };
  for (const id of ["arenaRegion", "canvasStage", "intermissionBanner",
    "intermissionTitle", "intermissionDetail", "intermissionCountdown", "enemyIntroduction",
    "enemyIntroductionIcon", "enemyIntroductionName", "enemyIntroductionRole", "enemyIntroductionDescription",
    "enemyIntroductionCounterplay", "enemyIntroductionContinue"]) {
    elements[id] = element(id);
  }
  elements.arenaRegion.clientWidth = 1000;
  elements.arenaRegion.clientHeight = 760;
  elements.canvasStage.clientWidth = 800;
  elements.canvasStage.clientHeight = 600;
  document = {
    activeElement: null,
    getElementById(id) { return elements[id] ||= element(id); },
    createElement(tagName) { return element(""); },
    addEventListener(type, callback) { listeners[type] = callback; }
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
    document,
    addEventListener(type, callback) { listeners[`window:${type}`] = callback; },
    ResizeObserver: class ResizeObserver {
      constructor(callback) { this.callback = callback; }
      observe(target) { this.target = target; }
      disconnect() { this.target = null; }
    },
    requestAnimationFrame() {}
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  for (const file of ["settlement.js", "encounters.js", "behaviors.js", "weapons.js", "build.js", "layout.js", "telemetry.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  options.beforeGame?.(context);
  vm.runInContext(fs.readFileSync(path.join(root, "game.js"), "utf8") + `
    globalThis.__testGame = {
      player, enemies, bullets, hazards, keys,
      resetGame, update, startWave, startBossEncounter, completeBossEncounter,
      spawnEnemy, updateEnemies, handleDenierHazardDamage,
      beginEnemyIntroductions, showNextEnemyIntroduction, dismissEnemyIntroduction, updateArenaPresentation,
      enterIntermission, openAbandon, closeAbandon, abandonRun,
      handleBulletEnemyCollisions, handlePlayerEnemyCollisions,
      handleBulletBossCollisions, handleBossPlayerCollision,
      chooseUpgrade, updateLevel, takeDamage, settleRun, observeTelemetry,
      fireWeaponAttack, beginAttack, endAttack, updateWeaponRuntime,
      get telemetry() { return playtestTelemetry; },
      get weapon() { return weapon; },
      get build() { return buildState; },
      get choices() { return currentUpgradeChoices; },
      get weaponRuntime() { return weaponRuntime; },
      get state() {
        return { score, level, xp, isChoosingUpgrade, isGameOver, isVictory,
          isAbandoned, isAbandonConfirmOpen, runPhase, stageIndex, stageRuntime, currentWave,
          waveRuntime, bossRuntime, boss, intermissionTimer, stageClearTimer,
          currentEnemyIntroduction, pendingWaveIndex,
          introducedEnemyTypes: [...introducedEnemyTypes], denierHazardDamageRuntime,
          runSettlementState, lastSettlement, saveData, xpToNextLevel };
      },
      setState(values) {
        if ("xp" in values) xp = values.xp;
        if ("level" in values) level = values.level;
        if ("isChoosingUpgrade" in values) isChoosingUpgrade = values.isChoosingUpgrade;
        if ("boss" in values) boss = values.boss;
        if ("runPhase" in values) runPhase = values.runPhase;
        if ("currentWave" in values) currentWave = values.currentWave;
        if ("waveRuntime" in values) waveRuntime = values.waveRuntime;
      },
      presentUpgradeChoices(ids) {
        currentUpgradeChoices = ids.map(id => RunBuild.UPGRADES[id]);
        isChoosingUpgrade = true;
        renderUpgradeChoices();
      },
      setUpgradeRng(rng) {
        upgradeRng = rng;
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

function primaryAttack(game, clientX = 700, clientY = 300) {
  game.listeners["canvas:pointerdown"]({
    button: 0, clientX, clientY, preventDefault() {}
  });
  game.listeners.pointerup({ button: 0 });
}

function current(game) { return game.telemetry.getCurrentRun(); }
function session(game) { return game.telemetry.getSessionReport(); }
function lastRun(game) { return session(game).runs.at(-1); }
function currentEncounter(game) { return current(game).encounters.at(-1); }

test("game selects prototype Stage content independently from Playtest Mode", () => {
  const normal = loadGame(); normal.start(); normal.startWave(2);
  const playtest = loadGame("?playtest=1"); playtest.start(); playtest.startWave(2);
  const prototype = loadGame("?prototype=combat-variety-v1"); prototype.start(); prototype.startWave(2);
  const both = loadGame("?playtest=1&prototype=combat-variety-v1"); both.start(); both.startWave(4);
  const composition = game => game.state.currentWave.spawnGroups.flatMap(group => group.enemies)
    .reduce((counts, entry) => ({ ...counts, [entry.type]: (counts[entry.type] || 0) + entry.count }), {});
  assert.equal(composition(normal).interceptor, undefined);
  assert.equal(composition(playtest).interceptor, undefined);
  assert.equal(composition(prototype).interceptor, 1);
  assert.equal(composition(both).interceptor, 1);
  assert.equal(composition(both).support, 1);
  assert.equal(normal.state.stageRuntime.definition, normal.context.Encounters.STAGES[0]);
  assert.equal(prototype.state.stageRuntime.definition, prototype.context.Encounters.PROTOTYPE_STAGES[0]);
  assert.equal(prototype.telemetry?.enabled ?? false, false);
  assert.equal(both.telemetry.enabled, true);
});

test("production behavior hooks pause with gameplay and feed exact encounter telemetry", () => {
  const game = loadGame("?playtest=1&prototype=combat-variety-v1");
  game.start();
  game.startWave(2);
  game.spawnEnemy("interceptor");
  const interceptor = game.enemies[0];
  interceptor.x = 100;
  interceptor.y = 100;
  interceptor.speed = 0;
  game.updateEnemies(0.9);
  assert.equal(interceptor.behaviorRuntime.behaviorState, "TELEGRAPH");
  const frozen = JSON.stringify(interceptor.behaviorRuntime);
  game.setState({ isChoosingUpgrade: true });
  game.update(60);
  assert.equal(JSON.stringify(interceptor.behaviorRuntime), frozen);
  game.setState({ isChoosingUpgrade: false });
  game.updateEnemies(0.55);
  assert.equal(interceptor.behaviorRuntime.behaviorState, "CHARGE");
  interceptor.x = game.player.x;
  interceptor.y = game.player.y;
  game.handlePlayerEnemyCollisions();
  const metrics = currentEncounter(game).interceptor;
  assert.deepEqual(plain(metrics), { attempts: 1, chargeCommits: 1, chargeContacts: 1,
    missedCharges: 0, interruptedTelegraphs: 0 });
});

test("prototype introductions pause before their Wave until explicit edge-triggered confirmation", () => {
  const game = loadGame("?playtest=1&prototype=combat-variety-v1");
  const intermission = game.context.Encounters.CONFIG.intermission;
  game.start();

  finishWave(game);
  game.update(intermission);
  assert.equal(game.state.currentWave.waveIndex, 1);
  finishWave(game);
  const frozenRuntime = plain(game.state.waveRuntime);
  const frozenPlayer = plain(game.player);
  const activeTime = current(game).totalActiveTime;
  const intermissionTime = current(game).intermissionTime;
  game.weaponRuntime.attackHeld = true;
  game.weaponRuntime.timeUntilNextShot = 0.2;
  game.update(intermission);
  assert.equal(game.state.runPhase, "INTRODUCTION_PENDING");
  assert.equal(game.state.currentWave.waveIndex, 1);
  assert.equal(game.state.currentEnemyIntroduction, null);
  assert.equal(game.weaponRuntime.attackHeld, false);
  assert.equal(game.weaponRuntime.timeUntilNextShot, 0.2);
  game.update(0);
  assert.equal(game.state.runPhase, "INTRODUCTION_ACTIVE");
  assert.equal(game.state.currentEnemyIntroduction.type, "interceptor");
  game.updateArenaPresentation();
  assert.equal(game.elements.enemyIntroduction.hidden, false);
  assert.equal(game.elements.enemyIntroductionName.textContent, "INTERCEPTOR");
  assert.equal(game.elements.enemyIntroductionRole.textContent, "Predictive Attacker");
  assert.match(game.elements.enemyIntroductionDescription.textContent, /commits to a long charge/);
  assert.match(game.elements.enemyIntroductionCounterplay.textContent, /Change direction/);
  assert.equal(game.context.document.activeElement, game.elements.enemyIntroductionContinue);
  assert.equal(game.state.isChoosingUpgrade, false);
  assert.equal(game.elements.upgradeOverlay.hidden, true);
  assert.equal(game.elements.abandonOverlay.hidden, true);

  game.spawnEnemy("interceptor");
  const frozenEnemy = plain(game.enemies[0]);
  game.bullets.push(bullet({ directionX: 1, speed: 100 }));
  game.hazards.push({ phase: "ACTIVE", x: 100, y: 100, radius: 10, remaining: 5 });
  game.listeners.keydown({ key: "d", repeat: false, preventDefault() {} });
  primaryAttack(game);
  game.update(999);
  assert.equal(game.state.runPhase, "INTRODUCTION_ACTIVE");
  assert.deepEqual(plain(game.state.waveRuntime), frozenRuntime);
  assert.deepEqual(plain(game.player), frozenPlayer);
  assert.deepEqual(plain(game.enemies[0]), frozenEnemy);
  assert.equal(game.bullets[0].x, 100);
  assert.equal(game.hazards[0].remaining, 5);
  assert.equal(game.keys.d, false);
  assert.equal(game.weaponRuntime.attackHeld, false);
  assert.equal(game.weaponRuntime.timeUntilNextShot, 0.2);
  assert.equal(current(game).totalActiveTime, activeTime);
  assert.equal(current(game).intermissionTime, intermissionTime);
  assert.equal(game.openAbandon(), undefined);
  assert.equal(game.state.isAbandonConfirmOpen, false);

  game.listeners.keydown({ key: "Enter", repeat: true, preventDefault() {} });
  assert.equal(game.state.runPhase, "INTRODUCTION_ACTIVE");
  game.enemies.length = 0;
  game.bullets.length = 0;
  game.hazards.length = 0;
  game.listeners.keydown({ key: "Enter", repeat: false, preventDefault() {} });
  assert.equal(game.state.runPhase, "WAVE_ACTIVE");
  assert.equal(game.state.currentWave.waveIndex, 2);
  assert.equal(game.state.waveRuntime.elapsedTime, 0);
  assert.equal(game.state.waveRuntime.nextSpawnGroupIndex, 0);
  assert.equal(game.weaponRuntime.attackHeld, false);
  game.update(0);
  assert.equal(game.bullets.length, 0);
});

test("all three prototype introductions appear once per Run and reset cleanly", () => {
  const game = loadGame("?playtest=1&prototype=combat-variety-v1");
  const intermission = game.context.Encounters.CONFIG.intermission;
  game.start();
  finishWave(game);
  game.update(intermission);
  finishWave(game);
  game.update(intermission);
  assert.equal(game.state.runPhase, "INTRODUCTION_PENDING");
  game.update(0);
  assert.equal(game.state.currentEnemyIntroduction.type, "interceptor");
  game.elements.enemyIntroductionContinue.eventListeners.click();
  assert.equal(game.state.currentWave.waveIndex, 2);

  finishWave(game);
  game.update(intermission);
  assert.equal(game.state.runPhase, "INTRODUCTION_PENDING");
  game.update(0);
  assert.equal(game.state.currentEnemyIntroduction.type, "denier");
  game.listeners.keydown({ key: " ", repeat: false, preventDefault() {} });
  assert.equal(game.state.currentWave.waveIndex, 3);
  finishWave(game);
  game.update(intermission);
  assert.equal(game.state.runPhase, "INTRODUCTION_PENDING");
  game.update(0);
  assert.equal(game.state.currentEnemyIntroduction.type, "support");
  game.dismissEnemyIntroduction();
  assert.equal(game.state.currentWave.waveIndex, 4);
  assert.deepEqual(plain(game.state.introducedEnemyTypes), ["interceptor", "denier", "support"]);
  assert.deepEqual(plain(game.telemetry.getCurrentRun().enemyIntroductionsShown),
    ["interceptor", "denier", "support"]);

  assert.equal(game.beginEnemyIntroductions(2), false);
  assert.equal(game.state.runPhase, "WAVE_ACTIVE");
  game.resetGame();
  assert.deepEqual(plain(game.state.introducedEnemyTypes), []);
  assert.equal(game.state.currentEnemyIntroduction, null);
  assert.equal(game.elements.enemyIntroduction.hidden, true);
});

test("Denier hazard damage repeats periodically, never bursts on overlap, and clears on teardown", () => {
  const game = loadGame("?playtest=1&prototype=combat-variety-v1");
  game.start();
  game.player.x = 100;
  game.player.y = 100;
  game.hazards.push(
    { id: 1, phase: "ACTIVE", x: 120, y: 120, radius: 55, damage: 1, damageInterval: 1, remaining: 3 },
    { id: 2, phase: "ACTIVE", x: 120, y: 120, radius: 55, damage: 1, damageInterval: 1, remaining: 3 }
  );
  game.handleDenierHazardDamage(0);
  assert.equal(game.player.hp, 4);
  game.handleDenierHazardDamage(0.25);
  assert.equal(game.player.hp, 4);
  game.handleDenierHazardDamage(0.75);
  assert.equal(game.player.hp, 3);
  const metrics = currentEncounter(game).denier;
  assert.equal(metrics.hazardContacts, 1);
  assert.equal(metrics.hazardDamageEvents, 2);
  game.enterIntermission();
  assert.equal(game.hazards.length, 0);
  assert.deepEqual(plain(game.state.denierHazardDamageRuntime), { cooldown: 0, inside: false, entrySequence: 0 });
});

test("death clears Denier and introduction transients; restart begins clean", () => {
  const game = loadGame("?prototype=combat-variety-v1");
  game.start();
  game.hazards.push({ id: 1, phase: "ACTIVE", x: 120, y: 120, radius: 55,
    damage: 1, damageInterval: 1, remaining: 3 });
  game.beginEnemyIntroductions(2);
  assert.equal(game.state.runPhase, "INTRODUCTION_PENDING");
  game.update(0);
  assert.equal(game.state.runPhase, "INTRODUCTION_ACTIVE");
  game.takeDamage(game.player.hp, "denier-hazard");
  assert.equal(game.state.runPhase, "RUN_DEAD");
  assert.equal(game.hazards.length, 0);
  assert.equal(game.state.currentEnemyIntroduction, null);
  assert.equal(game.elements.enemyIntroduction.hidden, true);
  game.resetGame();
  assert.equal(game.state.runPhase, "WAVE_ACTIVE");
  assert.deepEqual(plain(game.state.introducedEnemyTypes), []);
  assert.deepEqual(plain(game.state.denierHazardDamageRuntime), { cooldown: 0, inside: false, entrySequence: 0 });
});

test("Victory cleanup cannot leave an active introduction overlay behind", () => {
  const game = loadGame("?prototype=combat-variety-v1");
  game.start();
  game.beginEnemyIntroductions(2);
  game.update(0);
  game.updateArenaPresentation();
  assert.equal(game.elements.enemyIntroduction.hidden, false);
  game.setState({ runPhase: "STAGE_REWARD" });
  game.update(0);
  assert.equal(game.state.runPhase, "RUN_VICTORY");
  assert.equal(game.state.isVictory, true);
  assert.equal(game.state.currentEnemyIntroduction, null);
  assert.equal(game.elements.enemyIntroduction.hidden, true);
});

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

test("Wave start snapshots exact definition, analysis, resolved Player and full Starter Weapon state", () => {
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
  assert.deepEqual(plain(encounter.playerStart.weapon), {
    id: "starter", name: "Starter", damage: 1, fireRate: 4,
    bulletSpeed: 480, bulletSize: 10, projectileCount: 1,
    spreadDegrees: 0, pierce: 0
  });
  assert.equal(encounter.playerStart.playerXp, 0);
  assert.equal(encounter.playerStart.playerSpeed, 240);
  assert.equal(encounter.playerStart.playerMaxHp, 5);
  assert.deepEqual(plain(encounter.playerStart.build), { upgradeStacks: {
    "rapid-fire": 0, "heavy-shot": 0, "split-shot": 0, vitality: 0, "swift-feet": 0
  } });
  assert.equal(encounter.spawnGroups.length, wave.spawnGroups.length);
  assert.equal(encounter.configuredSpawnFloor, wave.spawnGroups.reduce((sum, group) => sum + group.delay, 0));
  assert.equal(Object.isFrozen(wave), true);
});

test("telemetry configuration snapshots immutable Weapon, Upgrade and Player balance data as plain JSON", () => {
  const game = loadGame("?playtest=1");
  const configuration = session(game).configuration;

  assert.deepEqual(plain(configuration.starterWeapon), {
    id: "starter", name: "Starter", damage: 1, fireRate: 4,
    bulletSpeed: 480, bulletSize: 10, projectileCount: 1,
    spreadDegrees: 0, pierce: 0
  });
  assert.deepEqual(plain(configuration.playerBaseStats), { maxHp: 5, speed: 240 });
  assert.equal(configuration.technicalFireRateCap, 12);
  assert.deepEqual(Object.keys(configuration.upgrades).sort(),
    ["heavy-shot", "rapid-fire", "split-shot", "swift-feet", "vitality"]);
  assert.deepEqual(Object.fromEntries(Object.entries(configuration.upgrades)
    .map(([id, upgrade]) => [id, upgrade.maxStacks])), {
    "rapid-fire": 4, "heavy-shot": 4, "split-shot": 2, vitality: 3, "swift-feet": 4
  });
  assert.deepEqual(plain(configuration.upgrades["rapid-fire"].effects), { fireRateMultiplier: 1.2 });
  assert.deepEqual(plain(configuration.upgrades["heavy-shot"].effects), {
    damageAdd: 1, bulletSizeAdd: 1, fireRateMultiplier: 0.92
  });
  assert.deepEqual(plain(configuration.upgrades["split-shot"].effects), {
    projectileCountAdd: 1, spreadDegrees: 12, damageMultipliers: [1, 0.75, 0.65]
  });
  assert.deepEqual(plain(configuration.upgrades.vitality.effects), { maxHpAdd: 1, healOnSelect: 1 });
  assert.deepEqual(plain(configuration.upgrades["swift-feet"].effects), { speedMultiplier: 1.08 });
  assert.equal(JSON.stringify(configuration).includes("function"), false);
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
      primaryAttack(game, 10, 10);
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
    game.bullets.push(bullet({ damage: 100 }));
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
  // The calibrated cap allows the atomic 4-Threat second Group to release while
  // exactly 2 Threat remains from the first Group.
  game.enemies.splice(0, 2);
  game.update(0);
  assert.equal(runtime.nextSpawnGroupIndex, nextIndex + 1);
  assert.equal(game.enemies.length, 6);
  const encounter = currentEncounter(game);
  assert.equal(encounter.actualLastGroupReleaseTime, runtime.elapsedTime);
  assert.equal(encounter.groupReleaseTimes.at(-1).groupIndex, nextIndex);
  assert.equal(encounter.peakActiveEnemyCount, 6);
  assert.equal(encounter.peakActiveThreat, 6);
  assert.equal(encounter.averageActiveEnemyCount, 4);
  assert.equal(encounter.averageActiveThreat, 4);
});

test("shot and successful hit hooks preserve collision results, kill credits and contact removals", () => {
  const game = loadGame("?playtest=1"); game.start();
  primaryAttack(game);
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
  assert.equal(encounter.attackEvents, 1);
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

test("formal Upgrade choices record the selected displayed ID and resolved Weapon, Player and Build snapshots", () => {
  const game = loadGame("?playtest=1"); game.start();
  const selectedIds = [];
  let choiceRngCalls = 0;
  game.setUpgradeRng(() => { choiceRngCalls++; return 0.25; });

  for (let selection = 0; selection < 3; selection++) {
    game.setState({ xp: game.state.xpToNextLevel, isChoosingUpgrade: false });
    game.updateLevel();
    assert.equal(game.state.isChoosingUpgrade, true);
    assert.equal(game.choices.length, 3);
    assert.equal(new Set(game.choices.map(choice => choice.id)).size, 3);
    assert.equal(game.elements.upgradeChoices.children.length, 3);

    const index = selection % game.choices.length;
    const selected = game.choices[index];
    const offeredUpgradeIds = game.choices.map(choice => choice.id);
    const randomCallsBeforeSelection = game.getRandomCalls();
    const choiceRngCallsBeforeSelection = choiceRngCalls;
    selectedIds.push(selected.id);
    game.listeners.keydown({ key: String(index + 1), repeat: false });

    const entry = current(game).upgradeHistory.at(-1);
    assert.equal(entry.upgradeId, selected.id);
    assert.equal(entry.upgradeName, selected.name);
    assert.equal(entry.upgradeStack, game.build.upgradeStacks[selected.id]);
    assert.deepEqual(plain(entry.weapon), plain(game.weapon));
    assert.deepEqual(plain(entry.build), plain(game.build));
    assert.deepEqual(plain(entry.player.weapon), plain(game.weapon));
    assert.deepEqual(plain(entry.player.build), plain(game.build));
    assert.equal(entry.player.playerSpeed, game.player.speed);
    assert.equal(entry.player.playerMaxHp, game.player.maxHp);
    assert.deepEqual(plain(current(game).upgradeChoiceHistory.at(-1)), {
      playerLevel: entry.playerLevel,
      offeredUpgradeIds: plain(offeredUpgradeIds),
      selectedUpgradeId: selected.id
    });
    assert.equal(game.getRandomCalls(), randomCallsBeforeSelection);
    assert.equal(choiceRngCalls, choiceRngCallsBeforeSelection);
  }

  const history = current(game).upgradeHistory;
  assert.equal(history.length, 3);
  assert.deepEqual(plain(history.map(entry => entry.upgradeId)), selectedIds);
  assert.equal(history.every(entry => Object.hasOwn(game.context.RunBuild.UPGRADES, entry.upgradeId)), true);
  assert.equal(history.every(entry => entry.playerLevel >= 2), true);
  assert.equal(current(game).upgradeChoiceHistory.length, 3);
});

test("Split Shot records one attack event per discharge and projectile-level shots at both stacks", () => {
  const game = loadGame("?playtest=1"); game.start();

  game.presentUpgradeChoices(["split-shot", "vitality", "rapid-fire"]);
  assert.equal(game.elements.upgradeChoices.children.length, 3);
  assert.equal(game.bullets.length, 0);
  game.elements.upgradeChoices.children[0].eventListeners.click();
  assert.equal(game.bullets.length, 0);
  assert.equal(game.weapon.projectileCount, 2);
  assert.equal(game.weapon.damage, 0.75);

  primaryAttack(game);
  let encounter = currentEncounter(game);
  assert.equal(encounter.attackEvents, 1);
  assert.equal(encounter.shotsFired, 2);
  assert.equal(game.bullets.length, 2);
  assert.equal(current(game).upgradeHistory[0].upgradeId, "split-shot");
  assert.equal(current(game).upgradeHistory[0].build.upgradeStacks["split-shot"], 1);
  assert.deepEqual(plain(current(game).upgradeHistory[0].player.weapon), plain(game.weapon));

  game.bullets.length = 0;
  game.updateWeaponRuntime(1);
  game.presentUpgradeChoices(["split-shot", "heavy-shot", "swift-feet"]);
  game.listeners.keydown({ key: "1", repeat: false });
  assert.equal(game.weapon.projectileCount, 3);
  assert.equal(game.weapon.damage, 0.65);

  primaryAttack(game);
  encounter = currentEncounter(game);
  assert.equal(encounter.attackEvents, 2);
  assert.equal(encounter.shotsFired, 5);
  assert.equal(game.bullets.length, 3);
  const secondUpgrade = current(game).upgradeHistory.at(-1);
  assert.equal(secondUpgrade.upgradeId, "split-shot");
  assert.equal(secondUpgrade.upgradeStack, 2);
  assert.equal(secondUpgrade.build.upgradeStacks["split-shot"], 2);
  assert.deepEqual(plain(secondUpgrade.weapon), plain(game.weapon));
  assert.deepEqual(plain(secondUpgrade.player.weapon), plain(game.weapon));
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

test("Boss has a separate encounter, preserves the 15-second reference, and pauses with gameplay", () => {
  const game = loadGame("?playtest=1"); game.start();
  finishWave(game); game.startBossEncounter();
  game.state.boss.speed = 0;
  game.update(0.5);
  const before = plain(currentEncounter(game));
  game.setState({ isChoosingUpgrade: true }); game.update(60);
  assert.deepEqual(plain(currentEncounter(game)), before);
  game.setState({ isChoosingUpgrade: false });
  game.state.boss.x = 100; game.state.boss.y = 100;
  game.bullets.push(bullet({ damage: 100 })); game.handleBulletBossCollisions();
  game.completeBossEncounter(); game.completeBossEncounter();
  const encounter = currentEncounter(game);
  assert.equal(encounter.type, "boss");
  assert.equal(encounter.bossId, "boss-1");
  assert.equal(encounter.templateId, undefined);
  assert.equal(encounter.analysis.expectedClearTime, 15);
  assert.equal(encounter.encounterElapsedTime, 0.5);
  assert.equal(encounter.actualClearTime, 0.5);
  assert.equal(encounter.clearTimeRatio, 0.5 / 15);
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

test("Boss telemetry counts entered Charges and only damaging Charge contacts", () => {
  const game = loadGame("?playtest=1"); game.start();
  finishWave(game); game.startBossEncounter();
  game.state.boss.x = 200;
  game.state.boss.y = 200;
  game.state.boss.speed = 0;
  game.player.x = 500;
  game.player.y = 200;
  const randomCallsBeforeCycle = game.getRandomCalls();

  game.update(2.5);
  assert.equal(game.state.bossRuntime.phase, "TELEGRAPH");
  assert.equal(currentEncounter(game).chargeAttempts, 0);
  game.update(0.65);
  assert.equal(game.state.bossRuntime.phase, "CHARGE");
  assert.equal(currentEncounter(game).chargeAttempts, 1);
  assert.equal(currentEncounter(game).chargeContacts, 0);
  assert.equal(game.getRandomCalls(), randomCallsBeforeCycle);

  game.state.boss.x = game.player.x;
  game.state.boss.y = game.player.y;
  const hpBefore = game.player.hp;
  game.update(0);
  assert.equal(game.player.hp, hpBefore - 1);
  assert.equal(currentEncounter(game).chargeContacts, 1);
  game.update(0);
  assert.equal(game.player.hp, hpBefore - 1);
  assert.equal(currentEncounter(game).chargeContacts, 1);
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
    assert.equal(/telemetry|runSequence|playtest|upgradeHistory|upgradeChoiceHistory/.test(value), false);
  }
});

test("completed Run snapshots and exported JSON remain stable through New Runs", () => {
  const game = loadGame("?playtest=1"); game.start(); game.takeDamage(5);
  const first = plain(lastRun(game));
  const exported = lastRun(game);
  exported.finalPlayerHp = 999;
  exported.encounters[0].analysis.expectedClearTime = 999;
  game.listeners.keydown({ key: "r" });
  game.presentUpgradeChoices(["heavy-shot", "rapid-fire", "vitality"]);
  game.chooseUpgrade("1");
  assert.equal(game.weapon.damage, 2);
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
