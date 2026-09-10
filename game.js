const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const arenaRegion = document.getElementById("arenaRegion");
const canvasStage = document.getElementById("canvasStage");
const intermissionBanner = document.getElementById("intermissionBanner");
const intermissionTitle = document.getElementById("intermissionTitle");
const intermissionDetail = document.getElementById("intermissionDetail");
const intermissionCountdown = document.getElementById("intermissionCountdown");
const enemyIntroduction = document.getElementById("enemyIntroduction");
const enemyIntroductionIcon = document.getElementById("enemyIntroductionIcon");
const enemyIntroductionName = document.getElementById("enemyIntroductionName");
const enemyIntroductionRole = document.getElementById("enemyIntroductionRole");
const enemyIntroductionDescription = document.getElementById("enemyIntroductionDescription");
const startScreen = document.getElementById("startScreen");
const gameInterface = document.getElementById("gameInterface");
const playButton = document.getElementById("playButton");
const hpValue = document.getElementById("hpValue");
const scoreValue = document.getElementById("scoreValue");
const levelValue = document.getElementById("levelValue");
const xpValue = document.getElementById("xpValue");
const upgradeOverlay = document.getElementById("upgradeOverlay");
const upgradeTitle = document.getElementById("upgradeTitle");
const upgradeMessage = document.getElementById("upgradeMessage");
const upgradeChoices = document.getElementById("upgradeChoices");
const { RUN_END_REASONS, SCORE_TYPES, createRunSettlementState, awardScore, selectSettlementState, calculateSettlement } = RunSettlement;
const activeStages = Encounters.getStagesForSearch(globalThis.location?.search || "");

const saveStorageKey = "canva-war-save";
let saveData = loadSave();

function createDefaultSaveData() {
  return {
    version: 2,
    progression: {
      highestStage: 1,
      defeatedBosses: [],
      points: 0
    },
    unlocks: {
      weapons: ["starter"],
      equipment: []
    },
    statistics: {
      totalRuns: 0,
      totalKills: 0
    }
  };
}

function isValidSaveData(data) {
  return (
    data &&
    typeof data === "object" &&
    data.version === 2 &&
    data.progression &&
    typeof data.progression.highestStage === "number" &&
    Array.isArray(data.progression.defeatedBosses) &&
    typeof data.progression.points === "number" &&
    data.unlocks &&
    Array.isArray(data.unlocks.weapons) &&
    Array.isArray(data.unlocks.equipment) &&
    data.statistics &&
    typeof data.statistics.totalRuns === "number" &&
    typeof data.statistics.totalKills === "number"
  );
}

function migrateSaveData(data) {
  if (data && typeof data === "object" && data.version === 1) {
    return {
      ...data,
      version: 2,
      progression: {
        ...data.progression,
        points: 0
      }
    };
  }

  return data;
}

function loadSave() {
  try {
    const savedData = localStorage.getItem(saveStorageKey);

    if (!savedData) {
      return createDefaultSaveData();
    }

    const parsedData = migrateSaveData(JSON.parse(savedData));
    return isValidSaveData(parsedData) ? parsedData : createDefaultSaveData();
  } catch {
    return createDefaultSaveData();
  }
}

function saveGame() {
  try {
    localStorage.setItem(saveStorageKey, JSON.stringify(saveData));
  } catch {
    // Saving is optional for the active local run; a storage error must not stop gameplay.
  }
}

function recordBossOneDefeat() {
  if (!saveData.progression.defeatedBosses.includes("boss-1")) {
    saveData.progression.defeatedBosses.push("boss-1");
    saveGame();
  }
}

const player = {
  x: 380,
  y: 280,
  width: 40,
  height: 40,
  speed: RunBuild.PLAYER_BASE_STATS.speed,
  hp: RunBuild.PLAYER_BASE_STATS.maxHp,
  maxHp: RunBuild.PLAYER_BASE_STATS.maxHp
};

const enemies = [];
const bullets = [];
const hazards = [];
const denierHazardDamageRuntime = EnemyBehaviors.createHazardDamageRuntime();
const playerVelocity = { x: 0, y: 0 };
let nextEnemyRuntimeId = 1;
let boss = null;
let hasBossSpawned = false;
let isBossDefeated = false;
let bossDamageCooldown = 0;
const bossDamageCooldownDuration = Encounters.BOSSES["boss-1"].contactCooldown;
let buildState = RunBuild.createBuildState();
let weapon = RunBuild.resolveWeaponStats(Weapons.STARTER, buildState);
let playerStats = RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, buildState);
let upgradeRng = null;
let currentUpgradeChoices = [];
const weaponRuntime = { timeUntilNextShot: 0, attackHeld: false };
const enemyStats = Object.fromEntries(Object.entries(Encounters.ENEMIES)
  .map(([type, definition]) => [type, definition.stats]));
const enemyColors = {
  normal: "#dc2626",
  fast: "#f97316",
  tank: "#7c3aed",
  interceptor: "#eab308",
  denier: "#be123c",
  support: "#0f766e"
};
const SPAWN_PLACEMENT_ATTEMPTS = 16;
const COLLISION_EPSILON = 1e-7;
const RUN_PHASES = Object.freeze(Object.fromEntries([
  "STAGE_ENTER", "WAVE_ACTIVE", "INTERMISSION", "ENEMY_INTRODUCTION", "BOSS_ACTIVE", "STAGE_CLEAR",
  "STAGE_REWARD", "RUN_VICTORY", "RUN_DEAD"
].map(phase => [phase, phase])));
const BOSS_PHASES = Object.freeze({
  CHASE: "CHASE",
  TELEGRAPH: "TELEGRAPH",
  CHARGE: "CHARGE",
  RECOVERY: "RECOVERY"
});
let runPhase = null;
let stageIndex = 0;
let stageRuntime = null;
let currentWave = null;
let waveRuntime = null;
let bossRuntime = null;
let intermissionTimer = 0;
let stageClearTimer = 0;
const introducedEnemyTypes = new Set();
let introductionQueue = [];
let currentEnemyIntroduction = null;
let introductionTimer = 0;
let pendingWaveIndex = null;
let isAbandonConfirmOpen = false;
let isAbandoned = false;
const abandonOverlay = document.getElementById("abandonOverlay");

function createUpgradeRng() {
  let seed = 0x43414e56;
  try {
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      const values = new Uint32Array(1);
      globalThis.crypto.getRandomValues(values);
      seed = values[0];
    }
  } catch {
    // A deterministic private stream is a safe fallback and never consumes Wave RNG.
  }
  return Weapons.createSeededRng(seed);
}

