const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
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
const enemyStats = {
  normal: { width: 40, height: 40, speed: 120, hp: 3, maxHp: 3 },
  fast: { width: 30, height: 30, speed: 200, hp: 1, maxHp: 1 },
  tank: { width: 60, height: 60, speed: 70, hp: 8, maxHp: 8 }
};
const enemyColors = {
  normal: "#dc2626",
  fast: "#f97316",
  tank: "#7c3aed"
};
const RUN_PHASES = Object.freeze(Object.fromEntries([
  "STAGE_ENTER", "WAVE_ACTIVE", "INTERMISSION", "BOSS_ACTIVE", "STAGE_CLEAR",
  "STAGE_REWARD", "RUN_VICTORY", "RUN_DEAD"
].map(phase => [phase, phase])));
let runPhase = null;
let stageIndex = 0;
let stageRuntime = null;
let currentWave = null;
let waveRuntime = null;
let bossRuntime = null;
let intermissionTimer = 0;
let stageClearTimer = 0;
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
function startWave(index) {
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
  stageRuntime = { definition: Encounters.STAGES[stageIndex], waveIndex: 0, recentTemplates: [], completed: false };
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
  clearInput();
}
function startBossEncounter() {
  const definition = Encounters.BOSSES[stageRuntime.definition.boss];
  bossRuntime = { encounterId: definition.id, elapsedTime: 0, damageTaken: 0,
    analysis: definition.analysis, isComplete: false };
  runSettlementState.progress.currentEncounter = { id: definition.id, type: "boss" };
  spawnBoss();
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
  updateHud();
});

