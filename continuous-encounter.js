// Production Continuous Encounter controller.
// Structural rules are locked design contracts; CALIBRATION values are provisional playtest tuning.
(function (global) {
  const STRUCTURE = Object.freeze({
    viewportWidth: 800,
    viewportHeight: 600,
    playerSpawnExclusionRadius: 100,
    normalFillMinimum: 0.15,
    normalFillTarget: 0.20,
    normalFillMaximum: 0.25,
    controllerCeiling: 0.70,
    distanceBands: Object.freeze({
      NEAR: Object.freeze([0.08, 0.20]),
      MID: Object.freeze([0.20, 0.40]),
      FAR: Object.freeze([0.40, 0.70])
    })
  });

  const CALIBRATION = Object.freeze({
    turnoverCycles: 1.5,
    normalAreaRate: 0.12,
    comingAreaRate: 0.32,
    creditCapFill: 0.14,
    waveComingDeltaMinimum: 0.20,
    waveComingDeltaMaximum: 0.30,
    normalDispatchMaximum: 2,
    normalDispatchInterval: 0.20,
    comingDispatchMaximum: 3,
    comingDispatchInterval: 0.15,
    maxManagedRegularEnemies: 40,
    progressReadinessDuration: 0.5,
    openingRamp: Object.freeze([
      Object.freeze({ until: 2, target: 0.05 }),
      Object.freeze({ until: 5, target: 0.15 }),
      Object.freeze({ until: Infinity, target: 0.20 })
    ]),
    placementAttemptsPerBand: 8,
    placementCandidateScanLimit: 48,
    entryAnchorMinimumInset: 72,
    entryCrowdingRadius: 180,
    largeClearancePadding: 12,
    openSpacePadding: 32,
    recentHistoryLength: 6,
    recencyMultipliers: Object.freeze([0.35, 0.50, 0.65, 0.80, 0.90, 1]),
    streakMultiplier: 0.55,
    mechanicCaps: Object.freeze({
      interceptor: 6, denier: 6, support: 4, gunner: 8,
      artillery: 4, trapper: 6, tether: 4
    })
  });

  const PHASES = Object.freeze({
    SETTLING: "SETTLING",
    NORMAL: "NORMAL",
    WAVE_COMING: "WAVE_COMING",
    FINAL_COMPLETE: "FINAL_COMPLETE"
  });
  const LIFECYCLES = Object.freeze({
    RESERVED: "RESERVED", ENTERING: "ENTERING", ACTIVE: "ACTIVE",
    NEAR_OFFSCREEN: "NEAR_OFFSCREEN", RETURNING: "RETURNING", DEAD: "DEAD"
  });
  const EPSILON = 1e-9;

  const capacityArea = (width = STRUCTURE.viewportWidth, height = STRUCTURE.viewportHeight,
    radius = STRUCTURE.playerSpawnExclusionRadius) => width * height - Math.PI * radius * radius;
  const visualArea = dimensions => Math.max(0, dimensions.visualWidth ?? dimensions.width ?? 0) *
    Math.max(0, dimensions.visualHeight ?? dimensions.height ?? 0);
  const visualRect = enemy => ({ x: enemy.x, y: enemy.y,
    width: enemy.visualWidth ?? enemy.width, height: enemy.visualHeight ?? enemy.height });

  function intersectionArea(a, b) {
    const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return width * height;
  }

  function isFullyInside(rect, bounds) {
    return rect.x >= bounds.x && rect.y >= bounds.y &&
      rect.x + rect.width <= bounds.x + bounds.width && rect.y + rect.height <= bounds.y + bounds.height;
  }

  function minimumSpawnCenterDistance(dimensions, radius = STRUCTURE.playerSpawnExclusionRadius) {
    const width = dimensions.visualWidth ?? dimensions.width;
    const height = dimensions.visualHeight ?? dimensions.height;
    return radius + Math.hypot(width, height) / 2;
  }

  function distanceBandPixels(tag, width = STRUCTURE.viewportWidth, height = STRUCTURE.viewportHeight) {
    const ratios = STRUCTURE.distanceBands[tag];
    if (!ratios) throw new Error(`Unknown spawn distance band: ${tag}`);
    const shortSide = Math.min(width, height);
    return Object.freeze({ minimum: ratios[0] * shortSide, maximum: ratios[1] * shortSide });
  }

  function computeFill(enemies, viewport, extraSpawnReservedArea = 0) {
    let visibleArea = 0;
    let spawnReservedArea = Math.max(0, extraSpawnReservedArea);
    let returnReservedArea = 0;
    for (const enemy of enemies) {
      if (!enemy || enemy.lifecycle === LIFECYCLES.DEAD || enemy.hp <= 0) continue;
      const fullArea = visualArea(enemy);
      const visible = intersectionArea(visualRect(enemy), viewport);
      visibleArea += visible;
      if (enemy.lifecycle === LIFECYCLES.ENTERING || enemy.lifecycle === LIFECYCLES.RESERVED) {
        spawnReservedArea += Math.max(0, fullArea - visible);
      } else if (enemy.lifecycle === LIFECYCLES.NEAR_OFFSCREEN) {
        returnReservedArea += Math.max(0, fullArea - visible);
      }
    }
    const capacity = capacityArea(viewport.width, viewport.height);
    const spawnReservedFill = spawnReservedArea / capacity;
    const returnReservedFill = returnReservedArea / capacity;
    const visibleFill = visibleArea / capacity;
    return Object.freeze({ capacityArea: capacity, visibleArea, spawnReservedArea, returnReservedArea,
      visibleFill, spawnReservedFill, returnReservedFill,
      reservedFill: spawnReservedFill + returnReservedFill,
      projectedFill: visibleFill + spawnReservedFill + returnReservedFill });
  }

  function shouldEnableNormalRefill(projectedFill, enabled = false) {
    if (projectedFill < STRUCTURE.normalFillMinimum - EPSILON) return true;
    if (projectedFill >= STRUCTURE.normalFillTarget - EPSILON) return false;
    return Boolean(enabled);
  }

  function candidateFits(projectedFill, candidateArea, capacity = capacityArea(), ceiling = STRUCTURE.controllerCeiling) {
    return projectedFill + candidateArea / capacity <= ceiling + EPSILON;
  }

  function createSeededRng(seed) {
    let state = (Number(seed) >>> 0) || 0x6d2b79f5;
    return function rng() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function spawnWeight(type, history, calibration = CALIBRATION) {
    const lastIndex = history.lastIndexOf(type);
    const age = lastIndex < 0 ? Infinity : history.length - 1 - lastIndex;
    const recency = Number.isFinite(age)
      ? calibration.recencyMultipliers[Math.min(age, calibration.recencyMultipliers.length - 1)]
      : 1;
    let streak = 0;
    for (let index = history.length - 1; index >= 0 && history[index] === type; index--) streak++;
    const streakFactor = streak > 0 ? Math.pow(calibration.streakMultiplier, streak) : 1;
    return Math.max(Number.EPSILON, recency * streakFactor);
  }

  function selectType(types, history, rng, weightFor = type => spawnWeight(type, history)) {
    if (!types.length) return null;
    const weights = types.map(type => Math.max(Number.EPSILON, weightFor(type)));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const random = rng();
    if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error("Invalid RNG value");
    let target = random * total;
    for (let index = 0; index < types.length; index++) {
      target -= weights[index];
      if (target < 0) return types[index];
    }
    return types.at(-1);
  }

  function legalTypes({ definitions, types, enemies, projectedFill, capacity = capacityArea(), introduced = null }) {
    const counts = {};
    for (const enemy of enemies) if (enemy.hp > 0 && enemy.lifecycle !== LIFECYCLES.DEAD) {
      counts[enemy.type] = (counts[enemy.type] || 0) + 1;
    }
    return types.filter(type => {
      const definition = definitions[type];
      if (!definition || definition.contentEligible === false) return false;
      if (introduced && definition.requiresIntroduction && !introduced.has(type) && introduced.pendingType !== type) {
        // Introduction is a hold, not an exclusion; selector may still commit this type.
      }
      const cap = CALIBRATION.mechanicCaps[type];
      if (Number.isFinite(cap) && (counts[type] || 0) >= cap) return false;
      return candidateFits(projectedFill, visualArea(definition), capacity);
    });
  }

  function createController({ waveCount, seed = 1 } = {}) {
    if (!Number.isInteger(waveCount) || waveCount <= 0) throw new Error("Continuous Encounter requires a positive waveCount");
    return {
      phase: PHASES.SETTLING,
      waveIndex: 0,
      waveCount,
      waveProgressArmed: false,
      nRef: 0,
      target: 0,
      progress: 0,
      normalRefillEnabled: true,
      normalCredit: 0,
      comingCredit: 0,
      comingStartFill: 0,
      comingSelectedDelta: 0,
      comingDelta: 0,
      comingTarget: 0,
      comingPeakProjectedFill: 0,
      comingBudgetArea: 0,
      comingRemainingArea: 0,
      comingCommittedArea: 0,
      settlingDuration: 0,
      waveProgressReadinessStableTime: 0,
      waveProgressReadinessBlockedReason: "opening-ramp",
      spawnHistory: [],
      pendingReservations: [],
      nextReservationId: 1,
      combatElapsed: 0,
      dispatchPulseCooldown: 0,
      dispatchPulseCount: 0,
      reservationsLastPulse: 0,
      peakManagedCount: 0,
      typeRng: createSeededRng((seed ^ 0xa511e9b3) >>> 0),
      positionRng: createSeededRng((seed ^ 0x63d83595) >>> 0),
      comingRng: createSeededRng((seed ^ 0x1b56c4e9) >>> 0)
    };
  }

  function addCredit(controller, deltaTime, capacity = capacityArea()) {
    const dt = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0);
    const cap = CALIBRATION.creditCapFill * capacity;
    if ([PHASES.NORMAL, PHASES.SETTLING].includes(controller.phase)) {
      controller.normalCredit = Math.min(cap,
        controller.normalCredit + CALIBRATION.normalAreaRate * capacity * dt);
    } else if (controller.phase === PHASES.WAVE_COMING) {
      controller.comingCredit = Math.min(cap,
        controller.comingCredit + CALIBRATION.comingAreaRate * capacity * dt);
    }
  }

  function armProgress(controller, enemies, viewport) {
    const nRef = enemies.reduce((sum, enemy) => {
      if (enemy.hp <= 0 || enemy.countsTowardEncounterProgress === false) return sum;
      const full = visualArea(enemy);
      return sum + (full > 0 ? intersectionArea(visualRect(enemy), viewport) / full : 0);
    }, 0);
    const target = Math.ceil(nRef * CALIBRATION.turnoverCycles);
    if (!(nRef > 0) || !(target > 0)) {
      throw new Error("Cannot arm Wave Progress without a populated N_ref snapshot");
    }
    controller.nRef = nRef;
    controller.target = target;
    controller.progress = 0;
    controller.waveProgressArmed = true;
    controller.phase = PHASES.NORMAL;
    controller.settlingDuration = 0;
    controller.waveProgressReadinessStableTime = 0;
    controller.waveProgressReadinessBlockedReason = "armed";
    return controller.target;
  }

  function resetProgressReadiness(controller, reason = "opening-ramp") {
    if (!controller) return;
    controller.waveProgressReadinessStableTime = 0;
    controller.waveProgressReadinessBlockedReason = reason;
  }

  function recordKill(controller, countsTowardEncounterProgress = true) {
    if (!controller.waveProgressArmed || !countsTowardEncounterProgress) return false;
    controller.progress += 1;
    if (controller.progress < controller.target) return false;
    controller.waveProgressArmed = false;
    resetProgressReadiness(controller, "wave-transition");
    return true;
  }

  function beginWaveComing(controller, projectedFill, rng = controller.comingRng) {
    const start = Math.max(0, projectedFill);
    const random = rng();
    if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error("Invalid Coming RNG value");
    const selectedDelta = CALIBRATION.waveComingDeltaMinimum +
      (CALIBRATION.waveComingDeltaMaximum - CALIBRATION.waveComingDeltaMinimum) * random;
    const target = Math.min(STRUCTURE.controllerCeiling, start + selectedDelta);
    const budget = Math.max(0, (target - start) * capacityArea());
    controller.phase = PHASES.WAVE_COMING;
    controller.comingStartFill = start;
    controller.comingSelectedDelta = selectedDelta;
    controller.comingDelta = target - start;
    controller.comingTarget = target;
    controller.comingPeakProjectedFill = start;
    controller.comingBudgetArea = budget;
    controller.comingRemainingArea = budget;
    controller.comingCommittedArea = 0;
    controller.comingCredit = 0;
    controller.dispatchPulseCooldown = 0;
    resetProgressReadiness(controller, "wave-transition");
    return budget;
  }

  function commitSpawn(controller, type, area, phase = controller.phase) {
    const creditKey = phase === PHASES.WAVE_COMING ? "comingCredit" : "normalCredit";
    if (controller[creditKey] + EPSILON < area) return null;
    if (phase === PHASES.WAVE_COMING && controller.comingRemainingArea + EPSILON < area) return null;
    controller[creditKey] = Math.max(0, controller[creditKey] - area);
    if (phase === PHASES.WAVE_COMING) {
      controller.comingRemainingArea = Math.max(0, controller.comingRemainingArea - area);
      controller.comingCommittedArea += area;
    }
    controller.spawnHistory.push(type);
    if (controller.spawnHistory.length > CALIBRATION.recentHistoryLength) controller.spawnHistory.shift();
    return { id: controller.nextReservationId++, type, area, phase, status: "PENDING" };
  }

  function cancelSpawn(controller, reservation) {
    if (!reservation || reservation.status !== "PENDING") return false;
    reservation.status = "CANCELED";
    const creditKey = reservation.phase === PHASES.WAVE_COMING ? "comingCredit" : "normalCredit";
    const cap = CALIBRATION.creditCapFill * capacityArea();
    controller[creditKey] = Math.min(cap, controller[creditKey] + reservation.area);
    if (reservation.phase === PHASES.WAVE_COMING) {
      controller.comingRemainingArea += reservation.area;
      controller.comingCommittedArea = Math.max(0, controller.comingCommittedArea - reservation.area);
    }
    if (controller.spawnHistory.at(-1) === reservation.type) controller.spawnHistory.pop();
    return true;
  }

  function establishSpawn(reservation) {
    if (!reservation || reservation.status !== "PENDING") return false;
    reservation.status = "ESTABLISHED";
    return true;
  }

  function openingRampComplete(controller) {
    if (controller.waveIndex !== 0) return true;
    const lastRampBoundary = CALIBRATION.openingRamp
      .filter(step => Number.isFinite(step.until)).at(-1)?.until || 0;
    return controller.combatElapsed >= lastRampBoundary - EPSILON;
  }

  function progressReadiness(controller, fill, enemies = []) {
    if (!openingRampComplete(controller)) return { ready: false, reason: "opening-ramp" };
    if (fill.projectedFill < STRUCTURE.normalFillMinimum - EPSILON) {
      return { ready: false, reason: "projected-fill-low" };
    }
    if (fill.projectedFill > STRUCTURE.normalFillMaximum + EPSILON) {
      return { ready: false, reason: "projected-fill-high" };
    }
    const unresolvedReserved = controller.pendingReservations.length > 0 ||
      enemies.some(enemy => enemy?.hp > 0 && enemy.lifecycle === LIFECYCLES.RESERVED);
    if (unresolvedReserved) return { ready: false, reason: "unresolved-reserved" };
    return { ready: true, reason: "ready-stabilizing" };
  }

  function canArmProgress(controller, fill, enemies = []) {
    return progressReadiness(controller, fill, enemies).ready;
  }

  function effectiveNormalTarget(controller, waveIndex = controller.waveIndex) {
    if (waveIndex !== 0) return STRUCTURE.normalFillTarget;
    return CALIBRATION.openingRamp.find(step => controller.combatElapsed < step.until)?.target ??
      STRUCTURE.normalFillTarget;
  }

  function dispatchPolicy(phase) {
    return phase === PHASES.WAVE_COMING
      ? Object.freeze({ maximum: CALIBRATION.comingDispatchMaximum, interval: CALIBRATION.comingDispatchInterval })
      : Object.freeze({ maximum: CALIBRATION.normalDispatchMaximum, interval: CALIBRATION.normalDispatchInterval });
  }

  function canDispatchPulse(controller) {
    return controller.dispatchPulseCooldown <= EPSILON;
  }

  function recordDispatchPulse(controller, reservationsCommitted) {
    const committed = Math.max(0, Math.trunc(reservationsCommitted || 0));
    controller.dispatchPulseCount++;
    controller.reservationsLastPulse = committed;
    controller.dispatchPulseCooldown = dispatchPolicy(controller.phase).interval;
  }

  function isManagedRegularEnemy(enemy) {
    return Boolean(enemy && enemy.hp > 0 && [LIFECYCLES.ENTERING, LIFECYCLES.ACTIVE,
      LIFECYCLES.NEAR_OFFSCREEN, LIFECYCLES.RETURNING].includes(enemy.lifecycle));
  }

  function managedRegularEnemyCount(enemies, pendingReservationCount = 0) {
    return enemies.filter(isManagedRegularEnemy).length + Math.max(0, Math.trunc(pendingReservationCount || 0));
  }

  function canReserveManagedEnemy(enemies, pendingReservationCount = 0) {
    return managedRegularEnemyCount(enemies, pendingReservationCount) < CALIBRATION.maxManagedRegularEnemies;
  }

  function updateLifecycle(enemy, viewport, managementMargin = distanceBandPixels("FAR", viewport.width, viewport.height).maximum) {
    if (enemy.hp <= 0) return enemy.lifecycle = LIFECYCLES.DEAD;
    const rect = visualRect(enemy);
    const visible = intersectionArea(rect, viewport) > 0;
    if (!enemy.hasEnteredViewport) {
      if (isFullyInside(rect, viewport)) {
        enemy.hasEnteredViewport = true;
        return enemy.lifecycle = LIFECYCLES.ACTIVE;
      }
      return enemy.lifecycle = LIFECYCLES.ENTERING;
    }
    if (visible) return enemy.lifecycle = LIFECYCLES.ACTIVE;
    const management = { x: viewport.x - managementMargin, y: viewport.y - managementMargin,
      width: viewport.width + managementMargin * 2, height: viewport.height + managementMargin * 2 };
    if (intersectionArea(rect, management) > 0) return enemy.lifecycle = LIFECYCLES.NEAR_OFFSCREEN;
    return enemy.lifecycle = LIFECYCLES.RETURNING;
  }

  function updateController(controller, deltaTime, fill, enemies, viewport) {
    const dt = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0);
    controller.combatElapsed += dt;
    controller.dispatchPulseCooldown = Math.max(0, controller.dispatchPulseCooldown - dt);
    if (controller.phase === PHASES.WAVE_COMING) {
      controller.comingPeakProjectedFill = Math.max(controller.comingPeakProjectedFill, fill.projectedFill);
    }
    addCredit(controller, deltaTime, fill.capacityArea);
    controller.normalRefillEnabled = shouldEnableNormalRefill(fill.projectedFill, controller.normalRefillEnabled);
    if (controller.phase === PHASES.SETTLING) {
      controller.settlingDuration += Math.max(0, deltaTime);
      const readiness = progressReadiness(controller, fill, enemies);
      controller.waveProgressReadinessBlockedReason = readiness.reason;
      if (readiness.ready) {
        controller.waveProgressReadinessStableTime += dt;
        if (controller.waveProgressReadinessStableTime + EPSILON >= CALIBRATION.progressReadinessDuration) {
          armProgress(controller, enemies, viewport);
        }
      } else {
        controller.waveProgressReadinessStableTime = 0;
      }
    }
    if (controller.phase === PHASES.WAVE_COMING && controller.comingRemainingArea <= EPSILON &&
        !controller.pendingReservations.length) {
      controller.phase = PHASES.SETTLING;
      controller.settlingDuration = 0;
      resetProgressReadiness(controller, controller.waveIndex === 0 ? "opening-ramp" : "ready-stabilizing");
    }
    return controller;
  }

  const api = Object.freeze({ STRUCTURE, CALIBRATION, PHASES, LIFECYCLES,
    capacityArea, visualArea, visualRect, intersectionArea, isFullyInside,
    minimumSpawnCenterDistance, distanceBandPixels, computeFill, shouldEnableNormalRefill,
    candidateFits, createSeededRng, spawnWeight, selectType, legalTypes, createController,
    addCredit, armProgress, resetProgressReadiness, recordKill, beginWaveComing, commitSpawn, cancelSpawn, establishSpawn,
    openingRampComplete, progressReadiness, canArmProgress, effectiveNormalTarget, dispatchPolicy, canDispatchPulse, recordDispatchPulse,
    isManagedRegularEnemy, managedRegularEnemyCount, canReserveManagedEnemy,
    updateLifecycle, updateController });
  global.ContinuousEncounter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