function clearInput({ weaponReady = false } = {}) {
  Object.keys(keys).forEach(key => { keys[key] = false; });
  weaponRuntime.attackHeld = false;
  if (weaponReady) weaponRuntime.timeUntilNextShot = 0;
}
function resetHazardDamageRuntime() {
  denierHazardDamageRuntime.cooldown = 0;
  denierHazardDamageRuntime.inside = false;
  denierHazardDamageRuntime.entrySequence = 0;
}
function clearIntroductionTransient() {
  introductionQueue = [];
  currentEnemyIntroduction = null;
  introductionTimer = 0;
  pendingWaveIndex = null;
  enemyIntroduction.hidden = true;
}
function showNextEnemyIntroduction() {
  const type = introductionQueue.shift();
  const definition = Encounters.COMBAT_VARIETY_V1.introductions[type];
  if (!definition) return false;
  introducedEnemyTypes.add(type);
  currentEnemyIntroduction = { type, ...definition };
  introductionTimer = 0;
  runPhase = RUN_PHASES.ENEMY_INTRODUCTION;
  clearInput();
  observeTelemetry("recordEnemyIntroduction", () => ({ enemyType: type }));
  return true;
}
function beginEnemyIntroductions(waveIndex) {
  const planned = stageRuntime.definition.introductions?.[waveIndex] || [];
  introductionQueue = planned.filter(type => !introducedEnemyTypes.has(type));
  if (!introductionQueue.length) return false;
  pendingWaveIndex = waveIndex;
  return showNextEnemyIntroduction();
}
function startWave(index) {
  currentEnemyIntroduction = null;
  introductionQueue = [];
  pendingWaveIndex = null;
  currentWave = Encounters.generateWave(stageRuntime.definition, index, stageRuntime);
  stageRuntime.waveIndex = index;
  stageRuntime.recentTemplates.push(currentWave.templateId);
  waveRuntime = Encounters.createWaveRuntime(currentWave);
  runSettlementState.progress.currentEncounter = { id: currentWave.id, type: "wave" };
  runPhase = RUN_PHASES.WAVE_ACTIVE;
  clearInput({ weaponReady: true });
  observeTelemetry("startEncounter", () => ({ type: "wave", definition: currentWave, player: telemetryPlayer() }));
}
function enterStage() {
  runPhase = RUN_PHASES.STAGE_ENTER;
  stageRuntime = { definition: activeStages[stageIndex], waveIndex: 0, recentTemplates: [], completed: false };
  runSettlementState.progress.stage = stageIndex + 1;
  startWave(0);
}
// Reserved hooks: no live clear, Boss or performance awards exist yet.
function getEncounterAwards(type, runtime) {
  return { type, clearScoreType: type === "wave" ? SCORE_TYPES.WAVE_CLEAR : SCORE_TYPES.BOSS_KILL,
    clearScore: 0, performanceBonuses: [] };
}
function completeCurrentEncounter(type, runtime) {
  RunSettlement.completeEncounter(runSettlementState, getEncounterAwards(type, runtime));
  score = runSettlementState.score;
  observeTelemetry("finishEncounter", () => ({ outcome: "clear", player: telemetryPlayer() }));
}
function enterIntermission() {
  completeCurrentEncounter("wave", waveRuntime);
  runPhase = RUN_PHASES.INTERMISSION;
  intermissionTimer = 0;
  bullets.length = 0;
  EnemyBehaviors.clearTransient(enemies, hazards);
  resetHazardDamageRuntime();
  clearInput();
}
function startBossEncounter() {
  const definition = Encounters.BOSSES[stageRuntime.definition.boss];
  bossRuntime = { encounterId: definition.id, elapsedTime: 0, damageTaken: 0,
    analysis: definition.analysis, isComplete: false, phase: BOSS_PHASES.CHASE,
    phaseElapsed: 0, chaseDuration: definition.chargeCycle.initialChaseDuration,
    chargeDirectionX: 0, chargeDirectionY: 0, collisionPhase: BOSS_PHASES.CHASE };
  runSettlementState.progress.currentEncounter = { id: definition.id, type: "boss" };
  spawnBoss();
  EnemyBehaviors.clearTransient(enemies, hazards);
  resetHazardDamageRuntime();
  runPhase = RUN_PHASES.BOSS_ACTIVE;
  clearInput({ weaponReady: true });
  observeTelemetry("startEncounter", () => ({ type: "boss", definition,
    stageId: stageRuntime.definition.id, waveIndex: stageRuntime.waveIndex, player: telemetryPlayer() }));
}
function completeBossEncounter() {
  if (runPhase !== RUN_PHASES.BOSS_ACTIVE || !bossRuntime || bossRuntime.isComplete || !boss || boss.hp > 0 || player.hp <= 0) return;
  bossRuntime.isComplete = true;
  completeCurrentEncounter("boss", bossRuntime);
  isBossDefeated = true;
  boss = null;
  recordBossOneDefeat();
  stageRuntime.completed = true;
  runSettlementState.progress.completedStages += 1;
  saveData.progression.highestStage = Math.max(saveData.progression.highestStage, stageIndex + 1);
  saveGame();
  runPhase = RUN_PHASES.STAGE_CLEAR;
  stageClearTimer = 0;
  bullets.length = 0;
  EnemyBehaviors.clearTransient(enemies, hazards);
  resetHazardDamageRuntime();
  clearIntroductionTransient();
  clearInput();
}
function handleStageReward(stageContext) {
  // Architectural boundary only: no reward or healing.
}
function takeDamage(amount, enemyType) {
  const hpBefore = player.hp;
  player.hp = Math.max(0, player.hp - amount);
  const runtime = runPhase === RUN_PHASES.BOSS_ACTIVE ? bossRuntime : waveRuntime;
  if (runtime) runtime.damageTaken += amount;
  observeTelemetry("recordDamage", () => ({ amount: hpBefore - player.hp, incomingDamage: amount,
    hp: player.hp, maxHp: player.maxHp, enemyType }));
  if (player.hp <= 0) {
    runPhase = RUN_PHASES.RUN_DEAD;
    isGameOver = true;
    settleRun(RUN_END_REASONS.DEATH);
    EnemyBehaviors.clearTransient(enemies, hazards);
    resetHazardDamageRuntime();
    clearIntroductionTransient();
  }
}
function openAbandon() {
  if (!isGameStarted || isGameOver || isVictory || isChoosingUpgrade || isAbandoned) return;
  isAbandonConfirmOpen = true;
  abandonOverlay.hidden = false;
  clearInput();
  document.getElementById("continueButton").focus?.();
}
function closeAbandon() {
  isAbandonConfirmOpen = false;
  abandonOverlay.hidden = true;
  clearInput();
}
function abandonRun() {
  if (!isAbandonConfirmOpen) return;
  closeAbandon();
  settleRun(RUN_END_REASONS.ABANDON);
  isAbandoned = true;
  bullets.length = 0;
  EnemyBehaviors.clearTransient(enemies, hazards);
  resetHazardDamageRuntime();
  clearIntroductionTransient();
}
document.getElementById("abandonButton").addEventListener("click", openAbandon);
document.getElementById("continueButton").addEventListener("click", closeAbandon);
document.getElementById("confirmAbandonButton").addEventListener("click", abandonRun);
let isGameStarted = false;
let isGameOver = false;
let isVictory = false;
let isChoosingUpgrade = false;
let score = 0;
let runSettlementState = createRunSettlementState();
let lastSettlement = null;
let hasSettledRun = false;
let level = 1;
let xp = 0;
let previousXpRequirement = 3;
let xpToNextLevel = 5;

const keys = {
  w: false,
  a: false,
  s: false,
  d: false
};

const mouse = {
  x: 0,
  y: 0
};

playButton.addEventListener("click", () => {
  resetGame();
  saveData.statistics.totalRuns += 1;
  saveGame();
  isGameStarted = true;
  startScreen.hidden = true;
  gameInterface.hidden = false;
  resizeCanvasDisplay();
  updateHud();
});

function resizeCanvasDisplay() {
  const bounds = arenaRegion?.getBoundingClientRect?.();
  const availableWidth = arenaRegion?.clientWidth || bounds?.width || 0;
  const availableHeight = arenaRegion?.clientHeight || bounds?.height || 0;
  const size = GameLayout.calculateCanvasDisplaySize(
    canvas.width,
    canvas.height,
    availableWidth,
    availableHeight
  );

  if (size.width > 0 && size.height > 0 && canvasStage?.style) {
    canvasStage.style.width = `${size.width}px`;
    canvasStage.style.height = `${size.height}px`;
  }
  return size;
}

function updateAim(event) {
  const rect = canvas.getBoundingClientRect();
  const point = GameLayout.clientToCanvasPoint(
    event.clientX,
    event.clientY,
    rect,
    canvas.width,
    canvas.height
  );
  if (!point) return;
  mouse.x = point.x;
  mouse.y = point.y;
}

function canAttack() {
  return isGameStarted && !isGameOver && !isVictory && !isChoosingUpgrade &&
    !isAbandonConfirmOpen && !isAbandoned &&
    [RUN_PHASES.WAVE_ACTIVE, RUN_PHASES.BOSS_ACTIVE].includes(runPhase);
}

