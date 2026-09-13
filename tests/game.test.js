const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Battlefields = require("../battlefields.js");

const gamePath = path.join(__dirname, "..", "game.js");
const gameSource = fs.readFileSync(gamePath, "utf8");
const settlementSource = fs.readFileSync(path.join(__dirname, "..", "settlement.js"), "utf8");
const battlefieldsSource = fs.readFileSync(path.join(__dirname, "..", "battlefields.js"), "utf8");
const weaponsSource = fs.readFileSync(path.join(__dirname, "..", "weapons.js"), "utf8");
const buildSource = fs.readFileSync(path.join(__dirname, "..", "build.js"), "utf8");
const discoverySource = fs.readFileSync(path.join(__dirname, "..", "enemy-discovery.js"), "utf8");
const layoutPath = path.join(__dirname, "..", "layout.js");
const layoutSource = fs.existsSync(layoutPath) ? fs.readFileSync(layoutPath, "utf8") : "";
const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

const testHook = `
globalThis.__gameTest = {
  player,
  enemies,
  bullets,
  hazards,
  get weapon() { return weapon; },
  get buildState() { return buildState; },
  get currentUpgradeChoices() { return currentUpgradeChoices; },
  get playerStats() { return playerStats; },
  get weaponRuntime() { return weaponRuntime; },
  get weaponSlots() { return weaponSlots; },
  get activeWeaponSlotIndex() { return activeWeaponSlotIndex; },
  get weaponEffects() { return weaponEffects; },
  keys,
  listeners: globalThis.__listeners,
  elements: globalThis.__elements,
  resetGame,
  startGameplay, showView, requestHub,
  startWave, startBossEncounter, completeBossEncounter, updateLevel, openAbandon, closeAbandon, abandonRun,
  handleLogicalWaveComplete, updateContinuousEncounter,
  updateBullets, positionEnemyForSpawn, isValidSpawnPosition, tryMoveEnemy,
  recoverEnemyOverlap, resolveEnemyEnemyOverlaps, moveEnemyCharge, moveBossCharge,
  encounters: Encounters,
  setAwards(hook) { getEncounterAwards = hook; },
  setReward(hook) { handleStageReward = hook; },
  update,
  createDefaultSaveData,
  migrateSaveData,
  loadSave,
  saveGame,
  handleBulletEnemyCollisions,
  handleBulletBossCollisions,
  handleBossPlayerCollision,
  updateBossDamageCooldown,
  fireWeaponAttack,
  configureWeaponLoadout, activateWeaponSlot, switchActiveWeapon,
  beginAttack,
  endAttack,
  updateWeaponRuntime,
  chooseUpgrade,
  renderUpgradeChoices,
  renderBuildPanel,
  clearInput,
  spawnEnemy,
  updateEnemies,
  handlePlayerEnemyCollisions,
  resolvePlayerEnemyOverlap,
  canEnemyAct,
  enemyBehaviors: EnemyBehaviors,
  continuousEncounter: ContinuousEncounter,
  handleDenierHazardDamage,
  beginEnemyIntroductions,
  showNextEnemyIntroduction,
  dismissEnemyIntroduction,
  updateBoss,
  pushEnemy,
  hasOtherEnemyCollision,
  isOverlapping,
  isInsideCanvas,
  updateAim,
  updateCameraRuntime,
  updateHud,
  renderIntroductionPreview,
  renderEnemyCodex,
  enemyDiscovery,
  resizeCanvasDisplay: typeof resizeCanvasDisplay === "function" ? resizeCanvasDisplay : null,
  updateArenaPresentation: typeof updateArenaPresentation === "function" ? updateArenaPresentation : null,
  setBuildState(value) {
    buildState = RunBuild.createBuildState(value);
    weaponSlots[activeWeaponSlotIndex].buildState = buildState;
    weapon = RunBuild.resolveWeaponStats(Weapons.DEFINITIONS[weaponSlots[activeWeaponSlotIndex].weaponId], buildState);
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
  setMouse(x, y) { mouse.x = x; mouse.y = y; },
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
  getBattlefieldRuntime() {
    return battlefieldRuntime;
  },
  setBattlefieldRuntime(value) {
    battlefieldRuntime = value;
  },
  getCameraRuntime() { return cameraRuntime; },
  setCameraRuntime(value) { cameraRuntime = value; },
  getCurrentView() {
    return currentView;
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
      runPhase, stageIndex, stageRuntime, currentWave, waveRuntime, bossRuntime, encounterController, intermissionTimer, stageClearTimer,
      isAbandoned, currentEnemyIntroduction, pendingWaveIndex,
      introducedEnemyTypes: [...introducedEnemyTypes], denierHazardDamageRuntime
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
    if ("encounterController" in values) encounterController = values.encounterController;
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
      hidden: ["shopView", "armoryView", "equipmentView", "codexView", "gameView"].includes(id),
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
    hubView: createElement("hubView"),
    shopView: createElement("shopView"),
    armoryView: createElement("armoryView"),
    equipmentView: createElement("equipmentView"),
    codexView: createElement("codexView"),
    gameView: createElement("gameView"),
    playButton: createElement("playButton"),
    shopButton: createElement("shopButton"),
    armoryButton: createElement("armoryButton"),
    equipmentButton: createElement("equipmentButton"),
    enemyCodexButton: createElement("enemyCodexButton"),
    shopBackButton: createElement("shopBackButton"),
    armoryBackButton: createElement("armoryBackButton"),
    equipmentBackButton: createElement("equipmentBackButton"),
    codexBackButton: createElement("codexBackButton"),
    enemyCodexGrid: createElement("enemyCodexGrid"),
    playtestWeaponSelector: createElement("playtestWeaponSelector"),
    backToHubButton: createElement("backToHubButton"),
    shopPoints: createElement("shopPoints"),
    armoryWeaponName: createElement("armoryWeaponName"),
    equipmentStatus: createElement("equipmentStatus"),
    hpValue: createElement("hpValue"),
    scoreValue: createElement("scoreValue"),
    levelValue: createElement("levelValue"),
    xpValue: createElement("xpValue"),
    stageValue: createElement("stageValue"),
    waveValue: createElement("waveValue"),
    abandonOverlay: createElement("abandonOverlay"),
    continueButton: createElement("continueButton"),
    confirmAbandonButton: createElement("confirmAbandonButton"),
    upgradeOverlay: createElement("upgradeOverlay"),
    upgradeTitle: createElement("upgradeTitle"),
    upgradeMessage: createElement("upgradeMessage"),
    upgradeChoices: createElement("upgradeChoices"),
    buildWeaponName: createElement("buildWeaponName"),
    slotAValue: createElement("slotAValue"),
    slotBValue: createElement("slotBValue"),
    activeWeaponValue: createElement("activeWeaponValue"),
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
    intermissionCountdown: createElement("intermissionCountdown"),
    reinforcementEdges: createElement("reinforcementEdges"),
    enemyIntroduction: createElement("enemyIntroduction"),
    enemyIntroductionIcon: createElement("enemyIntroductionIcon"),
    enemyIntroductionName: createElement("enemyIntroductionName"),
    enemyIntroductionRole: createElement("enemyIntroductionRole"),
    enemyIntroductionDescription: createElement("enemyIntroductionDescription"),
    enemyIntroductionCounterplay: createElement("enemyIntroductionCounterplay"),
    enemyIntroductionContinue: createElement("enemyIntroductionContinue")
  };
  const previewOperations = [];
  const previewContext = {};
  for (const method of ["clearRect", "save", "restore", "fillRect", "strokeRect", "beginPath",
    "arc", "fill", "stroke", "moveTo", "lineTo"]) {
    previewContext[method] = (...args) => previewOperations.push({ method, args });
  }
  Object.assign(elements.enemyIntroductionIcon, { width: 180, height: 140, previewOperations,
    getContext: () => previewContext });
  const selectorInputs = ["starter", "scatter", "piercer", "burst", "launcher", "arc-blade"]
    .map((weaponId, index) => {
      const input = createElement(`weapon-${weaponId}`);
      input.tagName = "INPUT";
      input.dataset.weaponId = weaponId;
      input.checked = index === 0;
      input.matches = selector => selector === "input[data-weapon-id]";
      return input;
    });
  elements.playtestWeaponSelector.append(...selectorInputs);
  elements.playtestWeaponSelector.querySelectorAll = selector =>
    selector === "input[data-weapon-id]:checked" ? selectorInputs.filter(input => input.checked) : selectorInputs;
  elements.playtestWeaponSelector.querySelector = selector =>
    elements.playtestWeaponSelector.querySelectorAll(selector)[0] || null;
  for (const edge of ["top", "right", "bottom", "left"]) {
    const indicator = createElement(`edge-${edge}`); indicator.dataset.edge = edge;
    elements.reinforcementEdges.append(indicator);
  }
  elements.arenaRegion.clientWidth = options.arenaWidth ?? 1000;
  elements.arenaRegion.clientHeight = options.arenaHeight ?? 760;
  elements.canvasStage.clientWidth = options.stageWidth ?? 800;
  elements.canvasStage.clientHeight = options.stageHeight ?? 600;
  elements.abandonOverlay.hidden = true;
  elements.upgradeOverlay.hidden = true;
  elements.intermissionBanner.hidden = true;
  elements.enemyIntroduction.hidden = true;
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
    location: { search: options.search || "" },
    URLSearchParams,
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
  vm.runInContext(battlefieldsSource, context, { filename: "battlefields.js" });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "encounters.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "continuous-encounter.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "behaviors.js"), "utf8"), context);
  vm.runInContext(weaponsSource, context, { filename: "weapons.js" });
  vm.runInContext(buildSource, context, { filename: "build.js" });
  if (layoutSource) vm.runInContext(layoutSource, context, { filename: "layout.js" });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "audio.js"), "utf8"), context);
  vm.runInContext(discoverySource, context, { filename: "enemy-discovery.js" });
  vm.runInContext(gameSource + testHook, context, { filename: gamePath });
  context.__gameTest.triggerResize = () => resizeObservers.forEach(observer =>
    observer.callback([{ target: observer.target, contentRect: observer.target?.getBoundingClientRect?.() }]));
  return context.__gameTest;
}

function startGame(game, { discoverAll = true } = {}) {
  game.listeners["playButton:click"]();
  for (let guard = 0; guard < 12; guard++) {
    const phase = game.getState().runPhase;
    if (phase === "INTRODUCTION_PENDING") game.update(0);
    else if (phase === "INTRODUCTION_ACTIVE") game.dismissEnemyIntroduction();
    else break;
  }
  if (discoverAll) Object.keys(game.encounters.ENEMIES).forEach(type => game.enemyDiscovery.discover(type));
}

function makeBoss(overrides = {}) {
  return {
    x: 100,
    y: 100,
    width: 100,
    height: 100,
    speed: 60,
    hp: 100,
    maxHp: 100,
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

function makeBehaviorEnemy(game, type, runtimeId, overrides = {}) {
  const definition = game.encounters.ENEMIES[type];
  return { type, runtimeId, waveId: game.getState().currentWave?.id,
    x: 100, y: 100, ...definition.stats,
    lifecycle: game.continuousEncounter.LIFECYCLES.ACTIVE,
    behaviorRuntime: game.enemyBehaviors.createRuntime(definition),
    countsTowardEncounterProgress: true, ...overrides };
}

function pairPenetration(first, second) {
  const overlapX = Math.min(first.x + first.width - second.x,
    second.x + second.width - first.x);
  const overlapY = Math.min(first.y + first.height - second.y,
    second.y + second.height - first.y);
  return overlapX > 0 && overlapY > 0 ? Math.min(overlapX, overlapY) : 0;
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
    { x: 780, y: 580, hp: 5 }
  );
  assert.equal(game.enemies.length, 0);
  assert.equal(game.bullets.length, 0);
  assert.deepEqual({ ...game.keys }, { w: false, a: false, s: false, d: false });
  assert.equal(state.score, 0);
  assert.deepEqual(
    { level: state.level, xp: state.xp, previous: state.previousXpRequirement, next: state.xpToNextLevel },
    { level: 1, xp: 0, previous: 3, next: 5 }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(game.weapon)), {
    id: "starter",
    name: "Starter",
    attackKind: "projectile",
    supportedWeaponUpgrades: ["rapid-fire", "heavy-shot", "split-shot"],
    damage: 2,
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
  assert.deepEqual({ ...game.weaponRuntime }, { timeUntilNextShot: 0, attackHeld: false,
    burstShotsRemaining: 0, burstShotTimer: 0, burstAimAngle: 0,
    burstWeapon: null, burstAttackId: null });
  assert.equal(state.boss, null);
  assert.equal(state.hasBossSpawned, false);
  assert.equal(state.isBossDefeated, false);
  assert.equal(state.bossDamageCooldown, 0);
  assert.equal(state.isGameStarted, true);
  assert.equal(state.isGameOver, false);
  assert.equal(state.isVictory, false);
  assert.equal(state.isChoosingUpgrade, false);
}

function openWorldRuntime(obstacles = []) {
  return {
    id: "test-world",
    seed: 1,
    navigationCache: new Map(),
    definition: {
      id: "test-world",
      bounds: { width: 1600, height: 1200 },
      playerSpawn: { x: 780, y: 580 },
      obstacles
    }
  };
}

function legacyCoverRuntime() {
  return openWorldRuntime([
    { id: "northwest-cover", x: 110, y: 120, width: 240, height: 60,
      solid: true, blocksProjectiles: true },
    { id: "northeast-wall", x: 560, y: 0, width: 60, height: 230,
      solid: true, blocksProjectiles: true },
    { id: "southwest-wall", x: 180, y: 370, width: 60, height: 230,
      solid: true, blocksProjectiles: true },
    { id: "southeast-cover", x: 450, y: 420, width: 240, height: 60,
      solid: true, blocksProjectiles: true }
  ]);
}

function wallWorldRuntime(orientation) {
  const obstacle = orientation === "vertical"
    ? { id: "vertical-wall", x: 760, y: 260, width: 80, height: 680,
      solid: true, blocksProjectiles: true }
    : { id: "horizontal-wall", x: 300, y: 560, width: 1000, height: 80,
      solid: true, blocksProjectiles: true };
  return openWorldRuntime([obstacle]);
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

function testHubAndPlay() {
  const game = loadGame();
  assert.equal(game.getState().isGameStarted, false);
  assert.equal(game.getCurrentView(), "hub");
  assert.equal(game.elements.hubView.hidden, false);
  assert.equal(game.elements.gameView.hidden, true);
  game.keys.d = true;
  game.update(1);
  assert.equal(game.player.x, 380);

  makeDirtyRun(game, "gameOver");
  startGame(game);
  assertResetState(game);
  assert.equal(game.getCurrentView(), "game");
  assert.equal(game.elements.hubView.hidden, true);
  assert.equal(game.elements.gameView.hidden, false);
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

function testMetaViewsAndInputIsolation() {
  const game = loadGame();
  game.listeners.keydown({ key: "w", repeat: false });
  game.beginAttack({ button: 0, clientX: 700, clientY: 300, preventDefault() {} });
  assert.deepEqual({ ...game.keys }, { w: false, a: false, s: false, d: false });
  assert.equal(game.bullets.length, 0);
  assert.equal(game.weaponRuntime.attackHeld, false);

  game.keys.d = true;
  game.listeners["shopButton:click"]();
  assert.equal(game.getCurrentView(), "shop");
  assert.equal(game.elements.shopView.hidden, false);
  assert.equal(game.elements.hubView.hidden, true);
  assert.equal(game.elements.shopPoints.textContent, "0");
  assert.deepEqual({ ...game.keys }, { w: false, a: false, s: false, d: false });
  game.listeners.keydown({ key: "d", repeat: false });
  assert.equal(game.keys.d, false);
  game.listeners["shopBackButton:click"]();
  assert.equal(game.getCurrentView(), "hub");

  game.listeners["armoryButton:click"]();
  assert.equal(game.getCurrentView(), "armory");
  assert.equal(game.elements.armoryWeaponName.textContent, "Starter");
  game.listeners["armoryBackButton:click"]();

  game.listeners["equipmentButton:click"]();
  assert.equal(game.getCurrentView(), "equipment");
  assert.equal(game.elements.equipmentStatus.textContent, "No equipment unlocked");
  game.listeners["equipmentBackButton:click"]();
  assert.equal(game.getCurrentView(), "hub");
  assert.equal(game.getState().isGameStarted, false);
}

function testGameplayHubReturnUsesAbandon() {
  const game = loadGame();
  startGame(game);
  game.keys.w = true;
  game.weaponRuntime.attackHeld = true;

  game.listeners["backToHubButton:click"]();
  assert.equal(game.getCurrentView(), "game");
  assert.equal(game.getState().isAbandonConfirmOpen, true);
  assert.equal(game.elements.abandonOverlay.hidden, false);
  assert.deepEqual({ ...game.keys }, { w: false, a: false, s: false, d: false });
  assert.equal(game.weaponRuntime.attackHeld, false);

  game.listeners["continueButton:click"]();
  assert.equal(game.getCurrentView(), "game");
  assert.equal(game.getState().isAbandonConfirmOpen, false);
  assert.equal(game.getState().isAbandoned, false);

  game.listeners["backToHubButton:click"]();
  game.listeners["confirmAbandonButton:click"]();
  assert.equal(game.getState().isAbandoned, true);
  assert.equal(game.getState().isGameStarted, false);
  assert.equal(game.getCurrentView(), "hub");
  assert.equal(game.elements.hubView.hidden, false);
  assert.equal(game.elements.gameView.hidden, true);
}

function testTerminalStatesReturnToHubAfterSettlement() {
  for (const endState of ["gameOver", "victory"]) {
    const game = loadGame();
    startGame(game);
    game.settleRun(endState === "victory"
      ? game.settlement.RUN_END_REASONS.VICTORY
      : game.settlement.RUN_END_REASONS.DEATH);
    game.setState({ isGameOver: endState === "gameOver", isVictory: endState === "victory" });
    const settlement = game.getLastSettlement();
    game.listeners["backToHubButton:click"]();
    assert.equal(game.getCurrentView(), "hub");
    assert.equal(game.getLastSettlement(), settlement);
    assert.equal(game.getBattlefieldRuntime(), null);
    assert.equal(game.enemies.length, 0);
    assert.equal(game.bullets.length, 0);
    assert.equal(game.hazards.length, 0);
  }
}

function testInitialPageMarkup() {
  assert.match(indexSource, /<section id="hubView" class="app-view hub-view"/);
  assert.match(indexSource, /<section id="shopView" class="app-view meta-view"[^>]*hidden>/);
  assert.match(indexSource, /<section id="armoryView" class="app-view meta-view"[^>]*hidden>/);
  assert.match(indexSource, /<section id="equipmentView" class="app-view meta-view"[^>]*hidden>/);
  assert.match(indexSource, /<section id="gameView" class="app-view game-screen" hidden>/);
  assert.match(indexSource, /href="style\.css\?v=20260912-combat-c1"/);
  assert.match(indexSource, /<title>CANVA WAR<\/title>/);
  assert.match(indexSource, /<h1 id="hubTitle">CANVA WAR<\/h1>/);
  assert.match(indexSource, /id="upgradeOverlay"/);
  assert.match(indexSource, /id="upgradeChoices"/);
  assert.match(indexSource, /id="buildUpgradeList"/);
  assert.match(indexSource, /id="arenaRegion"/);
  assert.match(indexSource, /id="canvasStage"/);
  assert.match(indexSource, /id="intermissionBanner"/);
  assert.match(indexSource, /id="intermissionTitle"/);
  assert.match(indexSource, /id="intermissionDetail"/);
  assert.match(indexSource, /id="intermissionCountdown"/);
  assert.match(indexSource, /id="enemyIntroduction"/);
  assert.match(indexSource, /id="enemyIntroductionName"/);
  assert.match(indexSource, /id="enemyIntroductionCounterplay"/);
  assert.match(indexSource, /id="enemyIntroductionContinue"/);
  assert.match(indexSource, /aria-modal="true"/);
  assert.match(indexSource, /id="reinforcementEdges"/);
  assert.match(indexSource, /id="audioMuteButton"/);
  assert.doesNotMatch(indexSource, /Choose your next destination|ROGUELITE OPERATIONS/);
  const scriptVersion = "20260912-combat-c1";
  const scriptSources = [...indexSource.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .map(match => match[1]);
  assert.deepEqual(scriptSources, ["settlement.js", "battlefields.js", "encounters.js", "continuous-encounter.js", "behaviors.js", "weapons.js", "build.js",
    "layout.js", "audio.js", "enemy-discovery.js", "telemetry.js", "telemetry-ui.js", "game.js"]
    .map(source => `${source}?v=${scriptVersion}`));
}

function testSaveDefaultsAndRoundTrip() {
  const game = loadGame();
  const defaultSave = game.createDefaultSaveData();
  assert.deepEqual(JSON.parse(JSON.stringify(defaultSave)), {
    version: 2,
    progression: { highestStage: 1, defeatedBosses: [], points: 0 },
    unlocks: { weapons: ["starter"], equipment: [], deployables: [], summons: [] },
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
    progression: { highestStage: 2, defeatedBosses: ["boss-1"] },
    unlocks: { weapons: ["starter", "legacy-weapon"], equipment: ["legacy-equipment"] },
    statistics: { totalRuns: 2, totalKills: 3 }
  };
  const game = loadGame({ "canva-war-save": JSON.stringify(legacySave) });
  assert.deepEqual(JSON.parse(JSON.stringify(game.getSaveData())), {
    ...legacySave,
    version: 2,
    progression: { ...legacySave.progression, points: 0 },
    unlocks: { ...legacySave.unlocks, deployables: [], summons: [] }
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
  ["Hub and Play", testHubAndPlay],
  ["meta views and input isolation", testMetaViewsAndInputIsolation],
  ["gameplay Hub return uses Abandon", testGameplayHubReturnUsesAbandon],
  ["terminal states return to Hub after Settlement", testTerminalStatesReturnToHubAfterSettlement],
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
  game.handleLogicalWaveComplete({ projectedFill: 0.45 });
  return game.getState().runPhase;
}

test("five logical Waves use continuous transitions before the isolated Boss entry", () => {
  const game = loadGame(); startGame(game);
  let rewardCalls = 0;
  game.setReward(context => { assert.equal(context.completed, true); rewardCalls++; });
  for (let index = 0; index < 5; index++) {
    assert.equal(game.getState().stageRuntime.waveIndex, index);
    game.bullets.push(makeBullet()); finishWave(game);
    const snapshot = game.getRunSettlementState().securedCheckpoint;
    assert.equal(snapshot.progress.completedWaves, index + 1);
    if (index < 4) {
      assert.equal(game.getState().runPhase, "WAVE_ACTIVE");
      assert.equal(game.getState().encounterController.phase, "WAVE_COMING");
      assert.equal(game.bullets.length, index + 1);
    } else {
      assert.equal(game.getState().runPhase, "INTERMISSION");
      assert.equal(game.bullets.length, 0);
      game.update(4);
      assert.equal(game.getState().runPhase, "BOSS_ACTIVE");
      assert.equal(game.getState().hasBossSpawned, true);
    }
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
  const game = loadGame(); startGame(game); game.spawnEnemy("normal");
  const enemy = game.enemies[0];
  enemy.x = game.player.x; enemy.y = game.player.y;
  const count = game.getState().waveRuntime.aliveEnemyCount;
  game.update(0);
  assert.equal(game.getState().waveRuntime.aliveEnemyCount, 0);
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
  assert.equal(game.getState().bossRuntime.phase, "CHASE");
  assert.equal(game.getState().bossRuntime.phaseElapsed, 0);
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
  game.getState().encounterController.waveProgressReadinessStableTime = 0.4;
  finishWave(game);
  game.startBossEncounter(); game.update(0.5);
  game.getSaveData().progression.points = 25;
  const saved = JSON.stringify(game.getSaveData());
  game.resetGame(); const state = game.getState();
  assert.equal(state.stageIndex, 0); assert.equal(state.stageRuntime.waveIndex, 0);
  assert.deepEqual(Array.from(state.stageRuntime.recentTemplates), []);
  assert.equal(state.waveRuntime.nextSpawnGroupIndex, 0);
  assert.equal(state.waveRuntime.groupDelayElapsed, 0);
  assert.equal(state.waveRuntime.activeThreat, 0); assert.equal(state.waveRuntime.damageTaken, 0);
  assert.equal(state.intermissionTimer, 0); assert.equal(state.stageClearTimer, 0);
  assert.equal(state.bossRuntime, null); assert.equal(state.boss, null);
  assert.equal(state.encounterController.waveProgressReadinessStableTime, 0);
  assert.equal(state.encounterController.waveProgressReadinessBlockedReason, "opening-ramp");
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

test("last kill disarms Progress and checkpoints before the Level Up pause", () => {
  const game = loadGame(); startGame(game);
  const runtime = game.getState().waveRuntime;
  game.getState().encounterController.phase = "NORMAL";
  game.getState().encounterController.waveProgressArmed = true;
  game.getState().encounterController.target = 1;
  game.enemies.push({ waveId: runtime.waveId, type: "normal", x: 100, y: 100, width: 20, height: 20,
    visualWidth: 20, visualHeight: 20, lifecycle: "ACTIVE", hp: 1, speed: 0 });
  game.bullets.push(makeBullet()); game.setState({ xp: 4 });
  game.update(0);
  assert.equal(game.getState().isChoosingUpgrade, true);
  assert.equal(runtime.aliveEnemyCount, 0);
  assert.equal(game.getState().runPhase, "WAVE_ACTIVE");
  assert.equal(game.getRunSettlementState().securedCheckpoint.score, 1);
  assert.equal(game.getState().stageRuntime.waveIndex, 1);
  game.update(5); assert.equal(runtime.elapsedTime, 0);
  game.listeners.keydown({ key: "1" }); game.update(0);
  assert.equal(game.getState().runPhase, "WAVE_ACTIVE");
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

test("Death uses current state while Abandon uses the secured checkpoint during Coming and Settling", () => {
  for (const phase of ["WAVE_COMING", "SETTLING"]) {
    const death = loadGame(); startGame(death); finishWave(death);
    death.getState().encounterController.phase = phase;
    death.getState().encounterController.waveProgressReadinessStableTime = 0.4;
    const checkpointScore = death.getRunSettlementState().securedCheckpoint.score;
    death.settlement.awardScore(death.getRunSettlementState(), "enemyKill", 9);
    death.player.hp = 1;
    death.enemies.push(makeEnemy(death, "normal", { x: death.player.x, y: death.player.y,
      width: 20, height: 20, visualWidth: 20, visualHeight: 20, hp: 1, lifecycle: "ACTIVE", speed: 0 }));
    death.handlePlayerEnemyCollisions();
    assert.equal(death.getState().runPhase, "RUN_DEAD");
    assert.equal(death.getState().encounterController.waveProgressReadinessStableTime, 0);
    assert.equal(death.getState().encounterController.waveProgressReadinessBlockedReason, "run-ended");
    assert.equal(death.getLastSettlement().finalScore, checkpointScore + 9, `death ${phase}`);

    const abandon = loadGame(); startGame(abandon); finishWave(abandon);
    abandon.getState().encounterController.phase = phase;
    const securedScore = abandon.getRunSettlementState().securedCheckpoint.score;
    abandon.settlement.awardScore(abandon.getRunSettlementState(), "enemyKill", 9);
    abandon.openAbandon(); abandon.abandonRun();
    assert.equal(abandon.getLastSettlement().finalScore, securedScore, `abandon ${phase}`);
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

test("Wave Coming remains non-modal and combat firing stays active", () => {
  const game = loadGame(); startGame(game);
  finishWave(game);
  assert.equal(game.getState().encounterController.phase, "WAVE_COMING");
  game.weaponRuntime.timeUntilNextShot = 0;
  pressPrimary(game);
  assert.equal(game.bullets.length, 1);
  assert.equal(game.weaponRuntime.attackHeld, true);
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
    { damage: 2, size: 10, speed: 480 }
  );

  selectUpgrade(game, "heavy-shot");
  assert.deepEqual(
    { damage: originalProjectile.damage, size: originalProjectile.width, speed: originalProjectile.speed },
    { damage: 2, size: 10, speed: 480 }
  );
  game.weaponRuntime.timeUntilNextShot = 0;
  pressPrimary(game); releasePrimary(game);
  const upgradedProjectile = game.bullets.at(-1);
  assert.deepEqual(
    { damage: upgradedProjectile.damage, size: upgradedProjectile.width, speed: upgradedProjectile.speed },
    { damage: 3, size: 11, speed: 480 }
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
    hp: 2, maxHp: 2, speed: 0
  });
  game.enemies.push(enemy);
  game.handleBulletEnemyCollisions();
  assert.equal(enemy.hp, 0.5);
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

test("carried Wave enemies remain valid projectile targets while dead ghosts do not", () => {
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

  assert.equal(active.hp, 5);
  assert.equal(stale.hp, 4);
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
  assert.equal(game.elements.buildDamage.textContent, "3");
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
  assert.equal(game.elements.buildDamage.textContent, "2");
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

test("only contact policy uses generic body damage; strike and charge require committed states", () => {
  const game = loadGame(); startGame(game);
  game.enemies.length = 0;
  game.player.x = 100; game.player.y = 100;
  const makeOverlap = type => makeEnemy(game, type, { x: 100, y: 100,
    ...game.encounters.ENEMIES[type].stats, lifecycle: "ACTIVE",
    behaviorRuntime: game.enemyBehaviors.createRuntime(game.encounters.ENEMIES[type]) });
  const passiveTypes = ["fast", "tank", "denier", "support", "gunner", "artillery", "trapper", "tether"];
  game.enemies.push(...passiveTypes.map(makeOverlap));
  game.handlePlayerEnemyCollisions();
  assert.equal(game.player.hp, 5);
  assert.equal(game.enemies.length, passiveTypes.length);
  assert.equal(game.enemies.some(enemy => rectanglesOverlap(game.player, enemy)), false,
    "compressed non-contact enemies must be physically separated without gaining body damage");

  const fast = game.enemies.find(enemy => enemy.type === "fast");
  game.player.x = fast.x = 100; game.player.y = fast.y = 100;
  fast.behaviorRuntime.behaviorState = game.enemyBehaviors.STATES.STRIKE;
  game.handlePlayerEnemyCollisions();
  assert.equal(game.player.hp, 4);
  game.handlePlayerEnemyCollisions();
  assert.equal(game.player.hp, 4);

  const interceptor = makeOverlap("interceptor");
  game.player.x = interceptor.x = 100; game.player.y = interceptor.y = 100;
  interceptor.behaviorRuntime.behaviorState = game.enemyBehaviors.STATES.CHARGE;
  game.enemies.push(interceptor);
  game.handlePlayerEnemyCollisions();
  assert.equal(game.player.hp, 3);

  const normal = makeOverlap("normal");
  game.player.x = normal.x = 100; game.player.y = normal.y = 100;
  game.enemies.push(normal);
  game.handlePlayerEnemyCollisions();
  assert.equal(game.player.hp, 2);
  assert.equal(game.enemies.includes(normal), false);
});

test("ENTERING and RETURNING enemies cannot initiate attacks while fully offscreen", () => {
  const game = loadGame(); startGame(game);
  game.enemies.length = 0;
  const types = ["fast", "tank", "interceptor", "denier", "support", "gunner", "artillery", "trapper", "tether"];
  for (const lifecycle of ["ENTERING", "RETURNING"]) {
    for (const type of types) {
      const definition = game.encounters.ENEMIES[type];
      const candidate = makeEnemy(game, type, { x: -500, y: -500, ...definition.stats, lifecycle,
        behaviorRuntime: game.enemyBehaviors.createRuntime(definition) });
      candidate.behaviorRuntime.attackCooldown = 0;
      candidate.behaviorRuntime.cooldown = 0;
      game.enemies.push(candidate);
      assert.equal(game.canEnemyAct(candidate), false, `${type} ${lifecycle}`);
    }
  }
  const before = game.enemies.map(enemy => ({ x: enemy.x, y: enemy.y, state: enemy.behaviorRuntime.behaviorState }));
  game.updateEnemies(2);
  assert.deepEqual(game.enemies.map(enemy => ({ x: enemy.x, y: enemy.y, state: enemy.behaviorRuntime.behaviorState })), before);
  assert.equal(game.hazards.length, 0);
  assert.equal(game.player.hp, 5);
});

test("lethal Enemy hazard cleanup cannot invalidate the active hazard iteration", () => {
  const game = loadGame(); startGame(game);
  game.player.hp = 1;
  game.hazards.push(...[1, 2].map(id => ({ id, kind: "enemy-projectile", phase: "ACTIVE",
    x: game.player.x, y: game.player.y, width: 10, height: 10,
    directionX: 0, directionY: 0, speed: 0, damage: 1, remaining: 1 })));
  assert.doesNotThrow(() => game.updateEnemies(0));
  assert.equal(game.getState().runPhase, "RUN_DEAD");
  assert.equal(game.hazards.length, 0);
});

test("all ten Introduction previews use the shared renderer without gameplay or RNG side effects", () => {
  const rendered = loadGame(); startGame(rendered);
  const control = loadGame(); startGame(control);
  const types = Object.keys(rendered.encounters.ENEMIES);
  assert.deepEqual(types.sort(), ["artillery", "denier", "fast", "gunner", "interceptor",
    "normal", "support", "tank", "tether", "trapper"]);
  const before = JSON.stringify({ enemies: rendered.enemies, hazards: rendered.hazards,
    history: rendered.getState().encounterController.spawnHistory });
  for (const type of types) {
    const operations = rendered.elements.enemyIntroductionIcon.previewOperations;
    operations.length = 0;
    rendered.renderIntroductionPreview(type);
    assert.ok(operations.some(operation => operation.method === "fillRect"), type);
    assert.ok(operations.some(operation => operation.method === "strokeRect"), type);
    if (["denier", "artillery", "trapper"].includes(type)) {
      assert.ok(operations.some(operation => operation.method === "arc"), type);
    }
    if (["support", "tether"].includes(type)) {
      assert.ok(operations.some(operation => operation.method === "lineTo"), type);
    }
  }
  assert.equal(JSON.stringify({ enemies: rendered.enemies, hazards: rendered.hazards,
    history: rendered.getState().encounterController.spawnHistory }), before);
  assert.equal(rendered.getState().encounterController.typeRng(),
    control.getState().encounterController.typeRng());
});

test("moving-Camera Continuous Encounter stress stays bounded and leaves no pending reservation", () => {
  const game = loadGame(); startGame(game);
  let peakCount = 0;
  let sawReturnLifecycleWhileSettling = false;
  let lastFill = null;
  for (let frame = 0; frame < 600; frame++) {
    game.player.x = 780 + Math.sin(frame / 30) * 360;
    game.player.y = 580 + Math.cos(frame / 36) * 260;
    game.updateCameraRuntime();
    const fill = game.updateContinuousEncounter(1 / 30);
    lastFill = fill;
    if (game.getState().runPhase === "INTRODUCTION_PENDING") game.update(0);
    if (game.getState().runPhase === "INTRODUCTION_ACTIVE") game.dismissEnemyIntroduction();
    peakCount = Math.max(peakCount, game.enemies.length);
    if (!game.getState().encounterController.waveProgressArmed &&
        game.enemies.some(enemy => [game.continuousEncounter.LIFECYCLES.NEAR_OFFSCREEN,
          game.continuousEncounter.LIFECYCLES.RETURNING].includes(enemy.lifecycle))) {
      sawReturnLifecycleWhileSettling = true;
    }
    assert.ok(fill.projectedFill >= 0);
    assert.ok(game.getState().encounterController.normalCredit >= 0);
    assert.ok(game.getState().encounterController.comingCredit >= 0);
    for (const enemy of game.enemies) {
      assert.equal(Battlefields.isStaticPositionValid(enemy, game.getBattlefieldRuntime()), true);
    }
  }
  const controller = game.getState().encounterController;
  assert.equal(controller.pendingReservations.length, 0);
  assert.equal(sawReturnLifecycleWhileSettling, true);
  assert.equal(controller.waveProgressArmed, true);
  assert.ok(controller.nRef > 0);
  assert.ok(controller.target > 0);
  assert.ok(peakCount > 10);
  const counts = game.enemies.reduce((result, enemy) => {
    result[enemy.type] = (result[enemy.type] || 0) + 1; return result;
  }, {});
  assert.deepEqual(Object.keys(counts).sort(), ["fast", "normal"]);
  assert.ok(peakCount <= game.continuousEncounter.CALIBRATION.maxManagedRegularEnemies);
  for (const [type, cap] of Object.entries(game.continuousEncounter.CALIBRATION.mechanicCaps)) {
    assert.ok((counts[type] || 0) <= cap, type);
  }
  for (let kill = 1; kill < controller.target; kill++) {
    assert.equal(game.continuousEncounter.recordKill(controller, true), false);
  }
  assert.equal(game.continuousEncounter.recordKill(controller, true), true);
  game.handleLogicalWaveComplete(lastFill);
  assert.equal(game.getState().stageRuntime.waveIndex, 1);
  assert.equal(controller.phase, game.continuousEncounter.PHASES.WAVE_COMING);
});

test("all living carried enemies update and collide independent of original Wave id", () => {
  const game = loadGame(); startGame(game);
  game.enemies.length = 0;
  const active = makeEnemy(game, "normal", { x: 0, y: 250 });
  const stale = makeEnemy(game, "normal", { waveId: "stale-wave", x: 35, y: 250 });
  const dead = makeEnemy(game, "normal", { hp: 0, x: 35, y: 250 });
  game.enemies.push(active, stale, dead);
  const staleBefore = { x: stale.x, y: stale.y };
  const deadBefore = { x: dead.x, y: dead.y };

  assert.equal(game.hasOtherEnemyCollision(active), true);
  game.updateEnemies(0.1);

  assert.ok(active.x !== 0 || stale.x !== staleBefore.x || stale.y !== staleBefore.y);
  assert.notDeepEqual({ x: stale.x, y: stale.y }, staleBefore);
  assert.deepEqual({ x: dead.x, y: dead.y }, deadBefore);
  assert.equal(game.hasOtherEnemyCollision(active), false);
});

test("two living enemies that start overlapped deterministically separate", () => {
  const game = loadGame(); startGame(game);
  game.enemies.length = 0;
  game.player.x = 650;
  game.player.y = 450;
  const first = makeEnemy(game, "normal", { x: 40, y: 40 });
  const second = makeEnemy(game, "normal", { x: 40, y: 40 });
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

test("compressed mixed-size enemy clusters separate with bounded finite corrections", () => {
  const game = loadGame(); startGame(game);
  game.enemies.length = 0;
  const cluster = [
    makeBehaviorEnemy(game, "tank", 1),
    makeBehaviorEnemy(game, "normal", 2),
    makeBehaviorEnemy(game, "fast", 3),
    makeBehaviorEnemy(game, "gunner", 4),
    makeBehaviorEnemy(game, "normal", 5)
  ];
  game.enemies.push(...cluster);
  const origins = cluster.map(enemy => ({ x: enemy.x, y: enemy.y }));
  const result = game.resolveEnemyEnemyOverlaps();
  assert.ok(result.overlapEvents >= 4);
  assert.ok(result.separationCorrections > 0);
  assert.ok(result.maxPenetration >= 40);
  cluster.forEach((enemy, index) => {
    assert.equal(Number.isFinite(enemy.x) && Number.isFinite(enemy.y), true);
    assert.ok(Math.hypot(enemy.x - origins[index].x, enemy.y - origins[index].y) <= 50);
    assert.equal(game.isInsideCanvas(enemy), true);
  });
  for (let frame = 0; frame < 180; frame++) game.resolveEnemyEnemyOverlaps();
  const deepest = Math.max(0, ...cluster.flatMap((enemy, index) =>
    cluster.slice(index + 1).map(other => pairPenetration(enemy, other))));
  assert.ok(deepest < 4, `remaining penetration ${deepest}`);
});

test("enemy separation respects obstacles and world edges", () => {
  for (const placement of ["obstacle", "edge"]) {
    const game = loadGame(); startGame(game);
    game.enemies.length = 0;
    const definition = game.getBattlefieldRuntime().definition;
    const obstacle = definition.obstacles[0];
    const x = placement === "edge" ? 0 : Math.max(0, obstacle.x - 42);
    const y = placement === "edge" ? 0 : Math.max(0, Math.min(obstacle.y, definition.bounds.height - 40));
    const cluster = [1, 2, 3].map(id => makeBehaviorEnemy(game, "normal", id, { x, y }));
    if (placement === "obstacle" && !Battlefields.isStaticPositionValid(cluster[0], game.getBattlefieldRuntime())) {
      cluster.forEach(enemy => { enemy.x = obstacle.x + obstacle.width + 2; });
    }
    game.enemies.push(...cluster);
    for (let frame = 0; frame < 180; frame++) game.resolveEnemyEnemyOverlaps();
    cluster.forEach(enemy => {
      assert.equal(Battlefields.isStaticPositionValid(enemy, game.getBattlefieldRuntime()), true, placement);
      assert.equal(game.isInsideCanvas(enemy), true, placement);
    });
    const deepest = Math.max(...cluster.flatMap((enemy, index) =>
      cluster.slice(index + 1).map(other => pairPenetration(enemy, other))));
    assert.ok(deepest < 4, `${placement} penetration ${deepest}`);
  }
});

test("committed Fast and Interceptor movement is followed by overlap cleanup", () => {
  const game = loadGame(); startGame(game);
  game.enemies.length = 0;
  const fast = makeBehaviorEnemy(game, "fast", 1, { x: 100, y: 100 });
  const interceptor = makeBehaviorEnemy(game, "interceptor", 2, { x: 100, y: 100 });
  const normal = makeBehaviorEnemy(game, "normal", 3, { x: 100, y: 100 });
  fast.behaviorRuntime.behaviorState = game.enemyBehaviors.STATES.STRIKE;
  fast.behaviorRuntime.chargeDirectionX = 1; fast.behaviorRuntime.chargeDirectionY = 0;
  interceptor.behaviorRuntime.behaviorState = game.enemyBehaviors.STATES.CHARGE;
  interceptor.behaviorRuntime.chargeDirectionX = 1; interceptor.behaviorRuntime.chargeDirectionY = 0;
  game.enemies.push(fast, interceptor, normal);
  const fastStart = fast.x, interceptorStart = interceptor.x;
  for (let frame = 0; frame < 180; frame++) game.updateEnemies(1 / 60);
  assert.ok(fast.x > fastStart || interceptor.x > interceptorStart);
  assert.ok(pairPenetration(fast, interceptor) < 4);
  assert.ok(pairPenetration(fast, normal) < 4);
  assert.ok(pairPenetration(interceptor, normal) < 4);
});

test("crowded real Gunner behavior separates and produces a burst", () => {
  const game = loadGame(); startGame(game);
  game.enemies.length = 0;
  const playerCenter = { x: game.player.x + game.player.width / 2,
    y: game.player.y + game.player.height / 2 };
  const gunnerDefinition = game.encounters.ENEMIES.gunner;
  const candidatePositions = [[260, 0], [-260, 0], [0, 260], [0, -260]]
    .map(([x, y]) => ({ x: playerCenter.x + x - gunnerDefinition.stats.width / 2,
      y: playerCenter.y + y - gunnerDefinition.stats.height / 2 }));
  const position = candidatePositions.find(candidate => {
    const body = { ...candidate, width: gunnerDefinition.stats.width, height: gunnerDefinition.stats.height };
    return Battlefields.isStaticPositionValid(body, game.getBattlefieldRuntime()) &&
      Battlefields.hasLineOfTravel(body, game.player, game.getBattlefieldRuntime());
  });
  assert.ok(position, "expected one clear authored-range Gunner position");
  const gunner = makeBehaviorEnemy(game, "gunner", 1, { ...position });
  gunner.behaviorRuntime.attackCooldown = 0;
  const crowd = [2, 3, 4, 5].map(id => makeBehaviorEnemy(game, "normal", id, { ...position }));
  game.enemies.push(gunner, ...crowd);
  const initialPenetration = Math.max(...crowd.map(enemy => pairPenetration(gunner, enemy)));
  for (let frame = 0; frame < 360 &&
      game.hazards.filter(hazard => hazard.kind === "enemy-projectile").length < 2; frame++) {
    game.updateEnemies(1 / 60);
  }
  assert.ok(game.hazards.filter(hazard => hazard.kind === "enemy-projectile").length > 0);
  const remainingPenetration = Math.max(...crowd.map(enemy => pairPenetration(gunner, enemy)));
  assert.ok(remainingPenetration < initialPenetration / 2,
    `${remainingPenetration} should be below half of ${initialPenetration}`);
});

test("real Gunner projectiles stop at projectile-blocking Battlefield geometry", () => {
  const game = loadGame(); startGame(game);
  game.enemies.length = 0;
  const obstacle = game.getBattlefieldRuntime().definition.obstacles
    .find(candidate => candidate.blocksProjectiles);
  assert.ok(obstacle);
  const fromLeft = obstacle.x >= 20;
  game.hazards.push({ id: 1, kind: "enemy-projectile", phase: "ACTIVE",
    x: fromLeft ? obstacle.x - 15 : obstacle.x + obstacle.width + 5,
    y: obstacle.y + Math.max(0, obstacle.height / 2 - 5), width: 10, height: 10,
    directionX: fromLeft ? 1 : -1, directionY: 0, speed: 300, damage: 1, remaining: 4 });
  game.updateEnemies(0.25);
  assert.equal(game.hazards.length, 0);
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
      terrainOverlap: game.enemies.some(enemy =>
        Battlefields.firstSolidCollision(enemy, game.getBattlefieldRuntime())),
      overlap: game.enemies.some((enemy, index) =>
        game.enemies.slice(index + 1).some(other => rectanglesOverlap(enemy, other)))
    };
  }

  const first = spawnSnapshot();
  const second = spawnSnapshot();
  assert.equal(first.calls, 8);
  assert.equal(first.overlap, false);
  assert.equal(first.terrainOverlap, false);
  assert.deepEqual(Array.from(first.positions, point => ({ ...point })),
    Array.from(second.positions, point => ({ ...point })));
});

test("spawn rejects unreachable components and finds a deterministic reachable perimeter fallback", () => {
  let calls = 0;
  const game = loadGame({}, { random() { calls++; return 0; } }); startGame(game);
  game.enemies.length = 0;
  const definition = {
    id: "partitioned-test-field",
    bounds: { width: 800, height: 600 },
    playerSpawn: { x: 380, y: 500 },
    obstacles: [{ id: "barrier", x: 0, y: 280, width: 800, height: 40,
      solid: true, blocksProjectiles: true }]
  };
  game.setBattlefieldRuntime({ id: definition.id, definition });
  game.player.x = 380;
  game.player.y = 500;
  const before = calls;
  game.spawnEnemy("normal");
  assert.equal(calls - before, 2);
  assert.equal(game.enemies.length, 1);
  const spawned = game.enemies[0];
  assert.ok(spawned.y >= 320);
  assert.equal(Battlefields.isStaticPositionValid(spawned, definition), true);
  assert.ok(Battlefields.findPath(spawned, game.player, definition));
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

test("existing enemies persist and keep moving across a logical Wave boundary", () => {
  const game = loadGame(); startGame(game);
  game.spawnEnemy("normal");
  const carried = game.enemies[0];
  const oldWaveId = carried.waveId;
  const before = distanceToPlayer(game, carried);
  finishWave(game);
  assert.equal(game.getState().runPhase, "WAVE_ACTIVE");
  game.updateEnemies(1 / 60);
  assert.equal(carried.waveId, oldWaveId);
  assert.ok(distanceToPlayer(game, carried) < before);
});

test("Boss follows CHASE, TELEGRAPH, locked CHARGE, RECOVERY, then CHASE without RNG", () => {
  let randomCalls = 0;
  const game = loadGame({}, { random() { randomCalls++; return 0.25; } });
  startGame(game);
  game.setBattlefieldRuntime(openWorldRuntime());
  game.startBossEncounter();
  game.player.x = 500;
  game.player.y = 280;
  const boss = makeBoss({ x: 200, y: 250 });
  game.setState({ boss });
  const callsBeforeCycle = randomCalls;

  game.updateBoss(2.49);
  assert.equal(game.getState().bossRuntime.phase, "CHASE");
  game.updateBoss(0.01);
  let runtime = game.getState().bossRuntime;
  assert.equal(runtime.phase, "TELEGRAPH");
  assert.equal(runtime.phaseElapsed, 0);
  closeTo(runtime.chargeDirectionX, 1);
  closeTo(runtime.chargeDirectionY, 0);
  const chargeOrigin = { x: boss.x, y: boss.y };

  game.player.x = 0;
  game.player.y = 0;
  game.updateBoss(0.64);
  assert.deepEqual({ x: boss.x, y: boss.y }, chargeOrigin);
  assert.equal(game.getState().bossRuntime.phase, "TELEGRAPH");
  game.updateBoss(0.01);
  assert.equal(game.getState().bossRuntime.phase, "CHARGE");

  game.updateBoss(0.1);
  closeTo(boss.x, chargeOrigin.x + 42);
  closeTo(boss.y, chargeOrigin.y);
  game.updateBoss(0.35);
  assert.equal(game.getState().bossRuntime.phase, "RECOVERY");
  closeTo(boss.x, chargeOrigin.x + 189);
  closeTo(boss.y, chargeOrigin.y);
  const recoveryPosition = { x: boss.x, y: boss.y };

  game.updateBoss(0.54);
  assert.deepEqual({ x: boss.x, y: boss.y }, recoveryPosition);
  game.updateBoss(0.01);
  assert.equal(game.getState().bossRuntime.phase, "CHASE");
  game.updateBoss(0.1);
  closeTo(Math.hypot(boss.x - recoveryPosition.x, boss.y - recoveryPosition.y), 6);
  assert.equal(randomCalls, callsBeforeCycle);
  assert.deepEqual(
    { speed: game.encounters.BOSSES["boss-1"].stats.speed,
      hp: game.encounters.BOSSES["boss-1"].stats.hp,
      maxHp: game.encounters.BOSSES["boss-1"].stats.maxHp,
      damage: game.encounters.BOSSES["boss-1"].stats.damage,
      chargeCycle: JSON.parse(JSON.stringify(game.encounters.BOSSES["boss-1"].chargeCycle)) },
    { speed: 60, hp: 100, maxHp: 100, damage: 1,
      chargeCycle: { initialChaseDuration: 2.5, chaseDuration: 2, telegraphDuration: 0.65,
        chargeDuration: 0.45, chargeSpeed: 420, recoveryDuration: 0.55 } }
  );
});

test("Boss charge ends at the arena boundary and observes the full recovery", () => {
  const game = loadGame(); startGame(game); game.startBossEncounter();
  game.player.x = 0;
  game.player.y = 310;
  const boss = makeBoss({ x: 10, y: 280, speed: 0 });
  game.setState({ boss });

  game.updateBoss(2.5);
  assert.equal(game.getState().bossRuntime.phase, "TELEGRAPH");
  game.updateBoss(0.65);
  assert.equal(game.getState().bossRuntime.phase, "CHARGE");
  game.updateBoss(0.1);
  assert.equal(boss.x, 0);
  assert.equal(game.getState().bossRuntime.phase, "RECOVERY");
  const boundaryPosition = { x: boss.x, y: boss.y };
  game.updateBoss(0.54);
  assert.equal(game.getState().bossRuntime.phase, "RECOVERY");
  assert.deepEqual({ x: boss.x, y: boss.y }, boundaryPosition);
  game.updateBoss(0.01);
  assert.equal(game.getState().bossRuntime.phase, "CHASE");
});

test("scaled Canvas pointer coordinates map to the unchanged logical arena", () => {
  const game = loadGame(); startGame(game);
  game.elements.gameCanvas.setBoundingClientRect({ left: 100, top: 50, width: 400, height: 300 });

  game.updateAim({ clientX: 300, clientY: 200 });
  assert.deepEqual({ ...game.getMouse() }, { x: 800, y: 600, screenX: 400, screenY: 300 });

  game.weaponRuntime.timeUntilNextShot = 0;
  game.beginAttack(primaryPointer(500, 200));
  game.endAttack(primaryPointer());
  const bullet = game.bullets.at(-1);
  closeTo(bullet.directionX, 1);
  closeTo(bullet.directionY, 0);
});

test("Camera follows world movement, aim converts to World coordinates, and pause freezes Camera", () => {
  const game = loadGame(); startGame(game);
  const camera = game.getCameraRuntime();
  assert.deepEqual({ ...camera }, { x: 400, y: 300, width: 800, height: 600 });
  game.setState({ runPhase: "INTERMISSION", intermissionTimer: 0 });
  game.keys.d = true;
  game.update(0.5);
  assert.ok(camera.x > 400);
  game.elements.gameCanvas.setBoundingClientRect({ left: 0, top: 0, width: 800, height: 600 });
  game.updateAim({ clientX: 400, clientY: 300 });
  assert.deepEqual({ ...game.getMouse() }, {
    x: camera.x + 400, y: camera.y + 300, screenX: 400, screenY: 300
  });
  const frozen = { x: camera.x, y: camera.y };
  game.player.x += 100;
  game.setState({ runPhase: "INTRODUCTION_ACTIVE" });
  game.update(1);
  assert.deepEqual({ x: camera.x, y: camera.y }, frozen);
});

test("offscreen world bullets keep simulating until World bounds or terrain", () => {
  const game = loadGame(); startGame(game);
  const bullet = makeBullet({ x: 20, y: 20, speed: 10, directionX: 1, directionY: 0 });
  assert.equal(Battlefields.isOutsideRect(bullet, game.getCameraRuntime()), true);
  game.bullets.push(bullet);
  game.updateBullets(1);
  assert.equal(game.bullets.includes(bullet), true);
  assert.equal(bullet.x, 30);
});

test("regular enemies and Boss spawn outside the Camera using only two RNG samples each", () => {
  let calls = 0;
  const game = loadGame({}, { random() { calls++; return calls % 2 ? 0.25 : 0.75; } });
  startGame(game);
  const beforeEnemy = calls;
  game.spawnEnemy("normal");
  assert.equal(calls - beforeEnemy, 2);
  const enemy = game.enemies.at(-1);
  assert.ok(enemy);
  assert.equal(Battlefields.isOutsideRect(enemy, game.getCameraRuntime()), true);
  const beforeBoss = calls;
  game.startBossEncounter();
  assert.equal(calls - beforeBoss, 2);
  assert.equal(Battlefields.isOutsideRect(game.getState().boss, game.getCameraRuntime()), true);
});

test("Wave denominator and Boss transition use synthetic stage waveCount data", () => {
  const game = loadGame(); startGame(game);
  const state = game.getState();
  state.stageRuntime.definition = { ...state.stageRuntime.definition, waveCount: 2 };
  state.stageRuntime.waveIndex = 1;
  game.setState({ runPhase: "INTERMISSION", intermissionTimer: 0 });
  game.updateHud();
  assert.equal(game.elements.waveValue.textContent, "WAVE 2 / 2");
  game.update(game.encounters.CONFIG.intermission);
  assert.equal(game.getState().runPhase, "BOSS_ACTIVE");
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

test("Wave Coming banner is compact, non-countdown transition presentation", () => {
  const game = loadGame(); startGame(game);
  finishWave(game);
  game.updateArenaPresentation();
  assert.equal(game.elements.intermissionBanner.hidden, false);
  assert.equal(game.elements.intermissionTitle.textContent, "WAVE COMING");
  assert.equal(game.elements.intermissionDetail.textContent, "REINFORCEMENTS INBOUND");
  assert.equal(game.elements.intermissionCountdown.textContent, "");
  assert.equal(game.elements.intermissionBanner.classList.contains("wave-coming"), true);
  assert.equal(game.elements.intermissionBanner.classList.contains("boss-incoming"), false);
});

test("reinforcement edge cues aggregate only real Coming reservations and clear on resolution", () => {
  const game = loadGame(); startGame(game);
  const controller = game.getState().encounterController;
  controller.pendingReservations.push(...[1, 2].map(id => ({
    reservation: { id, phase: "WAVE_COMING", area: 1600, status: "PENDING" },
    enemy: { spawnSide: "right" }
  })));
  game.updateArenaPresentation();
  const indicators = game.elements.reinforcementEdges.children;
  assert.equal(indicators.find(item => item.dataset.edge === "right").dataset.count, "2");
  assert.equal(indicators.find(item => item.dataset.edge === "left").dataset.count, undefined);
  controller.pendingReservations.length = 0;
  game.enemies.push(makeEnemy(game, "fast", { lifecycle: "ENTERING", reservationPhase: "WAVE_COMING",
    spawnSide: "top" }));
  game.updateArenaPresentation();
  assert.equal(indicators.find(item => item.dataset.edge === "right").dataset.count, undefined);
  assert.equal(indicators.find(item => item.dataset.edge === "top").dataset.count, "1");
  game.enemies.length = 0;
  game.updateArenaPresentation();
  assert.equal(indicators.find(item => item.dataset.edge === "top").dataset.count, undefined);
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

test("Battlefield lifetime follows the Run and Hub cleanup removes transient world state", () => {
  const game = loadGame();
  assert.equal(game.getBattlefieldRuntime(), null);
  startGame(game);
  assert.equal(game.getBattlefieldRuntime().id, "stage-1-field-a");
  assert.equal(game.getState().stageRuntime.definition.battlefieldId, "stage-1-field-a");
  game.enemies.push(makeEnemy(game, "normal", { runtimeId: 901, x: 40, y: 40 }));
  game.bullets.push(makeBullet());
  game.hazards.push({ id: 1, phase: "ACTIVE", remaining: 2 });

  game.listeners["backToHubButton:click"]();
  game.listeners["confirmAbandonButton:click"]();

  assert.equal(game.getCurrentView(), "hub");
  assert.equal(game.getBattlefieldRuntime(), null);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.hazards.length, 0);
  assert.equal(game.getState().boss, null);
  assert.equal(game.getState().stageRuntime, null);
});

test("Player sweep cannot tunnel through cover and diagonal movement slides along it", () => {
  const game = loadGame(); startGame(game);
  game.setBattlefieldRuntime(legacyCoverRuntime());
  game.setState({ runPhase: "INTERMISSION", intermissionTimer: 0 });
  game.player.x = 20;
  game.player.y = 130;
  game.keys.d = true;
  game.update(5);
  assert.ok(game.player.x + game.player.width <= 110);
  assert.equal(Battlefields.firstSolidCollision(game.player, game.getBattlefieldRuntime()), null);

  game.keys.d = true;
  game.keys.s = true;
  game.player.x = 60;
  game.player.y = 100;
  game.update(0.5);
  assert.ok(game.player.x + game.player.width <= 110);
  assert.ok(game.player.y > 150);
  assert.equal(Battlefields.firstSolidCollision(game.player, game.getBattlefieldRuntime()), null);
});

test("terrain removes ordinary and Piercing bullets before they can pass through", () => {
  for (const pierceRemaining of [0, 5]) {
    const game = loadGame(); startGame(game);
    game.setBattlefieldRuntime(legacyCoverRuntime());
    game.bullets.push(makeBullet({ x: 20, y: 140, speed: 1000,
      directionX: 1, directionY: 0, pierceRemaining }));
    game.updateBullets(1);
    assert.equal(game.bullets.length, 0);
  }
});

test("Normal, Fast, and Tank chase around static cover without entering terrain", () => {
  for (const [index, type] of ["normal", "fast", "tank"].entries()) {
    const game = loadGame(); startGame(game);
    game.setBattlefieldRuntime(legacyCoverRuntime());
    game.enemies.length = 0;
    game.player.x = 200;
    game.player.y = 240;
    const dimensions = ENEMY_TEST_STATS[type];
    const enemy = makeEnemy(game, type, { runtimeId: index + 1,
      x: 200, y: type === "tank" ? 20 : 40, ...dimensions });
    game.enemies.push(enemy);
    let crossedCover = false;
    for (let frame = 0; frame < 720; frame++) {
      game.updateEnemies(1 / 60);
      assert.equal(Battlefields.firstSolidCollision(enemy, game.getBattlefieldRuntime()), null);
      if (enemy.y >= 180) { crossedCover = true; break; }
    }
    assert.equal(crossedCover, true,
      `${type} did not route around cover: ${JSON.stringify({ x: enemy.x, y: enemy.y, navigation: enemy.navigationRuntime })}`);
    assert.ok(enemy.navigationRuntime);
  }
});

test("Normal, Fast, and Tank make sustained progress around horizontal and vertical walls", () => {
  const fixtures = {
    vertical: { enemy: { x: 320, y: 560 }, player: { x: 1180, y: 560 } },
    horizontal: { enemy: { x: 780, y: 240 }, player: { x: 780, y: 920 } }
  };
  for (const [orientation, fixture] of Object.entries(fixtures)) {
    for (const [index, type] of ["normal", "fast", "tank"].entries()) {
      const game = loadGame(); startGame(game);
      game.setBattlefieldRuntime(wallWorldRuntime(orientation));
      game.enemies.length = 0;
      Object.assign(game.player, fixture.player);
      const enemy = makeEnemy(game, type, { runtimeId: index + 1, ...fixture.enemy });
      game.enemies.push(enemy);
      const initialDistance = distanceToPlayer(game, enemy);
      let previous = { x: enemy.x, y: enemy.y };
      for (let frame = 0; frame < 3600 && distanceToPlayer(game, enemy) > 150; frame++) {
        game.updateEnemies(1 / 60);
        assert.equal(Battlefields.firstSolidCollision(enemy, game.getBattlefieldRuntime()), null,
          `${orientation} ${type} entered terrain`);
        const frameMovement = Math.hypot(enemy.x - previous.x, enemy.y - previous.y);
        assert.ok(frameMovement <= enemy.speed / 60 + 1e-6,
          `${orientation} ${type} exceeded its movement budget`);
        previous = { x: enemy.x, y: enemy.y };
      }
      assert.ok(distanceToPlayer(game, enemy) < Math.min(150, initialDistance * 0.25),
        `${orientation} ${type} failed to converge: ${JSON.stringify({ x: enemy.x, y: enemy.y,
          distance: distanceToPlayer(game, enemy), navigation: enemy.navigationRuntime })}`);
      assert.ok(enemy.navigationRuntime);
    }
  }
});

test("a moving Player invalidates a stale pursuit target without per-frame route churn", () => {
  const game = loadGame(); startGame(game);
  game.setBattlefieldRuntime(wallWorldRuntime("vertical"));
  game.enemies.length = 0;
  Object.assign(game.player, { x: 1180, y: 340 });
  const enemy = makeEnemy(game, "normal", { runtimeId: 41, x: 320, y: 560 });
  game.enemies.push(enemy);
  game.updateEnemies(1 / 60);
  const firstTargetCell = enemy.navigationRuntime.targetCell;
  for (let frame = 0; frame < 30; frame++) game.updateEnemies(1 / 60);
  assert.equal(enemy.navigationRuntime.targetCell, firstTargetCell);

  Object.assign(game.player, { x: 1180, y: 900 });
  const distanceAfterMove = distanceToPlayer(game, enemy);
  for (let frame = 0; frame < 90 && enemy.navigationRuntime.targetCell === firstTargetCell; frame++) {
    game.updateEnemies(1 / 60);
  }
  assert.notEqual(enemy.navigationRuntime.targetCell, firstTargetCell);
  for (let frame = 0; frame < 2400 && distanceToPlayer(game, enemy) > 180; frame++) {
    game.updateEnemies(1 / 60);
    assert.equal(Battlefields.firstSolidCollision(enemy, game.getBattlefieldRuntime()), null);
  }
  assert.ok(distanceToPlayer(game, enemy) < Math.min(180, distanceAfterMove * 0.35));
});

test("problem seed 785540978 keeps an offscreen pursuer engaged across Camera movement", () => {
  const game = loadGame({}, { search: "?battlefieldSeed=785540978" }); startGame(game);
  const battlefield = game.getBattlefieldRuntime();
  assert.equal(battlefield.seed, 785540978);
  assert.equal(Battlefields.analyzeLocalDensity(battlefield).emptySampleCount, 0);
  game.enemies.length = 0;
  game.spawnEnemy("normal");
  const enemy = game.enemies[0];
  assert.equal(Battlefields.isOutsideRect(enemy, game.getCameraRuntime()), true);
  const initialDistance = distanceToPlayer(game, enemy);
  let becameVisible = false;
  for (let frame = 0; frame < 1800; frame++) {
    game.updateEnemies(1 / 60);
    game.updateCameraRuntime();
    assert.equal(Battlefields.firstSolidCollision(enemy, battlefield), null);
    if (!Battlefields.isOutsideRect(enemy, game.getCameraRuntime())) {
      becameVisible = true;
      break;
    }
  }
  assert.equal(becameVisible, true);
  assert.ok(distanceToPlayer(game, enemy) < initialDistance);

  const oldTargetCell = enemy.navigationRuntime.targetCell;
  Object.assign(game.player, { x: 1180, y: 900 });
  assert.equal(Battlefields.isStaticPositionValid(game.player, battlefield), true);
  for (let frame = 0; frame < 120 && enemy.navigationRuntime.targetCell === oldTargetCell; frame++) {
    game.updateEnemies(1 / 60);
    game.updateCameraRuntime();
  }
  assert.notEqual(enemy.navigationRuntime.targetCell, oldTargetCell);
});

test("enemy overlap recovery never resolves one stack into static terrain", () => {
  const game = loadGame(); startGame(game);
  game.setBattlefieldRuntime(legacyCoverRuntime());
  game.enemies.length = 0;
  const first = makeEnemy(game, "normal", { runtimeId: 1, x: 70, y: 180 });
  const second = makeEnemy(game, "normal", { runtimeId: 2, x: 70, y: 180 });
  game.enemies.push(first, second);
  for (let frame = 0; frame < 180 && rectanglesOverlap(first, second); frame++) {
    game.recoverEnemyOverlap(first, 2);
    game.recoverEnemyOverlap(second, 2);
  }
  assert.equal(rectanglesOverlap(first, second), false);
  assert.equal(Battlefields.firstSolidCollision(first, game.getBattlefieldRuntime()), null);
  assert.equal(Battlefields.firstSolidCollision(second, game.getBattlefieldRuntime()), null);
});

test("Interceptor committed charge stops at terrain and enters Recovery", () => {
  const game = loadGame(); startGame(game);
  game.setBattlefieldRuntime(legacyCoverRuntime());
  game.enemies.length = 0;
  const interceptor = makeEnemy(game, "interceptor", { runtimeId: 1,
    x: 500, y: 100, width: 34, height: 34, speed: 105, hp: 3, maxHp: 3 });
  game.enemies.push(interceptor);
  game.updateEnemies(0);
  Object.assign(interceptor.behaviorRuntime, {
    behaviorState: "CHARGE", stateElapsed: 0, chargeDirectionX: 1, chargeDirectionY: 0,
    chargeDistanceTravelled: 0, attemptResolved: false
  });
  game.updateEnemies(0.3);
  assert.equal(interceptor.behaviorRuntime.behaviorState, "RECOVERY");
  assert.ok(interceptor.x + interceptor.width <= 560);
  assert.equal(interceptor.behaviorRuntime.chargeDirectionX, 1);
  assert.equal(interceptor.behaviorRuntime.chargeDirectionY, 0);
});

test("Denier telegraph target is projected out of solid terrain", () => {
  const game = loadGame(); startGame(game);
  game.setBattlefieldRuntime(legacyCoverRuntime());
  game.enemies.length = 0;
  game.player.x = 180;
  game.player.y = 130;
  const denier = makeEnemy(game, "denier", { runtimeId: 1,
    x: 400, y: 280, width: 40, height: 40, speed: 85, hp: 3, maxHp: 3 });
  game.enemies.push(denier);
  game.updateEnemies(0);
  denier.behaviorRuntime.cooldown = 0;
  game.updateEnemies(0.01);
  assert.equal(game.hazards.length, 1);
  const hazard = game.hazards[0];
  assert.equal(Battlefields.firstSolidCollision(
    { x: hazard.x, y: hazard.y, width: 1, height: 1 }, game.getBattlefieldRuntime()), null);
});

test("Support keeps its distance-independent Link across terrain", () => {
  const game = loadGame({}, { search: "?prototype=combat-variety-v1" }); startGame(game);
  game.setBattlefieldRuntime(legacyCoverRuntime());
  game.enemies.length = 0;
  const support = makeEnemy(game, "support", { runtimeId: 1,
    x: 40, y: 40, width: 38, height: 38, speed: 80, hp: 3, maxHp: 3 });
  const interceptor = makeEnemy(game, "interceptor", { runtimeId: 2,
    x: 720, y: 520, width: 34, height: 34, speed: 105, hp: 3, maxHp: 3 });
  game.enemies.push(support, interceptor);
  game.updateEnemies(0);
  assert.equal(support.behaviorRuntime.linkedTargetId, interceptor.runtimeId);
  assert.equal(interceptor.behaviorRuntime.affectedBySupport, true);
  assert.deepEqual(Array.from(support.behaviorRuntime.supportedEnemyIds), [interceptor.runtimeId]);
});

test("Boss chase uses navigation and Boss charge stops at terrain for full Recovery", () => {
  const game = loadGame(); startGame(game);
  game.setBattlefieldRuntime(legacyCoverRuntime());
  game.startBossEncounter();
  const state = game.getState();
  Object.assign(state.boss, { x: 400, y: 100 });
  Object.assign(state.bossRuntime, {
    phase: "CHASE", phaseElapsed: 0, chaseDuration: 1,
    navigationRuntime: null
  });
  game.player.x = 700;
  game.player.y = 100;
  game.updateBoss(0.1);
  assert.ok(state.bossRuntime.navigationRuntime);

  Object.assign(state.boss, { x: 400, y: 100 });
  Object.assign(state.bossRuntime, {
    phase: "CHARGE", phaseElapsed: 0, chargeDirectionX: 1, chargeDirectionY: 0
  });
  game.updateBoss(0.3);
  assert.equal(state.bossRuntime.phase, "RECOVERY");
  assert.ok(state.boss.x + state.boss.width <= 560);
});

test("Boss pursues around blocked charge lanes before committing a straight attack", () => {
  for (const fixture of [
    { name: "synthetic vertical wall", battlefield: wallWorldRuntime("vertical"),
      boss: { x: 600, y: 560 }, player: { x: 1180, y: 560 } },
    { name: "problem seed", battlefield: null,
      boss: { x: 300, y: 600 }, player: { x: 700, y: 600 } }
  ]) {
    const game = loadGame({}, fixture.battlefield ? {} : { search: "?battlefieldSeed=785540978" });
    startGame(game);
    if (fixture.battlefield) game.setBattlefieldRuntime(fixture.battlefield);
    game.startBossEncounter();
    const state = game.getState();
    Object.assign(state.boss, fixture.boss);
    Object.assign(game.player, fixture.player);
    Object.assign(state.bossRuntime, { phase: "CHASE", phaseElapsed: 0,
      chaseDuration: 0.1, navigationRuntime: null });
    game.updateBoss(0.1);
    assert.equal(state.bossRuntime.phase, "CHASE", `${fixture.name} accepted a blocked lane`);

    const initialDistance = distanceToPlayer(game, state.boss);
    let sawTelegraph = false;
    let previous = { x: state.boss.x, y: state.boss.y };
    for (let frame = 0; frame < 4800 && !sawTelegraph; frame++) {
      game.updateBoss(1 / 60);
      assert.equal(Battlefields.firstSolidCollision(state.boss, game.getBattlefieldRuntime()), null,
        `${fixture.name} Boss entered terrain`);
      const frameMovement = Math.hypot(state.boss.x - previous.x, state.boss.y - previous.y);
      assert.ok(frameMovement <= 420 / 60 + 1e-6, `${fixture.name} Boss teleported`);
      previous = { x: state.boss.x, y: state.boss.y };
      if (state.bossRuntime.phase === "TELEGRAPH") {
        sawTelegraph = true;
        assert.equal(Battlefields.hasLineOfTravel(state.boss, game.player,
          game.getBattlefieldRuntime()), true, `${fixture.name} telegraphed through terrain`);
      }
    }
    assert.equal(sawTelegraph, true, `${fixture.name} Boss never found a useful charge lane: ${JSON.stringify({
      x: state.boss.x, y: state.boss.y, phase: state.bossRuntime.phase,
      navigation: state.bossRuntime.navigationRuntime })}`);
    assert.ok(distanceToPlayer(game, state.boss) < initialDistance,
      `${fixture.name} Boss made no engagement progress`);
  }
});

test("Enemy Introduction pause freezes position and navigation runtime", () => {
  const game = loadGame({}, { search: "?prototype=combat-variety-v1" }); startGame(game, { discoverAll: false });
  game.enemies.length = 0;
  const enemy = makeEnemy(game, "normal", { runtimeId: 1, x: 40, y: 40 });
  game.enemies.push(enemy);
  game.updateEnemies(0.1);
  const before = { x: enemy.x, y: enemy.y, navigation: JSON.stringify(enemy.navigationRuntime) };
  assert.equal(game.beginEnemyIntroductions(2), true);
  game.update(0.5);
  game.update(1);
  assert.deepEqual({ x: enemy.x, y: enemy.y, navigation: JSON.stringify(enemy.navigationRuntime) }, before);
});

test("Save v2 migration normalizes future arrays idempotently and never persists active Run state", () => {
  const game = loadGame();
  const legacyV2 = {
    version: 2,
    progression: { highestStage: 2, defeatedBosses: ["boss-1"], points: 37 },
    unlocks: { weapons: ["starter"], equipment: ["boots"] },
    statistics: { totalRuns: 4, totalKills: 12 }
  };
  const migrated = game.migrateSaveData(legacyV2);
  assert.equal(migrated.unlocks.deployables.length, 0);
  assert.equal(migrated.unlocks.summons.length, 0);
  assert.equal(migrated.progression.points, 37);
  assert.equal(JSON.stringify(game.migrateSaveData(migrated)), JSON.stringify(migrated));
  assert.equal(game.migrateSaveData(migrated), migrated);
  const storedV2 = JSON.stringify(migrated);
  const reloaded = loadGame({ "canva-war-save": storedV2 });
  assert.equal(JSON.stringify(reloaded.getSaveData()), storedV2);

  game.setSaveData(migrated);
  startGame(game);
  const stored = JSON.parse(game.storage.get("canva-war-save"));
  assert.deepEqual(Object.keys(stored).sort(), ["progression", "statistics", "unlocks", "version"]);
  assert.equal("runPhase" in stored, false);
  assert.equal("battlefieldId" in stored, false);
  assert.equal("player" in stored, false);
});

test("final regular-Wave completion is safe when bullet index greater than zero clears live combat arrays", () => {
  const game = loadGame(); startGame(game);
  game.startWave(4);
  const state = game.getState();
  state.encounterController.phase = game.continuousEncounter.PHASES.NORMAL;
  state.encounterController.waveProgressArmed = true;
  state.encounterController.target = 1;
  state.encounterController.progress = 0;
  game.enemies.length = 0;
  game.bullets.length = 0;
  const staleTarget = makeEnemy(game, "normal", { x: 300, y: 300, hp: 3, maxHp: 3, speed: 0 });
  const completingTarget = makeEnemy(game, "fast", { x: 100, y: 100, hp: 1, maxHp: 1, speed: 0 });
  game.enemies.push(staleTarget, completingTarget);
  game.bullets.push(makeBullet({ x: 300, y: 300 }), makeBullet({ x: 100, y: 100 }));

  assert.doesNotThrow(() => game.handleBulletEnemyCollisions());
  assert.equal(state.encounterController.progress, 1);
  assert.equal(state.encounterController.waveProgressArmed, false);
  assert.equal(game.getState().runPhase, "INTERMISSION");
  assert.equal(game.getRunSettlementState().securedCheckpoint.progress.completedWaves, 1);
  assert.equal(game.getSaveData().statistics.totalKills, 1);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.enemies.length, 0);
  assert.doesNotThrow(() => game.update(0));
  game.update(4);
  assert.equal(game.getState().runPhase, "BOSS_ACTIVE");
  assert.equal(game.getState().hasBossSpawned, true);
});

test("non-final Wave completion terminates the projectile snapshot before stale hits", () => {
  const game = loadGame(); startGame(game);
  const state = game.getState();
  state.encounterController.phase = game.continuousEncounter.PHASES.NORMAL;
  state.encounterController.waveProgressArmed = true;
  state.encounterController.target = 1;
  state.encounterController.progress = 0;
  game.enemies.length = 0;
  game.bullets.length = 0;
  const staleTarget = makeEnemy(game, "normal", { x: 300, y: 300, hp: 3, maxHp: 3, speed: 0 });
  const completingTarget = makeEnemy(game, "fast", { x: 100, y: 100, hp: 1, maxHp: 1, speed: 0 });
  game.enemies.push(staleTarget, completingTarget);
  const staleBullet = makeBullet({ x: 300, y: 300 });
  game.bullets.push(staleBullet, makeBullet({ x: 100, y: 100 }));

  game.handleBulletEnemyCollisions();
  assert.equal(game.getState().stageRuntime.waveIndex, 1);
  assert.equal(game.getState().encounterController.phase, "WAVE_COMING");
  assert.equal(game.getSaveData().statistics.totalKills, 1);
  assert.equal(staleTarget.hp, 3);
  assert.equal(game.bullets.includes(staleBullet), true);
  assert.equal(game.getRunSettlementState().securedCheckpoint.progress.completedWaves, 1);
});

test("two-slot loadout caps at two and preserves independent cooldowns across Q switching", () => {
  const game = loadGame(); startGame(game);
  assert.deepEqual(Array.from(game.configureWeaponLoadout(["scatter", "piercer", "launcher"])),
    ["scatter", "piercer"]);
  game.setMouse(game.player.x + 300, game.player.y);
  pressPrimary(game); releasePrimary(game);
  assert.equal(game.bullets.length, 5);
  const scatterCooldown = game.weaponSlots[0].runtime.timeUntilNextShot;
  assert.ok(scatterCooldown > 0);

  game.listeners.keydown({ key: "q", repeat: false, preventDefault() {} });
  assert.equal(game.activeWeaponSlotIndex, 1);
  assert.equal(game.weapon.id, "piercer");
  assert.equal(game.weaponSlots[1].runtime.timeUntilNextShot, 0);
  pressPrimary(game); releasePrimary(game);
  assert.equal(game.bullets.length, 6);
  game.updateWeaponRuntime(0.1);
  game.listeners.keydown({ key: "q", repeat: false, preventDefault() {} });
  assert.equal(game.activeWeaponSlotIndex, 0);
  closeTo(game.weaponRuntime.timeUntilNextShot, scatterCooldown - 0.1);
  assert.equal(game.elements.slotAValue.textContent, "Scatter");
  assert.equal(game.elements.slotBValue.textContent, "Piercer");
  assert.equal(game.elements.activeWeaponValue.textContent, "A: Scatter");
});

test("Burst fires exactly three deterministic shots and pending shots clean up on death and restart", () => {
  const game = loadGame(); startGame(game);
  game.configureWeaponLoadout(["burst"]);
  game.setMouse(game.player.x + 300, game.player.y);
  pressPrimary(game); releasePrimary(game);
  assert.equal(game.bullets.length, 1);
  assert.equal(game.weaponRuntime.burstShotsRemaining, 2);
  game.updateWeaponRuntime(0.109);
  assert.equal(game.bullets.length, 1);
  game.updateWeaponRuntime(0.001);
  assert.equal(game.bullets.length, 2);
  game.updateWeaponRuntime(0.11);
  assert.equal(game.bullets.length, 3);
  assert.equal(game.weaponRuntime.burstShotsRemaining, 0);

  game.weaponRuntime.timeUntilNextShot = 0;
  pressPrimary(game); releasePrimary(game);
  assert.equal(game.weaponRuntime.burstShotsRemaining, 2);
  game.player.hp = 1;
  game.enemies.push(makeEnemy(game, "normal", { x: game.player.x, y: game.player.y,
    hp: 3, maxHp: 3, lifecycle: "ACTIVE" }));
  game.handlePlayerEnemyCollisions();
  assert.equal(game.getState().isGameOver, true);
  assert.equal(game.weaponRuntime.burstShotsRemaining, 0);
  game.listeners.keydown({ key: "r", repeat: false });
  assert.equal(game.weaponSlots.length, 1);
  assert.equal(game.weapon.id, "starter");
  assert.equal(game.weaponRuntime.burstShotsRemaining, 0);
});

test("Launcher explosion hits nearby enemies once each and Arc Blade remains frontal", () => {
  const launcher = loadGame(); startGame(launcher);
  launcher.configureWeaponLoadout(["launcher"]);
  launcher.setMouse(launcher.player.x + 300, launcher.player.y);
  pressPrimary(launcher); releasePrimary(launcher);
  const rocket = launcher.bullets[0];
  rocket.x = 100; rocket.y = 100;
  const nearby = [
    makeEnemy(launcher, "normal", { x: 100, y: 100, hp: 5, maxHp: 5, speed: 0 }),
    makeEnemy(launcher, "fast", { x: 150, y: 100, hp: 5, maxHp: 5, speed: 0 })
  ];
  launcher.enemies.push(...nearby);
  launcher.handleBulletEnemyCollisions();
  assert.deepEqual(nearby.map(enemy => enemy.hp), [3, 3]);
  launcher.handleBulletEnemyCollisions();
  assert.deepEqual(nearby.map(enemy => enemy.hp), [3, 3]);
  assert.equal(launcher.bullets.includes(rocket), false);

  const blade = loadGame(); startGame(blade);
  blade.configureWeaponLoadout(["arc-blade"]);
  blade.player.x = 400; blade.player.y = 300;
  blade.setMouse(800, 320);
  const front = makeEnemy(blade, "normal", { x: 475, y: 300, hp: 4, maxHp: 4, speed: 0 });
  const back = makeEnemy(blade, "normal", { x: 325, y: 300, hp: 4, maxHp: 4, speed: 0 });
  blade.enemies.push(front, back);
  pressPrimary(blade); releasePrimary(blade);
  assert.equal(front.hp, 2);
  assert.equal(back.hp, 4);
  assert.equal(blade.bullets.length, 0);
  assert.equal(blade.weaponEffects.filter(effect => effect.kind === "arc").length, 1);
});

test("Scatter projectiles carry a short range and Launcher and Arc Blade can damage the Boss", () => {
  const scatter = loadGame(); startGame(scatter);
  scatter.configureWeaponLoadout(["scatter"]);
  scatter.setMouse(scatter.player.x + 300, scatter.player.y);
  pressPrimary(scatter); releasePrimary(scatter);
  assert.deepEqual(Array.from(scatter.bullets, projectile => projectile.remainingRange), [260, 260, 260, 260, 260]);
  scatter.updateBullets(1);
  assert.equal(scatter.bullets.length, 0);

  const launcher = loadGame(); startGame(launcher);
  launcher.configureWeaponLoadout(["launcher"]);
  launcher.startBossEncounter();
  launcher.setMouse(launcher.player.x + 300, launcher.player.y);
  pressPrimary(launcher); releasePrimary(launcher);
  const rocket = launcher.bullets[0];
  Object.assign(launcher.getState().boss, { x: 100, y: 100, hp: 100 });
  Object.assign(rocket, { x: 100, y: 100 });
  launcher.handleBulletBossCollisions();
  assert.equal(launcher.getState().boss.hp, 98);
  assert.equal(launcher.weaponEffects.some(effect => effect.kind === "explosion"), true);

  const blade = loadGame(); startGame(blade);
  blade.configureWeaponLoadout(["arc-blade"]);
  blade.startBossEncounter();
  blade.player.x = 400; blade.player.y = 300;
  Object.assign(blade.getState().boss, { x: 475, y: 285, hp: 100 });
  blade.setMouse(800, 320);
  pressPrimary(blade); releasePrimary(blade);
  assert.equal(blade.getState().boss.hp, 98);
});

test("production starts Starter-only while playtest selection equips one or two of six", () => {
  const production = loadGame(); startGame(production);
  assert.deepEqual(Array.from(production.weaponSlots, slot => slot.weaponId), ["starter"]);

  const playtest = loadGame({}, { search: "?playtest=1" });
  const inputs = playtest.elements.playtestWeaponSelector.children;
  inputs.forEach(input => { input.checked = ["scatter", "arc-blade"].includes(input.dataset.weaponId); });
  playtest.listeners["playtestWeaponSelector:change"]({ target: inputs[1] });
  startGame(playtest);
  assert.equal(inputs.length, 6);
  assert.deepEqual(Array.from(playtest.weaponSlots, slot => slot.weaponId), ["scatter", "arc-blade"]);
  inputs[2].checked = true;
  playtest.listeners["playtestWeaponSelector:change"]({ target: inputs[2] });
  assert.equal(inputs.filter(input => input.checked).length, 2);
});

test("enemy discovery persists across restart and reload and Codex never creates Run state", () => {
  const first = loadGame();
  first.listeners["playButton:click"]();
  assert.equal(first.getState().runPhase, "INTRODUCTION_PENDING");
  first.update(0);
  assert.equal(first.getState().currentEnemyIntroduction.type, "normal");
  assert.equal(first.enemyDiscovery.has("normal"), true);
  first.dismissEnemyIntroduction(); first.update(0); first.dismissEnemyIntroduction();
  assert.equal(first.getState().runPhase, "WAVE_ACTIVE");

  first.setState({ isGameOver: true });
  first.listeners.keydown({ key: "r", repeat: false });
  assert.equal(first.getState().runPhase, "WAVE_ACTIVE");
  assert.equal(first.getState().currentEnemyIntroduction, null);

  const reloaded = loadGame(Object.fromEntries(first.storage));
  reloaded.renderEnemyCodex();
  const codexText = reloaded.elements.enemyCodexGrid.textContent;
  assert.match(codexText, /NORMAL/);
  assert.match(codexText, /Unknown Enemy/);
  assert.doesNotMatch(codexText, /Discover this enemy.*Strike/);
  assert.equal(reloaded.getState().isGameStarted, false);
  assert.equal(reloaded.enemies.length, 0);
  reloaded.listeners["playButton:click"]();
  assert.equal(reloaded.getState().runPhase, "WAVE_ACTIVE");
});

test("newly eligible undiscovered enemies cannot spawn before their Wave briefing completes", () => {
  const game = loadGame(); startGame(game, { discoverAll: false });
  game.startWave(1);
  assert.equal(game.getState().runPhase, "INTRODUCTION_PENDING");
  const before = game.enemies.length;
  for (let index = 0; index < 10; index++) game.updateContinuousEncounter(0.25);
  assert.equal(game.enemies.length, before);
  assert.equal(game.enemyDiscovery.has("tank"), false);
  game.update(0);
  assert.equal(game.getState().currentEnemyIntroduction.type, "tank");
  assert.equal(game.enemyDiscovery.has("tank"), true);
});
