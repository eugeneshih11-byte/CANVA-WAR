const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const gamePath = path.join(__dirname, "..", "game.js");
const gameSource = fs.readFileSync(gamePath, "utf8");
const settlementSource = fs.readFileSync(path.join(__dirname, "..", "settlement.js"), "utf8");
const weaponsSource = fs.readFileSync(path.join(__dirname, "..", "weapons.js"), "utf8");
const buildSource = fs.readFileSync(path.join(__dirname, "..", "build.js"), "utf8");
const layoutPath = path.join(__dirname, "..", "layout.js");
const layoutSource = fs.existsSync(layoutPath) ? fs.readFileSync(layoutPath, "utf8") : "";
const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

const testHook = `
globalThis.__gameTest = {
  player,
  enemies,
  bullets,
  get weapon() { return weapon; },
  get buildState() { return buildState; },
  get currentUpgradeChoices() { return currentUpgradeChoices; },
  get playerStats() { return playerStats; },
  weaponRuntime,
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
  fireWeaponAttack,
  beginAttack,
  endAttack,
  updateWeaponRuntime,
  chooseUpgrade,
  renderUpgradeChoices,
  renderBuildPanel,
  clearInput,
  spawnEnemy,
  updateEnemies,
  updateBoss,
  pushEnemy,
  hasOtherEnemyCollision,
  isOverlapping,
  isInsideCanvas,
  updateAim,
  resizeCanvasDisplay: typeof resizeCanvasDisplay === "function" ? resizeCanvasDisplay : null,
  updateArenaPresentation: typeof updateArenaPresentation === "function" ? updateArenaPresentation : null,
  setBuildState(value) {
    buildState = RunBuild.createBuildState(value);
    weapon = RunBuild.resolveWeaponStats(Weapons.STARTER, buildState);
    playerStats = RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, buildState);
    player.speed = playerStats.speed;
    player.maxHp = playerStats.maxHp;
    player.hp = Math.min(player.hp, player.maxHp);
    renderBuildPanel();
  },
  setUpgradeChoices(ids) {
    currentUpgradeChoices = ids.map(id => RunBuild.UPGRADES[id]);
    isChoosingUpgrade = currentUpgradeChoices.length > 0;
    if (isChoosingUpgrade) renderUpgradeChoices();
  },
  setUpgradeRng(rng) { upgradeRng = rng; },
  getMouse() { return { ...mouse }; },
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
      isAbandonConfirmOpen,
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
    if ("isAbandoned" in values) isAbandoned = values.isAbandoned;
    if ("isChoosingUpgrade" in values) isChoosingUpgrade = values.isChoosingUpgrade;
    if ("score" in values) score = values.score;
    if ("level" in values) level = values.level;
    if ("xp" in values) xp = values.xp;
    if ("previousXpRequirement" in values) previousXpRequirement = values.previousXpRequirement;
    if ("xpToNextLevel" in values) xpToNextLevel = values.xpToNextLevel;
    if ("runPhase" in values) runPhase = values.runPhase;
    if ("intermissionTimer" in values) intermissionTimer = values.intermissionTimer;
    if ("stageRuntime" in values) stageRuntime = values.stageRuntime;
    if ("currentWave" in values) currentWave = values.currentWave;
    if ("waveRuntime" in values) waveRuntime = values.waveRuntime;
  }
};
`;