function fireWeaponAttack() {
  if (!canAttack() || weaponRuntime.timeUntilNextShot > 1e-9) return false;

  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  const aimAngle = Math.atan2(mouse.y - playerCenterY, mouse.x - playerCenterX);
  const directions = Weapons.getProjectileDirections(
    aimAngle,
    weapon.projectileCount,
    weapon.spreadDegrees
  );

  observeTelemetry("recordAttack");
  for (const direction of directions) {
    bullets.push({
      x: playerCenterX - weapon.bulletSize / 2,
      y: playerCenterY - weapon.bulletSize / 2,
      width: weapon.bulletSize,
      height: weapon.bulletSize,
      speed: weapon.bulletSpeed,
      damage: weapon.damage,
      directionX: direction.x,
      directionY: direction.y,
      pierceRemaining: weapon.pierce,
      hitTargets: new Set()
    });
    observeTelemetry("recordShot");
  }
  weaponRuntime.timeUntilNextShot = 1 / weapon.fireRate;
  return true;
}

function beginAttack(event) {
  if ((event.button ?? 0) !== 0) return;
  updateAim(event);
  event.preventDefault?.();
  if (!canAttack()) {
    weaponRuntime.attackHeld = false;
    return;
  }
  if (event.pointerId !== undefined) {
    try { canvas.setPointerCapture?.(event.pointerId); } catch { /* Document release still clears input. */ }
  }
  weaponRuntime.attackHeld = true;
  fireWeaponAttack();
}

function endAttack(event) {
  if (event && (event.button ?? 0) !== 0) return;
  weaponRuntime.attackHeld = false;
}

function updateWeaponRuntime(deltaTime) {
  const attackInterval = 1 / weapon.fireRate;
  const elapsed = Math.min(attackInterval, Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0);
  const remaining = weaponRuntime.timeUntilNextShot - elapsed;
  weaponRuntime.timeUntilNextShot = remaining <= 1e-9 ? 0 : remaining;
  if (weaponRuntime.attackHeld && fireWeaponAttack()) {
    // Preserve ordinary sub-frame overshoot, but cap lag recovery to one interval.
    weaponRuntime.timeUntilNextShot = Math.max(0, attackInterval + Math.max(-attackInterval, remaining));
  }
}

canvas.addEventListener("pointermove", updateAim);
canvas.addEventListener("mousemove", updateAim);
canvas.addEventListener("pointerdown", beginAttack);
canvas.addEventListener("mousedown", beginAttack);
canvas.addEventListener("lostpointercapture", () => { weaponRuntime.attackHeld = false; });
document.addEventListener("pointerup", endAttack);
document.addEventListener("mouseup", endAttack);
document.addEventListener("pointercancel", () => { weaponRuntime.attackHeld = false; });
globalThis.addEventListener?.("blur", () => clearInput());
globalThis.addEventListener?.("resize", resizeCanvasDisplay);
if (typeof ResizeObserver === "function" && arenaRegion) {
  const arenaResizeObserver = new ResizeObserver(resizeCanvasDisplay);
  arenaResizeObserver.observe(arenaRegion);
}

canvas.addEventListener("click", () => {
  // Click is intentionally not a firing trigger; cadence is owned by Weapon Runtime.
  if (!isGameStarted || isGameOver || isVictory || isChoosingUpgrade || isAbandonConfirmOpen || isAbandoned) {
    return;
  }
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === "r" && (isGameOver || isVictory || isAbandoned)) {
    resetGame();
    return;
  }

  if (isAbandonConfirmOpen) {
    if (key === "escape") closeAbandon();
    if (key === "tab") {
      event.preventDefault();
      const continueButton = document.getElementById("continueButton");
      const confirmButton = document.getElementById("confirmAbandonButton");
      (document.activeElement === continueButton ? confirmButton : continueButton).focus?.();
    }
    return;
  }

  if (!isGameStarted || isGameOver || isVictory || isAbandoned) {
    return;
  }

  if (isChoosingUpgrade) {
    if (!event.repeat) {
      chooseUpgrade(key);
    }
    return;
  }

  if (key in keys && !event.repeat) {
    keys[key] = true;
  }
});

document.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();

  if (key in keys) {
    keys[key] = false;
  }
});

function resetGame() {
  buildState = RunBuild.createBuildState();
  weapon = RunBuild.resolveWeaponStats(Weapons.STARTER, buildState);
  playerStats = RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, buildState);
  player.x = 380;
  player.y = 280;
  player.speed = playerStats.speed;
  player.maxHp = playerStats.maxHp;
  player.hp = playerStats.maxHp;
  enemies.length = 0;
  bullets.length = 0;
  EnemyBehaviors.clearTransient(enemies, hazards);
  resetHazardDamageRuntime();
  introducedEnemyTypes.clear();
  clearIntroductionTransient();
  nextEnemyRuntimeId = 1;
  playerVelocity.x = 0;
  playerVelocity.y = 0;
  boss = null;
  hasBossSpawned = false;
  isBossDefeated = false;
  bossDamageCooldown = 0;
  stageIndex = 0;
  currentWave = null;
  waveRuntime = null;
  bossRuntime = null;
  intermissionTimer = 0;
  stageClearTimer = 0;
  isAbandoned = false;
  closeAbandon();
  mouse.x = 0;
  mouse.y = 0;
  isGameOver = false;
  isVictory = false;
  isChoosingUpgrade = false;
  currentUpgradeChoices = [];
  upgradeOverlay.hidden = true;
  upgradeChoices.textContent = "";
  upgradeRng = createUpgradeRng();
  weaponRuntime.timeUntilNextShot = 0;
  weaponRuntime.attackHeld = false;
  score = 0;
  runSettlementState = createRunSettlementState();
  lastSettlement = null;
  hasSettledRun = false;
  level = 1;
  xp = 0;
  previousXpRequirement = 3;
  xpToNextLevel = 5;
  keys.w = false;
  keys.a = false;
  keys.s = false;
  keys.d = false;
  renderBuildPanel();
  observeTelemetry("startRun", () => ({ player: telemetryPlayer() }));
  enterStage();
}

