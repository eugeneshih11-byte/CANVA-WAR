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
const enemyIntroductionCounterplay = document.getElementById("enemyIntroductionCounterplay");
const enemyIntroductionContinue = document.getElementById("enemyIntroductionContinue");
const reinforcementEdges = document.getElementById("reinforcementEdges");
const audioMuteButton = document.getElementById("audioMuteButton");
const masterVolume = document.getElementById("masterVolume");
const sfxVolume = document.getElementById("sfxVolume");
const hubView = document.getElementById("hubView");
const shopView = document.getElementById("shopView");
const armoryView = document.getElementById("armoryView");
const equipmentView = document.getElementById("equipmentView");
const codexView = document.getElementById("codexView");
const gameView = document.getElementById("gameView");
const playButton = document.getElementById("playButton");
const enemyCodexButton = document.getElementById("enemyCodexButton");
const codexBackButton = document.getElementById("codexBackButton");
const enemyCodexGrid = document.getElementById("enemyCodexGrid");
const playtestWeaponSelector = document.getElementById("playtestWeaponSelector");
const backToHubButton = document.getElementById("backToHubButton");
const hpValue = document.getElementById("hpValue");
const scoreValue = document.getElementById("scoreValue");
const levelValue = document.getElementById("levelValue");
const xpValue = document.getElementById("xpValue");
const upgradeOverlay = document.getElementById("upgradeOverlay");
const upgradeTitle = document.getElementById("upgradeTitle");
const upgradeMessage = document.getElementById("upgradeMessage");
const upgradeChoices = document.getElementById("upgradeChoices");
const slotAValue = document.getElementById("slotAValue");
const slotBValue = document.getElementById("slotBValue");
const activeWeaponValue = document.getElementById("activeWeaponValue");
const buildDetailButton = document.getElementById("buildDetailButton");
const buildDetailOverlay = document.getElementById("buildDetailOverlay");
const buildDetailClose = document.getElementById("buildDetailClose");
const buildDetailContent = document.getElementById("buildDetailContent");
const comboNotification = document.getElementById("comboNotification");
const playtestBuildDemoButton = document.getElementById("playtestBuildDemoButton");
const playtestWaveComingButton = document.getElementById("playtestWaveComingButton");
const APP_VIEWS = Object.freeze({
  HUB: "hub",
  SHOP: "shop",
  ARMORY: "armory",
  EQUIPMENT: "equipment",
  CODEX: "codex",
  GAME: "game"
});
const appViews = Object.freeze({
  [APP_VIEWS.HUB]: hubView,
  [APP_VIEWS.SHOP]: shopView,
  [APP_VIEWS.ARMORY]: armoryView,
  [APP_VIEWS.EQUIPMENT]: equipmentView,
  [APP_VIEWS.CODEX]: codexView,
  [APP_VIEWS.GAME]: gameView
});
let currentView = APP_VIEWS.HUB;
let returnToHubAfterAbandon = false;
const { RUN_END_REASONS, SCORE_TYPES, createRunSettlementState, awardScore, selectSettlementState, calculateSettlement } = RunSettlement;
const activeStages = Encounters.getStagesForSearch(globalThis.location?.search || "");

const saveStorageKey = "canva-war-save";
let saveData = loadSave();
const audioManager = CanvaWarAudio.createAudioManager();
const enemyDiscovery = EnemyDiscovery.createStore({ storage: globalThis.localStorage,
  knownTypes: Object.keys(Encounters.ENEMIES) });