function loadGame(initialStorage = {}, options = {}) {
  const listeners = {};
  const storage = new Map(Object.entries(initialStorage));
  let documentStub;
  let anonymousElementIndex = 0;
  const createElement = (id = `created-${++anonymousElementIndex}`) => {
    const elementListeners = {};
    const element = {
      id,
      tagName: "DIV",
      _textContent: "",
      hidden: id === "gameInterface",
      children: [],
      dataset: {},
      attributes: {},
      className: "",
      parentNode: null,
      style: {
        setProperty(name, value) { this[name] = String(value); },
        removeProperty(name) { delete this[name]; }
      },
      clientWidth: 0,
      clientHeight: 0,
      _rect: null,
      classList: {
        values: new Set(),
        add(...names) { names.forEach(name => this.values.add(name)); },
        remove(...names) { names.forEach(name => this.values.delete(name)); },
        contains(name) { return this.values.has(name); },
        toggle(name, force) {
          const shouldAdd = force === undefined ? !this.values.has(name) : Boolean(force);
          if (shouldAdd) this.values.add(name);
          else this.values.delete(name);
          return shouldAdd;
        }
      },
      addEventListener(type, handler) {
        elementListeners[type] = handler;
        listeners[`${id}:${type}`] = handler;
      },
      append(...nodes) {
        for (const node of nodes) {
          this.children.push(node);
          if (node && typeof node === "object") node.parentNode = this;
        }
      },
      appendChild(node) { this.append(node); return node; },
      replaceChildren(...nodes) {
        this.children.length = 0;
        this._textContent = "";
        this.append(...nodes);
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] ?? null; },
      removeAttribute(name) { delete this.attributes[name]; },
      getBoundingClientRect() {
        return this._rect || { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight };
      },
      setBoundingClientRect(rect) {
        this._rect = { left: 0, top: 0, ...rect };
        if (Number.isFinite(rect.width)) this.clientWidth = rect.width;
        if (Number.isFinite(rect.height)) this.clientHeight = rect.height;
      },
      focus() { if (documentStub) documentStub.activeElement = this; },
      click() { elementListeners.click?.({ button: 0, target: this, currentTarget: this, preventDefault() {} }); },
      dispatch(type, event = {}) { elementListeners[type]?.({ target: this, currentTarget: this, ...event }); }
    };
    Object.defineProperty(element, "textContent", {
      get() {
        if (this.children.length > 0) {
          return this._textContent + this.children.map(child => child?.textContent ?? String(child)).join("");
        }
        return this._textContent;
      },
      set(value) {
        this._textContent = String(value);
        this.children.length = 0;
      }
    });
    return element;
  };
  const canvas = Object.assign(createElement("canvas"), {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    getContext() {
      return {
        clearRect() {}, fillRect() {}, fillText() {}, save() {}, restore() {}
      };
    },
    getBoundingClientRect() {
      return this._rect || { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight };
    },
    addEventListener(type, handler) {
      listeners[`canvas:${type}`] = handler;
    }
  });
  const elements = {
    gameCanvas: canvas,
    startScreen: createElement("startScreen"),
    gameInterface: createElement("gameInterface"),
    playButton: createElement("playButton"),
    hpValue: createElement("hpValue"),
    scoreValue: createElement("scoreValue"),
    levelValue: createElement("levelValue"),
    xpValue: createElement("xpValue"),
    stageValue: createElement("stageValue"),
    waveValue: createElement("waveValue"),
    abandonButton: createElement("abandonButton"),
    abandonOverlay: createElement("abandonOverlay"),
    continueButton: createElement("continueButton"),
    confirmAbandonButton: createElement("confirmAbandonButton"),
    upgradeOverlay: createElement("upgradeOverlay"),
    upgradeTitle: createElement("upgradeTitle"),
    upgradeMessage: createElement("upgradeMessage"),
    upgradeChoices: createElement("upgradeChoices"),
    buildWeaponName: createElement("buildWeaponName"),
    buildDamage: createElement("buildDamage"),
    buildFireRate: createElement("buildFireRate"),
    buildProjectileCount: createElement("buildProjectileCount"),
    buildMoveSpeed: createElement("buildMoveSpeed"),
    buildMaxHp: createElement("buildMaxHp"),
    buildUpgradeList: createElement("buildUpgradeList"),
    arenaRegion: createElement("arenaRegion"),
    canvasStage: createElement("canvasStage"),
    intermissionBanner: createElement("intermissionBanner"),
    intermissionTitle: createElement("intermissionTitle"),
    intermissionDetail: createElement("intermissionDetail"),
    intermissionCountdown: createElement("intermissionCountdown")
  };
  elements.arenaRegion.clientWidth = options.arenaWidth ?? 1000;
  elements.arenaRegion.clientHeight = options.arenaHeight ?? 760;
  elements.canvasStage.clientWidth = options.stageWidth ?? 800;
  elements.canvasStage.clientHeight = options.stageHeight ?? 600;
  elements.abandonOverlay.hidden = true;
  elements.upgradeOverlay.hidden = true;
  elements.intermissionBanner.hidden = true;
  const resizeObservers = [];
  const context = {
    Math: Object.assign(Object.create(Math), { random: options.random || (() => 0.25) }),
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
    addEventListener(type, handler) {
      listeners[`global:${type}`] = handler;
    },
    crypto: {
      getRandomValues(values) { values[0] = 0x12345678; return values; }
    },
    Uint32Array,
    Set,
    innerWidth: options.innerWidth ?? 1280,
    innerHeight: options.innerHeight ?? 800,
    devicePixelRatio: options.devicePixelRatio ?? 1,
    ResizeObserver: class ResizeObserver {
      constructor(callback) { this.callback = callback; resizeObservers.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.target = null; }
    },
    document: documentStub = {
      activeElement: null,
      getElementById(id) {
        return elements[id] ||= createElement(id);
      },
      createElement(tagName) {
        const element = createElement();
        element.tagName = String(tagName).toUpperCase();
        return element;
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
  vm.runInContext(weaponsSource, context, { filename: "weapons.js" });
  vm.runInContext(buildSource, context, { filename: "build.js" });
  if (layoutSource) vm.runInContext(layoutSource, context, { filename: "layout.js" });
  vm.runInContext(gameSource + testHook, context, { filename: gamePath });
  context.__gameTest.triggerResize = () => resizeObservers.forEach(observer =>
    observer.callback([{ target: observer.target, contentRect: observer.target?.getBoundingClientRect?.() }]));
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

const ENEMY_TEST_STATS = Object.freeze({
  normal: { width: 40, height: 40, speed: 120, hp: 3, maxHp: 3 },
  fast: { width: 30, height: 30, speed: 200, hp: 1, maxHp: 1 },
  tank: { width: 60, height: 60, speed: 70, hp: 8, maxHp: 8 }
});

function makeEnemy(game, type = "normal", overrides = {}) {
  return {
    type,
    waveId: game.getState().currentWave?.id,
    x: 0,
    y: 0,
    damage: 1,
    ...ENEMY_TEST_STATS[type],
    ...overrides
  };
}

function rectanglesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

function distanceToPlayer(game, enemy) {
  return Math.hypot(game.player.x - enemy.x, game.player.y - enemy.y);
}

function closeTo(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);
}

function primaryPointer(clientX = 780, clientY = 300) {
  return { button: 0, clientX, clientY, preventDefault() {} };
}

function pressPrimary(game, clientX = 780, clientY = 300) {
  game.listeners["canvas:pointerdown"](primaryPointer(clientX, clientY));
}

function releasePrimary(game) {
  game.listeners.pointerup(primaryPointer());
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
  assert.deepEqual({ ...game.weapon }, {
    id: "starter",
    name: "Starter",
    damage: 1,
    fireRate: 4,
    bulletSpeed: 480,
    bulletSize: 10,
    projectileCount: 1,
    spreadDegrees: 0,
    pierce: 0
  });
  assert.deepEqual({ ...game.buildState.upgradeStacks }, {
    "rapid-fire": 0,
    "heavy-shot": 0,
    "split-shot": 0,
    vitality: 0,
    "swift-feet": 0
  });
  assert.deepEqual({ ...game.weaponRuntime }, { timeUntilNextShot: 0, attackHeld: false });
  assert.equal(state.boss, null);
  assert.equal(state.hasBossSpawned, false);
  assert.equal(state.isBossDefeated, false);
  assert.equal(state.bossDamageCooldown, 0);
  assert.equal(state.isGameStarted, true);
  assert.equal(state.isGameOver, false);
  assert.equal(state.isVictory, false);
  assert.equal(state.isChoosingUpgrade, false);
}

function selectUpgrade(game, upgradeId) {
  game.setUpgradeChoices([upgradeId]);
  game.chooseUpgrade("1");
}

function makeDirtyRun(game, endState) {
  selectUpgrade(game, "heavy-shot");
  selectUpgrade(game, "rapid-fire");
  game.player.x = 10;
  game.player.y = 20;
  game.player.hp = 1;
  game.enemies.push({});
  game.bullets.push({});
  Object.assign(game.keys, { w: true, a: true, s: true, d: true });
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

  const enemy = makeEnemy(game, "normal", {
    x: 200, y: 100, width: 20, height: 20, hp: 1, maxHp: 1, speed: 0
  });
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
  assert.equal(game.elements.scoreValue.textContent, "0");
  assert.equal(game.elements.levelValue.textContent, "1");
  assert.equal(game.elements.xpValue.textContent, "0 / 5");
  assert.equal(game.getSaveData().statistics.totalRuns, 1);
  assert.equal(
    JSON.parse(game.storage.get("canva-war-save")).statistics.totalRuns,
    1
  );
}

function testInitialPageMarkup() {
  assert.match(indexSource, /<section id="gameInterface" class="game-screen" hidden>/);
  assert.match(indexSource, /href="style\.css\?v=3"/);
  assert.match(indexSource, /<title>CANVA WAR<\/title>/);
  assert.match(indexSource, /<h1>CANVA WAR<\/h1>/);
  assert.match(indexSource, /id="upgradeOverlay"/);
  assert.match(indexSource, /id="upgradeChoices"/);
  assert.match(indexSource, /id="buildUpgradeList"/);
  assert.match(indexSource, /id="arenaRegion"/);
  assert.match(indexSource, /id="canvasStage"/);
  assert.match(indexSource, /id="intermissionBanner"/);
  assert.match(indexSource, /id="intermissionTitle"/);
  assert.match(indexSource, /id="intermissionDetail"/);
  assert.match(indexSource, /id="intermissionCountdown"/);
  assert.match(indexSource, /<script src="weapons\.js"><\/script>\s*<script src="build\.js"><\/script>/);
  assert.match(indexSource, /<script src="layout\.js"><\/script>[\s\S]*<script src="game\.js"><\/script>/);
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
  game.enemies.push(makeEnemy(game, "normal", {
    x: game.player.x, y: game.player.y, width: 20, height: 20,
    hp: 1, maxHp: 1, speed: 0
  }));
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
  const enemy = makeEnemy(game, "normal", {
    x: 100, y: 100, width: 20, height: 20, hp: 1, maxHp: 1, speed: 0
  });
  game.enemies.push(enemy);
  game.bullets.push(makeBullet({ x: 100, y: 100 }));
  game.handleBulletEnemyCollisions();
  assert.equal(game.getSaveData().statistics.totalKills, 1);
  assert.equal(JSON.parse(game.storage.get("canva-war-save")).statistics.totalKills, 1);

  game.enemies.push(makeEnemy(game, "normal", {
    x: game.player.x, y: game.player.y, width: 20, height: 20,
    hp: 1, maxHp: 1, speed: 0
  }));
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
    pressPrimary(game); assert.equal(game.bullets.length, 0);
    releasePrimary(game);
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
  pressPrimary(game); assert.equal(game.bullets.length, 0);
  releasePrimary(game);
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

test("primary press fires immediately, hold follows cadence, and release stops", () => {
  const game = loadGame(); startGame(game);
  pressPrimary(game);
  assert.equal(game.bullets.length, 1);
  assert.equal(game.weaponRuntime.attackHeld, true);
  assert.equal(game.weaponRuntime.timeUntilNextShot, 0.25);

  game.updateWeaponRuntime(0.249);
  assert.equal(game.bullets.length, 1);
  game.updateWeaponRuntime(0.001);
  assert.equal(game.bullets.length, 2);

  releasePrimary(game);
  game.updateWeaponRuntime(10);
  assert.equal(game.weaponRuntime.attackHeld, false);
  assert.equal(game.bullets.length, 2);
});

test("rapid presses cannot bypass cooldown and non-primary press is ignored", () => {
  const game = loadGame(); startGame(game);
  game.listeners["canvas:pointerdown"](primaryPointer(780, 300));
  game.listeners["canvas:mousedown"](primaryPointer(780, 300));
  assert.equal(game.bullets.length, 1);
  releasePrimary(game);
  for (let index = 0; index < 20; index++) {
    pressPrimary(game);
    releasePrimary(game);
  }
  assert.equal(game.bullets.length, 1);

  game.listeners["canvas:pointerdown"]({ ...primaryPointer(), button: 1 });
  assert.equal(game.bullets.length, 1);
  game.updateWeaponRuntime(0.25);
  pressPrimary(game);
  assert.equal(game.bullets.length, 2);
});

test("a large delta can emit at most one attack and never burst-catches up", () => {
  const game = loadGame(); startGame(game);
  pressPrimary(game);
  assert.equal(game.bullets.length, 1);
  game.updateWeaponRuntime(100);
  assert.equal(game.bullets.length, 2);
  assert.equal(game.weaponRuntime.timeUntilNextShot, 0.25);
});

test("Level choice and Abandon freeze Weapon cooldown and clear held attack", () => {
  const levelGame = loadGame(); startGame(levelGame);
  pressPrimary(levelGame);
  const levelCooldown = levelGame.weaponRuntime.timeUntilNextShot;
  levelGame.setState({ xp: 5 });
  levelGame.updateLevel();
  assert.equal(levelGame.getState().isChoosingUpgrade, true);
  assert.equal(levelGame.weaponRuntime.attackHeld, false);
  levelGame.update(100);
  assert.equal(levelGame.weaponRuntime.timeUntilNextShot, levelCooldown);

  const abandonGame = loadGame(); startGame(abandonGame);
  pressPrimary(abandonGame);
  const abandonCooldown = abandonGame.weaponRuntime.timeUntilNextShot;
  abandonGame.openAbandon();
  assert.equal(abandonGame.weaponRuntime.attackHeld, false);
  abandonGame.update(100);
  assert.equal(abandonGame.weaponRuntime.timeUntilNextShot, abandonCooldown);
});

test("Intermission blocks fire, drops held input, and the next Encounter starts ready", () => {
  const game = loadGame(); startGame(game);
  finishWave(game);
  game.weaponRuntime.timeUntilNextShot = 0.2;
  pressPrimary(game);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.weaponRuntime.attackHeld, false);
  game.update(0.1);
  assert.equal(game.weaponRuntime.timeUntilNextShot, 0.2);
  game.update(game.encounters.CONFIG.intermission - 0.1);
  assert.equal(game.getState().runPhase, "WAVE_ACTIVE");
  assert.equal(game.weaponRuntime.timeUntilNextShot, 0);
  assert.equal(game.weaponRuntime.attackHeld, false);
  pressPrimary(game);
  assert.equal(game.bullets.length, 1);
});

test("blur and run-ending transitions clear held attack input", () => {
  const game = loadGame(); startGame(game);
  pressPrimary(game);
  game.listeners["global:blur"]();
  assert.equal(game.weaponRuntime.attackHeld, false);

  game.weaponRuntime.timeUntilNextShot = 0;
  pressPrimary(game);
  game.player.hp = 1;
  game.enemies.push(makeEnemy(game, "normal", {
    x: game.player.x, y: game.player.y, width: 20, height: 20,
    hp: 1, maxHp: 1, speed: 0
  }));
  game.update(0);
  assert.equal(game.getState().runPhase, "RUN_DEAD");
  assert.equal(game.weaponRuntime.attackHeld, false);
});

test("one, two, and three projectiles use centered deterministic directions", () => {
  const game = loadGame(); startGame(game);

  function fireAngles() {
    game.bullets.length = 0;
    game.weaponRuntime.timeUntilNextShot = 0;
    pressPrimary(game, 780, 300);
    releasePrimary(game);
    return game.bullets.map(bullet =>
      Math.round(Math.atan2(bullet.directionY, bullet.directionX) * 180 / Math.PI));
  }

  assert.deepEqual(Array.from(fireAngles()), [0]);
  selectUpgrade(game, "split-shot");
  assert.deepEqual(Array.from(fireAngles()), [-6, 6]);
  selectUpgrade(game, "split-shot");
  assert.deepEqual(Array.from(fireAngles()), [-12, 0, 12]);
});

test("projectiles snapshot resolved stats and later upgrades cannot rewrite them", () => {
  const game = loadGame(); startGame(game);
  pressPrimary(game); releasePrimary(game);
  const originalProjectile = game.bullets[0];
  assert.deepEqual(
    { damage: originalProjectile.damage, size: originalProjectile.width, speed: originalProjectile.speed },
    { damage: 1, size: 10, speed: 480 }
  );

  selectUpgrade(game, "heavy-shot");
  assert.deepEqual(
    { damage: originalProjectile.damage, size: originalProjectile.width, speed: originalProjectile.speed },
    { damage: 1, size: 10, speed: 480 }
  );
  game.weaponRuntime.timeUntilNextShot = 0;
  pressPrimary(game); releasePrimary(game);
  const upgradedProjectile = game.bullets.at(-1);
  assert.deepEqual(
    { damage: upgradedProjectile.damage, size: upgradedProjectile.width, speed: upgradedProjectile.speed },
    { damage: 2, size: 11, speed: 480 }
  );
});

test("fractional Split Shot damage is applied without rounding", () => {
  const game = loadGame(); startGame(game);
  selectUpgrade(game, "split-shot");
  game.weaponRuntime.timeUntilNextShot = 0;
  pressPrimary(game); releasePrimary(game);
  game.bullets.splice(1);
  const bullet = game.bullets[0];
  const enemy = makeEnemy(game, "normal", {
    x: bullet.x, y: bullet.y, width: 20, height: 20,
    hp: 1, maxHp: 1, speed: 0
  });
  game.enemies.push(enemy);
  game.handleBulletEnemyCollisions();
  assert.equal(enemy.hp, 0.25);
  assert.equal(game.enemies.includes(enemy), true);
});

test("pierce zero stops at one target while pierce one hits two distinct targets", () => {
  const noPierce = loadGame(); startGame(noPierce);
  const noPierceTargets = [
    makeEnemy(noPierce, "normal", { x: 100, y: 100, width: 20, height: 20, hp: 5, maxHp: 5, speed: 0 }),
    makeEnemy(noPierce, "normal", { x: 100, y: 100, width: 20, height: 20, hp: 5, maxHp: 5, speed: 0 })
  ];
  noPierce.enemies.push(...noPierceTargets);
  noPierce.bullets.push(makeBullet({ pierceRemaining: 0 }));
  noPierce.handleBulletEnemyCollisions();
  assert.equal(noPierceTargets.reduce((sum, enemy) => sum + enemy.hp, 0), 9);
  assert.equal(noPierce.bullets.length, 0);

  const pierce = loadGame(); startGame(pierce);
  const pierceTargets = [
    makeEnemy(pierce, "normal", { x: 100, y: 100, width: 20, height: 20, hp: 5, maxHp: 5, speed: 0 }),
    makeEnemy(pierce, "normal", { x: 100, y: 100, width: 20, height: 20, hp: 5, maxHp: 5, speed: 0 })
  ];
  pierce.enemies.push(...pierceTargets);
  pierce.bullets.push(makeBullet({ pierceRemaining: 1 }));
  pierce.handleBulletEnemyCollisions();
  assert.deepEqual(pierceTargets.map(enemy => enemy.hp), [4, 4]);
  assert.equal(pierce.bullets.length, 0);
});

test("a piercing projectile cannot hit the same enemy twice across frames", () => {
  const game = loadGame(); startGame(game);
  const first = makeEnemy(game, "normal", {
    x: 100, y: 100, width: 20, height: 20, hp: 5, maxHp: 5, speed: 0
  });
  game.enemies.push(first);
  game.bullets.push(makeBullet({ pierceRemaining: 1 }));
  game.handleBulletEnemyCollisions();
  assert.equal(first.hp, 4);
  assert.equal(game.bullets.length, 1);
  game.handleBulletEnemyCollisions();
  assert.equal(first.hp, 4);

  const second = { ...first, hp: 5 };
  game.enemies.push(second);
  game.handleBulletEnemyCollisions();
  assert.equal(first.hp, 4);
  assert.equal(second.hp, 4);
  assert.equal(game.bullets.length, 0);
});

test("stale and dead ghosts cannot absorb projectiles or award combat credit", () => {
  const game = loadGame(); startGame(game);
  const active = makeEnemy(game, "normal", {
    x: 100, y: 100, width: 20, height: 20, hp: 5, maxHp: 5, speed: 0
  });
  const stale = makeEnemy(game, "normal", {
    waveId: "stale-wave", x: 100, y: 100, width: 20, height: 20,
    hp: 5, maxHp: 5, speed: 0
  });
  const dead = makeEnemy(game, "normal", {
    x: 100, y: 100, width: 20, height: 20, hp: 0, maxHp: 5, speed: 0
  });
  game.enemies.push(active, stale, dead);
  game.bullets.push(makeBullet({ pierceRemaining: 0 }));

  game.handleBulletEnemyCollisions();

  assert.equal(active.hp, 4);
  assert.equal(stale.hp, 5);
  assert.equal(dead.hp, 0);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.getState().score, 0);
  assert.equal(game.getState().xp, 0);
  assert.equal(game.getSaveData().statistics.totalKills, 0);
});

test("a piercing projectile cannot repeatedly damage the Boss", () => {
  const game = loadGame(); startGame(game); game.startBossEncounter();
  const sameBoss = makeBoss({ hp: 5 });
  game.setState({ boss: sameBoss });
  game.bullets.push(makeBullet({ pierceRemaining: 1 }));
  game.handleBulletBossCollisions();
  assert.equal(sameBoss.hp, 4);
  assert.equal(game.bullets.length, 1);
  game.handleBulletBossCollisions();
  assert.equal(sameBoss.hp, 4);
  assert.equal(game.bullets.length, 1);
});

test("Upgrade cards show three numbered choices and card clicks select without firing", () => {
  const game = loadGame(); startGame(game);
  game.setUpgradeChoices(["rapid-fire", "heavy-shot", "split-shot"]);
  const cards = game.elements.upgradeChoices.children;
  assert.equal(game.elements.upgradeOverlay.hidden, false);
  assert.equal(cards.length, 3);
  assert.match(cards[0].textContent, /1 · RAPID FIRE/);
  assert.match(cards[0].textContent, /\+20% Fire Rate/);
  assert.match(cards[0].textContent, /0 \/ 4/);
  assert.match(cards[1].getAttribute("aria-label"), /^2\. Heavy Shot\./);
  assert.equal(game.bullets.length, 0);
  cards[1].click();
  assert.equal(game.buildState.upgradeStacks["heavy-shot"], 1);
  assert.equal(game.getState().isChoosingUpgrade, false);
  assert.equal(game.elements.upgradeOverlay.hidden, true);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.weaponRuntime.attackHeld, false);
});