function update(deltaTime) {
  if (!isGameStarted || isGameOver || isVictory || isChoosingUpgrade || isAbandonConfirmOpen || isAbandoned) {
    return;
  }

  if (runPhase === RUN_PHASES.STAGE_CLEAR) {
    stageClearTimer += deltaTime;
    if (stageClearTimer >= Encounters.CONFIG.stageClear) runPhase = RUN_PHASES.STAGE_REWARD;
    return;
  }
  if (runPhase === RUN_PHASES.STAGE_REWARD) {
    handleStageReward(stageRuntime);
    if (stageIndex + 1 < activeStages.length) { stageIndex++; enterStage(); }
    else { runPhase = RUN_PHASES.RUN_VICTORY; isVictory = true; settleRun(RUN_END_REASONS.VICTORY); }
    return;
  }
  if (runPhase === RUN_PHASES.ENEMY_INTRODUCTION) {
    introductionTimer += deltaTime;
    if (introductionTimer >= Encounters.COMBAT_VARIETY_V1.introductionDuration) {
      if (!showNextEnemyIntroduction()) {
        const waveIndex = pendingWaveIndex;
        clearIntroductionTransient();
        startWave(waveIndex);
      }
    }
    return;
  }
  let directionX = 0;
  let directionY = 0;

  if (keys.w) directionY -= 1;
  if (keys.s) directionY += 1;
  if (keys.a) directionX -= 1;
  if (keys.d) directionX += 1;

  const directionLength = Math.hypot(directionX, directionY);

  const playerStartX = player.x;
  const playerStartY = player.y;
  if (directionLength > 0) {
    directionX /= directionLength;
    directionY /= directionLength;
    const movementX = directionX * player.speed * deltaTime;
    const movementY = directionY * player.speed * deltaTime;

    player.x += movementX;
    const enemyOnX = getPlayerCollision();

    if (enemyOnX && !pushEnemy(enemyOnX, movementX, 0)) {
      player.x -= movementX;
    }

    player.y += movementY;
    const enemyOnY = getPlayerCollision();

    if (enemyOnY && !pushEnemy(enemyOnY, 0, movementY)) {
      player.y -= movementY;
    }
  }

  player.x = Math.max(0, Math.min(player.x, canvas.width - player.width));
  player.y = Math.max(0, Math.min(player.y, canvas.height - player.height));
  playerVelocity.x = deltaTime > 0 ? (player.x - playerStartX) / deltaTime : 0;
  playerVelocity.y = deltaTime > 0 ? (player.y - playerStartY) / deltaTime : 0;

  if (runPhase === RUN_PHASES.INTERMISSION) {
    observeTelemetry("recordIntermission", () => ({ deltaTime }));
    intermissionTimer += deltaTime;
    if (intermissionTimer >= Encounters.CONFIG.intermission) {
      if (stageRuntime.waveIndex + 1 < stageRuntime.definition.waveCount) {
        const nextWaveIndex = stageRuntime.waveIndex + 1;
        if (!beginEnemyIntroductions(nextWaveIndex)) startWave(nextWaveIndex);
      } else startBossEncounter();
    }
    return;
  }
  if (runPhase === RUN_PHASES.WAVE_ACTIVE) {
    observeCombatFrame(deltaTime);
    Encounters.updateWaveRuntime(currentWave, waveRuntime, enemies, deltaTime, spawnEnemy);
    observeTelemetry("recordGroupRelease", () => ({ groupIndex: waveRuntime.nextSpawnGroupIndex - 1,
      elapsedTime: waveRuntime.elapsedTime, activeEnemyCount: waveRuntime.aliveEnemyCount, activeThreat: waveRuntime.activeThreat }));
    updateEnemies(deltaTime);
    handleDenierHazardDamage(deltaTime);
    if (isGameOver) return;
    handlePlayerEnemyCollisions();
    if (isGameOver) return;
  } else if (runPhase === RUN_PHASES.BOSS_ACTIVE) {
    observeCombatFrame(deltaTime);
    bossRuntime.elapsedTime += deltaTime;
    updateBoss(deltaTime);
    updateBossDamageCooldown(deltaTime);
    handleBossPlayerCollision();
    if (isGameOver) return;
  } else return;
  updateWeaponRuntime(deltaTime);
  updateBullets(deltaTime);
  if (runPhase === RUN_PHASES.WAVE_ACTIVE) {
    handleBulletEnemyCollisions();
    if (isChoosingUpgrade || isGameOver) return;
    Encounters.syncWaveRuntime(currentWave, waveRuntime, enemies);
    if (waveRuntime.isComplete) { enterIntermission(); return; }
  } else {
    handleBulletBossCollisions();
    if (player.hp <= 0) { takeDamage(0); return; }
    completeBossEncounter();
  }
}

function updateBullets(deltaTime) {
  for (let index = bullets.length - 1; index >= 0; index--) {
    const bullet = bullets[index];

    bullet.x += bullet.directionX * bullet.speed * deltaTime;
    bullet.y += bullet.directionY * bullet.speed * deltaTime;

    const isOutsideCanvas =
      bullet.x + bullet.width < 0 ||
      bullet.x > canvas.width ||
      bullet.y + bullet.height < 0 ||
      bullet.y > canvas.height;

    if (isOutsideCanvas) {
      bullets.splice(index, 1);
    }
  }
}

function spawnEnemy(type = "normal", waveId = currentWave?.id) {
  const stats = Encounters.getScaledEnemyStats(enemyStats[type], stageRuntime.definition.enemyScaling);
  const enemy = { type, waveId, runtimeId: nextEnemyRuntimeId++, x: 0, y: 0, ...stats,
    behaviorRuntime: EnemyBehaviors.createRuntime(Encounters.ENEMIES[type]) };
  const edge = Math.floor(Math.random() * 4);
  const edgeOffset = Math.random();
  positionEnemyForSpawn(enemy, edge, edgeOffset);

  enemies.push(enemy);
}

function setEntityOnCanvasEdge(entity, edge, offsetRatio) {
  const offset = ((offsetRatio % 1) + 1) % 1;
  entity.x = 0;
  entity.y = 0;
  if (edge === 0) {
    entity.x = offset * (canvas.width - entity.width);
  } else if (edge === 1) {
    entity.x = canvas.width - entity.width;
    entity.y = offset * (canvas.height - entity.height);
  } else if (edge === 2) {
    entity.x = offset * (canvas.width - entity.width);
    entity.y = canvas.height - entity.height;
  } else {
    entity.y = offset * (canvas.height - entity.height);
  }
}

function positionEnemyForSpawn(enemy, initialEdge, initialOffset) {
  const offsetSteps = [0, 0.5, 0.25, 0.75];
  let originalPosition = null;
  for (let attempt = 0; attempt < SPAWN_PLACEMENT_ATTEMPTS; attempt++) {
    const edge = (initialEdge + attempt) % 4;
    const offsetStep = offsetSteps[Math.floor(attempt / 4)];
    setEntityOnCanvasEdge(enemy, edge, initialOffset + offsetStep);
    if (attempt === 0) originalPosition = { x: enemy.x, y: enemy.y };
    if (!hasOtherEnemyCollision(enemy)) return true;
  }

  // Dense or malformed runtime state can exhaust the bounded search. Movement
  // recovery below can still depenetrate this deterministic fallback safely.
  enemy.x = originalPosition.x;
  enemy.y = originalPosition.y;
  return false;
}

function spawnBoss() {
  boss = { x: 0, y: 0, ...Encounters.BOSSES[stageRuntime.definition.boss].stats };
  const edge = Math.floor(Math.random() * 4);

  if (edge === 0) {
    boss.x = Math.random() * (canvas.width - boss.width);
  } else if (edge === 1) {
    boss.x = canvas.width - boss.width;
    boss.y = Math.random() * (canvas.height - boss.height);
  } else if (edge === 2) {
    boss.x = Math.random() * (canvas.width - boss.width);
    boss.y = canvas.height - boss.height;
  } else {
    boss.y = Math.random() * (canvas.height - boss.height);
  }

  hasBossSpawned = true;
}

function isOverlapping(rectangleA, rectangleB) {
  return (
    rectangleA.x < rectangleB.x + rectangleB.width &&
    rectangleA.x + rectangleA.width > rectangleB.x &&
    rectangleA.y < rectangleB.y + rectangleB.height &&
    rectangleA.y + rectangleA.height > rectangleB.y
  );
}

function isCurrentEncounterEnemy(enemy) {
  return Boolean(
    runPhase === RUN_PHASES.WAVE_ACTIVE &&
    currentWave &&
    enemy?.waveId === currentWave.id &&
    Number.isFinite(enemy.hp) &&
    enemy.hp > 0
  );
}

function prepareProjectileHitState(bullet) {
  if (!(bullet.hitTargets instanceof Set)) bullet.hitTargets = new Set();
  if (!Number.isFinite(bullet.pierceRemaining)) {
    bullet.pierceRemaining = Math.max(0, Math.floor(bullet.pierce || 0));
  }
}

function consumeProjectileHit(bullet, bulletIndex, target) {
  bullet.hitTargets.add(target);
  if (bullet.pierceRemaining > 0) {
    bullet.pierceRemaining--;
    return false;
  }
  bullets.splice(bulletIndex, 1);
  return true;
}