const isPlaytestMode = new URLSearchParams(globalThis.location?.search || "").get("playtest") === "1";

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
      equipment: [],
      deployables: [],
      summons: []
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
    Array.isArray(data.unlocks.deployables) &&
    Array.isArray(data.unlocks.summons) &&
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
        points: Number.isFinite(data.progression?.points) ? data.progression.points : 0
      },
      unlocks: {
        ...data.unlocks,
        deployables: [],
        summons: []
      }
    };
  }

  if (data && typeof data === "object" && data.version === 2 && data.unlocks &&
      (!Array.isArray(data.unlocks.deployables) || !Array.isArray(data.unlocks.summons))) {
    return {
      ...data,
      unlocks: {
        ...data.unlocks,
        deployables: Array.isArray(data.unlocks.deployables) ? data.unlocks.deployables : [],
        summons: Array.isArray(data.unlocks.summons) ? data.unlocks.summons : []
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
let battlefieldRuntime = null;
let cameraRuntime = null;
let fallbackBattlefieldSeed = 0x43414e56;
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
let rewardRngSeed = null;
let currentUpgradeChoices = [];
let weaponRuntime = createWeaponRuntime();
let weaponSlots = [{ weaponId: Weapons.STARTER.id, runtime: weaponRuntime }];
let activeWeaponSlotIndex = 0;
const weaponEffects = [];
const pendingLauncherEffects = [];
let nextWeaponAttackId = 1;
let isBuildDetailOpen = false;
let comboNotificationTimer = 0;
const enemyStats = Object.fromEntries(Object.entries(Encounters.ENEMIES)
  .map(([type, definition]) => [type, definition.stats]));
const enemyColors = {
  normal: "#dc2626",
  fast: "#f97316",
  tank: "#7c3aed",
  interceptor: "#eab308",
  denier: "#be123c",
  support: "#0f766e",
  gunner: "#2563eb",
  artillery: "#9333ea",
  trapper: "#65a30d",
  tether: "#0891b2"
};
const SPAWN_PLACEMENT_ATTEMPTS = 16;
const MAX_DETERMINISTIC_SPAWN_CANDIDATES = 256;
const COLLISION_EPSILON = 1e-7;
const ENEMY_SPATIAL_CELL_SIZE = 120;
const ENEMY_SEPARATION_MAX_PASSES = 4;
const ENEMY_SEPARATION_STEP = 3;
let enemySpatialHash = new Map();
const RUN_PHASES = Object.freeze(Object.fromEntries([
  "STAGE_ENTER", "WAVE_ACTIVE", "INTERMISSION", "INTRODUCTION_PENDING", "INTRODUCTION_ACTIVE",
  "BOSS_ACTIVE", "STAGE_CLEAR",
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
let encounterController = null;
let pendingSpawnReservation = null;
let waveComingBannerTimer = 0;
let bossRuntime = null;
let intermissionTimer = 0;
let stageClearTimer = 0;
const introducedEnemyTypes = new Set();
let introductionQueue = [];
let currentEnemyIntroduction = null;
let pendingWaveIndex = null;
let isAbandonConfirmOpen = false;
let isAbandoned = false;
const abandonOverlay = document.getElementById("abandonOverlay");

function createWeaponRuntime() {
  return { timeUntilNextShot: 0, attackHeld: false, burstShotsRemaining: 0,
    burstShotTimer: 0, burstAimAngle: 0, burstNextShotIndex: 0,
    burstWeapon: null, burstAttackId: null, burstSequence: null,
    committedBurstSequences: new Set(), pendingBurstFollowups: [],
    arcAttackCount: 0, disposed: false };
}

function configureWeaponLoadout(ids = [Weapons.STARTER.id]) {
  const selected = [...new Set(ids)].filter(id => Weapons.DEFINITIONS[id]).slice(0, 2);
  if (!selected.length) selected.push(Weapons.STARTER.id);
  clearWeaponActions();
  buildState = RunBuild.createBuildState();
  weaponSlots = selected.map(weaponId => ({ weaponId, runtime: createWeaponRuntime() }));
  activeWeaponSlotIndex = 0;
  weaponRuntime = weaponSlots[0].runtime;
  weapon = RunBuild.resolveWeaponStats(Weapons.DEFINITIONS[weaponSlots[0].weaponId], buildState);
  playerStats = RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, buildState);
  return weaponSlots.map(slot => slot.weaponId);
}

function selectedPlaytestWeaponIds() {
  if (!isPlaytestMode || !playtestWeaponSelector?.querySelectorAll) return [Weapons.STARTER.id];
  const selected = [...playtestWeaponSelector.querySelectorAll("input[data-weapon-id]:checked")]
    .map(input => input.dataset.weaponId).filter(id => Weapons.DEFINITIONS[id]).slice(0, 2);
  return selected.length ? selected : [Weapons.STARTER.id];
}

function activateWeaponSlot(index, { record = true } = {}) {
  if (!Number.isInteger(index) || index < 0 || index >= weaponSlots.length || index === activeWeaponSlotIndex) return false;
  const previousRuntime = weaponRuntime;
  const switchedDuringCommittedBurst = previousRuntime.burstShotsRemaining > 0;
  weaponRuntime.attackHeld = false;
  activeWeaponSlotIndex = index;
  const slot = weaponSlots[index];
  weaponRuntime = slot.runtime;
  weaponRuntime.attackHeld = false;
  weapon = RunBuild.resolveWeaponStats(Weapons.DEFINITIONS[slot.weaponId], buildState);
  playerStats = RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, buildState);
  if (record) {
    observeTelemetry("recordWeaponSwitch", () => ({ activeWeapon: weapon.id,
      slot: index === 0 ? "A" : "B" }));
    if (switchedDuringCommittedBurst) {
      observeTelemetry("recordCommittedBurstWeaponSwitch", () => ({
        sequenceId: previousRuntime.burstSequence?.id || previousRuntime.burstAttackId,
        fromSlot: index === 0 ? "B" : "A", toSlot: index === 0 ? "A" : "B"
      }));
    }
    audioManager.play("weaponSwitch", { concurrency: 1 });
  }
  renderBuildPanel();
  return true;
}

function switchActiveWeapon() {
  if (weaponSlots.length < 2 || !canAttack()) return false;
  return activateWeaponSlot(activeWeaponSlotIndex === 0 ? 1 : 0);
}

function clearWeaponRuntime(runtime, { ready = false, disposed = false } = {}) {
  if (!runtime) return;
  if (runtime.burstShotsRemaining > 0) {
    observeTelemetry("recordBurstShotsCanceled", () => ({ count: runtime.burstShotsRemaining,
      sequenceId: runtime.burstSequence?.id || runtime.burstAttackId }));
  }
  for (const sequence of runtime.committedBurstSequences || []) sequence.canceled = true;
  runtime.attackHeld = false;
  runtime.burstShotsRemaining = 0;
  runtime.burstShotTimer = 0;
  runtime.burstNextShotIndex = 0;
  runtime.burstWeapon = null;
  runtime.burstAttackId = null;
  runtime.burstSequence = null;
  runtime.committedBurstSequences?.clear();
  if (runtime.pendingBurstFollowups) runtime.pendingBurstFollowups.length = 0;
  runtime.disposed = disposed;
  if (ready) runtime.timeUntilNextShot = 0;
}

function clearWeaponActions({ ready = false } = {}) {
  for (const slot of weaponSlots) clearWeaponRuntime(slot.runtime, { ready });
  weaponEffects.length = 0;
}

function replaceWeaponSlot(index, weaponId) {
  if (!Number.isInteger(index) || index < 0 || index >= weaponSlots.length || !Weapons.DEFINITIONS[weaponId]) return false;
  const slot = weaponSlots[index];
  if (slot.weaponId === weaponId) return false;
  clearWeaponRuntime(slot.runtime, { disposed: true });
  slot.weaponId = weaponId;
  slot.runtime = createWeaponRuntime();
  if (index === activeWeaponSlotIndex) {
    weaponRuntime = slot.runtime;
    weapon = RunBuild.resolveWeaponStats(Weapons.DEFINITIONS[weaponId], buildState);
    playerStats = RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, buildState);
    renderBuildPanel();
  }
  return true;
}

function clearPendingLauncherEffects() {
  pendingLauncherEffects.length = 0;
}

function createUpgradeRng() {
  rewardRngSeed = ((battlefieldRuntime?.seed ?? 0x43414e56) ^ 0x72657764) >>> 0;
  return RunBuild.createRewardRng(rewardRngSeed);
}

function clearInput({ weaponReady = false } = {}) {
  Object.keys(keys).forEach(key => { keys[key] = false; });
  for (const slot of weaponSlots) {
    slot.runtime.attackHeld = false;
    if (weaponReady) slot.runtime.timeUntilNextShot = 0;
  }
}
function resetHazardDamageRuntime() {
  denierHazardDamageRuntime.cooldown = 0;
  denierHazardDamageRuntime.inside = false;
  denierHazardDamageRuntime.entrySequence = 0;
}
function clearIntroductionTransient() {
  introductionQueue = [];
  currentEnemyIntroduction = null;
  pendingWaveIndex = null;
  enemyIntroduction.hidden = true;
}
function cancelPendingContinuousSpawn() {
  if (!pendingSpawnReservation) return;
  ContinuousEncounter.cancelSpawn(encounterController, pendingSpawnReservation.reservation);
  const index = encounterController.pendingReservations.findIndex(item =>
    item.reservation.id === pendingSpawnReservation.reservation.id);
  if (index >= 0) encounterController.pendingReservations.splice(index, 1);
  pendingSpawnReservation = null;
}
function beginSpawnIntroduction(type, reservation) {
  if (enemyDiscovery.has(type)) return false;
  const definition = Encounters.COMBAT_VARIETY_V1.introductions[type];
  if (!definition) return false;
  pendingSpawnReservation = reservation;
  introductionQueue = [type];
  pendingWaveIndex = null;
  currentEnemyIntroduction = null;
  runPhase = RUN_PHASES.INTRODUCTION_PENDING;
  clearInput();
  return true;
}
function showNextEnemyIntroduction() {
  const type = introductionQueue.shift();
  const definition = Encounters.COMBAT_VARIETY_V1.introductions[type];
  if (!definition) return false;
  introducedEnemyTypes.add(type);
  enemyDiscovery.discover(type);
  currentEnemyIntroduction = { type, ...definition };
  runPhase = RUN_PHASES.INTRODUCTION_ACTIVE;
  clearInput();
  observeTelemetry("recordEnemyIntroduction", () => ({ enemyType: type }));
  audioManager.play("enemyIntroduction");
  updateArenaPresentation();
  enemyIntroductionContinue.focus?.();
  return true;
}
function beginEnemyIntroductions(waveIndex) {
  const planned = stageRuntime.definition.introductions?.[waveIndex] || [];
  const undiscovered = planned.filter(type => !enemyDiscovery.has(type));
  const suppressed = planned.filter(type => enemyDiscovery.has(type));
  introductionQueue = undiscovered;
  observeTelemetry("recordEnemyEligibility", () => ({
    eligibleTypes: Encounters.getContinuousEligibleTypes(stageRuntime.definition, waveIndex),
    newlyUnlockedTypes: planned.slice(), newlyIntroducedTypes: undiscovered.slice(),
    introductionSuppressedTypes: suppressed.slice()
  }));
  if (!introductionQueue.length) return false;
  pendingWaveIndex = waveIndex;
  currentEnemyIntroduction = null;
  runPhase = RUN_PHASES.INTRODUCTION_PENDING;
  clearInput();
  return true;
}
function dismissEnemyIntroduction() {
  if (runPhase !== RUN_PHASES.INTRODUCTION_ACTIVE) return false;
  clearInput();
  if (introductionQueue.length) {
    currentEnemyIntroduction = null;
    runPhase = RUN_PHASES.INTRODUCTION_PENDING;
    return true;
  }
  if (pendingSpawnReservation) {
    const pending = pendingSpawnReservation;
    pendingSpawnReservation = null;
    clearIntroductionTransient();
    runPhase = RUN_PHASES.WAVE_ACTIVE;
    finalizeContinuousSpawn(pending);
    return true;
  }
  clearIntroductionTransient();
  runPhase = RUN_PHASES.WAVE_ACTIVE;
  clearInput({ weaponReady: true });
  return true;
}
function battlefieldActorFootprints() {
  return [
    { id: "player", width: player.width, height: player.height },
    ...Object.entries(Encounters.ENEMIES).map(([id, definition]) => ({ id,
      width: definition.stats.width, height: definition.stats.height })),
    ...Object.entries(Encounters.BOSSES).map(([id, definition]) => ({ id,
      width: definition.stats.width, height: definition.stats.height }))
  ];
}
function createBattlefieldSeed() {
  const override = new URLSearchParams(globalThis.location?.search || "").get("battlefieldSeed");
  if (override !== null && override !== "") return Battlefields.normalizeSeed(override);
  try {
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      const values = new Uint32Array(1);
      globalThis.crypto.getRandomValues(values);
      return values[0];
    }
  } catch {
    // The private deterministic fallback never consumes encounter or spawn RNG.
  }
  fallbackBattlefieldSeed = (fallbackBattlefieldSeed + 0x9e3779b9) >>> 0;
  return fallbackBattlefieldSeed;
}
function updateCameraRuntime() {
  if (!cameraRuntime || !battlefieldRuntime) return null;
  GameLayout.updateCamera(cameraRuntime, player, battlefieldRuntime.definition.bounds);
  const worldPoint = GameLayout.screenToWorld(
    { x: mouse.screenX, y: mouse.screenY }, cameraRuntime);
  mouse.x = worldPoint.x;
  mouse.y = worldPoint.y;
  return cameraRuntime;
}
function battlefieldTelemetry() {
  return battlefieldRuntime ? {
    battlefieldId: battlefieldRuntime.id,
    battlefieldSeed: battlefieldRuntime.seed,
    worldWidth: battlefieldRuntime.definition.bounds.width,
    worldHeight: battlefieldRuntime.definition.bounds.height,
    obstacleCount: battlefieldRuntime.definition.obstacles.length
  } : {};
}
function initializeBattlefield(stage, placePlayer = false) {
  battlefieldRuntime = Battlefields.createRuntime(stage.battlefieldId, {
    seed: createBattlefieldSeed(), actorFootprints: battlefieldActorFootprints()
  });
  cameraRuntime = GameLayout.createCamera(canvas.width, canvas.height);
  if (placePlayer) {
    player.x = battlefieldRuntime.definition.playerSpawn.x;
    player.y = battlefieldRuntime.definition.playerSpawn.y;
  }
  updateCameraRuntime();
  return battlefieldRuntime;
}
function clearBattlefieldRuntime() {
  battlefieldRuntime = null;
  cameraRuntime = null;
  enemies.length = 0;
  enemySpatialHash = new Map();
  bullets.length = 0;
  clearWeaponActions();
  clearPendingLauncherEffects();
  EnemyBehaviors.clearTransient(enemies, hazards);
  resetHazardDamageRuntime();
  boss = null;
  stageRuntime = null;
  currentWave = null;
  waveRuntime = null;
  encounterController = null;
  pendingSpawnReservation = null;
  bossRuntime = null;
}
function startWave(index, { preserveInput = false } = {}) {
  currentEnemyIntroduction = null;
  introductionQueue = [];
  pendingWaveIndex = null;
  currentWave = Object.freeze({ id: `${stageRuntime.definition.id}-wave-${index + 1}`,
    stageId: stageRuntime.definition.id, waveIndex: index, templateId: "continuous",
    eligibleEnemyTypes: Encounters.getContinuousEligibleTypes(stageRuntime.definition, index),
    threatBudget: null, maxActiveThreat: null, spawnGroups: [], mechanics: [...stageRuntime.definition.mechanics],
    analysis: Object.freeze({ threat: null, expectedClearTime: null, expectedBaseScore: 0,
      performanceAllowance: 0, scoreCapacity: 0, calibrationPending: "continuous-encounter" }) });
  stageRuntime.waveIndex = index;
  encounterController.waveIndex = index;
  ContinuousEncounter.resetProgressReadiness(encounterController,
    index === 0 ? "opening-ramp" : "wave-transition");
  waveRuntime = { waveId: currentWave.id, elapsedTime: 0, damageTaken: 0, analysis: currentWave.analysis,
    aliveEnemyCount: enemies.filter(enemy => enemy.hp > 0).length, isComplete: false,
    groupDelayElapsed: 0, nextSpawnGroupIndex: 0, spawnedEnemyCount: 0, activeThreat: 0 };
  runSettlementState.progress.currentEncounter = { id: currentWave.id, type: "wave" };
  observeTelemetry("startEncounter", () => ({ type: "wave", definition: currentWave,
    ...battlefieldTelemetry(), player: telemetryPlayer() }));
  if (beginEnemyIntroductions(index)) return;
  runPhase = RUN_PHASES.WAVE_ACTIVE;
  if (!preserveInput) clearInput({ weaponReady: true });
}
function enterStage() {
  runPhase = RUN_PHASES.STAGE_ENTER;
  const definition = activeStages[stageIndex];
  if (battlefieldRuntime?.id !== definition.battlefieldId) initializeBattlefield(definition, true);
  stageRuntime = { definition, waveIndex: 0, recentTemplates: [], completed: false };
  encounterController = ContinuousEncounter.createController({ waveCount: definition.waveCount,
    seed: battlefieldRuntime.seed });
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
  clearWeaponActions();
  EnemyBehaviors.clearTransient(enemies, hazards);
  resetHazardDamageRuntime();
  clearInput();
  audioManager.play("bossIncoming");
}
function handleLogicalWaveComplete(fill) {
  if (!encounterController || runPhase !== RUN_PHASES.WAVE_ACTIVE) return;
  if (stageRuntime.waveIndex + 1 >= stageRuntime.definition.waveCount) {
    encounterController.phase = ContinuousEncounter.PHASES.FINAL_COMPLETE;
    enemies.length = 0;
    enterIntermission();
    return;
  }
  completeCurrentEncounter("wave", waveRuntime);
  // Logical Wave transitions are non-modal. Preserve held movement, firing, and
  // per-Weapon cooldown state unless an Enemy Introduction actually opens.
  startWave(stageRuntime.waveIndex + 1, { preserveInput: true });
  ContinuousEncounter.beginWaveComing(encounterController, fill.projectedFill);
  waveComingBannerTimer = 2.2;
  audioManager.play("waveComing");
  observeTelemetry("recordWaveComing", () => ({ startFill: encounterController.comingStartFill,
    selectedDelta: encounterController.comingSelectedDelta, delta: encounterController.comingDelta,
    target: encounterController.comingTarget, budgetArea: encounterController.comingBudgetArea }));
}
function startBossEncounter() {
  const definition = Encounters.BOSSES[stageRuntime.definition.boss];
  bossRuntime = { encounterId: definition.id, elapsedTime: 0, damageTaken: 0,
    analysis: definition.analysis, isComplete: false, phase: BOSS_PHASES.CHASE,
    phaseElapsed: 0, chaseDuration: definition.chargeCycle.initialChaseDuration,
    chargeDirectionX: 0, chargeDirectionY: 0, collisionPhase: BOSS_PHASES.CHASE,
    navigationRuntime: Battlefields.createNavigationRuntime(0) };
  runSettlementState.progress.currentEncounter = { id: definition.id, type: "boss" };
  spawnBoss();
  EnemyBehaviors.clearTransient(enemies, hazards);
  resetHazardDamageRuntime();
  runPhase = RUN_PHASES.BOSS_ACTIVE;
  clearInput({ weaponReady: true });
  observeTelemetry("startEncounter", () => ({ type: "boss", definition,
    ...battlefieldTelemetry(),
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
  clearWeaponActions();
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
  if (hpBefore > player.hp) audioManager.play("playerDamage", { concurrency: 2, retrigger: 0.08 });
  if (player.hp <= 0) {
    runPhase = RUN_PHASES.RUN_DEAD;
    isGameOver = true;
    settleRun(RUN_END_REASONS.DEATH);
    EnemyBehaviors.clearTransient(enemies, hazards);
    resetHazardDamageRuntime();
    cancelPendingContinuousSpawn();
    clearIntroductionTransient();
    clearWeaponActions();
    audioManager.play("death");
  }
}
function openAbandon() {
  if (!isGameStarted || isGameOver || isVictory || isChoosingUpgrade || isAbandoned ||
      [RUN_PHASES.INTRODUCTION_PENDING, RUN_PHASES.INTRODUCTION_ACTIVE].includes(runPhase)) return false;
  isAbandonConfirmOpen = true;
  abandonOverlay.hidden = false;
  clearInput();
  document.getElementById("continueButton").focus?.();
  return true;
}
function closeAbandon() {
  isAbandonConfirmOpen = false;
  returnToHubAfterAbandon = false;
  abandonOverlay.hidden = true;
  clearInput();
}
function abandonRun() {
  if (!isAbandonConfirmOpen) return;
  const shouldReturnToHub = returnToHubAfterAbandon;
  closeAbandon();
  settleRun(RUN_END_REASONS.ABANDON);
  isAbandoned = true;
  bullets.length = 0;
  clearWeaponActions();
  EnemyBehaviors.clearTransient(enemies, hazards);
  resetHazardDamageRuntime();
  cancelPendingContinuousSpawn();
  clearIntroductionTransient();
  if (shouldReturnToHub) showView(APP_VIEWS.HUB);
}
document.getElementById("continueButton").addEventListener("click", closeAbandon);
document.getElementById("confirmAbandonButton").addEventListener("click", abandonRun);
enemyIntroductionContinue.addEventListener("click", dismissEnemyIntroduction);
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
  y: 0,
  screenX: 0,
  screenY: 0
};

function renderMetaView(view) {
  if (view === APP_VIEWS.SHOP) {
    document.getElementById("shopPoints").textContent = saveData.progression.points;
  }
  if (view === APP_VIEWS.ARMORY) {
    document.getElementById("armoryWeaponName").textContent = saveData.unlocks.weapons.includes(Weapons.STARTER.id)
      ? Weapons.STARTER.name
      : "No weapons unlocked";
  }
  if (view === APP_VIEWS.EQUIPMENT) {
    const equipmentCount = saveData.unlocks.equipment.length;
    document.getElementById("equipmentStatus").textContent = equipmentCount === 0
      ? "No equipment unlocked"
      : `${equipmentCount} equipment unlocked`;
  }
  if (view === APP_VIEWS.CODEX) renderEnemyCodex();
}

function showView(view) {
  if (!appViews[view]) return false;
  clearInput();
  Object.entries(appViews).forEach(([id, element]) => { element.hidden = id !== view; });
  currentView = view;
  renderMetaView(view);
  if (view === APP_VIEWS.HUB) {
    isGameStarted = false;
    clearBattlefieldRuntime();
  }
  if (view === APP_VIEWS.GAME) resizeCanvasDisplay();
  return true;
}

function hasActiveRun() {
  return isGameStarted && !isGameOver && !isVictory && !isAbandoned;
}

function requestHub() {
  if (currentView !== APP_VIEWS.GAME || !hasActiveRun()) return showView(APP_VIEWS.HUB);
  returnToHubAfterAbandon = true;
  if (!openAbandon()) {
    returnToHubAfterAbandon = false;
    return false;
  }
  return true;
}

function startGameplay() {
  audioManager.unlock();
  ensurePlaytestTelemetry();
  isGameStarted = true;
  resetGame();
  saveData.statistics.totalRuns += 1;
  saveGame();
  showView(APP_VIEWS.GAME);
  updateHud();
}

playButton.addEventListener("click", startGameplay);
function renderAudioSetting() {
  const settings = audioManager.getSettings();
  const muted = settings.masterMuted;
  audioMuteButton.textContent = muted ? "SFX OFF" : "SFX";
  audioMuteButton.setAttribute("aria-pressed", String(muted));
  masterVolume.value = String(settings.masterVolume);
  sfxVolume.value = String(settings.sfxVolume);
}
audioMuteButton.addEventListener("click", () => {
  audioManager.unlock();
  const settings = audioManager.getSettings();
  audioManager.setSettings({ masterMuted: !settings.masterMuted });
  renderAudioSetting();
});
masterVolume.addEventListener("input", () => audioManager.setSettings({ masterVolume: masterVolume.value }));
sfxVolume.addEventListener("input", () => audioManager.setSettings({ sfxVolume: sfxVolume.value }));
renderAudioSetting();
document.getElementById("shopButton").addEventListener("click", () => showView(APP_VIEWS.SHOP));
document.getElementById("armoryButton").addEventListener("click", () => showView(APP_VIEWS.ARMORY));
document.getElementById("equipmentButton").addEventListener("click", () => showView(APP_VIEWS.EQUIPMENT));
enemyCodexButton.addEventListener("click", () => showView(APP_VIEWS.CODEX));
document.getElementById("shopBackButton").addEventListener("click", requestHub);
document.getElementById("armoryBackButton").addEventListener("click", requestHub);
document.getElementById("equipmentBackButton").addEventListener("click", requestHub);
codexBackButton.addEventListener("click", requestHub);
backToHubButton.addEventListener("click", requestHub);
buildDetailButton?.addEventListener("click", () => openBuildDetail());
buildDetailClose?.addEventListener("click", () => closeBuildDetail());
if (playtestBuildDemoButton) {
  playtestBuildDemoButton.hidden = !isPlaytestMode;
  playtestBuildDemoButton.addEventListener("click", preparePlaytestBuildDemoStep);
}
if (playtestWaveComingButton) {
  playtestWaveComingButton.hidden = !isPlaytestMode;
  playtestWaveComingButton.addEventListener("click", () => {
    if (!isGameStarted || runPhase !== RUN_PHASES.WAVE_ACTIVE ||
        stageRuntime.waveIndex + 1 >= stageRuntime.definition.waveCount) return;
    const viewport = cameraViewportRect();
    handleLogicalWaveComplete(ContinuousEncounter.computeFill(enemies, viewport, pendingSpawnArea()));
  });
}
if (playtestWeaponSelector) {
  playtestWeaponSelector.hidden = !isPlaytestMode;
  playtestWeaponSelector.addEventListener("change", event => {
    if (!event.target?.matches?.("input[data-weapon-id]")) return;
    const checked = [...playtestWeaponSelector.querySelectorAll("input[data-weapon-id]:checked")];
    if (checked.length > 2) event.target.checked = false;
    if (!playtestWeaponSelector.querySelector("input[data-weapon-id]:checked")) event.target.checked = true;
  });
}

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
  mouse.screenX = point.x;
  mouse.screenY = point.y;
  const worldPoint = cameraRuntime
    ? GameLayout.screenToWorld(point, cameraRuntime)
    : point;
  mouse.x = worldPoint.x;
  mouse.y = worldPoint.y;
}

function canAttack() {
  return currentView === APP_VIEWS.GAME && isGameStarted && !isGameOver && !isVictory && !isChoosingUpgrade &&
    !isAbandonConfirmOpen && !isBuildDetailOpen && !isAbandoned &&
    [RUN_PHASES.WAVE_ACTIVE, RUN_PHASES.BOSS_ACTIVE].includes(runPhase);
}

function createProjectile(direction, weaponSnapshot, attackId, metadata = {}) {
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  const bullet = {
    x: playerCenterX - weaponSnapshot.bulletSize / 2,
    y: playerCenterY - weaponSnapshot.bulletSize / 2,
    width: weaponSnapshot.bulletSize,
    height: weaponSnapshot.bulletSize,
    speed: weaponSnapshot.bulletSpeed,
    damage: weaponSnapshot.damage,
    directionX: direction.x,
    directionY: direction.y,
    pierceRemaining: weaponSnapshot.pierce,
    hitTargets: new Set(), weaponId: weaponSnapshot.id, attackId,
    remainingRange: Number.isFinite(weaponSnapshot.maxRange) ? weaponSnapshot.maxRange : null,
    explosionRadius: weaponSnapshot.explosionRadius || 0, exploded: false,
    launcherEffects: weaponSnapshot.launcherEffects ? {
      ...weaponSnapshot.launcherEffects,
      clusterOffsets: weaponSnapshot.launcherEffects.clusterOffsets.map(offset => ({ ...offset }))
    } : null,
    ...metadata
  };
  bullets.push(bullet);
  observeTelemetry("recordShot");
  observeTelemetry("recordWeaponProjectile", () => ({ weaponId: weaponSnapshot.id }));
  return bullet;
}

function fireProjectileSet(weaponSnapshot, aimAngle, attackId, metadata = {}) {
  const directions = Weapons.getProjectileDirections(aimAngle,
    weaponSnapshot.projectileCount, weaponSnapshot.spreadDegrees);
  for (const direction of directions) {
    createProjectile(direction, weaponSnapshot, attackId, metadata);
  }
}

function fireCommittedBurstShot(runtime, sequence, shotIndex, { followup = false } = {}) {
  if (!runtime || runtime.disposed || !sequence || sequence.canceled) return false;
  fireProjectileSet(sequence.weaponSnapshot, sequence.aimAngle, sequence.id, {
    burstSequence: sequence,
    burstSequenceId: sequence.id,
    burstShotIndex: shotIndex,
    burstFollowup: followup,
    burstResolutionClosed: false
  });
  sequence.outstandingProjectiles += sequence.weaponSnapshot.projectileCount;
  observeTelemetry(followup ? "recordExecutionFollowupFired" : "recordBurstShotFired", () => ({
    weaponId: sequence.weaponSnapshot.id, sequenceId: sequence.id, shotIndex
  }));
  audioManager.play(followup ? "doubleTap" : "burstFire", { concurrency: 3 });
  return true;
}

function fireArcBlade(weaponSnapshot, aimAngle, attackId) {
  const centerX = player.x + player.width / 2, centerY = player.y + player.height / 2;
  weaponRuntime.arcAttackCount++;
  const sweep = RunBuild.getArcBladeSweep(buildState, weaponRuntime.arcAttackCount);
  const halfAngle = sweep.halfAngleDegrees * Math.PI / 180;
  const targets = [...enemies.slice().filter(isCurrentEncounterEnemy),
    ...(runPhase === RUN_PHASES.BOSS_ACTIVE && boss ? [boss] : [])].filter(target => {
    const dx = target.x + target.width / 2 - centerX, dy = target.y + target.height / 2 - centerY;
    const distance = Math.hypot(dx, dy);
    const difference = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - aimAngle),
      Math.cos(Math.atan2(dy, dx) - aimAngle)));
    return distance <= weaponSnapshot.sweepRange + Math.hypot(target.width, target.height) / 2 && difference <= halfAngle;
  });
  let hitCount = 0;
  for (const target of targets) {
    const result = target === boss
      ? damageBoss(target, weaponSnapshot.damage, { weaponId: weaponSnapshot.id, hitKind: "arc" })
      : damageRegularEnemy(target, weaponSnapshot.damage,
        { weaponId: weaponSnapshot.id, hitKind: "arc" });
    hitCount++;
    if (result.waveCompleted || isChoosingUpgrade || isGameOver) break;
  }
  weaponEffects.push({ kind: "arc", x: centerX, y: centerY, angle: aimAngle,
    range: weaponSnapshot.sweepRange, halfAngle, fullSweep: sweep.fullSweep, elapsed: 0, duration: 0.16 });
  observeTelemetry("recordArcBladeSweep", () => ({ weaponId: weaponSnapshot.id, targetCount: hitCount, attackId }));
  audioManager.play("arcBladeSweep", { world: true, pan: worldAudioPan(player), concurrency: 2 });
}