test("keyboard 1, 2, and 3 select the matching displayed Upgrade", () => {
  const ids = ["rapid-fire", "heavy-shot", "split-shot"];
  ids.forEach((expectedId, index) => {
    const game = loadGame(); startGame(game);
    game.setUpgradeChoices(ids);
    game.listeners.keydown({ key: String(index + 1), repeat: false });
    assert.equal(game.buildState.upgradeStacks[expectedId], 1);
    for (const otherId of ids.filter(id => id !== expectedId)) {
      assert.equal(game.buildState.upgradeStacks[otherId], 0);
    }
  });
});

test("multi-level XP processes one mandatory choice at a time", () => {
  const game = loadGame(); startGame(game);
  game.setState({ xp: 13 });
  game.updateLevel();
  assert.equal(game.getState().level, 2);
  assert.equal(game.getState().xp, 8);
  assert.equal(game.getState().isChoosingUpgrade, true);

  game.chooseUpgrade("1");
  assert.equal(game.getState().level, 3);
  assert.equal(game.getState().xp, 0);
  assert.equal(game.getState().isChoosingUpgrade, true);
  assert.equal(game.currentUpgradeChoices.length, 3);

  game.chooseUpgrade("1");
  assert.equal(game.getState().isChoosingUpgrade, false);
  assert.equal(game.getState().level, 3);
});