function handleBulletEnemyCollisions() {
  for (let bulletIndex = bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
    const bullet = bullets[bulletIndex];
    prepareProjectileHitState(bullet);

    for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
      const enemy = enemies[enemyIndex];
      if (!isCurrentEncounterEnemy(enemy)) continue;

      if (!bullet.hitTargets.has(enemy) && isOverlapping(bullet, enemy)) {
        enemy.hp -= bullet.damage;
        observeTelemetry("recordBulletHit", () => ({ enemyType: enemy.type,
          damage: Math.max(0, Math.min(bullet.damage, enemy.hp + bullet.damage)) }));
        const projectileRemoved = consumeProjectileHit(bullet, bulletIndex, enemy);

        if (enemy.hp <= 0) {
          EnemyBehaviors.recordEnemyDefeat(enemy, hazards, { emit: emitBehaviorTelemetry, enemies });
          enemies.splice(enemyIndex, 1);
          Encounters.syncWaveRuntime(currentWave, waveRuntime, enemies);
          observeTelemetry("recordEnemyKill", () => ({ enemyType: enemy.type }));
          awardRunScore(SCORE_TYPES.ENEMY_KILL, 1);
          xp += 1;
          saveData.statistics.totalKills += 1;
          saveGame();
          updateLevel();

          if (isChoosingUpgrade) {
            return;
          }
        }

        if (projectileRemoved) break;
      }
    }
  }
}

function awardRunScore(scoreType, amount, performanceRecord) {
  awardScore(runSettlementState, scoreType, amount, performanceRecord);
  score = runSettlementState.score;
}

function settleRun(endReason) {
  if (hasSettledRun) {
    return lastSettlement;
  }

  clearInput();

  const settlementState = selectSettlementState(runSettlementState, endReason);
  if (!settlementState) {
    observeRunEnd(endReason, null, null);
    return null;
  }

  lastSettlement = calculateSettlement(settlementState);
  saveData.progression.points += lastSettlement.points;
  saveGame();
  hasSettledRun = true;
  observeRunEnd(endReason, lastSettlement, settlementState);
  return lastSettlement;
}

function handleBulletBossCollisions() {
  if (!boss) {
    return;
  }

  for (let bulletIndex = bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
    const bullet = bullets[bulletIndex];
    prepareProjectileHitState(bullet);

    if (!bullet.hitTargets.has(boss) && isOverlapping(bullet, boss)) {
      boss.hp -= bullet.damage;
      observeTelemetry("recordBulletHit", () => ({ enemyType: "boss-1",
        damage: Math.max(0, Math.min(bullet.damage, boss.hp + bullet.damage)) }));
      consumeProjectileHit(bullet, bulletIndex, boss);

      if (boss.hp <= 0) {
        return;
      }
    }
  }
}

function updateLevel() {
  if (isChoosingUpgrade) return;

  while (xp >= xpToNextLevel) {
    xp -= xpToNextLevel;
    level += 1;

    const nextXpRequirement = previousXpRequirement + xpToNextLevel;
    previousXpRequirement = xpToNextLevel;
    xpToNextLevel = nextXpRequirement;
    currentUpgradeChoices = RunBuild.generateUpgradeChoices(
      buildState,
      3,
      upgradeRng || (upgradeRng = createUpgradeRng())
    );

    if (currentUpgradeChoices.length === 0) {
      upgradeTitle.textContent = "BUILD MAXED";
      upgradeMessage.textContent = "All upgrades are at maximum.";
      renderBuildPanel();
      continue;
    }

    isChoosingUpgrade = true;
    clearInput();
    renderUpgradeChoices();
    return;
  }
}

function chooseUpgrade(key) {
  if (!isChoosingUpgrade) return;
  const choiceIndex = Number(key) - 1;
  const upgrade = Number.isInteger(choiceIndex) ? currentUpgradeChoices[choiceIndex] : null;
  if (!upgrade) return;

  const result = RunBuild.applyUpgrade(buildState, upgrade.id, {
    playerHp: player.hp,
    basePlayer: RunBuild.PLAYER_BASE_STATS
  });
  if (!result.applied) return;

  buildState = result.buildState;
  weapon = RunBuild.resolveWeaponStats(Weapons.STARTER, buildState);
  playerStats = RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, buildState);
  player.speed = playerStats.speed;
  player.maxHp = playerStats.maxHp;
  player.hp = Math.min(player.maxHp, result.playerHp ?? player.hp);
  observeTelemetry("recordUpgradeChoice", () => ({
    playerLevel: level,
    offeredUpgradeIds: currentUpgradeChoices.map(choice => choice.id),
    selectedUpgradeId: upgrade.id
  }));
  observeTelemetry("recordUpgrade", () => ({
    playerLevel: level,
    upgradeId: upgrade.id,
    upgradeName: upgrade.name,
    upgradeStack: RunBuild.getUpgradeStacks(buildState, upgrade.id),
    weapon,
    player: telemetryPlayer(),
    build: buildState
  }));
  isChoosingUpgrade = false;
  currentUpgradeChoices = [];
  upgradeOverlay.hidden = true;
  upgradeChoices.textContent = "";
  clearInput();
  renderBuildPanel();
  updateLevel();
}

function handlePlayerEnemyCollisions() {
  for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
    const enemy = enemies[enemyIndex];

    if (isCurrentEncounterEnemy(enemy) && isOverlapping(player, enemy)) {
      // This removal is guaranteed below; observe it before fatal damage can finish the report.
      observeTelemetry("recordEnemyRemoval", () => ({ enemyType: enemy.type, reason: "contact" }));
      EnemyBehaviors.recordEnemyContact(enemy, { emit: emitBehaviorTelemetry });
      EnemyBehaviors.recordEnemyRemoval(enemy, hazards, enemies);
      takeDamage(enemy.damage ?? 1, enemy.type);
      enemies.splice(enemyIndex, 1);
      if (waveRuntime) Encounters.syncWaveRuntime(currentWave, waveRuntime, enemies);
      if (isGameOver) return;
    }
  }
}

function handleBossPlayerCollision() {
  if (!boss || !isOverlapping(player, boss)) {
    return;
  }

  if (bossDamageCooldown > 0) {
    return;
  }

  if (bossRuntime?.collisionPhase === BOSS_PHASES.CHARGE && player.hp > 0 && (boss.damage ?? 1) > 0) {
    observeTelemetry("recordBossChargeContact");
  }
  takeDamage(boss.damage ?? 1, "boss-1");
  bossDamageCooldown = bossDamageCooldownDuration;
}

function handleDenierHazardDamage(deltaTime) {
  const result = EnemyBehaviors.updateHazardDamageRuntime(
    denierHazardDamageRuntime, hazards, player, deltaTime, isOverlapping
  );
  if (result.entered) {
    emitBehaviorTelemetry("recordDenierHazardContact", {
      entryId: `${currentWave?.id}:${result.entryId}`, hazardId: result.hazardId
    });
  }
  if (result.damage > 0) {
    emitBehaviorTelemetry("recordDenierHazardDamage", { hazardId: result.hazardId });
    takeDamage(result.damage, "denier-hazard");
  }
}

function updateBossDamageCooldown(deltaTime) {
  bossDamageCooldown = Math.max(0, bossDamageCooldown - deltaTime);
}

function getPlayerCollision() {
  for (const enemy of enemies) {
    if (isCurrentEncounterEnemy(enemy) && isOverlapping(player, enemy)) {
      return enemy;
    }
  }

  return null;
}

function isInsideCanvas(rectangle) {
  return (
    rectangle.x >= 0 &&
    rectangle.x + rectangle.width <= canvas.width &&
    rectangle.y >= 0 &&
    rectangle.y + rectangle.height <= canvas.height
  );
}

function pushEnemy(enemy, movementX, movementY) {
  return tryMoveEnemy(enemy, movementX, movementY);
}

function hasOtherEnemyCollision(enemy) {
  for (const otherEnemy of enemies) {
    if (otherEnemy !== enemy && isCurrentEncounterEnemy(otherEnemy) && isOverlapping(enemy, otherEnemy)) {
      return true;
    }
  }

  return false;
}

