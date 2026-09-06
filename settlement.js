// Provisional Score -> Points settlement infrastructure.
// These values are placeholders until Stage/Wave playtest data exists.
(function (global) {
  const RUN_END_REASONS = Object.freeze({
    DEATH: "death",
    VICTORY: "victory",
    ABANDON: "abandon"
  });

  const SCORE_TYPES = Object.freeze({
    ENEMY_KILL: "enemyKill",
    WAVE_CLEAR: "waveClear",
    BOSS_KILL: "bossKill",
    STAGE_CLEAR: "stageClear",
    FLAWLESS_WAVE: "flawlessWave",
    QUICK_CLEAR: "quickClear",
    LAST_STAND: "lastStand",
    PRIORITY_TARGET: "priorityTarget",
    FLAWLESS_BOSS: "flawlessBoss"
  });

  const SCORE_TYPE_GROUPS = Object.freeze({
    [SCORE_TYPES.ENEMY_KILL]: "base",
    [SCORE_TYPES.WAVE_CLEAR]: "base",
    [SCORE_TYPES.BOSS_KILL]: "base",
    [SCORE_TYPES.STAGE_CLEAR]: "base",
    [SCORE_TYPES.FLAWLESS_WAVE]: "performance",
    [SCORE_TYPES.QUICK_CLEAR]: "performance",
    [SCORE_TYPES.LAST_STAND]: "performance",
    [SCORE_TYPES.PRIORITY_TARGET]: "performance",
    [SCORE_TYPES.FLAWLESS_BOSS]: "performance"
  });

  const SETTLEMENT_CONFIG = Object.freeze({
    capacity: Object.freeze({
      // Provisional allowances: replace after Stage/Wave score data is available.
      startingAllowance: 100,
      completedWaveAllowance: 500,
      completedBossEncounterAllowance: 1000,
      completedStageAllowance: 1500,
      performanceRecordAllowance: 50,
      safetyBuffer: 100,
      minimumCapacity: 1
    }),
    antiFarming: Object.freeze({
      // A smooth marginal-score curve. This is deliberately not final balancing.
      excessDiminishingRate: 0.85
    }),
    points: Object.freeze({
      // Provisional P = P0 * (effectiveScore / S0)^b economy model.
      baselinePoints: 100,
      referenceEffectiveScore: 1000,
      exponent: 0.65
    })
  });

  function finiteNonNegative(value, fallback = 0) {
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  function createScoreBreakdown() {
    return {
      base: {
        enemyKill: 0,
        waveClear: 0,
        bossKill: 0,
        stageClear: 0
      },
      performance: {
        flawlessWave: 0,
        quickClear: 0,
        lastStand: 0,
        priorityTarget: 0,
        flawlessBoss: 0
      }
    };
  }

  function createPerformanceRecords() {
    return {
      flawlessWaves: [],
      quickClears: [],
      lastStands: [],
      priorityTargets: [],
      flawlessBosses: []
    };
  }

  function createRunSettlementState() {
    return {
      score: 0,
      scoreBreakdown: createScoreBreakdown(),
      progress: {
        stage: 1,
        completedWaves: 0,
        completedBossEncounters: 0,
        completedStages: 0,
        currentEncounter: null
      },
      performanceRecords: createPerformanceRecords(),
      securedCheckpoint: null
    };
  }

  function copyPlainData(value) {
    if (Array.isArray(value)) {
      return value.map(copyPlainData);
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, copyPlainData(entry)])
      );
    }

    return value;
  }

  function copySettlementState(state) {
    return {
      score: finiteNonNegative(state.score),
      scoreBreakdown: {
        base: { ...createScoreBreakdown().base, ...state.scoreBreakdown.base },
        performance: { ...createScoreBreakdown().performance, ...state.scoreBreakdown.performance }
      },
      progress: {
        stage: finiteNonNegative(state.progress.stage, 1) || 1,
        completedWaves: finiteNonNegative(state.progress.completedWaves),
        completedBossEncounters: finiteNonNegative(state.progress.completedBossEncounters),
        completedStages: finiteNonNegative(state.progress.completedStages),
        currentEncounter: copyPlainData(state.progress.currentEncounter)
      },
      performanceRecords: {
        flawlessWaves: copyPlainData(state.performanceRecords.flawlessWaves),
        quickClears: copyPlainData(state.performanceRecords.quickClears),
        lastStands: copyPlainData(state.performanceRecords.lastStands),
        priorityTargets: copyPlainData(state.performanceRecords.priorityTargets),
        flawlessBosses: copyPlainData(state.performanceRecords.flawlessBosses)
      },
      securedCheckpoint: null
    };
  }

  function awardScore(state, scoreType, amount, performanceRecord) {
    const group = SCORE_TYPE_GROUPS[scoreType];
    const safeAmount = finiteNonNegative(amount);

    if (!group || safeAmount === 0) {
      return state;
    }

    state.score += safeAmount;
    state.scoreBreakdown[group][scoreType] += safeAmount;

    if (performanceRecord) {
      const recordKey = {
        flawlessWave: "flawlessWaves",
        quickClear: "quickClears",
        lastStand: "lastStands",
        priorityTarget: "priorityTargets",
        flawlessBoss: "flawlessBosses"
      }[scoreType];

      if (recordKey) {
        state.performanceRecords[recordKey].push(copyPlainData(performanceRecord));
      }
    }

    return state;
  }

  function secureSettlementCheckpoint(state) {
    state.securedCheckpoint = copySettlementState(state);
    return state.securedCheckpoint;
  }

  function completeEncounter(state, completion) {
    const encounterType = completion.type;

    if (encounterType === "wave") {
      state.progress.completedWaves += 1;
    } else if (encounterType === "boss") {
      state.progress.completedBossEncounters += 1;
    }

    // Required ordering: clear bonus and performance bonuses are awarded before snapshotting.
    awardScore(state, completion.clearScoreType, completion.clearScore);
    for (const bonus of completion.performanceBonuses || []) {
      awardScore(state, bonus.type, bonus.score, bonus.record);
    }

    state.progress.currentEncounter = null;
    return secureSettlementCheckpoint(state);
  }

  function countPerformanceRecords(performanceRecords) {
    return Object.values(performanceRecords).reduce((total, records) => total + records.length, 0);
  }

  function calculateEfficientScoreCapacity(state, config = SETTLEMENT_CONFIG) {
    const capacityConfig = config.capacity;
    const progress = state.progress || {};
    const currentEncounterAllowance = finiteNonNegative(
      progress.currentEncounter && progress.currentEncounter.scoreAllowance
    );
    const rawCapacity =
      finiteNonNegative(capacityConfig.startingAllowance) +
      finiteNonNegative(progress.completedWaves) * finiteNonNegative(capacityConfig.completedWaveAllowance) +
      finiteNonNegative(progress.completedBossEncounters) * finiteNonNegative(capacityConfig.completedBossEncounterAllowance) +
      finiteNonNegative(progress.completedStages) * finiteNonNegative(capacityConfig.completedStageAllowance) +
      countPerformanceRecords(state.performanceRecords || createPerformanceRecords()) * finiteNonNegative(capacityConfig.performanceRecordAllowance) +
      currentEncounterAllowance +
      finiteNonNegative(capacityConfig.safetyBuffer);

    return Math.max(finiteNonNegative(capacityConfig.minimumCapacity, 1) || 1, rawCapacity);
  }

  function calculateEffectiveScore(finalScore, capacity, config = SETTLEMENT_CONFIG) {
    const score = finiteNonNegative(finalScore);
    const safeCapacity = Math.max(finiteNonNegative(capacity, 1) || 1, 1);
    const rate = finiteNonNegative(config.antiFarming.excessDiminishingRate);

    if (score <= safeCapacity || rate === 0) {
      return score;
    }

    const scoreCapacityRatio = score / safeCapacity;
    return safeCapacity + (safeCapacity / rate) * Math.log(1 + rate * (scoreCapacityRatio - 1));
  }

  function calculatePoints(effectiveScore, config = SETTLEMENT_CONFIG) {
    const pointsConfig = config.points || {};
    const score = finiteNonNegative(effectiveScore);
    if (score <= 0) {
      return 0;
    }

    const referenceScore = Math.max(finiteNonNegative(pointsConfig.referenceEffectiveScore, 1) || 1, 1);
    const baselinePoints = finiteNonNegative(pointsConfig.baselinePoints);
    const fallbackExponent = SETTLEMENT_CONFIG.points.exponent;
    const exponent = Number.isFinite(pointsConfig.exponent) && pointsConfig.exponent > 0
      ? pointsConfig.exponent
      : fallbackExponent;
    return Math.floor(baselinePoints * Math.pow(score / referenceScore, exponent));
  }

  function calculateSettlement(state, config = SETTLEMENT_CONFIG) {
    const snapshot = copySettlementState(state);
    const capacity = calculateEfficientScoreCapacity(snapshot, config);
    const effectiveScore = calculateEffectiveScore(snapshot.score, capacity, config);
    return {
      finalScore: snapshot.score,
      finalProgress: snapshot.progress,
      efficientScoreCapacity: capacity,
      effectiveScore,
      points: calculatePoints(effectiveScore, config)
    };
  }

  function selectSettlementState(state, endReason) {
    if (endReason === RUN_END_REASONS.ABANDON) {
      return state.securedCheckpoint ? copySettlementState(state.securedCheckpoint) : null;
    }

    if (endReason === RUN_END_REASONS.DEATH || endReason === RUN_END_REASONS.VICTORY) {
      return copySettlementState(state);
    }

    return null;
  }

  global.RunSettlement = Object.freeze({
    RUN_END_REASONS,
    SCORE_TYPES,
    SETTLEMENT_CONFIG,
    createRunSettlementState,
    copySettlementState,
    awardScore,
    completeEncounter,
    secureSettlementCheckpoint,
    selectSettlementState,
    calculateEfficientScoreCapacity,
    calculateEffectiveScore,
    calculatePoints,
    calculateSettlement
  });
})(globalThis);