test("Escape cannot dismiss a Level choice and exhausted Builds resume safely", () => {
  const game = loadGame(); startGame(game);
  game.setUpgradeChoices(["rapid-fire", "heavy-shot", "split-shot"]);
  game.listeners.keydown({ key: "Escape", repeat: false });
  assert.equal(game.getState().isChoosingUpgrade, true);
  assert.equal(game.elements.upgradeOverlay.hidden, false);

  game.setState({ isChoosingUpgrade: false, xp: 5 });
  game.setBuildState({
    "rapid-fire": 4,
    "heavy-shot": 4,
    "split-shot": 2,
    vitality: 3,
    "swift-feet": 4
  });
  game.updateLevel();
  assert.equal(game.getState().level, 2);
  assert.equal(game.getState().isChoosingUpgrade, false);
  assert.match(game.elements.buildUpgradeList.textContent, /BUILD MAXED/);
});

test("Build panel lists owned Upgrades only and displays resolved combat stats", () => {
  const game = loadGame(); startGame(game);
  assert.equal(game.elements.buildUpgradeList.children.length, 1);
  assert.equal(game.elements.buildUpgradeList.children[0].textContent, "No upgrades yet.");

  game.player.hp = 3;
  selectUpgrade(game, "heavy-shot");
  selectUpgrade(game, "vitality");
  selectUpgrade(game, "swift-feet");
  assert.equal(game.player.hp, 4);
  assert.equal(game.elements.buildWeaponName.textContent, "Starter");
  assert.equal(game.elements.buildDamage.textContent, "2");
  assert.equal(game.elements.buildFireRate.textContent, "3.7/s");
  assert.equal(game.elements.buildProjectileCount.textContent, "1");
  assert.equal(game.elements.buildMoveSpeed.textContent, "259");
  assert.equal(game.elements.buildMaxHp.textContent, "6");
  assert.equal(game.elements.buildUpgradeList.children.length, 3);
  const ownedText = game.elements.buildUpgradeList.textContent;
  assert.match(ownedText, /Heavy Shot ×1/);
  assert.match(ownedText, /Vitality ×1/);
  assert.match(ownedText, /Swift Feet ×1/);
  assert.doesNotMatch(ownedText, /Rapid Fire|Split Shot/);
});