function getOverlapPenetration(rectangleA, rectangleB) {
  const penetrationX = Math.min(
    rectangleA.x + rectangleA.width - rectangleB.x,
    rectangleB.x + rectangleB.width - rectangleA.x
  );
  const penetrationY = Math.min(
    rectangleA.y + rectangleA.height - rectangleB.y,
    rectangleB.y + rectangleB.height - rectangleA.y
  );
  return penetrationX > 0 && penetrationY > 0 ? penetrationX + penetrationY : 0;
}

function getEnemyCollisionState(enemy, x = enemy.x, y = enemy.y) {
  const candidate = { x, y, width: enemy.width, height: enemy.height };
  const colliders = new Set();
  let totalPenetration = 0;
  for (const otherEnemy of enemies) {
    if (otherEnemy === enemy || !isCurrentEncounterEnemy(otherEnemy)) continue;
    const penetration = getOverlapPenetration(candidate, otherEnemy);
    if (penetration > 0) {
      colliders.add(otherEnemy);
      totalPenetration += penetration;
    }
  }
  return { colliders, totalPenetration };
}

function isCollisionRecoveryMove(before, after) {
  if (before.colliders.size === 0) return after.colliders.size === 0;
  for (const collider of after.colliders) {
    if (!before.colliders.has(collider)) return false;
  }
  return after.totalPenetration < before.totalPenetration - COLLISION_EPSILON;
}

function tryMoveEnemy(enemy, movementX, movementY) {
  if (!isCurrentEncounterEnemy(enemy)) return false;
  const nextX = enemy.x + movementX;
  const nextY = enemy.y + movementY;
  const candidate = { x: nextX, y: nextY, width: enemy.width, height: enemy.height };
  if (!isInsideCanvas(candidate)) return false;

  const before = getEnemyCollisionState(enemy);
  const after = getEnemyCollisionState(enemy, nextX, nextY);
  if (!isCollisionRecoveryMove(before, after)) return false;
  enemy.x = nextX;
  enemy.y = nextY;
  return true;
}

function recoverEnemyOverlap(enemy, distance) {
  const step = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const before = getEnemyCollisionState(enemy);
  if (step <= 0 || before.colliders.size === 0) return false;

  const directions = [[-step, 0], [step, 0], [0, -step], [0, step]];
  const startIndex = Math.max(0, enemies.indexOf(enemy)) % directions.length;
  let best = null;
  for (let offset = 0; offset < directions.length; offset++) {
    const [movementX, movementY] = directions[(startIndex + offset) % directions.length];
    const nextX = enemy.x + movementX;
    const nextY = enemy.y + movementY;
    const candidate = { x: nextX, y: nextY, width: enemy.width, height: enemy.height };
    if (!isInsideCanvas(candidate)) continue;
    const after = getEnemyCollisionState(enemy, nextX, nextY);
    if (!isCollisionRecoveryMove(before, after)) continue;
    if (!best || after.totalPenetration < best.totalPenetration - COLLISION_EPSILON) {
      best = { x: nextX, y: nextY, totalPenetration: after.totalPenetration };
    }
  }
  if (!best) return false;
  enemy.x = best.x;
  enemy.y = best.y;
  return true;
}

function moveEnemyTowardPlayer(enemy, deltaTime) {
  let directionX = player.x - enemy.x;
  let directionY = player.y - enemy.y;
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength <= 0) return;
  directionX /= directionLength;
  directionY /= directionLength;
  const movementX = directionX * enemy.speed * deltaTime;
  const movementY = directionY * enemy.speed * deltaTime;
  const movedX = tryMoveEnemy(enemy, movementX, 0);
  const movedY = tryMoveEnemy(enemy, 0, movementY);
  if (!movedX && !movedY) recoverEnemyOverlap(enemy, enemy.speed * deltaTime);
}

function moveEnemyCharge(enemy, directionX, directionY, speed, deltaTime) {
  const startX = enemy.x;
  const startY = enemy.y;
  const desiredX = enemy.x + directionX * speed * deltaTime;
  const desiredY = enemy.y + directionY * speed * deltaTime;
  const targetX = Math.max(0, Math.min(desiredX, canvas.width - enemy.width));
  const targetY = Math.max(0, Math.min(desiredY, canvas.height - enemy.height));
  const movementX = targetX - enemy.x;
  const movementY = targetY - enemy.y;
  const movedX = Math.abs(movementX) <= COLLISION_EPSILON || tryMoveEnemy(enemy, movementX, 0);
  const movedY = Math.abs(movementY) <= COLLISION_EPSILON || tryMoveEnemy(enemy, 0, movementY);
  if (!movedX && !movedY) recoverEnemyOverlap(enemy, speed * deltaTime);
  return { distance: Math.hypot(enemy.x - startX, enemy.y - startY),
    reachedBoundary: targetX !== desiredX || targetY !== desiredY };
}

function emitBehaviorTelemetry(method, details) {
  observeTelemetry(method, () => details);
}

function updateEnemies(deltaTime) {
  EnemyBehaviors.updateEnemies({ enemies, definitions: Encounters.ENEMIES, hazards,
    player, playerVelocity, deltaTime, arena: { width: canvas.width, height: canvas.height },
    isActive: isCurrentEncounterEnemy, moveChase: moveEnemyTowardPlayer,
    moveCharge: moveEnemyCharge, emit: emitBehaviorTelemetry });
}

function lockBossChargeDirection() {
  const directionX = player.x + player.width / 2 - (boss.x + boss.width / 2);
  const directionY = player.y + player.height / 2 - (boss.y + boss.height / 2);
  const directionLength = Math.hypot(directionX, directionY);
  bossRuntime.chargeDirectionX = directionLength > 0 ? directionX / directionLength : 1;
  bossRuntime.chargeDirectionY = directionLength > 0 ? directionY / directionLength : 0;
}

function enterBossPhase(phase) {
  const cycle = Encounters.BOSSES[bossRuntime.encounterId].chargeCycle;
  bossRuntime.phase = phase;
  bossRuntime.phaseElapsed = 0;
  if (phase === BOSS_PHASES.TELEGRAPH) lockBossChargeDirection();
  if (phase === BOSS_PHASES.CHARGE) observeTelemetry("recordBossChargeAttempt");
  if (phase === BOSS_PHASES.CHASE) bossRuntime.chaseDuration = cycle.chaseDuration;
}

function getBossPhaseDuration() {
  const cycle = Encounters.BOSSES[bossRuntime.encounterId].chargeCycle;
  if (bossRuntime.phase === BOSS_PHASES.CHASE) return bossRuntime.chaseDuration;
  if (bossRuntime.phase === BOSS_PHASES.TELEGRAPH) return cycle.telegraphDuration;
  if (bossRuntime.phase === BOSS_PHASES.CHARGE) return cycle.chargeDuration;
  return cycle.recoveryDuration;
}

function advanceBossPhase() {
  if (bossRuntime.phase === BOSS_PHASES.CHASE) enterBossPhase(BOSS_PHASES.TELEGRAPH);
  else if (bossRuntime.phase === BOSS_PHASES.TELEGRAPH) enterBossPhase(BOSS_PHASES.CHARGE);
  else if (bossRuntime.phase === BOSS_PHASES.CHARGE) enterBossPhase(BOSS_PHASES.RECOVERY);
  else enterBossPhase(BOSS_PHASES.CHASE);
}

function moveBossTowardPlayer(deltaTime) {
  let directionX = player.x + player.width / 2 - (boss.x + boss.width / 2);
  let directionY = player.y + player.height / 2 - (boss.y + boss.height / 2);
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength <= 0) return;
  directionX /= directionLength;
  directionY /= directionLength;
  boss.x += directionX * boss.speed * deltaTime;
  boss.y += directionY * boss.speed * deltaTime;
  boss.x = Math.max(0, Math.min(boss.x, canvas.width - boss.width));
  boss.y = Math.max(0, Math.min(boss.y, canvas.height - boss.height));
  bossRuntime.collisionPhase = BOSS_PHASES.CHASE;
}