function fireWeaponAttack() {
  if (!canAttack() || weaponRuntime.timeUntilNextShot > 1e-9 || weaponRuntime.burstShotsRemaining > 0) return false;
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  const aimAngle = Math.atan2(mouse.y - playerCenterY, mouse.x - playerCenterX);
  const weaponSnapshot = { ...weapon };
  const attackId = nextWeaponAttackId++;
  observeTelemetry("recordAttack");
  observeTelemetry("recordWeaponAttack", () => ({ weaponId: weaponSnapshot.id, attackKind: weaponSnapshot.attackKind }));
  if (weaponSnapshot.id === "launcher") {
    observeTelemetry("recordLauncherAttack", () => ({ attackId,
      chainReactionActive: weaponSnapshot.launcherEffects?.chainReactionActive === true }));
  }
  if (weaponSnapshot.attackKind === "arc") {
    fireArcBlade(weaponSnapshot, aimAngle, attackId);
  } else if (weaponSnapshot.attackKind === "burst") {
    const sequence = {
      id: attackId,
      weaponId: weaponSnapshot.id,
      runtime: weaponRuntime,
      weaponSnapshot,
      aimAngle,
      hitTargets: [null, null, null],
      executionTriggered: false,
      doubleTapScheduled: false,
      outstandingProjectiles: 0,
      canceled: false
    };
    weaponRuntime.committedBurstSequences.add(sequence);
    weaponRuntime.burstSequence = sequence;
    observeTelemetry("recordBurstAttackInitiated", () => ({ weaponId: weaponSnapshot.id,
      sequenceId: attackId, shotsScheduled: weaponSnapshot.burstCount,
      spacing: weaponSnapshot.burstSpacing }));
    fireCommittedBurstShot(weaponRuntime, sequence, 1);
    weaponRuntime.burstShotsRemaining = weaponSnapshot.burstCount - 1;
    weaponRuntime.burstShotTimer = weaponSnapshot.burstSpacing;
    weaponRuntime.burstAimAngle = aimAngle;
    weaponRuntime.burstWeapon = weaponSnapshot;
    weaponRuntime.burstAttackId = attackId;
    weaponRuntime.burstNextShotIndex = 2;
  } else {
    fireProjectileSet(weaponSnapshot, aimAngle, attackId);
    const cue = weaponSnapshot.id === "scatter" ? "scatterFire" :
      weaponSnapshot.id === "piercer" ? "piercerFire" :
      weaponSnapshot.id === "launcher" ? "launcherFire" : "playerFire";
    audioManager.play(cue, { concurrency: 2, retrigger: 0.025 });
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
  const dt = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
  for (const slot of weaponSlots) {
    const runtime = slot.runtime;
    runtime.timeUntilNextShot = Math.max(0, runtime.timeUntilNextShot - dt);
    if (runtime.burstShotsRemaining > 0) {
      runtime.burstShotTimer -= dt;
      while (runtime.burstShotsRemaining > 0 && runtime.burstShotTimer <= 1e-9) {
        fireCommittedBurstShot(runtime, runtime.burstSequence, runtime.burstNextShotIndex);
        runtime.burstNextShotIndex++;
        runtime.burstShotsRemaining--;
        if (runtime.burstShotsRemaining > 0) runtime.burstShotTimer += runtime.burstWeapon.burstSpacing;
        else {
          runtime.burstShotTimer = 0;
          runtime.burstNextShotIndex = 0;
          runtime.burstWeapon = null;
          runtime.burstAttackId = null;
          runtime.burstSequence = null;
        }
      }
    }
    for (let index = 0; index < runtime.pendingBurstFollowups.length;) {
      const followup = runtime.pendingBurstFollowups[index];
      followup.delayRemaining -= dt;
      if (followup.delayRemaining > 1e-9) { index++; continue; }
      runtime.pendingBurstFollowups.splice(index, 1);
      fireCommittedBurstShot(runtime, followup.sequence, 4, { followup: true });
    }
  }
  // A frame may produce at most one held attack. fireWeaponAttack owns the fresh
  // cooldown so a long frame cannot burst-catch up or immediately fire again.
  if (weaponRuntime.attackHeld) fireWeaponAttack();
  for (let index = weaponEffects.length - 1; index >= 0; index--) {
    weaponEffects[index].elapsed += dt;
    if (weaponEffects[index].elapsed >= weaponEffects[index].duration) weaponEffects.splice(index, 1);
  }
  updatePendingLauncherEffects(dt);
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
  if (!isGameStarted || isGameOver || isVictory || isChoosingUpgrade || isAbandonConfirmOpen ||
      isBuildDetailOpen || isAbandoned) {
    return;
  }
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (currentView !== APP_VIEWS.GAME) return;

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

  if (isBuildDetailOpen) {
    if (!event.repeat && ["b", "escape"].includes(key)) closeBuildDetail();
    return;
  }

  if (!isGameStarted || isGameOver || isVictory || isAbandoned) {
    return;
  }

  if ([RUN_PHASES.INTRODUCTION_PENDING, RUN_PHASES.INTRODUCTION_ACTIVE].includes(runPhase)) {
    if (runPhase === RUN_PHASES.INTRODUCTION_ACTIVE && !event.repeat &&
        ["enter", " ", "spacebar"].includes(key)) {
      event.preventDefault?.();
      dismissEnemyIntroduction();
    }
    return;
  }

  if (isChoosingUpgrade) {
    if (!event.repeat) {
      chooseUpgrade(key);
    }
    return;
  }

  if (key === "b" && !event.repeat) {
    event.preventDefault?.();
    openBuildDetail();
    return;
  }

  if (key === "q" && !event.repeat) {
    event.preventDefault?.();
    switchActiveWeapon();
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
  clearPendingLauncherEffects();
  configureWeaponLoadout(selectedPlaytestWeaponIds());
  battlefieldRuntime = null;
  initializeBattlefield(activeStages[0], true);
  player.speed = playerStats.speed;
  player.maxHp = playerStats.maxHp;
  player.hp = playerStats.maxHp;
  enemies.length = 0;
  enemySpatialHash = new Map();
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
  encounterController = null;
  pendingSpawnReservation = null;
  waveComingBannerTimer = 0;
  bossRuntime = null;
  intermissionTimer = 0;
  stageClearTimer = 0;
  isAbandoned = false;
  closeAbandon();
  mouse.screenX = 0;
  mouse.screenY = 0;
  updateCameraRuntime();
  isGameOver = false;
  isVictory = false;
  isChoosingUpgrade = false;
  isBuildDetailOpen = false;
  comboNotificationTimer = 0;
  currentUpgradeChoices = [];
  upgradeOverlay.hidden = true;
  upgradeChoices.textContent = "";
  if (buildDetailOverlay) buildDetailOverlay.hidden = true;
  if (comboNotification) comboNotification.hidden = true;
  upgradeRng = createUpgradeRng();
  clearWeaponActions({ ready: true });
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
  observeTelemetry("startRun", () => ({ player: telemetryPlayer(), ...battlefieldTelemetry() }));
  enterStage();
}

function movePlayerAxis(amount, axis) {
  let remaining = amount;
  let obstacleContact = false;
  for (let stepIndex = 0; Math.abs(remaining) > COLLISION_EPSILON && stepIndex < 256; stepIndex++) {
    const step = Math.sign(remaining) * Math.min(Math.abs(remaining), 4);
    const beforeX = player.x;
    const beforeY = player.y;
    const movement = Battlefields.moveAxis(player, step, axis, battlefieldRuntime);
    player.x = movement.x;
    player.y = movement.y;
    const actualX = player.x - beforeX;
    const actualY = player.y - beforeY;
    const enemy = getPlayerCollision();
    if (enemy && !pushEnemy(enemy, actualX, actualY)) {
      player.x = beforeX;
      player.y = beforeY;
      break;
    }
    remaining -= axis === "x" ? actualX : actualY;
    if (movement.collision) obstacleContact = true;
    if (movement.collided || Math.hypot(actualX, actualY) <= COLLISION_EPSILON) break;
  }
  if (obstacleContact) observeTelemetry("recordPlayerObstacleContact");
}

function pendingSpawnArea() {
  return encounterController?.pendingReservations.reduce((sum, item) => sum + item.reservation.area, 0) || 0;
}

function rebuildEnemySpatialHash() {
  const grid = new Map();
  for (const enemy of enemies) {
    if (!isCurrentEncounterEnemy(enemy)) continue;
    const minX = Math.floor(enemy.x / ENEMY_SPATIAL_CELL_SIZE);
    const maxX = Math.floor((enemy.x + enemy.width) / ENEMY_SPATIAL_CELL_SIZE);
    const minY = Math.floor(enemy.y / ENEMY_SPATIAL_CELL_SIZE);
    const maxY = Math.floor((enemy.y + enemy.height) / ENEMY_SPATIAL_CELL_SIZE);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const key = `${x},${y}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(enemy);
    }
  }
  enemySpatialHash = grid;
}

function nearbyEnemies(body) {
  if (!enemySpatialHash.size) return enemies;
  const found = new Set();
  const minX = Math.floor(body.x / ENEMY_SPATIAL_CELL_SIZE) - 1;
  const maxX = Math.floor((body.x + body.width) / ENEMY_SPATIAL_CELL_SIZE) + 1;
  const minY = Math.floor(body.y / ENEMY_SPATIAL_CELL_SIZE) - 1;
  const maxY = Math.floor((body.y + body.height) / ENEMY_SPATIAL_CELL_SIZE) + 1;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    for (const enemy of enemySpatialHash.get(`${x},${y}`) || []) found.add(enemy);
  }
  return found;
}

function updateContinuousEncounter(deltaTime) {
  rebuildEnemySpatialHash();
  const viewport = cameraViewportRect();
  for (const enemy of enemies) {
    const before = enemy.lifecycle;
    ContinuousEncounter.updateLifecycle(enemy, viewport);
    if (enemy.lifecycle !== before) observeTelemetry("recordLifecycleTransition", () => ({
      type: enemy.type, from: before, to: enemy.lifecycle }));
    if ([ContinuousEncounter.LIFECYCLES.ENTERING, ContinuousEncounter.LIFECYCLES.NEAR_OFFSCREEN,
      ContinuousEncounter.LIFECYCLES.RETURNING].includes(enemy.lifecycle) &&
      ![EnemyBehaviors.STATES.TELEGRAPH, EnemyBehaviors.STATES.CHARGE, EnemyBehaviors.STATES.STRIKE,
        EnemyBehaviors.STATES.CONNECTED].includes(enemy.behaviorRuntime?.behaviorState)) {
      const anchorBody = enemy.entryAnchor ? { ...enemy, ...enemy.entryAnchor } : null;
      const anchorNeedsRefresh = [ContinuousEncounter.LIFECYCLES.ENTERING,
        ContinuousEncounter.LIFECYCLES.RETURNING].includes(enemy.lifecycle) &&
        (!anchorBody || !ContinuousEncounter.isFullyInside(ContinuousEncounter.visualRect(anchorBody), viewport));
      if (anchorNeedsRefresh) {
        const side = outwardDistanceFromViewport(enemy, viewport)?.side || enemy.spawnSide || "left";
        const entryAnchor = createEntryAnchor(side, enemy);
        if (entryAnchor) enemy.entryAnchor = entryAnchor;
      }
      moveEnemyTowardPlayer(enemy, deltaTime);
      ContinuousEncounter.updateLifecycle(enemy, viewport);
    }
  }
  rebuildEnemySpatialHash();
  let fill = ContinuousEncounter.computeFill(enemies, viewport, pendingSpawnArea());
  const phaseBefore = encounterController.phase;
  ContinuousEncounter.updateController(encounterController, deltaTime, fill, enemies, viewport);
  if (phaseBefore !== encounterController.phase) observeTelemetry("recordEncounterPhase", () => ({
    from: phaseBefore, to: encounterController.phase, settlingDuration: encounterController.settlingDuration,
    nRef: encounterController.nRef, target: encounterController.target,
    waveProgressReadinessStableTime: encounterController.waveProgressReadinessStableTime,
    waveProgressReadinessBlockedReason: encounterController.waveProgressReadinessBlockedReason }));
  const mayRefill = encounterController.phase === ContinuousEncounter.PHASES.WAVE_COMING ||
    ([ContinuousEncounter.PHASES.NORMAL, ContinuousEncounter.PHASES.SETTLING].includes(encounterController.phase) &&
      encounterController.normalRefillEnabled);
  const effectiveOpeningTarget = ContinuousEncounter.effectiveNormalTarget(encounterController, stageRuntime.waveIndex);
  const dispatchCeiling = encounterController.phase === ContinuousEncounter.PHASES.WAVE_COMING
    ? ContinuousEncounter.STRUCTURE.controllerCeiling : effectiveOpeningTarget;
  if (mayRefill && runPhase === RUN_PHASES.WAVE_ACTIVE && !pendingSpawnReservation &&
      ContinuousEncounter.canDispatchPulse(encounterController)) {
    const policy = ContinuousEncounter.dispatchPolicy(encounterController.phase);
    let committed = 0;
    for (let reservationIndex = 0; reservationIndex < policy.maximum; reservationIndex++) {
      if (!dispatchContinuousSpawn(fill, dispatchCeiling)) break;
      committed++;
      fill = ContinuousEncounter.computeFill(enemies, viewport, pendingSpawnArea());
      if (pendingSpawnReservation) break;
    }
    ContinuousEncounter.recordDispatchPulse(encounterController, committed);
    observeTelemetry("recordDispatchPulse", () => ({ phase: encounterController.phase,
      reservationsCommitted: committed }));
  }
  const managedCount = ContinuousEncounter.managedRegularEnemyCount(enemies,
    encounterController.pendingReservations.length);
  encounterController.peakManagedCount = Math.max(encounterController.peakManagedCount, managedCount);
  waveRuntime.elapsedTime += deltaTime;
  waveRuntime.aliveEnemyCount = enemies.filter(enemy => enemy.hp > 0).length;
  waveComingBannerTimer = Math.max(0, waveComingBannerTimer - deltaTime);
  observeTelemetry("recordContinuousFrame", () => ({ deltaTime, fill, controller: encounterController,
    effectiveOpeningTarget, managedCount,
    lifecycleCounts: enemies.reduce((counts, enemy) => {
      counts[enemy.lifecycle] = (counts[enemy.lifecycle] || 0) + 1; return counts;
    }, {}) }));
  return fill;
}

function update(deltaTime) {
  if (currentView !== APP_VIEWS.GAME || !isGameStarted || isGameOver || isVictory || isChoosingUpgrade ||
      isAbandonConfirmOpen || isBuildDetailOpen || isAbandoned) {
    return;
  }
  comboNotificationTimer = Math.max(0, comboNotificationTimer - deltaTime);
  if (comboNotification) comboNotification.hidden = comboNotificationTimer <= 0;

  if (runPhase === RUN_PHASES.STAGE_CLEAR) {
    stageClearTimer += deltaTime;
    if (stageClearTimer >= Encounters.CONFIG.stageClear) runPhase = RUN_PHASES.STAGE_REWARD;
    return;
  }
  if (runPhase === RUN_PHASES.STAGE_REWARD) {
    handleStageReward(stageRuntime);
    if (stageIndex + 1 < activeStages.length) { stageIndex++; enterStage(); }
    else {
      clearIntroductionTransient();
      runPhase = RUN_PHASES.RUN_VICTORY;
      isVictory = true;
      settleRun(RUN_END_REASONS.VICTORY);
      audioManager.play("victory");
    }
    return;
  }
  if (runPhase === RUN_PHASES.INTRODUCTION_PENDING) {
    if (!showNextEnemyIntroduction()) {
      clearIntroductionTransient();
      runPhase = RUN_PHASES.WAVE_ACTIVE;
      clearInput({ weaponReady: true });
    }
    return;
  }
  if (runPhase === RUN_PHASES.INTRODUCTION_ACTIVE) {
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

    movePlayerAxis(movementX, "x");
    movePlayerAxis(movementY, "y");
  }
  playerVelocity.x = deltaTime > 0 ? (player.x - playerStartX) / deltaTime : 0;
  playerVelocity.y = deltaTime > 0 ? (player.y - playerStartY) / deltaTime : 0;
  updateCameraRuntime();

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
    updateContinuousEncounter(deltaTime);
    if (runPhase !== RUN_PHASES.WAVE_ACTIVE) return;
    updateEnemies(deltaTime);
    if (isGameOver) return;
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
  } else {
    handleBulletBossCollisions();
    if (player.hp <= 0) { takeDamage(0); return; }
    completeBossEncounter();
  }
}

function updateBullets(deltaTime) {
  for (const bullet of bullets.slice().reverse()) {
    if (!bullets.includes(bullet)) continue;
    const movement = Battlefields.traceMovement(bullet,
      bullet.directionX * bullet.speed * deltaTime,
      bullet.directionY * bullet.speed * deltaTime,
      battlefieldRuntime);
    bullet.x = movement.x;
    bullet.y = movement.y;
    if (Number.isFinite(bullet.remainingRange)) {
      bullet.remainingRange -= Math.hypot(movement.movementX, movement.movementY);
    }

    if (movement.reachedBoundary ||
        (movement.collision?.blocksProjectiles && projectileTerrainResponse(bullet, movement.collision) === "remove") ||
        (Number.isFinite(bullet.remainingRange) && bullet.remainingRange <= 0)) {
      if (bullet.explosionRadius > 0) {
        const result = explodeProjectile(bullet);
        if (result.waveCompleted) return;
      }
      else removeProjectile(bullet);
      continue;
    }

    if (!Battlefields.isInsideBounds(bullet, battlefieldRuntime)) {
      if (bullet.explosionRadius > 0) {
        const result = explodeProjectile(bullet);
        if (result.waveCompleted) return;
      }
      else removeProjectile(bullet);
    }
  }
}

function spawnEnemy(type = "normal", waveId = currentWave?.id) {
  const stats = Encounters.getScaledEnemyStats(enemyStats[type], stageRuntime.definition.enemyScaling);
  const definition = Encounters.ENEMIES[type];
  const enemy = { type, waveId, runtimeId: nextEnemyRuntimeId++, x: 0, y: 0, ...stats,
    visualWidth: definition.visualWidth, visualHeight: definition.visualHeight,
    collisionFootprint: { ...definition.collision }, navigationFootprint: { ...definition.navigation },
    countsTowardEncounterProgress: true, lifecycle: ContinuousEncounter.LIFECYCLES.ACTIVE, hasEnteredViewport: true,
    behaviorRuntime: EnemyBehaviors.createRuntime(Encounters.ENEMIES[type]),
    navigationRuntime: Battlefields.createNavigationRuntime(nextEnemyRuntimeId - 1) };
  const sideSample = Math.random();
  const edgeOffset = Math.random();
  if (positionEnemyForSpawn(enemy, sideSample, edgeOffset)) enemies.push(enemy);
  else {
    observeTelemetry("recordPathFailure");
    observeTelemetry("recordNavigationFallback");
  }
}

function cameraViewportRect() {
  return { x: cameraRuntime?.x || 0, y: cameraRuntime?.y || 0,
    width: cameraRuntime?.width || canvas.width, height: cameraRuntime?.height || canvas.height };
}
function worldAudioPan(entity) {
  const viewport = cameraViewportRect();
  const centerX = entity.x + (entity.width || 0) / 2;
  return Math.max(-1, Math.min(1, (centerX - (viewport.x + viewport.width / 2)) / (viewport.width / 2)));
}

function outwardDistanceFromViewport(body, viewport) {
  if (body.x + body.width <= viewport.x) return { side: "left", distance: viewport.x - body.x - body.width };
  if (body.x >= viewport.x + viewport.width) return { side: "right", distance: body.x - viewport.x - viewport.width };
  if (body.y + body.height <= viewport.y) return { side: "top", distance: viewport.y - body.y - body.height };
  if (body.y >= viewport.y + viewport.height) return { side: "bottom", distance: body.y - viewport.y - viewport.height };
  return null;
}

function validPlayerSpawnExclusion(enemy) {
  const enemyCenterX = enemy.x + enemy.visualWidth / 2;
  const enemyCenterY = enemy.y + enemy.visualHeight / 2;
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  return Math.hypot(enemyCenterX - playerCenterX, enemyCenterY - playerCenterY) + 1e-9 >=
    ContinuousEncounter.minimumSpawnCenterDistance(enemy);
}

function createEntryAnchor(side, enemy) {
  const viewport = cameraViewportRect();
  const inset = Math.max(ContinuousEncounter.CALIBRATION.entryAnchorMinimumInset,
    Math.max(enemy.visualWidth || enemy.width, enemy.visualHeight || enemy.height));
  const ratios = [0.5, 0.3, 0.7, 0.15, 0.85];
  const candidates = ratios.map(ratio => ({
    x: side === "left" ? viewport.x + inset : side === "right"
      ? viewport.x + viewport.width - inset - enemy.width
      : viewport.x + inset + (viewport.width - inset * 2 - enemy.width) * ratio,
    y: side === "top" ? viewport.y + inset : side === "bottom"
      ? viewport.y + viewport.height - inset - enemy.height
      : viewport.y + inset + (viewport.height - inset * 2 - enemy.height) * ratio
  })).map(anchor => ({ x: Math.max(viewport.x, Math.min(anchor.x, viewport.x + viewport.width - enemy.width)),
    y: Math.max(viewport.y, Math.min(anchor.y, viewport.y + viewport.height - enemy.height)) }));
  const ranked = candidates.map((anchor, index) => {
    const body = { ...enemy, ...anchor };
    if (!ContinuousEncounter.isFullyInside(ContinuousEncounter.visualRect(body), viewport) ||
        !validPlayerSpawnExclusion(body) || !Battlefields.isStaticPositionValid(body, battlefieldRuntime)) return null;
    const crowding = enemies.reduce((score, other) => {
      if (other === enemy || other.hp <= 0 || other.lifecycle === ContinuousEncounter.LIFECYCLES.DEAD) return score;
      const dx = (other.x + other.width / 2) - (anchor.x + enemy.width / 2);
      const dy = (other.y + other.height / 2) - (anchor.y + enemy.height / 2);
      return score + Math.max(0, ContinuousEncounter.CALIBRATION.entryCrowdingRadius - Math.hypot(dx, dy));
    }, 0);
    return { anchor, body, crowding, index };
  }).filter(Boolean).sort((first, second) => first.crowding - second.crowding || first.index - second.index);
  for (const candidate of ranked) {
    if (Battlefields.hasLineOfTravel(enemy, candidate.body, battlefieldRuntime) ||
        Battlefields.findPath(enemy, candidate.body, battlefieldRuntime)) return candidate.anchor;
  }
  return null;
}

function paddedBody(body, padding) {
  return { ...body, x: body.x - padding, y: body.y - padding,
    width: body.width + padding * 2, height: body.height + padding * 2 };
}

function profileCandidatePreference(enemy, profile) {
  if (profile.geometry === "los-preferred") {
    return Battlefields.hasLineOfTravel(enemy, player, battlefieldRuntime) ? 0 : 1;
  }
  if (profile.geometry === "open-space-preferred") {
    return Battlefields.isStaticPositionValid(paddedBody(enemy,
      ContinuousEncounter.CALIBRATION.openSpacePadding), battlefieldRuntime) ? 0 : 1;
  }
  return 0;
}

function profileGeometryAccepts(enemy, profile, entryAnchor) {
  if (profile.geometry === "lane-required") {
    return Battlefields.hasLineOfTravel(enemy, player, battlefieldRuntime);
  }
  if (profile.geometry === "approach-space") {
    return Battlefields.hasLineOfTravel(enemy, { ...enemy, ...entryAnchor }, battlefieldRuntime);
  }
  if (profile.geometry === "large-clearance") {
    return Battlefields.isStaticPositionValid(paddedBody(enemy,
      ContinuousEncounter.CALIBRATION.largeClearancePadding), battlefieldRuntime);
  }
  return true;
}

function positionEnemyForProfile(enemy, type) {
  const profile = Encounters.ENEMIES[type].spawnProfile;
  const viewport = cameraViewportRect();
  const sideSample = encounterController.positionRng();
  const offsetSample = encounterController.positionRng();
  const order = [profile.distance, ...["NEAR", "MID", "FAR"].filter(tag => tag !== profile.distance)];
  for (const tag of order) {
    const band = ContinuousEncounter.distanceBandPixels(tag, viewport.width, viewport.height);
    const candidates = Battlefields.spawnCandidates(enemy, viewport, battlefieldRuntime,
      sideSample, offsetSample, band.maximum + Battlefields.GRID_CELL_SIZE)
      .slice(0, ContinuousEncounter.CALIBRATION.placementCandidateScanLimit)
      .map((candidate, index) => ({ candidate, index,
        preference: profileCandidatePreference({ ...enemy, ...candidate }, profile) }))
      .sort((first, second) => first.preference - second.preference || first.index - second.index)
      .map(item => item.candidate);
    let attempts = 0;
    for (const candidate of candidates) {
      const body = { ...enemy, ...candidate };
      const edge = outwardDistanceFromViewport(body, viewport);
      if (!edge || edge.distance + 1e-9 < band.minimum || edge.distance > band.maximum + Battlefields.GRID_CELL_SIZE) continue;
      Object.assign(enemy, candidate);
      attempts++;
      observeTelemetry("recordSpawnPlacementAttempt", () => ({ selectedType: type,
        preferredDistanceTag: profile.distance, fallbackDistanceBandUsed: tag !== profile.distance ? tag : null,
        placementRetryCount: attempts - 1 }));
      if (!validPlayerSpawnExclusion(enemy) || !isValidSpawnPosition(enemy)) {
        if (attempts >= ContinuousEncounter.CALIBRATION.placementAttemptsPerBand) break;
        continue;
      }
      enemy.spawnSide = edge.side;
      enemy.selectedSpawnDistanceTag = profile.distance;
      enemy.fallbackSpawnDistanceBand = tag !== profile.distance ? tag : null;
      const entryAnchor = createEntryAnchor(edge.side, enemy);
      if (!entryAnchor || !profileGeometryAccepts(enemy, profile, entryAnchor)) {
        if (attempts >= ContinuousEncounter.CALIBRATION.placementAttemptsPerBand) break;
        continue;
      }
      enemy.entryAnchor = entryAnchor;
      return true;
    }
  }
  observeTelemetry("recordSpawnPlacementFailure", () => ({ selectedType: type,
    reason: "no-legal-profile-candidate", preferredDistanceTag: profile.distance }));
  return false;
}

function positionStillValid(enemy) {
  return validPlayerSpawnExclusion(enemy) && isValidSpawnPosition(enemy);
}

function finalizeContinuousSpawn(pending) {
  const index = encounterController.pendingReservations.findIndex(item => item.reservation.id === pending.reservation.id);
  if (index >= 0) encounterController.pendingReservations.splice(index, 1);
  if (!positionStillValid(pending.enemy) && !positionEnemyForProfile(pending.enemy, pending.enemy.type)) {
    ContinuousEncounter.cancelSpawn(encounterController, pending.reservation);
    observeTelemetry("recordSpawnPlacementFailure", () => ({ selectedType: pending.enemy.type,
      reason: "camera-moved-before-introduction-dismiss" }));
    return false;
  }
  pending.enemy.lifecycle = ContinuousEncounter.LIFECYCLES.ENTERING;
  pending.enemy.hasEnteredViewport = false;
  pending.enemy.reservationPhase = pending.reservation.phase;
  ContinuousEncounter.establishSpawn(pending.reservation);
  enemies.push(pending.enemy);
  observeTelemetry("recordContinuousSpawnCommitted", () => ({ type: pending.enemy.type,
    area: pending.reservation.area, phase: pending.reservation.phase }));
  observeTelemetry("recordLifecycleTransition", () => ({ type: pending.enemy.type, to: pending.enemy.lifecycle }));
  return true;
}

function dispatchContinuousSpawn(fill, requestedCeiling = null) {
  const phase = encounterController.phase;
  const isComing = phase === ContinuousEncounter.PHASES.WAVE_COMING;
  const ceiling = requestedCeiling ?? (isComing ? ContinuousEncounter.STRUCTURE.controllerCeiling :
    ContinuousEncounter.effectiveNormalTarget(encounterController, stageRuntime.waveIndex));
  const credit = isComing ? encounterController.comingCredit : encounterController.normalCredit;
  const types = Encounters.getContinuousEligibleTypes(stageRuntime.definition, stageRuntime.waveIndex);
  const pendingCount = encounterController.pendingReservations.length;
  if (!ContinuousEncounter.canReserveManagedEnemy(enemies, pendingCount)) {
    observeTelemetry("recordSpawnTypeRejected", () => ({ type: null, reason: "managed-cap" }));
    return false;
  }
  const activeCounts = enemies.reduce((counts, enemy) => {
    if (enemy.hp > 0 && enemy.lifecycle !== ContinuousEncounter.LIFECYCLES.DEAD) {
      counts[enemy.type] = (counts[enemy.type] || 0) + 1;
    }
    return counts;
  }, {});
  for (const type of types) {
    const cap = ContinuousEncounter.CALIBRATION.mechanicCaps[type];
    const area = ContinuousEncounter.visualArea(Encounters.ENEMIES[type]);
    if (Number.isFinite(cap) && (activeCounts[type] || 0) >= cap) {
      observeTelemetry("recordSpawnTypeRejected", () => ({ type, reason: "cap" }));
    } else if (fill.projectedFill + area / fill.capacityArea > ceiling + 1e-9) {
      observeTelemetry("recordSpawnTypeRejected", () => ({ type, reason: "fill" }));
    }
  }
  const legal = ContinuousEncounter.legalTypes({ definitions: Encounters.ENEMIES, types, enemies,
    projectedFill: fill.projectedFill, capacity: fill.capacityArea }).filter(type => {
      const area = ContinuousEncounter.visualArea(Encounters.ENEMIES[type]);
      return (!isComing || area <= encounterController.comingRemainingArea + 1e-9) &&
        fill.projectedFill + area / fill.capacityArea <= ceiling + 1e-9;
    });
  if (!legal.length) {
    if (isComing) {
      const minimumArea = Math.min(...types.map(type => ContinuousEncounter.visualArea(Encounters.ENEMIES[type])));
      if (encounterController.comingRemainingArea < minimumArea) encounterController.comingRemainingArea = 0;
    }
    return false;
  }
  const requestCredit = Math.max(...legal.map(type => ContinuousEncounter.visualArea(Encounters.ENEMIES[type])));
  if (credit + 1e-9 < requestCredit) return false;
  const selected = ContinuousEncounter.selectType(legal, encounterController.spawnHistory, encounterController.typeRng);
  for (const type of [selected, ...legal.filter(type => type !== selected)]) {
    const definition = Encounters.ENEMIES[type];
    const stats = Encounters.getScaledEnemyStats(definition.stats, stageRuntime.definition.enemyScaling);
    const enemy = { type, waveId: currentWave.id, runtimeId: nextEnemyRuntimeId++, x: 0, y: 0, ...stats,
      visualWidth: definition.visualWidth, visualHeight: definition.visualHeight,
      collisionFootprint: { ...definition.collision }, navigationFootprint: { ...definition.navigation },
      countsTowardEncounterProgress: true, lifecycle: ContinuousEncounter.LIFECYCLES.RESERVED,
      behaviorRuntime: EnemyBehaviors.createRuntime(definition),
      navigationRuntime: Battlefields.createNavigationRuntime(nextEnemyRuntimeId - 1) };
    if (!positionEnemyForProfile(enemy, type)) continue;
    const area = ContinuousEncounter.visualArea(definition);
    const reservation = ContinuousEncounter.commitSpawn(encounterController, type, area, phase);
    if (!reservation) return false;
    const pending = { reservation, enemy };
    if (beginSpawnIntroduction(type, pending)) {
      encounterController.pendingReservations.push(pending);
      return true;
    }
    return finalizeContinuousSpawn(pending);
  }
  if (isComing) encounterController.comingRemainingArea = 0;
  return false;
}

function projectileTerrainResponse(bullet, obstacle) {
  return obstacle?.blocksProjectiles ? "remove" : "continue";
}

function worldPerimeterCandidates(enemy) {
  const bounds = battlefieldRuntime.definition.bounds;
  const perimeterStep = Battlefields.GRID_CELL_SIZE;
  const candidates = [];
  for (let x = 0; x <= bounds.width - enemy.width; x += perimeterStep) {
    candidates.push({ x, y: 0 }, { x, y: bounds.height - enemy.height });
  }
  for (let y = perimeterStep; y < bounds.height - enemy.height; y += perimeterStep) {
    candidates.push({ x: 0, y }, { x: bounds.width - enemy.width, y });
  }
  return candidates;
}

function positionEnemyForSpawn(enemy, sideSample, initialOffset) {
  const cameraRect = cameraRuntime
    ? GameLayout.getCameraWorldRect(cameraRuntime)
    : { x: 0, y: 0, width: canvas.width, height: canvas.height };
  let candidates = Battlefields.spawnCandidates(enemy, cameraRect, battlefieldRuntime,
    sideSample, initialOffset);
  if (!candidates.length) candidates = worldPerimeterCandidates(enemy);
  const rotation = Math.abs(enemy.runtimeId || 0) % Math.max(1, candidates.length);
  const limit = Math.min(candidates.length,
    Math.max(SPAWN_PLACEMENT_ATTEMPTS, MAX_DETERMINISTIC_SPAWN_CANDIDATES));
  for (let index = 0; index < limit; index++) {
    Object.assign(enemy, candidates[(index + rotation) % candidates.length]);
    if (isValidSpawnPosition(enemy)) return true;
  }
  return false;
}

function isValidSpawnPosition(enemy) {
  return Battlefields.isStaticPositionValid(enemy, battlefieldRuntime) &&
    !hasOtherEnemyCollision(enemy) &&
    Boolean(Battlefields.findPath(enemy, player, battlefieldRuntime));
}

function spawnBoss() {
  boss = { x: 0, y: 0, ...Encounters.BOSSES[stageRuntime.definition.boss].stats };
  const edge = Math.random();
  const edgeOffset = Math.random();
  positionEnemyForSpawn(boss, edge, edgeOffset);

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
    Number.isFinite(enemy.hp) &&
    enemy.hp > 0 && enemy.lifecycle !== ContinuousEncounter.LIFECYCLES.DEAD
  );
}

function canEnemyAct(enemy) {
  if (!isCurrentEncounterEnemy(enemy)) return false;
  if (!enemy.lifecycle || enemy.lifecycle === ContinuousEncounter.LIFECYCLES.ACTIVE) return true;
  return [EnemyBehaviors.STATES.TELEGRAPH, EnemyBehaviors.STATES.CHARGE,
    EnemyBehaviors.STATES.STRIKE, EnemyBehaviors.STATES.CONNECTED].includes(enemy.behaviorRuntime?.behaviorState);
}

function prepareProjectileHitState(bullet) {
  if (!(bullet.hitTargets instanceof Set)) bullet.hitTargets = new Set();
  if (!Number.isFinite(bullet.pierceRemaining)) {
    bullet.pierceRemaining = Math.max(0, Math.floor(bullet.pierce || 0));
  }
}

function releaseBurstProjectile(bullet) {
  if (!bullet?.burstSequence || bullet.burstResolutionClosed) return;
  bullet.burstResolutionClosed = true;
  const sequence = bullet.burstSequence;
  sequence.outstandingProjectiles = Math.max(0, sequence.outstandingProjectiles - 1);
  if (sequence.outstandingProjectiles === 0 && sequence.runtime?.burstSequence !== sequence) {
    sequence.runtime?.committedBurstSequences?.delete(sequence);
  }
}

function removeProjectile(bullet) {
  const index = bullets.indexOf(bullet);
  if (index >= 0) {
    bullets.splice(index, 1);
    releaseBurstProjectile(bullet);
  }
  return index >= 0;
}

function resolveBurstProjectileHit(bullet, target) {
  const sequence = bullet?.burstSequence;
  if (!sequence || sequence.canceled || bullet.burstFollowup) {
    return { damage: bullet.damage, execution: false, executionBonusDamage: 0 };
  }
  const shotIndex = bullet.burstShotIndex;
  if (shotIndex === 1 || shotIndex === 2) {
    sequence.hitTargets[shotIndex - 1] = target;
    return { damage: bullet.damage, execution: false, executionBonusDamage: 0 };
  }
  const execution = shotIndex === 3 && sequence.weaponSnapshot.burstEffects?.executionProtocol === true &&
    !sequence.executionTriggered && sequence.hitTargets[0] === target && sequence.hitTargets[1] === target;
  if (!execution) return { damage: bullet.damage, execution: false, executionBonusDamage: 0 };
  sequence.executionTriggered = true;
  const damage = bullet.damage * sequence.weaponSnapshot.burstEffects.executionDamageMultiplier;
  return { damage, execution: true, executionBonusDamage: bullet.damage };
}

function scheduleDoubleTap(sequence) {
  const runtime = sequence?.runtime, profile = sequence?.weaponSnapshot?.burstEffects;
  if (!runtime || runtime.disposed || sequence.canceled || sequence.doubleTapScheduled || !profile?.doubleTapActive) return false;
  sequence.doubleTapScheduled = true;
  runtime.pendingBurstFollowups.push({ sequence, delayRemaining: profile.doubleTapDelay });
  observeTelemetry("recordExecutionFollowupScheduled", () => ({
    weaponId: sequence.weaponId, sequenceId: sequence.id, delay: profile.doubleTapDelay
  }));
  return true;
}

function completeBurstProjectileHit(bullet, target, hitResolution, result, hpBefore) {
  const sequence = bullet?.burstSequence;
  if (bullet?.burstFollowup && result.hit) {
    observeTelemetry("recordDoubleTapHit", () => ({ weaponId: bullet.weaponId,
      sequenceId: bullet.burstSequenceId, damage: result.damage, killed: result.killed }));
  }
  if (!hitResolution.execution || !result.hit) return;
  const actualBonusDamage = Math.max(0, Math.min(hitResolution.executionBonusDamage,
    hpBefore - bullet.damage));
  observeTelemetry("recordExecutionRound", () => ({ weaponId: bullet.weaponId,
    sequenceId: bullet.burstSequenceId, targetId: target.runtimeId || (target === boss ? "boss-1" : null),
    bonusDamage: actualBonusDamage }));
  weaponEffects.push({ kind: "execution", x: target.x + target.width / 2,
    y: target.y + target.height / 2, elapsed: 0, duration: 0.18 });
  audioManager.play("executionRound", { world: true, pan: worldAudioPan(target), concurrency: 2 });
  scheduleDoubleTap(sequence);
}

function consumeProjectileHit(bullet, target) {
  bullet.hitTargets.add(target);
  if (bullet.pierceRemaining > 0) {
    bullet.pierceRemaining--;
    observeTelemetry("recordWeaponPierce", () => ({ weaponId: bullet.weaponId || "starter" }));
    return false;
  }
  removeProjectile(bullet);
  return true;
}

function damageRegularEnemy(enemy, amount, { weaponId = "starter", hitKind = "projectile" } = {}) {
  if (!isCurrentEncounterEnemy(enemy)) return { hit: false, killed: false, waveCompleted: false };
  const hpBefore = enemy.hp;
  enemy.hp -= amount;
  const damage = Math.max(0, Math.min(amount, hpBefore));
  if (hitKind !== "arc") observeTelemetry("recordBulletHit", () => ({ enemyType: enemy.type, damage }));
  observeTelemetry("recordWeaponHit", () => ({ weaponId, enemyType: enemy.type, damage, hitKind }));
  audioManager.play(weaponId === "piercer" ? "piercerHit" : "weaponHit",
    { world: true, pan: worldAudioPan(enemy), concurrency: 3 });
  if (enemy.hp > 0) return { hit: true, killed: false, waveCompleted: false, damage };

  EnemyBehaviors.recordEnemyDefeat(enemy, hazards, { emit: emitBehaviorTelemetry, enemies });
  const enemyIndex = enemies.indexOf(enemy);
  if (enemyIndex >= 0) enemies.splice(enemyIndex, 1);
  if (waveRuntime) waveRuntime.aliveEnemyCount = enemies.filter(candidate => candidate.hp > 0).length;
  observeTelemetry("recordEnemyKill", () => ({ enemyType: enemy.type }));
  observeTelemetry("recordWeaponKill", () => ({ weaponId, enemyType: enemy.type }));
  awardRunScore(SCORE_TYPES.ENEMY_KILL, 1);
  xp += 1;
  saveData.statistics.totalKills += 1;
  saveGame();
  audioManager.play("enemyKill", { world: true, pan: worldAudioPan(enemy), concurrency: 3 });
  const waveCompleted = ContinuousEncounter.recordKill(encounterController,
    enemy.countsTowardEncounterProgress !== false);
  if (waveCompleted) {
    const fill = ContinuousEncounter.computeFill(enemies, cameraViewportRect(), pendingSpawnArea());
    handleLogicalWaveComplete(fill);
  }
  updateLevel();
  return { hit: true, killed: true, waveCompleted, damage };
}

function damageBoss(target, amount, { weaponId = "starter", hitKind = "projectile" } = {}) {
  if (!target || target !== boss || boss.hp <= 0 || runPhase !== RUN_PHASES.BOSS_ACTIVE) {
    return { hit: false, killed: false, waveCompleted: false };
  }
  const hpBefore = boss.hp;
  boss.hp -= amount;
  const damage = Math.max(0, Math.min(amount, hpBefore));
  if (hitKind !== "arc") observeTelemetry("recordBulletHit", () => ({ enemyType: "boss-1", damage }));
  observeTelemetry("recordWeaponHit", () => ({ weaponId, enemyType: "boss-1", damage, hitKind }));
  audioManager.play(weaponId === "piercer" ? "piercerHit" : "weaponHit",
    { world: true, pan: worldAudioPan(boss), concurrency: 3 });
  return { hit: true, killed: boss.hp <= 0, waveCompleted: false, damage };
}

function resolveExplosionEvent({ x, y, radius, damage, weaponId = "launcher", attackId = null,
  effectKind = "primary", chainReactionActive = false, damageEnabled = true }) {
  let targets = 0, waveCompleted = false;
  const hitTargets = new Set();
  const candidates = damageEnabled && !isChoosingUpgrade && !isGameOver && !isVictory && !isAbandoned
    ? (runPhase === RUN_PHASES.BOSS_ACTIVE && boss ? [boss] : enemies.slice()) : [];
  for (const target of candidates) {
    if (hitTargets.has(target) || (target !== boss && !isCurrentEncounterEnemy(target))) continue;
    const distance = Math.hypot(target.x + target.width / 2 - x,
      target.y + target.height / 2 - y);
    if (distance > radius + Math.hypot(target.width, target.height) / 2) continue;
    hitTargets.add(target);
    const result = target === boss
      ? damageBoss(target, damage, { weaponId, hitKind: effectKind })
      : damageRegularEnemy(target, damage, { weaponId, hitKind: effectKind });
    if (result.hit) targets++;
    if (result.waveCompleted || isChoosingUpgrade || isGameOver) {
      waveCompleted = result.waveCompleted;
      break;
    }
  }
  weaponEffects.push({ kind: "explosion", effectKind, x, y, radius,
    elapsed: 0, duration: effectKind === "siege-bloom" ? 0.36 : effectKind === "cluster" ? 0.2 : 0.22 });
  if (effectKind === "primary") {
    observeTelemetry("recordWeaponExplosion", () => ({ weaponId, targetCount: targets }));
  }
  if (weaponId === "launcher") {
    observeTelemetry("recordLauncherExplosion", () => ({ attackId, effectKind, targetCount: targets,
      chainReactionActive }));
  }
  audioManager.play("launcherExplosion", { world: true,
    pan: worldAudioPan({ x, y, width: 0 }), concurrency: effectKind === "primary" ? 3 : 6 });
  return { targets, waveCompleted };
}

function commitSiegeBloom(bullet, centerX, centerY) {
  const profile = bullet.launcherEffects;
  if (!profile?.siegeBloom) return;
  pendingLauncherEffects.push({ kind: "siege-bloom", x: centerX, y: centerY,
    radius: profile.siegeBloomRadius, damage: bullet.damage, weaponId: bullet.weaponId,
    attackId: bullet.attackId, chainReactionActive: profile.chainReactionActive,
    delayRemaining: profile.siegeBloomDelay });
}

function updatePendingLauncherEffects(deltaTime) {
  const dt = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
  for (const effect of pendingLauncherEffects) effect.delayRemaining -= dt;
  for (let index = 0; index < pendingLauncherEffects.length;) {
    const effect = pendingLauncherEffects[index];
    if (effect.delayRemaining > 1e-9) { index++; continue; }
    pendingLauncherEffects.splice(index, 1);
    resolveExplosionEvent({ ...effect, effectKind: "siege-bloom" });
    if (isChoosingUpgrade || isGameOver || isVictory || isAbandoned) break;
  }
}

function explodeProjectile(bullet) {
  if (bullet.exploded) return { targets: 0, waveCompleted: false };
  bullet.exploded = true;
  removeProjectile(bullet);
  const centerX = bullet.x + bullet.width / 2, centerY = bullet.y + bullet.height / 2;
  const profile = bullet.launcherEffects;
  const primary = resolveExplosionEvent({ x: centerX, y: centerY, radius: bullet.explosionRadius,
    damage: bullet.damage, weaponId: bullet.weaponId, attackId: bullet.attackId,
    effectKind: "primary", chainReactionActive: profile?.chainReactionActive === true });
  let damageEnabled = !primary.waveCompleted;
  for (const offset of profile?.clusterOffsets || []) {
    const cluster = resolveExplosionEvent({ x: centerX + offset.x, y: centerY + offset.y,
      radius: bullet.explosionRadius, damage: bullet.damage, weaponId: bullet.weaponId,
      attackId: bullet.attackId, effectKind: "cluster",
      chainReactionActive: profile.chainReactionActive, damageEnabled });
    if (cluster.waveCompleted) damageEnabled = false;
  }
  commitSiegeBloom(bullet, centerX, centerY);
  return primary;
}

function handleBulletEnemyCollisions() {
  const traversal = bullets.slice().reverse();
  for (const bullet of traversal) {
    if (!bullets.includes(bullet)) continue;
    prepareProjectileHitState(bullet);

    for (const enemy of enemies.slice().reverse()) {
      if (!isCurrentEncounterEnemy(enemy)) continue;

      if (!bullet.hitTargets.has(enemy) && isOverlapping(bullet, enemy)) {
        if (bullet.explosionRadius > 0) {
          const explosion = explodeProjectile(bullet);
          if (explosion.waveCompleted || isChoosingUpgrade || isGameOver) return;
          break;
        }
        const hitResolution = resolveBurstProjectileHit(bullet, enemy);
        const hpBefore = enemy.hp;
        const projectileRemoved = consumeProjectileHit(bullet, enemy);
        const result = damageRegularEnemy(enemy, hitResolution.damage,
          { weaponId: bullet.weaponId || "starter",
            hitKind: hitResolution.execution ? "execution" : bullet.burstFollowup ? "double-tap" : "projectile" });
        completeBurstProjectileHit(bullet, enemy, hitResolution, result, hpBefore);
        if (result.waveCompleted || isChoosingUpgrade || isGameOver) return;
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

  ContinuousEncounter.resetProgressReadiness(encounterController, "run-ended");
  clearInput();
  clearWeaponActions();
  clearPendingLauncherEffects();

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
      if (bullet.explosionRadius > 0) explodeProjectile(bullet);
      else {
        const hitResolution = resolveBurstProjectileHit(bullet, boss);
        const hpBefore = boss.hp;
        consumeProjectileHit(bullet, boss);
        const result = damageBoss(boss, hitResolution.damage, { weaponId: bullet.weaponId || "starter",
          hitKind: hitResolution.execution ? "execution" : bullet.burstFollowup ? "double-tap" : "projectile" });
        completeBurstProjectileHit(bullet, boss, hitResolution, result, hpBefore);
      }

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
    currentUpgradeChoices = RunBuild.generateRewardChoices(
      buildState,
      3,
      upgradeRng || (upgradeRng = createUpgradeRng()),
      weaponSlots.map(slot => slot.weaponId)
    );

    if (currentUpgradeChoices.length === 0) {
      upgradeTitle.textContent = "BUILD MAXED";
      upgradeMessage.textContent = "All upgrades are at maximum.";
      renderBuildPanel();
      continue;
    }

    isChoosingUpgrade = true;
    audioManager.play("levelUp");
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

  const result = RunBuild.applyReward(buildState, upgrade.id, {
    playerHp: player.hp,
    basePlayer: RunBuild.PLAYER_BASE_STATS,
    loadout: weaponSlots.map(slot => slot.weaponId)
  });
  if (!result.applied) return;

  buildState = result.buildState;
  weapon = RunBuild.resolveWeaponStats(Weapons.DEFINITIONS[weaponSlots[activeWeaponSlotIndex].weaponId], buildState);
  playerStats = RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, buildState);
  player.speed = playerStats.speed;
  player.maxHp = playerStats.maxHp;
  player.hp = Math.min(player.maxHp, result.playerHp ?? player.hp);
  if (result.discoveries.length) {
    comboNotificationTimer = 2.6;
    comboNotification.textContent = `COMBO DISCOVERED — ${result.discoveries[0].name.toUpperCase()}`;
    comboNotification.hidden = false;
    for (const combo of result.discoveries) observeTelemetry("recordComboDiscovery", () => ({
      comboId: combo.id, comboName: combo.name, build: buildState
    }));
  }
  observeTelemetry("recordUpgradeChoice", () => ({
    playerLevel: level,
    offeredRewards: currentUpgradeChoices.map(choice => ({ id: choice.id, category: choice.category,
      weaponId: choice.weaponId || null })),
    selectedRewardId: upgrade.id,
    rewardRng: { seed: rewardRngSeed, state: upgradeRng?.getState?.() ?? null }
  }));
  observeTelemetry("recordUpgrade", () => ({
    playerLevel: level,
    upgradeId: upgrade.id,
    upgradeName: upgrade.name,
    rewardCategory: upgrade.category,
    weaponId: upgrade.weaponId || null,
    rankBefore: result.rankBefore,
    rankAfter: result.rankAfter,
    upgradeStack: result.rankAfter,
    weapon,
    player: telemetryPlayer(),
    build: buildState
  }));
  if (upgrade.category === RunBuild.REWARD_CATEGORIES.WEAPON_EVOLUTION) {
    observeTelemetry("recordEvolutionAcquisition", () => ({
      evolutionId: upgrade.id, weaponId: upgrade.weaponId, playerLevel: level, build: buildState
    }));
  }
  isChoosingUpgrade = false;
  currentUpgradeChoices = [];
  upgradeOverlay.hidden = true;
  upgradeChoices.textContent = "";
  clearInput();
  renderBuildPanel();
  updateLevel();
}

function handlePlayerEnemyCollisions() {
  rebuildEnemySpatialHash();
  const overlapping = [...nearbyEnemies(player)].filter(enemy =>
    isCurrentEncounterEnemy(enemy) && isOverlapping(player, enemy));
  const initialPenetrations = new Map(overlapping.map(enemy => [enemy, playerEnemyPenetration(enemy)]));

  // Damage eligibility is determined from the same pre-resolution snapshot.
  // Otherwise separating one enemy can move the player out of a second enemy
  // before that enemy's independent attack policy has been evaluated.
  for (const enemy of overlapping) {
    const enemyIndex = enemies.indexOf(enemy);
    if (enemyIndex < 0) continue;
    const policy = Encounters.ENEMIES[enemy.type].behavior.attackPolicy;
    const runtime = enemy.behaviorRuntime;
    if (policy === "contact") {
      observeTelemetry("recordEnemyRemoval", () => ({ enemyType: enemy.type, reason: "contact" }));
      EnemyBehaviors.recordEnemyRemoval(enemy, hazards, enemies);
      takeDamage(enemy.damage ?? 1, enemy.type);
      enemy.lifecycle = ContinuousEncounter.LIFECYCLES.DEAD;
      enemies.splice(enemyIndex, 1);
      if (waveRuntime) waveRuntime.aliveEnemyCount = enemies.filter(candidate => candidate.hp > 0).length;
    } else if (policy === "strike" && runtime?.behaviorState === EnemyBehaviors.STATES.STRIKE && !runtime.attackDamageApplied) {
      runtime.attackDamageApplied = true;
      takeDamage(enemy.damage ?? 1, enemy.type);
    } else if (policy === "charge" && runtime?.behaviorState === EnemyBehaviors.STATES.CHARGE && !runtime.chargeContact) {
      EnemyBehaviors.recordEnemyContact(enemy, { emit: emitBehaviorTelemetry });
      takeDamage(enemy.damage ?? 1, enemy.type);
    }
    if (isGameOver) {
      for (const observed of overlapping) {
        observeTelemetry("recordPlayerEnemyOverlap", () => ({ enemyType: observed.type,
          penetration: initialPenetrations.get(observed), corrections: 0 }));
      }
      return;
    }
  }

  rebuildEnemySpatialHash();
  for (const enemy of overlapping) {
    const result = enemies.includes(enemy) && isOverlapping(player, enemy)
      ? resolvePlayerEnemyOverlap(enemy) : { corrections: 0 };
    observeTelemetry("recordPlayerEnemyOverlap", () => ({ enemyType: enemy.type,
      penetration: initialPenetrations.get(enemy), corrections: result.corrections || 0 }));
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
  return battlefieldRuntime
    ? Battlefields.isInsideBounds(rectangle, battlefieldRuntime)
    : rectangle.x >= 0 && rectangle.x + rectangle.width <= canvas.width &&
      rectangle.y >= 0 && rectangle.y + rectangle.height <= canvas.height;
}

function pushEnemy(enemy, movementX, movementY) {
  return tryMoveEnemy(enemy, movementX, movementY);
}

function hasOtherEnemyCollision(enemy) {
  for (const otherEnemy of nearbyEnemies(enemy)) {
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

function playerEnemyPenetration(enemy, playerBody = player) {
  const x = Math.min(playerBody.x + playerBody.width - enemy.x,
    enemy.x + enemy.width - playerBody.x);
  const y = Math.min(playerBody.y + playerBody.height - enemy.y,
    enemy.y + enemy.height - playerBody.y);
  return x > 0 && y > 0 ? Math.min(x, y) : 0;
}

function totalPlayerEnemyPenetration(playerBody = player) {
  let total = 0;
  for (const enemy of nearbyEnemies(playerBody)) {
    if (isCurrentEncounterEnemy(enemy)) total += playerEnemyPenetration(enemy, playerBody);
  }
  return total;
}

function tryMovePlayerSeparation(amount, axis) {
  const before = totalPlayerEnemyPenetration(player);
  const movement = Battlefields.moveAxis(player, amount, axis, battlefieldRuntime);
  const candidate = { ...player, x: movement.x, y: movement.y };
  const after = totalPlayerEnemyPenetration(candidate);
  if (after >= before - COLLISION_EPSILON) return false;
  player.x = candidate.x; player.y = candidate.y;
  return true;
}

function resolvePlayerEnemyOverlap(enemy) {
  const initialPenetration = playerEnemyPenetration(enemy);
  if (initialPenetration <= 0) return { corrected: false, corrections: 0, initialPenetration: 0 };
  let corrections = 0;
  for (; corrections < 16 && playerEnemyPenetration(enemy) > COLLISION_EPSILON; corrections++) {
    const overlapX = Math.min(player.x + player.width - enemy.x, enemy.x + enemy.width - player.x);
    const overlapY = Math.min(player.y + player.height - enemy.y, enemy.y + enemy.height - player.y);
    const axis = overlapX <= overlapY ? "x" : "y";
    const playerCenter = axis === "x" ? player.x + player.width / 2 : player.y + player.height / 2;
    const enemyCenter = axis === "x" ? enemy.x + enemy.width / 2 : enemy.y + enemy.height / 2;
    const enemyDirection = enemyCenter >= playerCenter ? 1 : -1;
    const step = Math.min(4, (axis === "x" ? overlapX : overlapY) + COLLISION_EPSILON);
    const enemyMoved = tryMoveEnemy(enemy, axis === "x" ? enemyDirection * step : 0,
      axis === "y" ? enemyDirection * step : 0);
    if (!enemyMoved && !tryMovePlayerSeparation(-enemyDirection * step, axis)) break;
    rebuildEnemySpatialHash();
  }
  return { corrected: corrections > 0, corrections, initialPenetration,
    remainingPenetration: playerEnemyPenetration(enemy) };
}

function getEnemyCollisionState(enemy, x = enemy.x, y = enemy.y) {
  const candidate = { x, y, width: enemy.width, height: enemy.height };
  const colliders = new Set();
  let totalPenetration = 0;
  for (const otherEnemy of nearbyEnemies(candidate)) {
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
  const movement = Battlefields.traceMovement(enemy, movementX, movementY, battlefieldRuntime);
  const nextX = movement.x;
  const nextY = movement.y;
  if (Math.hypot(nextX - enemy.x, nextY - enemy.y) <= COLLISION_EPSILON) return false;

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
    if (!Battlefields.isStaticPositionValid(candidate, battlefieldRuntime)) continue;
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

function enemyEnemyPenetration(first, second) {
  const overlapX = Math.min(first.x + first.width - second.x,
    second.x + second.width - first.x);
  const overlapY = Math.min(first.y + first.height - second.y,
    second.y + second.height - first.y);
  if (overlapX <= 0 || overlapY <= 0) return null;
  return { x: overlapX, y: overlapY, depth: Math.min(overlapX, overlapY) };
}

function separateEnemyPair(first, second, maximumStep = ENEMY_SEPARATION_STEP) {
  const initial = enemyEnemyPenetration(first, second);
  if (!initial) return 0;
  const axes = initial.x <= initial.y ? ["x", "y"] : ["y", "x"];
  const firstOrder = Number.isFinite(first.runtimeId) ? first.runtimeId : enemies.indexOf(first);
  const secondOrder = Number.isFinite(second.runtimeId) ? second.runtimeId : enemies.indexOf(second);
  for (const axis of axes) {
    const firstCenter = axis === "x" ? first.x + first.width / 2 : first.y + first.height / 2;
    const secondCenter = axis === "x" ? second.x + second.width / 2 : second.y + second.height / 2;
    const direction = firstCenter === secondCenter
      ? (firstOrder <= secondOrder ? -1 : 1)
      : (firstCenter < secondCenter ? -1 : 1);
    const penetration = axis === "x" ? initial.x : initial.y;
    const correction = Math.min(maximumStep, penetration + COLLISION_EPSILON);
    let corrections = 0;
    const firstStep = correction / 2;
    if (tryMoveEnemy(first, axis === "x" ? direction * firstStep : 0,
      axis === "y" ? direction * firstStep : 0)) {
      corrections++;
      rebuildEnemySpatialHash();
    }
    const remaining = enemyEnemyPenetration(first, second);
    if (remaining) {
      const secondStep = corrections ? correction / 2 : correction;
      if (tryMoveEnemy(second, axis === "x" ? -direction * secondStep : 0,
        axis === "y" ? -direction * secondStep : 0)) {
        corrections++;
        rebuildEnemySpatialHash();
      }
    }
    if (corrections) return corrections;
  }
  if (recoverEnemyOverlap(first, maximumStep)) return 1;
  if (recoverEnemyOverlap(second, maximumStep)) return 1;
  return 0;
}

function resolveEnemyEnemyOverlaps() {
  const order = new Map(enemies.map((enemy, index) => [enemy, index]));
  let overlapEvents = 0;
  let separationCorrections = 0;
  let maxPenetration = 0;
  for (let pass = 0; pass < ENEMY_SEPARATION_MAX_PASSES; pass++) {
    rebuildEnemySpatialHash();
    const visitedPairs = new Set();
    let passCorrections = 0;
    for (const first of enemies) {
      if (!isCurrentEncounterEnemy(first)) continue;
      for (const second of nearbyEnemies(first)) {
        if (first === second || !isCurrentEncounterEnemy(second)) continue;
        const firstIndex = order.get(first), secondIndex = order.get(second);
        const lower = Math.min(firstIndex, secondIndex), upper = Math.max(firstIndex, secondIndex);
        const pairKey = `${lower}:${upper}`;
        if (visitedPairs.has(pairKey)) continue;
        visitedPairs.add(pairKey);
        const penetration = enemyEnemyPenetration(first, second);
        if (!penetration) continue;
        if (pass === 0) {
          overlapEvents++;
          maxPenetration = Math.max(maxPenetration, penetration.depth);
        }
        const corrections = separateEnemyPair(first, second);
        passCorrections += corrections;
        separationCorrections += corrections;
      }
    }
    if (passCorrections === 0) break;
  }
  rebuildEnemySpatialHash();
  return { overlapEvents, separationCorrections, maxPenetration };
}

function moveEnemyTowardPlayer(enemy, deltaTime) {
  enemy.navigationRuntime ||= Battlefields.createNavigationRuntime(enemy.runtimeId);
  const rejoinsAtAnchor = [ContinuousEncounter.LIFECYCLES.ENTERING, ContinuousEncounter.LIFECYCLES.RETURNING].includes(enemy.lifecycle);
  if (rejoinsAtAnchor && !enemy.entryAnchor) return;
  const navigationTarget = rejoinsAtAnchor
    ? { x: enemy.entryAnchor.x, y: enemy.entryAnchor.y, width: enemy.width, height: enemy.height } : player;
  const intent = Battlefields.navigationIntent(enemy, navigationTarget, battlefieldRuntime,
    enemy.navigationRuntime, deltaTime);
  if (intent.requested) observeTelemetry("recordPathRequest");
  if (intent.failed) observeTelemetry("recordPathFailure");
  if (intent.fallback) observeTelemetry("recordNavigationFallback");
  let directionX = intent.destination.x - enemy.x;
  let directionY = intent.destination.y - enemy.y;
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength <= 0) return;
  directionX /= directionLength;
  directionY /= directionLength;
  const movementX = directionX * enemy.speed * deltaTime;
  const movementY = directionY * enemy.speed * deltaTime;
  const startX = enemy.x;
  const startY = enemy.y;
  const waypointIndexBefore = enemy.navigationRuntime.waypointIndex;
  const remainingBefore = intent.remainingDistance;
  const movedDirectly = tryMoveEnemy(enemy, movementX, movementY);
  let movedX = false;
  let movedY = false;
  if (!movedDirectly) {
    movedX = tryMoveEnemy(enemy, movementX, 0);
    movedY = tryMoveEnemy(enemy, 0, movementY);
  }
  if (!movedDirectly && !movedX && !movedY && recoverEnemyOverlap(enemy, enemy.speed * deltaTime)) {
    observeTelemetry("recordNavigationFallback");
  }
  const movedDistance = Math.hypot(enemy.x - startX, enemy.y - startY);
  const recovered = Battlefields.recordNavigationProgress(enemy.navigationRuntime, {
    attemptedDistance: Math.min(enemy.speed * deltaTime, directionLength), movedDistance, deltaTime,
    beforeDistance: remainingBefore,
    afterDistance: Battlefields.navigationRemainingDistance(enemy, enemy.navigationRuntime),
    waypointIndexBefore, waypointIndexAfter: enemy.navigationRuntime.waypointIndex
  });
  if (recovered) {
    observeTelemetry("recordForcedRepath");
    observeTelemetry("recordStuckRecovery", () => ({
      noProgressDuration: enemy.navigationRuntime.lastRecoveryDuration
    }));
  }
}

function moveEnemyToRange(enemy, preferredRange, deltaTime, hasLineOfSight) {
  const enemyCenterX = enemy.x + enemy.width / 2;
  const enemyCenterY = enemy.y + enemy.height / 2;
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  const offsetX = enemyCenterX - playerCenterX;
  const offsetY = enemyCenterY - playerCenterY;
  const distance = Math.hypot(offsetX, offsetY);
  if (distance >= preferredRange[0] || distance <= COLLISION_EPSILON) {
    moveEnemyTowardPlayer(enemy, deltaTime);
    return;
  }
  const directionX = offsetX / distance;
  const directionY = offsetY / distance;
  const step = enemy.speed * deltaTime;
  if (tryMoveEnemy(enemy, directionX * step, directionY * step)) return;
  if (tryMoveEnemy(enemy, directionX * step, 0)) return;
  if (tryMoveEnemy(enemy, 0, directionY * step)) return;
  const turn = (enemy.runtimeId || 0) % 2 ? 1 : -1;
  tryMoveEnemy(enemy, -directionY * step * turn, directionX * step * turn);
}

function moveEnemyCharge(enemy, directionX, directionY, speed, deltaTime) {
  const startX = enemy.x;
  const startY = enemy.y;
  const desiredX = enemy.x + directionX * speed * deltaTime;
  const desiredY = enemy.y + directionY * speed * deltaTime;
  const bounds = battlefieldRuntime.definition.bounds;
  const targetX = Math.max(0, Math.min(desiredX, bounds.width - enemy.width));
  const targetY = Math.max(0, Math.min(desiredY, bounds.height - enemy.height));
  const staticMovement = Battlefields.traceMovement(enemy, targetX - enemy.x,
    targetY - enemy.y, battlefieldRuntime);
  if (Math.hypot(staticMovement.movementX, staticMovement.movementY) > COLLISION_EPSILON) {
    tryMoveEnemy(enemy, staticMovement.movementX, staticMovement.movementY);
  }
  return { distance: Math.hypot(enemy.x - startX, enemy.y - startY),
    reachedBoundary: targetX !== desiredX || targetY !== desiredY || Boolean(staticMovement.collision) };
}

function emitBehaviorTelemetry(method, details) {
  observeTelemetry(method, () => details);
  const cueByEvent = {
    recordInterceptorAttempt: "interceptorTelegraph", recordInterceptorCommit: "interceptorCharge",
    recordTankSlamTelegraph: "tankSlamTelegraph", recordTankSlamImpact: "tankSlamImpact",
    recordGunnerBurst: "gunnerBurst", recordArtilleryWarning: "artilleryWarning",
    recordArtilleryImpact: "artilleryImpact", recordDenierCast: "denierCast",
    recordSupportLinkCreated: "supportLinkOn", recordSupportLinkBroken: "supportLinkOff", recordTrapperArm: "trapperArm",
    recordTrapperTrigger: "trapperTrigger", recordTetherConnect: "tetherConnect",
    recordTetherBreak: "tetherBreak"
  };
  const cue = cueByEvent[method];
  if (cue) {
    const source = enemies.find(enemy => enemy.runtimeId === details?.enemyId || enemy.runtimeId === details?.supportId);
    audioManager.play(cue, { world: true, pan: source ? worldAudioPan(source) : 0 });
  }
}

function moveEnemyProjectile(projectile, movementX, movementY) {
  const movement = Battlefields.traceMovement(projectile, movementX, movementY, battlefieldRuntime);
  projectile.x = movement.x;
  projectile.y = movement.y;
  return { blocked: movement.reachedBoundary || Boolean(movement.collision?.blocksProjectiles) };
}

function updateEnemies(deltaTime) {
  const bounds = battlefieldRuntime.definition.bounds;
  EnemyBehaviors.updateEnemies({ enemies, definitions: Encounters.ENEMIES, hazards,
    player, playerVelocity, deltaTime, arena: bounds,
    isActive: canEnemyAct, moveChase: moveEnemyTowardPlayer,
    moveToRange: moveEnemyToRange,
    moveCharge: moveEnemyCharge,
    damagePlayer: takeDamage,
    overlaps: isOverlapping,
    moveEnemyProjectile,
    hasLineOfSight: (enemy, target) => Battlefields.hasLineOfTravel(enemy, target, battlefieldRuntime),
    resolvePlayablePoint: point => Battlefields.nearestPlayablePoint(point, battlefieldRuntime),
    emit: emitBehaviorTelemetry });
  const separation = resolveEnemyEnemyOverlaps();
  if (separation.overlapEvents > 0) {
    observeTelemetry("recordEnemyEnemyOverlap", () => separation);
  }
}

function lockBossChargeDirection() {
  const directionX = player.x + player.width / 2 - (boss.x + boss.width / 2);
  const directionY = player.y + player.height / 2 - (boss.y + boss.height / 2);
  const directionLength = Math.hypot(directionX, directionY);
  bossRuntime.chargeDirectionX = directionLength > 0 ? directionX / directionLength : 1;
  bossRuntime.chargeDirectionY = directionLength > 0 ? directionY / directionLength : 0;
  const cycle = Encounters.BOSSES[bossRuntime.encounterId].chargeCycle;
  bossRuntime.chargePlannedDistance = Math.min(directionLength,
    cycle.chargeSpeed * cycle.chargeDuration);
}

function isBossChargeLaneViable() {
  const plannedDistance = bossRuntime.chargePlannedDistance || 0;
  if (plannedDistance <= COLLISION_EPSILON) return true;
  const movement = Battlefields.traceMovement(boss,
    bossRuntime.chargeDirectionX * plannedDistance,
    bossRuntime.chargeDirectionY * plannedDistance, battlefieldRuntime);
  return !movement.collision || Math.hypot(movement.movementX, movement.movementY) +
    Battlefields.GRID_CELL_SIZE >= plannedDistance;
}

function recoverBossObstruction() {
  bossRuntime.phase = BOSS_PHASES.CHASE;
  bossRuntime.phaseElapsed = 0;
  bossRuntime.chaseDuration = Encounters.BOSSES[bossRuntime.encounterId].chargeCycle.chaseDuration;
  observeTelemetry("recordBossObstruction");
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
  if (bossRuntime.phase === BOSS_PHASES.CHASE) {
    lockBossChargeDirection();
    if (!isBossChargeLaneViable()) recoverBossObstruction();
    else enterBossPhase(BOSS_PHASES.TELEGRAPH);
  } else if (bossRuntime.phase === BOSS_PHASES.TELEGRAPH) {
    if (!isBossChargeLaneViable()) recoverBossObstruction();
    else enterBossPhase(BOSS_PHASES.CHARGE);
  }
  else if (bossRuntime.phase === BOSS_PHASES.CHARGE) enterBossPhase(BOSS_PHASES.RECOVERY);
  else enterBossPhase(BOSS_PHASES.CHASE);
}

function moveBossTowardPlayer(deltaTime) {
  bossRuntime.navigationRuntime ||= Battlefields.createNavigationRuntime(0);
  const intent = Battlefields.navigationIntent(boss, player, battlefieldRuntime,
    bossRuntime.navigationRuntime, deltaTime);
  if (intent.requested) observeTelemetry("recordPathRequest");
  if (intent.failed) observeTelemetry("recordPathFailure");
  if (intent.fallback) observeTelemetry("recordNavigationFallback");
  let directionX = intent.destination.x - boss.x;
  let directionY = intent.destination.y - boss.y;
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength <= 0) return;
  directionX /= directionLength;
  directionY /= directionLength;
  const attemptedDistance = Math.min(boss.speed * deltaTime, directionLength);
  const waypointIndexBefore = bossRuntime.navigationRuntime.waypointIndex;
  const remainingBefore = intent.remainingDistance;
  const startX = boss.x;
  const startY = boss.y;
  const movement = Battlefields.traceMovement(boss,
    directionX * attemptedDistance, directionY * attemptedDistance, battlefieldRuntime);
  boss.x = movement.x;
  boss.y = movement.y;
  if (movement.collision) {
    boss.x = startX;
    boss.y = startY;
    boss.x = Battlefields.moveAxis(boss, directionX * attemptedDistance, "x", battlefieldRuntime).x;
    boss.y = Battlefields.moveAxis(boss, directionY * attemptedDistance, "y", battlefieldRuntime).y;
  }
  const recovered = Battlefields.recordNavigationProgress(bossRuntime.navigationRuntime, {
    attemptedDistance, movedDistance: Math.hypot(boss.x - startX, boss.y - startY), deltaTime,
    beforeDistance: remainingBefore,
    afterDistance: Battlefields.navigationRemainingDistance(boss, bossRuntime.navigationRuntime),
    waypointIndexBefore, waypointIndexAfter: bossRuntime.navigationRuntime.waypointIndex
  });
  if (recovered) {
    observeTelemetry("recordForcedRepath");
    observeTelemetry("recordStuckRecovery", () => ({
      noProgressDuration: bossRuntime.navigationRuntime.lastRecoveryDuration
    }));
    observeTelemetry("recordBossObstruction");
  }
  bossRuntime.collisionPhase = BOSS_PHASES.CHASE;
}

function moveBossCharge(deltaTime) {
  const cycle = Encounters.BOSSES[bossRuntime.encounterId].chargeCycle;
  const nextX = boss.x + bossRuntime.chargeDirectionX * cycle.chargeSpeed * deltaTime;
  const nextY = boss.y + bossRuntime.chargeDirectionY * cycle.chargeSpeed * deltaTime;
  const bounds = battlefieldRuntime.definition.bounds;
  const maxX = bounds.width - boss.width;
  const maxY = bounds.height - boss.height;
  const targetX = Math.max(0, Math.min(nextX, maxX));
  const targetY = Math.max(0, Math.min(nextY, maxY));
  const movement = Battlefields.traceMovement(boss, targetX - boss.x,
    targetY - boss.y, battlefieldRuntime);
  boss.x = movement.x;
  boss.y = movement.y;
  bossRuntime.collisionPhase = BOSS_PHASES.CHARGE;
  return Boolean(movement.collision) || targetX !== nextX || targetY !== nextY ||
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

function drawEnemyVisual(targetContext, type, x, y, width, height, preview = false) {
  targetContext.save();
  targetContext.fillStyle = enemyColors[type] || "#dc2626";
  targetContext.strokeStyle = "#05070b";
  targetContext.lineWidth = Math.max(3, Math.min(width, height) * 0.08);
  targetContext.fillRect(x, y, width, height);
  targetContext.strokeRect(x, y, width, height);
  if (preview && ["denier", "artillery", "trapper"].includes(type)) {
    targetContext.beginPath();
    targetContext.arc(x + width * 0.72, y + height * 0.82, width * 0.38, 0, Math.PI * 2);
    targetContext.fillStyle = "rgba(251,113,133,.18)";
    targetContext.strokeStyle = "#fda4af";
    targetContext.fill(); targetContext.stroke();
  }
  if (preview && ["support", "tether"].includes(type)) {
    targetContext.strokeStyle = type === "support" ? "#5eead4" : "#67e8f9";
    targetContext.lineWidth = 5;
    targetContext.beginPath();
    targetContext.moveTo(x + width, y + height / 2);
    targetContext.lineTo(x + width * 1.65, y + height * 0.25);
    targetContext.stroke();
  }
  targetContext.restore();
}

function renderEnemyPreview(targetCanvas, type, { hidden = false } = {}) {
  const previewContext = targetCanvas?.getContext?.("2d");
  if (!previewContext) return;
  previewContext.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  if (hidden) {
    previewContext.save();
    previewContext.fillStyle = "#374151";
    previewContext.fillRect(targetCanvas.width / 2 - 28, targetCanvas.height / 2 - 28, 56, 56);
    previewContext.restore();
    return;
  }
  const definition = Encounters.ENEMIES[type];
  if (!definition) return;
  const scale = Math.min(72 / definition.visualWidth, 72 / definition.visualHeight);
  const width = definition.visualWidth * scale, height = definition.visualHeight * scale;
  drawEnemyVisual(previewContext, type, targetCanvas.width / 2 - width / 2,
    targetCanvas.height / 2 - height / 2, width, height, true);
}

function renderIntroductionPreview(type) {
  renderEnemyPreview(enemyIntroductionIcon, type);
}

function renderEnemyCodex() {
  if (!enemyCodexGrid) return;
  enemyCodexGrid.textContent = "";
  for (const type of Object.keys(Encounters.ENEMIES)) {
    const discovered = enemyDiscovery.has(type);
    const introduction = Encounters.COMBAT_VARIETY_V1.introductions[type];
    const definition = Encounters.ENEMIES[type];
    const card = document.createElement("article");
    card.className = `codex-card${discovered ? "" : " codex-card-unknown"}`;
    const preview = document.createElement("canvas");
    preview.width = 180; preview.height = 110; preview.className = "codex-preview";
    renderEnemyPreview(preview, discovered ? type : null, { hidden: !discovered });
    const title = document.createElement("strong");
    title.textContent = discovered ? introduction.name : "Unknown Enemy";
    const detail = document.createElement("div");
    detail.className = "codex-detail";
    if (discovered) {
      const policy = definition.behavior.attackPolicy.replace(/-/g, " ");
      detail.textContent = `${introduction.role} · ${introduction.description} ` +
        `Mechanism: ${policy}. ${introduction.counterplay}`;
    } else {
      detail.textContent = "Discover this enemy in combat to reveal its identity.";
    }
    card.append(preview, title, detail);
    enemyCodexGrid.append(card);
  }
}

function drawEnemies() {
  for (const enemy of enemies) {
    if (!isWorldVisible(enemy, 12)) continue;
    drawEnemyVisual(ctx, enemy.type, enemy.x, enemy.y, enemy.visualWidth, enemy.visualHeight);
    drawHealthBar(enemy);
  }
}

function drawBoss() {
  if (!boss || !isWorldVisible(boss, 24)) {
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
    const bounds = battlefieldRuntime.definition.bounds;
    const telegraphLength = Math.hypot(bounds.width, bounds.height);
    ctx.lineTo(centerX + bossRuntime.chargeDirectionX * telegraphLength,
      centerY + bossRuntime.chargeDirectionY * telegraphLength);
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
  for (const bullet of bullets) {
    if (!isWorldVisible(bullet, 8)) continue;
    ctx.fillStyle = bullet.burstFollowup ? "#67e8f9" :
      bullet.burstShotIndex === 3 && bullet.burstSequence?.weaponSnapshot?.burstEffects?.executionProtocol
        ? "#fef08a" : "#facc15";
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

function drawWeaponEffects() {
  for (const effect of weaponEffects) {
    const alpha = Math.max(0, 1 - effect.elapsed / effect.duration);
    ctx.save();
    if (effect.kind === "arc") {
      ctx.fillStyle = `rgba(147,197,253,${0.32 * alpha})`;
      ctx.strokeStyle = `rgba(219,234,254,${0.9 * alpha})`;
      ctx.beginPath(); ctx.moveTo(effect.x, effect.y);
      ctx.arc(effect.x, effect.y, effect.range, effect.angle - effect.halfAngle,
        effect.angle + effect.halfAngle); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (effect.kind === "explosion") {
      const bloom = effect.effectKind === "siege-bloom";
      const cluster = effect.effectKind === "cluster";
      ctx.fillStyle = bloom ? `rgba(192,132,252,${0.3 * alpha})` :
        cluster ? `rgba(250,204,21,${0.26 * alpha})` : `rgba(251,146,60,${0.28 * alpha})`;
      ctx.strokeStyle = bloom ? `rgba(233,213,255,${0.95 * alpha})` :
        cluster ? `rgba(254,249,195,${0.9 * alpha})` : `rgba(254,215,170,${0.9 * alpha})`;
      ctx.lineWidth = bloom ? 5 : cluster ? 2 : 3;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (bloom) {
        ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * 0.55, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (effect.kind === "execution") {
      ctx.strokeStyle = `rgba(103,232,249,${0.95 * alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, 20 + 10 * (1 - alpha), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBattlefield() {
  if (!battlefieldRuntime) return;
  for (const obstacle of battlefieldRuntime.definition.obstacles) {
    if (!isWorldVisible(obstacle, 8)) continue;
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    ctx.fillStyle = "#475569";
    ctx.fillRect(obstacle.x + 5, obstacle.y + 5,
      Math.max(0, obstacle.width - 10), Math.max(0, obstacle.height - 10));
    ctx.fillStyle = "rgba(148, 163, 184, 0.38)";
    ctx.fillRect(obstacle.x + 5, obstacle.y + 5, Math.max(0, obstacle.width - 10), 5);
  }
}

function drawBehaviorArena() {
  const living = enemies.filter(isCurrentEncounterEnemy);
  EnemyBehaviors.drawArenaCues(ctx, living, hazards, Encounters.ENEMIES, {
    bounds: battlefieldRuntime.definition.bounds,
    player,
    isVisible: isWorldVisible
  });
}

function isWorldVisible(body, padding = 0) {
  return !cameraRuntime || GameLayout.intersectsCamera(body, cameraRuntime, padding);
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

function addBuildDetailSection(title, entries) {
  const section = document.createElement("section");
  section.className = "build-detail-section";
  section.dataset.section = title.toLowerCase().replaceAll(" ", "-");
  const list = document.createElement("ul");
  for (const entry of entries.length ? entries : ["Empty"]) {
    list.append(textElement("li", entries.length ? "" : "empty", entry));
  }
  section.append(textElement("h3", "", title.toUpperCase()), list);
  buildDetailContent.append(section);
  return section;
}

function buildRankLabel(rank) {
  return ["", "I", "II", "III", "IV"][rank] || String(rank);
}

function renderBuildDetail() {
  if (!buildDetailContent) return;
  clearElement(buildDetailContent);
  addBuildDetailSection("Shared Upgrades", Object.values(RunBuild.SHARED_UPGRADES)
    .filter(item => RunBuild.getSharedUpgradeRank(buildState, item.id) > 0)
    .map(item => `${item.name} · Rank ${RunBuild.getSharedUpgradeRank(buildState, item.id)}`));
  for (const slot of weaponSlots) {
    const definition = Weapons.DEFINITIONS[slot.weaponId];
    const mods = Object.values(RunBuild.WEAPON_MODS)
      .filter(item => item.weaponId === slot.weaponId && RunBuild.getWeaponModRank(buildState, slot.weaponId, item.id) > 0)
      .map(item => `${item.displayName} ${buildRankLabel(RunBuild.getWeaponModRank(buildState, slot.weaponId, item.id))}`);
    const evolutionId = RunBuild.getWeaponEvolution(buildState, slot.weaponId);
    if (evolutionId) mods.push(`Evolution · ${RunBuild.WEAPON_EVOLUTIONS[evolutionId].displayName}`);
    addBuildDetailSection(`${definition.name} Mods`, mods);
  }
  const passiveEntries = Object.values(RunBuild.PASSIVES)
    .filter(item => RunBuild.getPassiveRank(buildState, item.id) > 0)
    .map(item => `${item.name} · Rank ${RunBuild.getPassiveRank(buildState, item.id)}`);
  while (passiveEntries.length < 3) passiveEntries.push("Empty Passive Slot");
  addBuildDetailSection("Passives", passiveEntries);
  if (buildState.discoveredCombos.length) {
    addBuildDetailSection("Combos", buildState.discoveredCombos.map(id => {
      const combo = RunBuild.COMBOS[id];
      return `${combo.name} · ${combo.description}`;
    }));
  }
}

function openBuildDetail() {
  if (!isGameStarted || isGameOver || isVictory || isAbandoned || isChoosingUpgrade ||
      isAbandonConfirmOpen || [RUN_PHASES.INTRODUCTION_PENDING, RUN_PHASES.INTRODUCTION_ACTIVE].includes(runPhase)) return false;
  isBuildDetailOpen = true;
  clearInput();
  renderBuildDetail();
  buildDetailOverlay.hidden = false;
  buildDetailClose.focus?.();
  return true;
}

function closeBuildDetail() {
  if (!isBuildDetailOpen) return false;
  isBuildDetailOpen = false;
  buildDetailOverlay.hidden = true;
  clearInput();
  buildDetailButton?.focus?.();
  return true;
}

// Playtest-only deterministic setup for exercising the authored Evolution and
// Combo through the real Level-Up selection path without a long XP grind.
function preparePlaytestBuildDemoStep() {
  if (!isPlaytestMode || !isGameStarted || isChoosingUpgrade || isBuildDetailOpen) return false;
  if (weaponSlots.some(slot => slot.weaponId === "burst")) {
    const steps = [
      { id: "tight-cadence", rank: 2 },
      { id: "heavy-shot", rank: 2 },
      { id: "execution-protocol", rank: 1 },
      { id: "rapid-fire", rank: 2 }
    ];
    const next = steps.find(step => RunBuild.getRewardRank(buildState, step.id) < step.rank);
    if (!next) {
      comboNotificationTimer = 2.6;
      comboNotification.textContent = "COMBO ACTIVE — DOUBLE TAP";
      comboNotification.hidden = false;
      return true;
    }
    currentUpgradeChoices = [RunBuild.REWARDS[next.id]];
    isChoosingUpgrade = true;
    clearInput();
    renderBuildPanel();
    renderUpgradeChoices();
    return true;
  }
  if (weaponSlots.some(slot => slot.weaponId === "launcher")) {
    const steps = [
      { id: "cluster-shell", rank: 2 },
      { id: "heavy-shot", rank: 2 },
      { id: "siege-bloom", rank: 1 },
      { id: "vitality", rank: 2 }
    ];
    const next = steps.find(step => RunBuild.getRewardRank(buildState, step.id) < step.rank);
    if (!next) {
      comboNotificationTimer = 2.6;
      comboNotification.textContent = "COMBO ACTIVE — CHAIN REACTION";
      comboNotification.hidden = false;
      return true;
    }
    currentUpgradeChoices = [RunBuild.REWARDS[next.id]];
    isChoosingUpgrade = true;
    clearInput();
    renderBuildPanel();
    renderUpgradeChoices();
    return true;
  }
  if (!weaponSlots.some(slot => slot.weaponId === "arc-blade")) {
    configureWeaponLoadout(["arc-blade", weaponSlots[0]?.weaponId || "starter"]);
  }
  const equipped = weaponSlots.map(slot => slot.weaponId);
  const applyUntil = (rewardId, targetRank) => {
    while (RunBuild.getRewardRank(buildState, rewardId) < targetRank) {
      const result = RunBuild.applyReward(buildState, rewardId, { loadout: equipped, playerHp: player.hp });
      if (!result.applied) break;
      buildState = result.buildState;
    }
  };
  if (!RunBuild.getWeaponEvolution(buildState, "arc-blade")) {
    applyUntil("rapid-fire", 2);
    applyUntil("wide-arc", 2);
    currentUpgradeChoices = [RunBuild.WEAPON_EVOLUTIONS["cyclone-blade"]];
  } else if (!RunBuild.hasDiscoveredCombo(buildState, "blade-dance")) {
    applyUntil("swift-feet", 1);
    currentUpgradeChoices = [RunBuild.PASSIVES["swift-feet"]];
  } else {
    comboNotificationTimer = 2.6;
    comboNotification.textContent = "COMBO ACTIVE — BLADE DANCE";
    comboNotification.hidden = false;
    return true;
  }
  weapon = RunBuild.resolveWeaponStats(Weapons.DEFINITIONS[weaponSlots[activeWeaponSlotIndex].weaponId], buildState);
  playerStats = RunBuild.resolvePlayerStats(RunBuild.PLAYER_BASE_STATS, buildState);
  player.speed = playerStats.speed;
  player.maxHp = playerStats.maxHp;
  isChoosingUpgrade = true;
  clearInput();
  renderBuildPanel();
  renderUpgradeChoices();
  return true;
}

function renderUpgradeChoices() {
  clearElement(upgradeChoices);
  upgradeTitle.textContent = "LEVEL UP";
  upgradeMessage.textContent = "Choose one upgrade. Press 1, 2, or 3.";
  currentUpgradeChoices.forEach((upgrade, index) => {
    const currentStack = RunBuild.getRewardRank(buildState, upgrade.id);
    const effectLines = RunBuild.getNextRewardEffectLines(buildState, upgrade.id);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "upgrade-card";
    card.dataset.choiceIndex = String(index);
    card.setAttribute?.("aria-label", `${index + 1}. ${upgrade.displayName || upgrade.name}. ${effectLines.join(". ")}. ${currentStack} of ${upgrade.maxRank}`);
    card.append(
      textElement("span", "upgrade-card-name", `${index + 1} · ${(upgrade.displayName || upgrade.name).toUpperCase()}`),
      textElement("span", "upgrade-card-effect", effectLines.join(" · ")),
      textElement("span", "upgrade-card-stack", `${upgrade.category.toUpperCase()} · ${currentStack} / ${upgrade.maxRank}`)
    );
    card.addEventListener("click", () => chooseUpgrade(String(index + 1)));
    upgradeChoices.append(card);
  });
  upgradeOverlay.hidden = false;
  upgradeChoices.children?.[0]?.focus?.();
}

function renderBuildPanel() {
  document.getElementById("buildWeaponName").textContent = weapon.name;
  document.getElementById("buildDamage").textContent = formatNumber(playerStats.damage);
  document.getElementById("buildFireRate").textContent = `${weapon.fireRate.toFixed(1)}/s`;
  document.getElementById("buildProjectileCount").textContent = weapon.projectileCount;
  document.getElementById("buildMoveSpeed").textContent = Math.round(player.speed);
  document.getElementById("buildMaxHp").textContent = player.maxHp;
  if (slotAValue) slotAValue.textContent = Weapons.DEFINITIONS[weaponSlots[0]?.weaponId]?.name || "Empty";
  if (slotBValue) slotBValue.textContent = Weapons.DEFINITIONS[weaponSlots[1]?.weaponId]?.name || "Empty";
  if (activeWeaponValue) activeWeaponValue.textContent = `${activeWeaponSlotIndex === 0 ? "A" : "B"}: ${weapon.name}`;

  const list = document.getElementById("buildUpgradeList");
  clearElement(list);
  const owned = [];
  for (const upgrade of Object.values(RunBuild.SHARED_UPGRADES)) {
    const value = RunBuild.getSharedUpgradeRank(buildState, upgrade.id);
    if (value) owned.push(`${upgrade.name} ×${value}`);
  }
  for (const passive of Object.values(RunBuild.PASSIVES)) {
    const value = RunBuild.getPassiveRank(buildState, passive.id);
    if (value) owned.push(`${passive.name} ×${value}`);
  }
  for (const slot of weaponSlots) for (const mod of Object.values(RunBuild.WEAPON_MODS)) {
    const value = RunBuild.getWeaponModRank(buildState, slot.weaponId, mod.id);
    if (value) owned.push(`${mod.displayName} ×${value}`);
  }
  for (const [weaponId, evolutionId] of Object.entries(buildState.weaponEvolutionByWeaponId)) {
    owned.push(`${Weapons.DEFINITIONS[weaponId].name} → ${RunBuild.WEAPON_EVOLUTIONS[evolutionId].name}`);
  }
  if (owned.length === 0) {
    list.append(textElement("li", "build-empty", "No upgrades yet."));
    return;
  }
  for (const entry of owned) list.append(textElement("li", "", entry));
  if (RunBuild.REWARD_LIST.every(reward => !RunBuild.canSelectReward(buildState, reward.id,
    weaponSlots.map(slot => slot.weaponId)))) {
    list.append(textElement("li", "build-maxed", "BUILD MAXED"));
  }
}

function updateHud() {
  hpValue.textContent = `${player.hp} / ${player.maxHp}`;
  scoreValue.textContent = score;
  levelValue.textContent = level;
  xpValue.textContent = `${xp} / ${xpToNextLevel}`;
  document.getElementById("stageValue").textContent = `STAGE ${stageIndex + 1}`;
  document.getElementById("waveValue").textContent = runPhase === RUN_PHASES.BOSS_ACTIVE ? "BOSS 1" :
    `WAVE ${(stageRuntime?.waveIndex ?? 0) + 1} / ${stageRuntime?.definition.waveCount ?? 0}`;
  backToHubButton.hidden = isChoosingUpgrade || isAbandonConfirmOpen || isBuildDetailOpen ||
    [RUN_PHASES.INTRODUCTION_PENDING, RUN_PHASES.INTRODUCTION_ACTIVE].includes(runPhase);
}

function updateArenaPresentation() {
  const showIntroduction = runPhase === RUN_PHASES.INTRODUCTION_ACTIVE && currentEnemyIntroduction &&
    !isGameOver && !isVictory && !isAbandoned;
  enemyIntroduction.hidden = !showIntroduction;
  if (showIntroduction) {
    enemyIntroductionName.textContent = currentEnemyIntroduction.name;
    enemyIntroductionRole.textContent = currentEnemyIntroduction.role;
    enemyIntroductionDescription.textContent = currentEnemyIntroduction.description;
    enemyIntroductionCounterplay.textContent = currentEnemyIntroduction.counterplay;
    renderIntroductionPreview(currentEnemyIntroduction.type);
  }
  const showWaveComing = runPhase === RUN_PHASES.WAVE_ACTIVE && waveComingBannerTimer > 0 &&
    !isGameOver && !isVictory && !isAbandoned;
  const showIntermission = runPhase === RUN_PHASES.INTERMISSION &&
    !isGameOver && !isVictory && !isAbandoned;
  intermissionBanner.hidden = !showIntermission && !showWaveComing;
  intermissionBanner.classList[showWaveComing ? "add" : "remove"]("wave-coming");
  intermissionBanner.classList[showIntermission ? "add" : "remove"]("boss-incoming");
  if (showWaveComing) {
    intermissionTitle.textContent = "WAVE COMING";
    intermissionDetail.textContent = "";
    intermissionCountdown.textContent = "";
  } else if (showIntermission) {
    intermissionTitle.textContent = `WAVE ${stageRuntime.waveIndex + 1} CLEAR`;
    intermissionDetail.textContent = "BOSS INCOMING";
    intermissionCountdown.textContent = String(Math.ceil(Math.max(0, Encounters.CONFIG.intermission - intermissionTimer)));
  }
  const edgeCounts = { top: 0, right: 0, bottom: 0, left: 0 };
  const showReinforcementEdges = runPhase === RUN_PHASES.WAVE_ACTIVE &&
    !isGameOver && !isVictory && !isAbandoned;
  if (showReinforcementEdges) {
    for (const enemy of enemies) if (enemy.lifecycle === ContinuousEncounter.LIFECYCLES.ENTERING &&
        enemy.reservationPhase === ContinuousEncounter.PHASES.WAVE_COMING && edgeCounts[enemy.spawnSide] !== undefined) {
      edgeCounts[enemy.spawnSide]++;
    }
    for (const pending of encounterController?.pendingReservations || []) {
      if (pending.reservation.phase === ContinuousEncounter.PHASES.WAVE_COMING && edgeCounts[pending.enemy.spawnSide] !== undefined) {
        edgeCounts[pending.enemy.spawnSide]++;
      }
    }
  }
  for (const indicator of reinforcementEdges.children) {
    const count = edgeCounts[indicator.dataset.edge] || 0;
    if (count) indicator.dataset.count = String(count); else delete indicator.dataset.count;
  }
}

function drawPhasePresentation() {
  let title = "", subtitle = "";
  if (runPhase === RUN_PHASES.STAGE_CLEAR) title = `STAGE ${stageIndex + 1} CLEAR`;
  if (isGameOver || isVictory || isAbandoned) {
    title = isAbandoned ? "ABANDONED" : isVictory ? "VICTORY" : "GAME OVER";
    subtitle = lastSettlement ? `Score ${lastSettlement.finalScore} · Points ${lastSettlement.points}` : "No secured checkpoint · Points 0";
    subtitle += " · Press R to Restart · Back to Hub above";
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
    playerSpeed: player.speed, speed: player.speed, maxHp: player.maxHp, damage: playerStats.damage,
    weapon: { ...weapon },
    loadout: { slotA: weaponSlots[0]?.weaponId || null, slotB: weaponSlots[1]?.weaponId || null,
      activeWeapon: weapon.id, activeSlot: activeWeaponSlotIndex === 0 ? "A" : "B" },
    build: RunBuild.createBuildState(buildState),
    rewardRng: { seed: rewardRngSeed, state: upgradeRng?.getState?.() ?? null } };
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
        battlefield: battlefieldRuntime ? { seed: battlefieldRuntime.seed,
          worldWidth: battlefieldRuntime.definition.bounds.width,
          worldHeight: battlefieldRuntime.definition.bounds.height,
          obstacleCount: battlefieldRuntime.definition.obstacles.length } : null,
        prototype: Encounters.isPrototypeEnabled(globalThis.location?.search || "") ? Encounters.COMBAT_VARIETY_V1.id : null,
        maxActiveThreatCurve: activeStages[0].maxActiveThreatCurve, enemies: Encounters.ENEMIES,
        clearTimeWeights: Encounters.CONFIG.clearTime, baseHandlingTime: Encounters.CONFIG.baseHandlingTime,
        bossExpectedClearTime: Encounters.BOSSES["boss-1"].analysis.expectedClearTime,
        maxActiveEnemies: Encounters.CONFIG.maxActiveEnemies,
        templates: Object.fromEntries(Object.entries(Encounters.TEMPLATES).map(([id, template]) => [id, { delays: template.delays }])),
        playerBaseStats: RunBuild.PLAYER_BASE_STATS,
        starterWeapon: Weapons.STARTER,
        weapons: Weapons.DEFINITIONS,
        continuousEncounter: { structure: ContinuousEncounter.STRUCTURE,
          calibration: ContinuousEncounter.CALIBRATION },
        buildContent: {
          rewards: Object.fromEntries(RunBuild.REWARD_LIST.map(reward => [reward.id, reward])),
          combos: RunBuild.COMBOS
        },
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
    const living = runPhase === RUN_PHASES.WAVE_ACTIVE ? enemies.filter(enemy => enemy.hp > 0) : [];
    const enemiesByType = {};
    living.forEach(enemy => { enemiesByType[enemy.type] = (enemiesByType[enemy.type] || 0) + 1; });
    const enemyOffscreenCount = living.filter(enemy => !isWorldVisible(enemy)).length;
    const bossOffscreen = runPhase === RUN_PHASES.BOSS_ACTIVE && boss && !isWorldVisible(boss);
    const cameraHasTerrain = battlefieldRuntime?.definition.obstacles
      .some(obstacle => isWorldVisible(obstacle));
    return { deltaTime, hp: player.hp, maxHp: player.maxHp, activeEnemyCount: living.length,
      activeThreat: living.reduce((sum, enemy) => sum + Encounters.ENEMIES[enemy.type].threatCost, 0), enemiesByType,
      enemyOffscreenCount, bossOffscreen, cameraHasTerrain,
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
let playtestTelemetry = null;
function ensurePlaytestTelemetry() {
  if (!playtestTelemetry) playtestTelemetry = initializePlaytestTelemetry();
  return playtestTelemetry;
}
let lastTime = null;

function gameLoop(timestamp) {
  const deltaTime = lastTime === null ? 0 : (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  if (currentView === APP_VIEWS.GAME) {
    update(deltaTime);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#7dd3fc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (cameraRuntime) ctx.translate(-cameraRuntime.x, -cameraRuntime.y);
    drawBattlefield();
    drawBehaviorArena();
    drawPlayer();
    drawWeaponEffects();
    drawEnemies();
    drawBoss();
    drawBullets();
    ctx.restore();
    drawWeaponDamage();
    updateArenaPresentation();
    drawPhasePresentation();
    updateHud();
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