test("restart clears the Run Build and restores its panel", () => {
  const game = loadGame(); startGame(game);
  selectUpgrade(game, "rapid-fire");
  selectUpgrade(game, "split-shot");
  assert.equal(game.weapon.projectileCount, 2);
  game.setState({ isGameOver: true });
  game.listeners.keydown({ key: "r", repeat: false });
  assertResetState(game);
  assert.equal(game.elements.buildWeaponName.textContent, "Starter");
  assert.equal(game.elements.buildDamage.textContent, "1");
  assert.equal(game.elements.buildFireRate.textContent, "4.0/s");
  assert.equal(game.elements.buildProjectileCount.textContent, "1");
  assert.equal(game.elements.buildUpgradeList.children.length, 1);
  assert.equal(game.elements.buildUpgradeList.children[0].textContent, "No upgrades yet.");
});

test("Normal, Fast, and Tank enemies advance toward the Player at their own speed", () => {
  const game = loadGame(); startGame(game);
  game.enemies.length = 0;
  const normal = makeEnemy(game, "normal", { x: 40, y: 40 });
  const fast = makeEnemy(game, "fast", { x: 40, y: 280 });
  const tank = makeEnemy(game, "tank", { x: 700, y: 500 });
  game.enemies.push(normal, fast, tank);
  const beforeDistances = game.enemies.map(enemy => distanceToPlayer(game, enemy));
  const beforePositions = game.enemies.map(enemy => ({ x: enemy.x, y: enemy.y }));

  game.updateEnemies(0.05);

  game.enemies.forEach((enemy, index) => {
    assert.ok(distanceToPlayer(game, enemy) < beforeDistances[index]);
    closeTo(
      Math.hypot(enemy.x - beforePositions[index].x, enemy.y - beforePositions[index].y),
      enemy.speed * 0.05
    );
  });
});