function moveBossCharge(deltaTime) {
  const cycle = Encounters.BOSSES[bossRuntime.encounterId].chargeCycle;
  const nextX = boss.x + bossRuntime.chargeDirectionX * cycle.chargeSpeed * deltaTime;
  const nextY = boss.y + bossRuntime.chargeDirectionY * cycle.chargeSpeed * deltaTime;
  const maxX = canvas.width - boss.width;
  const maxY = canvas.height - boss.height;
  boss.x = Math.max(0, Math.min(nextX, maxX));
  boss.y = Math.max(0, Math.min(nextY, maxY));
  bossRuntime.collisionPhase = BOSS_PHASES.CHARGE;
  return boss.x !== nextX || boss.y !== nextY ||
    (bossRuntime.chargeDirectionX < 0 && boss.x === 0) ||
    (bossRuntime.chargeDirectionX > 0 && boss.x === maxX) ||
    (bossRuntime.chargeDirectionY < 0 && boss.y === 0) ||
    (bossRuntime.chargeDirectionY > 0 && boss.y === maxY);
}

function updateBoss(deltaTime) {
  if (!boss || !bossRuntime || !Number.isFinite(deltaTime) || deltaTime < 0) return;
  let remaining = deltaTime;
  bossRuntime.collisionPhase = bossRuntime.phase;

  while (remaining > 1e-9) {
    const phaseDuration = getBossPhaseDuration();
    const phaseRemaining = Math.max(0, phaseDuration - bossRuntime.phaseElapsed);
    if (phaseRemaining <= 1e-9) {
      advanceBossPhase();
      continue;
    }
    const step = Math.min(remaining, phaseRemaining);
    let reachedBoundary = false;
    if (bossRuntime.phase === BOSS_PHASES.CHASE) moveBossTowardPlayer(step);
    else if (bossRuntime.phase === BOSS_PHASES.CHARGE) reachedBoundary = moveBossCharge(step);
    bossRuntime.phaseElapsed += step;
    remaining -= step;

    if (reachedBoundary) enterBossPhase(BOSS_PHASES.RECOVERY);
    else if (bossRuntime.phaseElapsed >= phaseDuration - 1e-9) advanceBossPhase();
  }
}

function drawPlayer() {
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(player.x, player.y, player.width, player.height);
  drawHealthBar(player);
}

function drawHealthBar(entity) {
  const healthRatio = entity.hp / entity.maxHp;
  const barHeight = 5;
  const barY = entity.y - barHeight - 3;

  ctx.save();
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(entity.x, barY, entity.width, barHeight);

  ctx.fillStyle = "#22c55e";
  ctx.fillRect(entity.x, barY, entity.width * healthRatio, barHeight);
  ctx.restore();
}

function drawEnemies() {
  for (const enemy of enemies) {
    ctx.fillStyle = enemyColors[enemy.type];
    ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
    drawHealthBar(enemy);
  }
}

function drawBoss() {
  if (!boss) {
    return;
  }

  const phase = bossRuntime?.phase;
  if (phase === BOSS_PHASES.TELEGRAPH) {
    const centerX = boss.x + boss.width / 2;
    const centerY = boss.y + boss.height / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(254, 240, 138, 0.9)";
    ctx.lineWidth = 10;
    ctx.setLineDash([18, 12]);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + bossRuntime.chargeDirectionX * 1000,
      centerY + bossRuntime.chargeDirectionY * 1000);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = phase === BOSS_PHASES.TELEGRAPH ? "#f59e0b" :
    phase === BOSS_PHASES.CHARGE ? "#dc2626" :
      phase === BOSS_PHASES.RECOVERY ? "#6d28d9" : "#7e22ce";
  ctx.fillRect(boss.x, boss.y, boss.width, boss.height);
  drawHealthBar(boss);
}

function drawBullets() {
  ctx.fillStyle = "#facc15";

  for (const bullet of bullets) {
    ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
  }
}

function drawWeaponDamage() {
  ctx.save();
  ctx.fillStyle = "#111827";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`Damage: ${formatNumber(weapon.damage)}`, canvas.width - 15, 30);
  ctx.restore();
}

function drawBehaviorArena() {
  const living = enemies.filter(isCurrentEncounterEnemy);
  EnemyBehaviors.drawArenaCues(ctx, living, hazards, Encounters.ENEMIES);
}

function formatNumber(value, precision = 2) {
  return Number(value.toFixed(precision)).toString();
}

function clearElement(element) {
  if (typeof element.replaceChildren === "function") element.replaceChildren();
  else element.textContent = "";
}

function textElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function renderUpgradeChoices() {
  clearElement(upgradeChoices);
  upgradeTitle.textContent = "LEVEL UP";
  upgradeMessage.textContent = "Choose one upgrade. Press 1, 2, or 3.";
  currentUpgradeChoices.forEach((upgrade, index) => {
    const currentStack = RunBuild.getUpgradeStacks(buildState, upgrade.id);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "upgrade-card";
    card.dataset.choiceIndex = String(index);
    card.setAttribute?.("aria-label", `${index + 1}. ${upgrade.name}. ${upgrade.effectLines.join(". ")}. ${currentStack} of ${upgrade.maxStacks}`);
    card.append(
      textElement("span", "upgrade-card-name", `${index + 1} · ${upgrade.name.toUpperCase()}`),
      textElement("span", "upgrade-card-effect", upgrade.effectLines.join(" · ")),
      textElement("span", "upgrade-card-stack", `${currentStack} / ${upgrade.maxStacks}`)
    );
    card.addEventListener("click", () => chooseUpgrade(String(index + 1)));
    upgradeChoices.append(card);
  });
  upgradeOverlay.hidden = false;
  upgradeChoices.children?.[0]?.focus?.();
}

function renderBuildPanel() {
  document.getElementById("buildWeaponName").textContent = weapon.name;
  document.getElementById("buildDamage").textContent = formatNumber(weapon.damage);
  document.getElementById("buildFireRate").textContent = `${weapon.fireRate.toFixed(1)}/s`;
  document.getElementById("buildProjectileCount").textContent = weapon.projectileCount;
  document.getElementById("buildMoveSpeed").textContent = Math.round(player.speed);
  document.getElementById("buildMaxHp").textContent = player.maxHp;

  const list = document.getElementById("buildUpgradeList");
  clearElement(list);
  const owned = RunBuild.UPGRADE_LIST.filter(upgrade =>
    RunBuild.getUpgradeStacks(buildState, upgrade.id) > 0);
  if (owned.length === 0) {
    list.append(textElement("li", "build-empty", "No upgrades yet."));
    return;
  }
  for (const upgrade of owned) {
    const stacks = RunBuild.getUpgradeStacks(buildState, upgrade.id);
    list.append(textElement("li", "", `${upgrade.name} ×${stacks}`));
  }
  if (RunBuild.UPGRADE_LIST.every(upgrade => !RunBuild.canSelectUpgrade(buildState, upgrade.id))) {
    list.append(textElement("li", "build-maxed", "BUILD MAXED"));
  }
}

function updateHud() {
  hpValue.textContent = `${player.hp} / ${player.maxHp}`;
  scoreValue.textContent = score;
  levelValue.textContent = level;
  xpValue.textContent = `${xp} / ${xpToNextLevel}`;
  document.getElementById("stageValue").textContent = `STAGE ${stageIndex + 1}`;
  document.getElementById("waveValue").textContent = runPhase === RUN_PHASES.BOSS_ACTIVE ? "BOSS 1" : `WAVE ${(stageRuntime?.waveIndex ?? 0) + 1} / 5`;
  document.getElementById("abandonButton").hidden = isGameOver || isVictory || isChoosingUpgrade || isAbandoned;
}