function updateAim(event) {
  const rect = canvas.getBoundingClientRect();

  mouse.x = (event.clientX - rect.left) * canvas.width / rect.width;
  mouse.y = (event.clientY - rect.top) * canvas.height / rect.height;
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
    if (stageIndex + 1 < Encounters.STAGES.length) { stageIndex++; enterStage(); }
    else { runPhase = RUN_PHASES.RUN_VICTORY; isVictory = true; settleRun(RUN_END_REASONS.VICTORY); }
    return;
  }
  let directionX = 0;
  let directionY = 0;

  if (keys.w) directionY -= 1;
  if (keys.s) directionY += 1;
  if (keys.a) directionX -= 1;
  if (keys.d) directionX += 1;

  const directionLength = Math.hypot(directionX, directionY);

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

  if (runPhase === RUN_PHASES.INTERMISSION) {
    observeTelemetry("recordIntermission", () => ({ deltaTime }));
    intermissionTimer += deltaTime;
    if (intermissionTimer >= Encounters.CONFIG.intermission) {
      if (stageRuntime.waveIndex + 1 < stageRuntime.definition.waveCount) startWave(stageRuntime.waveIndex + 1);
      else startBossEncounter();
    }
    return;
  }
  if (runPhase === RUN_PHASES.WAVE_ACTIVE) {
    observeCombatFrame(deltaTime);
    Encounters.updateWaveRuntime(currentWave, waveRuntime, enemies, deltaTime, spawnEnemy);
    observeTelemetry("recordGroupRelease", () => ({ groupIndex: waveRuntime.nextSpawnGroupIndex - 1,
      elapsedTime: waveRuntime.elapsedTime, activeEnemyCount: waveRuntime.aliveEnemyCount, activeThreat: waveRuntime.activeThreat }));
    updateEnemies(deltaTime);
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
  const enemy = { type, waveId, x: 0, y: 0, ...stats };
  const edge = Math.floor(Math.random() * 4);

  if (edge === 0) {
    enemy.x = Math.random() * (canvas.width - enemy.width);
  } else if (edge === 1) {
    enemy.x = canvas.width - enemy.width;
    enemy.y = Math.random() * (canvas.height - enemy.height);
  } else if (edge === 2) {
    enemy.x = Math.random() * (canvas.width - enemy.width);
    enemy.y = canvas.height - enemy.height;
  } else {
    enemy.y = Math.random() * (canvas.height - enemy.height);
  }

  enemies.push(enemy);
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

      if (!bullet.hitTargets.has(enemy) && isOverlapping(bullet, enemy)) {
        enemy.hp -= bullet.damage;
        observeTelemetry("recordBulletHit", () => ({ enemyType: enemy.type,
          damage: Math.max(0, Math.min(bullet.damage, enemy.hp + bullet.damage)) }));
        const projectileRemoved = consumeProjectileHit(bullet, bulletIndex, enemy);

        if (enemy.hp <= 0) {
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

    if (isOverlapping(player, enemy)) {
      // This removal is guaranteed below; observe it before fatal damage can finish the report.
      observeTelemetry("recordEnemyRemoval", () => ({ enemyType: enemy.type, reason: "contact" }));
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

  takeDamage(boss.damage ?? 1, "boss-1");
  bossDamageCooldown = bossDamageCooldownDuration;
}

function updateBossDamageCooldown(deltaTime) {
  bossDamageCooldown = Math.max(0, bossDamageCooldown - deltaTime);
}

function getPlayerCollision() {
  for (const enemy of enemies) {
    if (isOverlapping(player, enemy)) {
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
  enemy.x += movementX;
  enemy.y += movementY;

  if (!isInsideCanvas(enemy) || hasOtherEnemyCollision(enemy)) {
    enemy.x -= movementX;
    enemy.y -= movementY;
    return false;
  }

  return true;
}

function hasOtherEnemyCollision(enemy) {
  for (const otherEnemy of enemies) {
    if (otherEnemy !== enemy && isOverlapping(enemy, otherEnemy)) {
      return true;
    }
  }

  return false;
}

function updateEnemies(deltaTime) {
  for (const enemy of enemies) {
    let directionX = player.x - enemy.x;
    let directionY = player.y - enemy.y;
    const directionLength = Math.hypot(directionX, directionY);

    if (directionLength > 0) {
      directionX /= directionLength;
      directionY /= directionLength;
      enemy.x += directionX * enemy.speed * deltaTime;

      if (hasOtherEnemyCollision(enemy)) {
        enemy.x -= directionX * enemy.speed * deltaTime;
      }

      enemy.y += directionY * enemy.speed * deltaTime;

      if (hasOtherEnemyCollision(enemy)) {
        enemy.y -= directionY * enemy.speed * deltaTime;
      }
    }
  }
}

function updateBoss(deltaTime) {
  if (!boss) {
    return;
  }

  let directionX = player.x - boss.x;
  let directionY = player.y - boss.y;
  const directionLength = Math.hypot(directionX, directionY);

  if (directionLength > 0) {
    directionX /= directionLength;
    directionY /= directionLength;
    boss.x += directionX * boss.speed * deltaTime;
    boss.y += directionY * boss.speed * deltaTime;
  }

  boss.x = Math.max(0, Math.min(boss.x, canvas.width - boss.width));
  boss.y = Math.max(0, Math.min(boss.y, canvas.height - boss.height));
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

  ctx.fillStyle = "#7e22ce";
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
    list.append(textElement("li", "", `${upgrade.name} · ${stacks} / ${upgrade.maxStacks}`));
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

function drawPhasePresentation() {
  let title = "", subtitle = "";
  if (runPhase === RUN_PHASES.INTERMISSION) {
    title = `WAVE ${stageRuntime.waveIndex + 1} CLEAR`;
    subtitle = stageRuntime.waveIndex === 4 ? "BOSS INCOMING" : `NEXT: WAVE ${stageRuntime.waveIndex + 2}`;
    subtitle += ` · ${Math.ceil(Math.max(0, Encounters.CONFIG.intermission - intermissionTimer))}`;
  } else if (runPhase === RUN_PHASES.STAGE_CLEAR) title = "STAGE 1 CLEAR";
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
      configuration: { reference: "stage-1-initial", threatCurve: Encounters.STAGES[0].threatCurve,
        maxActiveThreatCurve: Encounters.STAGES[0].maxActiveThreatCurve, enemies: Encounters.ENEMIES,
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
  drawPlayer();
  drawEnemies();
  drawBoss();
  drawBullets();
  drawWeaponDamage();
  drawPhasePresentation();
  updateHud();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