test("only living current-Wave enemies update or participate in enemy collision", () => {
  const game = loadGame(); startGame(game);
  game.enemies.length = 0;
  const active = makeEnemy(game, "normal", { x: 0, y: 250 });
  const stale = makeEnemy(game, "normal", { waveId: "stale-wave", x: 35, y: 250 });
  const dead = makeEnemy(game, "normal", { hp: 0, x: 35, y: 250 });
  game.enemies.push(active, stale, dead);
  const staleBefore = { x: stale.x, y: stale.y };
  const deadBefore = { x: dead.x, y: dead.y };

  assert.equal(game.hasOtherEnemyCollision(active), false);
  game.updateEnemies(0.1);

  assert.ok(active.x > 0);
  assert.deepEqual({ x: stale.x, y: stale.y }, staleBefore);
  assert.deepEqual({ x: dead.x, y: dead.y }, deadBefore);
  assert.equal(game.hasOtherEnemyCollision(active), false);
});

test("two living enemies that start overlapped deterministically separate", () => {
  const game = loadGame(); startGame(game);
  game.enemies.length = 0;
  game.player.x = 650;
  game.player.y = 450;
  const first = makeEnemy(game, "normal", { x: 100, y: 100 });
  const second = makeEnemy(game, "normal", { x: 100, y: 100 });
  game.enemies.push(first, second);
  const origins = game.enemies.map(enemy => ({ x: enemy.x, y: enemy.y }));

  for (let frame = 0; frame < 180 && rectanglesOverlap(first, second); frame++) {
    game.updateEnemies(1 / 60);
  }

  assert.equal(rectanglesOverlap(first, second), false);
  game.enemies.forEach((enemy, index) => {
    assert.ok(enemy.x !== origins[index].x || enemy.y !== origins[index].y);
    assert.equal(game.isInsideCanvas(enemy), true);
  });
});

test("enemy collision still rejects movement that would create a new stack", () => {
  const game = loadGame(); startGame(game);
  game.enemies.length = 0;
  const first = makeEnemy(game, "normal", { x: 100, y: 100 });
  const second = makeEnemy(game, "normal", { x: 145, y: 100 });
  game.enemies.push(first, second);
  assert.equal(rectanglesOverlap(first, second), false);

  assert.equal(game.pushEnemy(first, 10, 0), false);
  assert.deepEqual({ x: first.x, y: first.y }, { x: 100, y: 100 });
  assert.equal(rectanglesOverlap(first, second), false);
});

