const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const gamePath = path.join(__dirname, "..", "game.js");
const gameSource = fs.readFileSync(gamePath, "utf8");
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
  handleBulletBossCollisions,
  handleBossPlayerCollision,
  updateBossDamageCooldown,
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

function loadGame() {
  const listeners = {};
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
}

function testInitialPageMarkup() {
  assert.match(indexSource, /<section id="gameInterface" class="game-screen" hidden>/);
  assert.match(indexSource, /href="style\.css\?v=2"/);
}

const tests = [
  ["initial page markup", testInitialPageMarkup],
  ["start screen and Play", testStartScreenAndPlay],
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