function updateArenaPresentation() {
  const showIntroduction = runPhase === RUN_PHASES.ENEMY_INTRODUCTION && currentEnemyIntroduction &&
    !isGameOver && !isVictory && !isAbandoned;
  enemyIntroduction.hidden = !showIntroduction;
  if (showIntroduction) {
    enemyIntroductionName.textContent = currentEnemyIntroduction.name;
    enemyIntroductionRole.textContent = currentEnemyIntroduction.role;
    enemyIntroductionDescription.textContent = currentEnemyIntroduction.description;
    enemyIntroductionIcon.style.background = enemyColors[currentEnemyIntroduction.type];
    enemyIntroductionIcon.style.color = enemyColors[currentEnemyIntroduction.type];
  }
  const showIntermission = runPhase === RUN_PHASES.INTERMISSION &&
    !isGameOver && !isVictory && !isAbandoned;
  intermissionBanner.hidden = !showIntermission;
  if (!showIntermission) {
    intermissionBanner.classList.remove("boss-incoming");
    return;
  }

  const bossIncoming = stageRuntime.waveIndex + 1 >= stageRuntime.definition.waveCount;
  intermissionTitle.textContent = `WAVE ${stageRuntime.waveIndex + 1} CLEAR`;
  intermissionDetail.textContent = bossIncoming
    ? "BOSS INCOMING"
    : `NEXT · WAVE ${stageRuntime.waveIndex + 2}`;
  intermissionCountdown.textContent = String(
    Math.ceil(Math.max(0, Encounters.CONFIG.intermission - intermissionTimer))
  );
  intermissionBanner.classList[bossIncoming ? "add" : "remove"]("boss-incoming");
}

function drawPhasePresentation() {
  let title = "", subtitle = "";
  if (runPhase === RUN_PHASES.STAGE_CLEAR) title = "STAGE 1 CLEAR";
  if (isGameOver || isVictory || isAbandoned) {
    title = isAbandoned ? "ABANDONED" : isVictory ? "VICTORY" : "GAME OVER";
    subtitle = lastSettlement ? `Score ${lastSettlement.finalScore} · Points ${lastSettlement.points}` : "No secured checkpoint · Points 0";
    subtitle += " · Press R to Restart";
  }
  if (title) {
    ctx.save(); ctx.fillStyle = "rgba(17, 24, 39, 0.88)"; ctx.fillRect(40, 230, 720, 140);
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
    ctx.font = "40px sans-serif"; ctx.fillText(title, 400, 290);
    ctx.font = "20px sans-serif"; ctx.fillText(subtitle, 400, 335); ctx.restore();
  }
  if (runPhase === RUN_PHASES.BOSS_ACTIVE && boss && !isGameOver && !isAbandoned) {
    ctx.save(); ctx.fillStyle = "#111827"; ctx.fillRect(180, 12, 440, 48);
    ctx.fillStyle = "#ffffff"; ctx.font = "18px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("BOSS 1", 400, 33);
    ctx.fillStyle = "#4b5563"; ctx.fillRect(200, 42, 400, 8);
    ctx.fillStyle = "#a855f7"; ctx.fillRect(200, 42, 400 * Math.max(0, boss.hp / boss.maxHp), 8); ctx.restore();
  }
}

// Optional observers never participate in gameplay decisions or consume generation RNG.
function telemetryPlayer() {
  return { playerHp: player.hp, playerMaxHp: player.maxHp, playerLevel: level, playerXp: xp,
    playerSpeed: player.speed, speed: player.speed, maxHp: player.maxHp,
    weapon: { ...weapon },
    build: { upgradeStacks: { ...buildState.upgradeStacks } } };
}
function initializePlaytestTelemetry() {
  try {
    if (typeof PlaytestTelemetry === "undefined") return null;
    const enabled = PlaytestTelemetry.isEnabled(globalThis.location?.search || "");
    if (!enabled) return null;
    const telemetry = PlaytestTelemetry.createTelemetry({ enabled,
      environment: { playtestMode: true, viewport: { width: globalThis.innerWidth || 0, height: globalThis.innerHeight || 0 },
        devicePixelRatio: globalThis.devicePixelRatio || 1 },
      configuration: { reference: "combat-variety-v1.1", threatCurve: Encounters.STAGES[0].threatCurve,
        prototype: Encounters.isPrototypeEnabled(globalThis.location?.search || "") ? Encounters.COMBAT_VARIETY_V1.id : null,
        maxActiveThreatCurve: activeStages[0].maxActiveThreatCurve, enemies: Encounters.ENEMIES,
        clearTimeWeights: Encounters.CONFIG.clearTime, baseHandlingTime: Encounters.CONFIG.baseHandlingTime,
        bossExpectedClearTime: Encounters.BOSSES["boss-1"].analysis.expectedClearTime,
        maxActiveEnemies: Encounters.CONFIG.maxActiveEnemies,
        templates: Object.fromEntries(Object.entries(Encounters.TEMPLATES).map(([id, template]) => [id, { delays: template.delays }])),
        playerBaseStats: RunBuild.PLAYER_BASE_STATS,
        starterWeapon: Weapons.STARTER,
        upgrades: Object.fromEntries(RunBuild.UPGRADE_LIST.map(upgrade => [upgrade.id, upgrade])),
        technicalFireRateCap: Weapons.MAX_FIRE_RATE }
    });
    if (typeof PlaytestUI !== "undefined") {
      try {
        playtestView = PlaytestUI.create(telemetry);
      } catch (error) {
        console.warn("Playtest report UI initialization failed.", error);
      }
    }
    return telemetry;
  } catch (error) {
    console.warn("Playtest telemetry initialization failed; gameplay continues.", error);
    return null;
  }
}
function observeTelemetry(method, details) {
  if (!playtestTelemetry?.enabled) return;
  try {
    playtestTelemetry[method](details?.());
    if (method === "startRun" || method === "finishRun") playtestView?.refresh();
  } catch (error) {
    console.warn(`Playtest telemetry ${method} failed; gameplay continues.`, error);
  }
}
function observeCombatFrame(deltaTime) {
  observeTelemetry("recordEncounterFrame", () => {
    const living = runPhase === RUN_PHASES.WAVE_ACTIVE ? enemies.filter(enemy => enemy.waveId === currentWave.id && enemy.hp > 0) : [];
    const enemiesByType = {};
    living.forEach(enemy => { enemiesByType[enemy.type] = (enemiesByType[enemy.type] || 0) + 1; });
    return { deltaTime, hp: player.hp, maxHp: player.maxHp, activeEnemyCount: living.length,
      activeThreat: living.reduce((sum, enemy) => sum + Encounters.ENEMIES[enemy.type].threatCost, 0), enemiesByType,
      nextSpawnGroupIndex: waveRuntime?.nextSpawnGroupIndex, groupDelayElapsed: waveRuntime?.groupDelayElapsed };
  });
}
function observeRunEnd(endReason, result, sourceState) {
  observeTelemetry("finishRun", () => ({ endReason, player: telemetryPlayer(), settlement: {
    endReason, settlementSource: sourceState ? (endReason === RUN_END_REASONS.ABANDON ? "secured-checkpoint" : "current-run") : "none",
    result, sourceState, securedCheckpoint: runSettlementState.securedCheckpoint
  } }));
}
let playtestView = null;
const playtestTelemetry = initializePlaytestTelemetry();
let lastTime = null;

function gameLoop(timestamp) {
  const deltaTime = lastTime === null ? 0 : (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  update(deltaTime);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBehaviorArena();
  drawPlayer();
  drawEnemies();
  drawBoss();
  drawBullets();
  drawWeaponDamage();
  updateArenaPresentation();
  drawPhasePresentation();
  updateHud();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