test("an Enemy blocked at a boundary can still slide on its legal axis", () => {
  const game = loadGame(); startGame(game);
  game.enemies.length = 0;
  game.player.x = -100;
  game.player.y = 400;
  const enemy = makeEnemy(game, "normal", { x: 0, y: 100 });
  game.enemies.push(enemy);

  game.updateEnemies(0.1);

  assert.equal(enemy.x, 0);
  assert.ok(enemy.y > 100);
  assert.equal(game.isInsideCanvas(enemy), true);
});

test("a dense current-Wave group cannot remain at zero displacement", () => {
  let randomCalls = 0;
  const game = loadGame({}, { random() { randomCalls++; return 0.25; } });
  startGame(game);
  game.enemies.length = 0;
  const types = ["normal", "fast", "tank", "normal", "fast", "tank", "normal", "fast"];
  const dense = types.map(type => makeEnemy(game, type, { x: 720, y: 120 }));
  game.enemies.push(...dense);
  const origins = dense.map(enemy => ({ x: enemy.x, y: enemy.y }));
  const moved = new Set();
  const callsBeforeRecovery = randomCalls;

  for (let frame = 0; frame < 180; frame++) {
    game.updateEnemies(1 / 60);
    dense.forEach((enemy, index) => {
      if (enemy.x !== origins[index].x || enemy.y !== origins[index].y) moved.add(index);
    });
  }

  assert.equal(moved.size, dense.length);
  assert.equal(randomCalls, callsBeforeRecovery);
  assert.equal(dense.every(enemy => game.isInsideCanvas(enemy)), true);
});

test("spawn overlap recovery is bounded, deterministic, and consumes no extra RNG", () => {
  function spawnSnapshot() {
    let calls = 0;
    const game = loadGame({}, { random() { calls++; return 0.25; } });
    startGame(game);
    game.enemies.length = 0;
    const before = calls;
    for (let index = 0; index < 4; index++) game.spawnEnemy("normal");
    return {
      calls: calls - before,
      positions: game.enemies.map(enemy => ({ x: enemy.x, y: enemy.y })),
      overlap: game.enemies.some((enemy, index) =>
        game.enemies.slice(index + 1).some(other => rectanglesOverlap(enemy, other)))
    };
  }

  const first = spawnSnapshot();
  const second = spawnSnapshot();
  assert.equal(first.calls, 8);
  assert.equal(first.overlap, false);
  assert.deepEqual(Array.from(first.positions, point => ({ ...point })),
    Array.from(second.positions, point => ({ ...point })));
});

test("Player pushing still moves a valid active Enemy", () => {
  const game = loadGame(); startGame(game);
  const state = game.getState();
  state.waveRuntime.nextSpawnGroupIndex = state.currentWave.spawnGroups.length;
  game.enemies.length = 0;
  game.player.x = 380;
  game.player.y = 280;
  const enemy = makeEnemy(game, "normal", { x: 421, y: 280, speed: 0 });
  game.enemies.push(enemy);
  game.keys.d = true;

  game.update(0.05);

  assert.equal(game.player.x, 392);
  assert.equal(enemy.x, 433);
  assert.equal(game.player.hp, 5);
  assert.equal(game.enemies.includes(enemy), true);
});

test("stale and dead ghost enemies neither block nor damage the Player", () => {
  for (const ghostOverrides of [{ waveId: "old-wave" }, { hp: 0 }]) {
    const game = loadGame(); startGame(game);
    const state = game.getState();
    state.waveRuntime.nextSpawnGroupIndex = state.currentWave.spawnGroups.length;
    game.enemies.length = 0;
    game.player.x = 380;
    game.player.y = 280;
    const ghost = makeEnemy(game, "normal", { x: 421, y: 280, speed: 0, ...ghostOverrides });
    game.enemies.push(ghost);
    game.keys.d = true;

    game.update(0.05);

    assert.equal(game.player.x, 392);
    assert.equal(game.player.hp, 5);
  }
});

test("Enemies in the next Wave resume movement under the new ownership id", () => {
  const game = loadGame(); startGame(game);
  finishWave(game);
  game.update(game.encounters.CONFIG.intermission);
  assert.equal(game.getState().runPhase, "WAVE_ACTIVE");
  game.update(0);
  const nextWaveId = game.getState().currentWave.id;
  const active = game.enemies.filter(enemy => enemy.waveId === nextWaveId && enemy.hp > 0);
  assert.ok(active.length > 0);
  const before = active.map(enemy => distanceToPlayer(game, enemy));

  game.updateEnemies(1 / 60);

  active.forEach((enemy, index) => assert.ok(distanceToPlayer(game, enemy) < before[index]));
});

test("Boss movement remains the original direct clamped chase", () => {
  const game = loadGame(); startGame(game); game.startBossEncounter();
  game.player.x = 380;
  game.player.y = 280;
  const boss = makeBoss({ x: 0, y: 0, speed: 50 });
  game.setState({ boss });
  const length = Math.hypot(380, 280);

  game.updateBoss(0.1);

  closeTo(boss.x, 380 / length * 5);
  closeTo(boss.y, 280 / length * 5);
  assert.deepEqual(
    { width: boss.width, height: boss.height, speed: boss.speed, hp: boss.hp, maxHp: boss.maxHp },
    { width: 100, height: 100, speed: 50, hp: 50, maxHp: 50 }
  );
});

test("scaled Canvas pointer coordinates map to the unchanged logical arena", () => {
  const game = loadGame(); startGame(game);
  game.elements.gameCanvas.setBoundingClientRect({ left: 100, top: 50, width: 400, height: 300 });

  game.updateAim({ clientX: 300, clientY: 200 });
  assert.deepEqual({ ...game.getMouse() }, { x: 400, y: 300 });

  game.weaponRuntime.timeUntilNextShot = 0;
  game.beginAttack(primaryPointer(500, 200));
  game.endAttack(primaryPointer());
  const bullet = game.bullets.at(-1);
  closeTo(bullet.directionX, 1);
  closeTo(bullet.directionY, 0);
});

test("resizing changes display size without changing logical or Run state or RNG", () => {
  let randomCalls = 0;
  const game = loadGame({}, { random() { randomCalls++; return 0.25; } });
  startGame(game);
  game.update(0);
  const before = JSON.stringify({
    player: game.player,
    enemies: game.enemies,
    build: game.buildState,
    weapon: game.weapon,
    weaponRuntime: game.weaponRuntime,
    phase: game.getState().runPhase,
    waveRuntime: game.getState().waveRuntime
  });
  const callsBefore = randomCalls;
  game.elements.arenaRegion.setBoundingClientRect({ left: 0, top: 0, width: 400, height: 1000 });

  const size = game.resizeCanvasDisplay();
  game.triggerResize();

  assert.deepEqual({ ...size }, { scale: 0.5, width: 400, height: 300 });
  assert.equal(game.elements.canvasStage.style.width, "400px");
  assert.equal(game.elements.canvasStage.style.height, "300px");
  assert.deepEqual(
    { width: game.elements.gameCanvas.width, height: game.elements.gameCanvas.height },
    { width: 800, height: 600 }
  );
  assert.equal(JSON.stringify({
    player: game.player,
    enemies: game.enemies,
    build: game.buildState,
    weapon: game.weapon,
    weaponRuntime: game.weaponRuntime,
    phase: game.getState().runPhase,
    waveRuntime: game.getState().waveRuntime
  }), before);
  assert.equal(randomCalls, callsBefore);
});

test("Intermission banner text and countdown follow the existing timer", () => {
  const game = loadGame(); startGame(game);
  finishWave(game);
  game.updateArenaPresentation();
  assert.equal(game.elements.intermissionBanner.hidden, false);
  assert.equal(game.elements.intermissionTitle.textContent, "WAVE 1 CLEAR");
  assert.equal(game.elements.intermissionDetail.textContent, "NEXT · WAVE 2");
  assert.equal(game.elements.intermissionCountdown.textContent, "4");
  assert.equal(game.elements.intermissionBanner.classList.contains("boss-incoming"), false);

  game.update(1.2);
  game.updateArenaPresentation();
  assert.equal(game.elements.intermissionCountdown.textContent, "3");
  game.update(2.79);
  game.updateArenaPresentation();
  assert.equal(game.elements.intermissionCountdown.textContent, "1");
  game.update(0.02);
  game.updateArenaPresentation();
  assert.equal(game.getState().runPhase, "WAVE_ACTIVE");
  assert.equal(game.elements.intermissionBanner.hidden, true);
});

test("the fifth Wave announces the Boss and terminal states hide the banner", () => {
  const game = loadGame(); startGame(game);
  const state = game.getState();
  state.stageRuntime.waveIndex = 4;
  game.setState({ runPhase: "INTERMISSION", intermissionTimer: 0 });
  game.updateArenaPresentation();
  assert.equal(game.elements.intermissionBanner.hidden, false);
  assert.equal(game.elements.intermissionTitle.textContent, "WAVE 5 CLEAR");
  assert.equal(game.elements.intermissionDetail.textContent, "BOSS INCOMING");
  assert.equal(game.elements.intermissionCountdown.textContent, "4");
  assert.equal(game.elements.intermissionBanner.classList.contains("boss-incoming"), true);

  game.setState({ isGameOver: true });
  game.updateArenaPresentation();
  assert.equal(game.elements.intermissionBanner.hidden, true);

  for (const terminalState of [{ isVictory: true }, { isAbandoned: true }]) {
    const terminalGame = loadGame(); startGame(terminalGame);
    terminalGame.getState().stageRuntime.waveIndex = 4;
    terminalGame.setState({ runPhase: "INTERMISSION", intermissionTimer: 0, ...terminalState });
    terminalGame.updateArenaPresentation();
    assert.equal(terminalGame.elements.intermissionBanner.hidden, true);
  }
});

test("arena resizing and presentation cannot disturb modal UI or fire attacks", () => {
  const game = loadGame(); startGame(game);
  game.setUpgradeChoices(["rapid-fire", "heavy-shot", "split-shot"]);
  const choicesBefore = game.currentUpgradeChoices.map(choice => choice.id).join(",");
  const buildBefore = JSON.stringify(game.buildState);
  game.elements.arenaRegion.setBoundingClientRect({ left: 0, top: 0, width: 640, height: 360 });

  game.resizeCanvasDisplay();
  game.updateArenaPresentation();

  assert.equal(game.elements.upgradeOverlay.hidden, false);
  assert.equal(game.elements.abandonOverlay.hidden, true);
  assert.equal(game.getState().isChoosingUpgrade, true);
  assert.equal(game.currentUpgradeChoices.map(choice => choice.id).join(","), choicesBefore);
  assert.equal(JSON.stringify(game.buildState), buildBefore);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.weaponRuntime.attackHeld, false);

  const abandonGame = loadGame(); startGame(abandonGame);
  abandonGame.openAbandon();
  abandonGame.elements.arenaRegion.setBoundingClientRect({ left: 0, top: 0, width: 500, height: 500 });
  abandonGame.resizeCanvasDisplay();
  abandonGame.updateArenaPresentation();
  assert.equal(abandonGame.elements.abandonOverlay.hidden, false);
  assert.equal(abandonGame.elements.upgradeOverlay.hidden, true);
  assert.equal(abandonGame.getState().isAbandonConfirmOpen, true);
  assert.equal(abandonGame.bullets.length, 0);
  assert.equal(abandonGame.weaponRuntime.attackHeld, false);
});
