// Optional, in-memory observations. This module has no gameplay dependencies.
(function (global) {
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const nonNegative = value => Number.isFinite(value) ? Math.max(0, value) : 0;
  const increment = (counts, type, amount = 1) => {
    if (typeof type === "string" && type) {
      Object.defineProperty(counts, type, { value: (Object.hasOwn(counts, type) ? counts[type] : 0) + amount,
        writable: true, enumerable: true, configurable: true });
    }
  };
  function isEnabled(search = "") {
    try { return new URLSearchParams(search).get("playtest") === "1"; }
    catch { return false; }
  }
  function createTelemetry(options = {}) {
    const enabled = options.enabled === true;
    const warn = (operation, error) => {
      if (!enabled) return;
      try { (options.warn || global.console?.warn)?.(`[Playtest telemetry] ${operation} failed`, error); }
      catch { /* Diagnostics must not interrupt gameplay either. */ }
    };
    const safe = (operation, callback, fallback = null) => (...args) => {
      if (!enabled) return fallback;
      try { return callback(...args); }
      catch (error) { warn(operation, error); return fallback; }
    };
    const timestamp = () => {
      try { return options.now ? options.now() : new Date().toISOString(); }
      catch (error) { warn("timestamp", error); return null; }
    };
    let configuration = {}, environment = {};
    if (enabled) {
      try { configuration = copy(options.configuration || {}); environment = copy(options.environment || {}); }
      catch (error) { warn("configuration snapshot", error); }
    }
    let sequence = 0, run = null, encounter = null;
    const completedRuns = [];
    const enemyMetadata = configuration.enemies || {};
    const maxActiveEnemies = configuration.maxActiveEnemies ?? configuration.config?.maxActiveEnemies ?? Infinity;

    function observeHp(hp, maxHp) {
      if (!encounter || !Number.isFinite(hp)) return;
      const data = encounter.data;
      data.endHp = hp;
      data.minimumHp = Math.min(data.minimumHp, hp);
      if (maxHp > 0) data.minimumHpRatio = Math.min(data.minimumHpRatio, hp / maxHp);
      run.finalPlayerHp = hp;
    }
    function encounterSnapshot() {
      const data = encounter.data, duration = data.encounterElapsedTime;
      const actualClearTime = data.outcome === "clear" ? duration : null;
      const weaponMetrics = Object.fromEntries(Object.entries(data.weaponMetrics).map(([id, metrics]) =>
        [id, { ...metrics, killsPerActiveCombatSecond: duration > 0 ? metrics.kills / duration : 0 }]));
      return copy({ ...data, weaponMetrics, encounterElapsedTime: duration, actualClearTime, activeCombatTime: duration,
        clearTimeRatio: actualClearTime !== null && data.analysis.expectedClearTime > 0
          ? actualClearTime / data.analysis.expectedClearTime : null,
        averageActiveEnemyCount: duration > 0 ? encounter.enemyIntegral / duration : 0,
        averageActiveThreat: duration > 0 ? encounter.threatIntegral / duration : 0,
        averageVisibleFill: data.fillSampleTime > 0 ? data.fillIntegral / data.fillSampleTime : data.visibleFill });
    }
    function runSnapshot() {
      if (!run) return copy(completedRuns.at(-1) || null);
      return copy({ ...run, encounters: [...run.encounters, ...(encounter ? [encounterSnapshot()] : [])] });
    }
    function finishEncounter({ outcome, player } = {}) {
      if (!run || !encounter) return;
      const endPlayer = copy(player || encounter.data.playerStart);
      observeHp(endPlayer.playerHp, endPlayer.playerMaxHp);
      encounter.data.playerEnd = endPlayer;
      encounter.data.playerLevelEnd = endPlayer.playerLevel;
      encounter.data.outcome = outcome || "run-ended-other";
      run.finalPlayerLevel = endPlayer.playerLevel;
      run.encounters.push(encounterSnapshot());
      encounter = null;
    }
    function finishRun({ endReason = "run-ended-other", player, settlement = null } = {}) {
      if (!run) return;
      const settlementSnapshot = copy(settlement);
      const endPlayer = copy(player || (encounter ? { ...encounter.data.playerStart,
        playerHp: run.finalPlayerHp, playerLevel: run.finalPlayerLevel } : run.playerStart));
      finishEncounter({ outcome: ["death", "abandon"].includes(endReason) ? endReason : "run-ended-other", player: endPlayer });
      const finished = copy({ ...run, endedAt: timestamp(), endReason, completed: true,
        victory: endReason === "victory", finalPlayerHp: endPlayer.playerHp,
        finalPlayerLevel: endPlayer.playerLevel, settlement: settlementSnapshot });
      completedRuns.push(finished);
      if (completedRuns.length > 20) completedRuns.shift();
      run = null;
    }
    function startRun({ player, battlefieldId = null, battlefieldSeed = null,
      worldWidth = null, worldHeight = null, obstacleCount = null } = {}) {
      const playerStart = copy(player || {});
      // A reset without a terminal game event still preserves the previous observations.
      if (run) finishRun({ endReason: "run-ended-other", player: { ...run.playerStart,
        playerHp: run.finalPlayerHp, playerLevel: run.finalPlayerLevel } });
      run = { runSequence: ++sequence, startedAt: timestamp(), endedAt: null, endReason: null,
        completed: false, stageReached: null, waveReached: 0, bossReached: false, victory: false,
        battlefieldId, battlefieldSeed, worldWidth, worldHeight, obstacleCount,
        playerStart, finalPlayerHp: playerStart.playerHp, finalPlayerLevel: playerStart.playerLevel,
        totalActiveCombatTime: 0, totalIntermissionTime: 0, encounters: [], upgradeHistory: [],
        upgradeChoiceHistory: [], enemyIntroductionsShown: [], settlement: null };
    }
    function startEncounter({ type, definition, stageId, waveIndex, battlefieldId,
      battlefieldSeed, worldWidth, worldHeight, obstacleCount, player }) {
      if (!run) return;
      const source = copy(definition), playerStart = copy(player);
      const enemyComposition = {};
      const spawnGroups = (type === "wave" ? source.spawnGroups : []).map((group, groupIndex) => {
        let enemyCount = 0, threat = 0;
        for (const entry of group.enemies) {
          enemyCount += entry.count;
          threat += entry.count * (enemyMetadata[entry.type]?.threatCost || 0);
          increment(enemyComposition, entry.type, entry.count);
        }
        return { groupIndex, delay: group.delay, enemies: group.enemies, enemyCount, threat };
      });
      if (encounter) finishEncounter({ outcome: "run-ended-other", player: playerStart });
      const data = { type, stageId: source.stageId ?? stageId, waveIndex: source.waveIndex ?? waveIndex,
        battlefieldId: source.battlefieldId ?? battlefieldId ?? null,
        battlefieldSeed: source.battlefieldSeed ?? battlefieldSeed ?? null,
        worldWidth: source.worldWidth ?? worldWidth ?? null,
        worldHeight: source.worldHeight ?? worldHeight ?? null,
        obstacleCount: source.obstacleCount ?? obstacleCount ?? null,
        ...(type === "boss" ? { bossId: source.id, chargeAttempts: 0, chargeContacts: 0 } :
          { waveId: source.id, templateId: source.templateId,
          threatBudget: source.threatBudget, generatedThreat: source.analysis.threat,
          maxActiveThreat: source.maxActiveThreat, enemyComposition, spawnGroups }),
        analysis: source.analysis, playerStart, playerEnd: null,
        encounterElapsedTime: 0, actualClearTime: null,
        damageTaken: 0, damageEvents: 0, damageByEnemyType: {}, damageEventsByEnemyType: {},
        startHp: playerStart.playerHp, endHp: playerStart.playerHp, minimumHp: playerStart.playerHp,
        minimumHpRatio: playerStart.playerMaxHp > 0 ? playerStart.playerHp / playerStart.playerMaxHp : 0,
        timeAtOrBelow30PercentHp: 0, playerLevelStart: playerStart.playerLevel, playerLevelEnd: playerStart.playerLevel,
        killsByEnemyType: {}, nonKillRemovalsByEnemyType: {}, nonKillRemovalsByReason: {},
        attackEvents: 0, shotsFired: 0, bulletHits: 0,
        bulletHitsByEnemyType: {}, bulletDamageByEnemyType: {}, enemySecondsByType: {},
        interceptor: { attempts: 0, chargeCommits: 0, chargeContacts: 0,
          missedCharges: 0, interruptedTelegraphs: 0 },
        denier: { casts: 0, hazardsCreated: 0, hazardContacts: 0, hazardDamageEvents: 0, activeHazardTime: 0 },
        support: { activeTime: 0, affectedEnemyTime: 0, affectedSpecialActions: 0, linksCreated: 0 },
        fast: { telegraphs: 0 }, tank: { telegraphs: 0, impacts: 0 },
        gunner: { bursts: 0 }, artillery: { warnings: 0, impacts: 0 },
        trapper: { arms: 0, triggers: 0 }, tether: { connects: 0, breaks: 0 },
        peakActiveEnemyCount: 0, peakActiveThreat: 0, configuredSpawnFloor: spawnGroups.reduce((sum, g) => sum + g.delay, 0),
        groupReleaseTimes: [], lastSpawnGroupReleaseTime: null, actualLastGroupReleaseTime: null,
        pressureBlockedTime: 0, pressureBlockedEvents: 0, threatBlockedTime: 0, enemyCountBlockedTime: 0,
        pathRequests: 0, pathFailures: 0, navigationFallbacks: 0, playerObstacleContacts: 0,
        forcedRepaths: 0, stuckRecoveries: 0, maxNoProgressDuration: 0,
        enemyOffscreenEngagementTime: 0, bossOffscreenTime: 0,
        bossObstructionEvents: 0, cameraEmptyTerrainTime: 0,
        visibleFill: 0, spawnReservedFill: 0, returnReservedFill: 0, reservedFill: 0, projectedFill: 0,
        fillIntegral: 0, fillSampleTime: 0, minimumVisibleFill: null, maximumVisibleFill: 0,
        normalRefillEvents: 0, normalRefillRequestedArea: 0,
        configuredFillBand: { minimum: 0.20, target: 0.25, maximum: 0.30, ceiling: 0.70 },
        effectiveOpeningTarget: 0, managedRegularEnemyCount: 0, peakManagedRegularEnemyCount: 0,
        dispatchPulseCount: 0, reservationsCommittedByPulse: [], spawnBlockedByFill: 0,
        spawnBlockedByManagedCap: 0,
        waveComingStartFill: 0, waveComingSelectedDelta: 0, waveComingDelta: 0,
        waveComingTarget: 0, waveComingBudgetArea: 0, waveComingCommittedArea: 0,
        waveComingPeakProjectedFill: 0,
        eligibleEnemyTypes: source.eligibleEnemyTypes || [], newlyUnlockedTypes: [],
        newlyIntroducedTypes: [], introductionSuppressedTypes: [],
        spawnCreditNormal: 0, spawnCreditComing: 0, spawnTypeHistory: [],
        spawnTypeRejectedByCap: {}, spawnTypeRejectedByFill: {}, spawnTypeRejectedByPlacement: {},
        spawnPlacementAttempts: 0, spawnPlacementFailures: 0, spawnPlacementFailureReason: {},
        spawnPlacementRetryCount: 0, placementRetryCount: 0, selectedType: null, preferredDistanceTag: null,
        fallbackDistanceBandUsed: null, selectedSpawnDistanceTag: {}, fallbackSpawnDistanceBand: {},
        lifecycleTransitions: {}, lifecycleCounts: {}, reservedEnemyCount: 0,
        enteringEnemyCount: 0, nearOffscreenEnemyCount: 0, returningEnemyCount: 0,
        waveProgressArmed: false, N_ref: 0, K_target: 0, currentWaveProgress: 0,
        settlingDuration: 0,
        playerEnemyOverlapEvents: 0, maxPlayerEnemyPenetration: 0,
        playerEnemySeparationCorrections: 0,
        weaponSlotA: playerStart.loadout?.slotA || playerStart.weapon?.id || null,
        weaponSlotB: playerStart.loadout?.slotB || null,
        activeWeapon: playerStart.loadout?.activeWeapon || playerStart.weapon?.id || null,
        weaponSwitchCount: 0, weaponMetrics: {},
        outcome: null };
      encounter = { data, enemyIntegral: 0, threatIntegral: 0, pressureBlocked: false, released: new Set(),
        behaviorEvents: {
          interceptorAttempts: new Set(), interceptorCommits: new Set(), interceptorContacts: new Set(),
          interceptorMisses: new Set(), interceptorInterrupts: new Set(), denierCasts: new Set(),
          denierHazards: new Set(), denierContacts: new Set(), supportLinks: new Set()
        } };
      run.stageReached = data.stageId;
      if (type === "wave") run.waveReached = Math.max(run.waveReached, data.waveIndex + 1);
      if (type === "boss") run.bossReached = true;
      run.finalPlayerHp = playerStart.playerHp;
      run.finalPlayerLevel = playerStart.playerLevel;
    }
    function recordEncounterFrame({ deltaTime, activeEnemyCount, activeThreat, hp, maxHp,
      nextSpawnGroupIndex, groupDelayElapsed, enemiesByType = {}, enemyOffscreenCount = 0,
      bossOffscreen = false, cameraHasTerrain = true }) {
      if (!run || !encounter) return;
      const dt = nonNegative(deltaTime), count = nonNegative(activeEnemyCount), threat = nonNegative(activeThreat);
      const data = encounter.data;
      data.encounterElapsedTime += dt;
      run.totalActiveCombatTime += dt;
      encounter.enemyIntegral += count * dt;
      encounter.threatIntegral += threat * dt;
      data.peakActiveEnemyCount = Math.max(data.peakActiveEnemyCount, count);
      data.peakActiveThreat = Math.max(data.peakActiveThreat, threat);
      data.enemyOffscreenEngagementTime += nonNegative(enemyOffscreenCount) * dt;
      if (bossOffscreen) data.bossOffscreenTime += dt;
      if (!cameraHasTerrain) data.cameraEmptyTerrainTime += dt;
      observeHp(hp, maxHp);
      if (maxHp > 0 && hp / maxHp <= 0.3) data.timeAtOrBelow30PercentHp += dt;
      for (const [type, amount] of Object.entries(enemiesByType)) increment(data.enemySecondsByType, type, nonNegative(amount) * dt);
      const group = data.spawnGroups?.[nextSpawnGroupIndex];
      if (!group) return;
      // The frame begins with this field state. Only its portion after the relative
      // minimum delay is eligible for pressure waiting; UI pauses never call this hook.
      const readyTime = Math.max(0, dt - Math.max(0, group.delay - nonNegative(groupDelayElapsed)));
      const ready = nonNegative(groupDelayElapsed) + dt + 1e-9 >= group.delay;
      const threatBlocked = threat + group.threat > data.maxActiveThreat + 1e-9;
      const countBlocked = count + group.enemyCount > maxActiveEnemies;
      if (ready && (threatBlocked || countBlocked)) {
        data.pressureBlockedTime += readyTime;
        if (threatBlocked) data.threatBlockedTime += readyTime;
        if (countBlocked) data.enemyCountBlockedTime += readyTime;
        if (!encounter.pressureBlocked) data.pressureBlockedEvents++;
        encounter.pressureBlocked = true;
      }
    }
    function recordGroupRelease({ groupIndex, elapsedTime, activeEnemyCount, activeThreat }) {
      if (!encounter || !Number.isInteger(groupIndex) || groupIndex < 0 || encounter.released.has(groupIndex)) return;
      const data = encounter.data;
      if (!data.spawnGroups?.[groupIndex]) return;
      encounter.released.add(groupIndex);
      encounter.pressureBlocked = false;
      const time = nonNegative(elapsedTime);
      data.groupReleaseTimes.push({ groupIndex, elapsedTime: time });
      data.lastSpawnGroupReleaseTime = data.actualLastGroupReleaseTime = time;
      data.peakActiveEnemyCount = Math.max(data.peakActiveEnemyCount, nonNegative(activeEnemyCount));
      data.peakActiveThreat = Math.max(data.peakActiveThreat, nonNegative(activeThreat));
    }
    function recordDamage({ amount, hp, maxHp, enemyType }) {
      if (!encounter) return;
      const damage = nonNegative(amount), data = encounter.data;
      data.damageTaken += damage;
      if (damage > 0) {
        data.damageEvents++;
        increment(data.damageByEnemyType, enemyType, damage);
        increment(data.damageEventsByEnemyType, enemyType);
      }
      observeHp(hp, maxHp);
    }
    function recordUpgrade(details = {}) {
      if (!run) return;
      const playerLevel = details.playerLevel;
      run.upgradeHistory.push(copy({ ...details,
        encounterIndex: encounter ? run.encounters.length : null, activeCombatTime: run.totalActiveCombatTime }));
      run.finalPlayerLevel = playerLevel;
      if (encounter) encounter.data.playerLevelEnd = playerLevel;
    }
    function recordUpgradeChoice({ playerLevel, offeredUpgradeIds, selectedUpgradeId } = {}) {
      if (!run) return;
      run.upgradeChoiceHistory.push(copy({ playerLevel,
        offeredUpgradeIds: Array.isArray(offeredUpgradeIds) ? offeredUpgradeIds : [],
        selectedUpgradeId: typeof selectedUpgradeId === "string" ? selectedUpgradeId : null }));
    }
    function recordAttack() {
      if (encounter) encounter.data.attackEvents++;
    }
    function uniqueBehaviorEvent(setName, id, callback) {
      if (!encounter) return;
      const events = encounter.behaviorEvents[setName];
      const key = id ?? `${setName}-${events.size}`;
      if (events.has(key)) return;
      events.add(key);
      callback(encounter.data);
    }
    const report = runs => copy({ schemaVersion: 1, generatedAt: timestamp(), environment, configuration, runs });
    return Object.freeze({ enabled,
      startRun: safe("start run", startRun), startEncounter: safe("start encounter", startEncounter),
      recordEncounterFrame: safe("record frame", recordEncounterFrame),
      recordGroupRelease: safe("record group release", recordGroupRelease),
      recordPathRequest: safe("record path request", () => {
        if (encounter) encounter.data.pathRequests++;
      }),
      recordPathFailure: safe("record path failure", () => {
        if (encounter) encounter.data.pathFailures++;
      }),
      recordNavigationFallback: safe("record navigation fallback", () => {
        if (encounter) encounter.data.navigationFallbacks++;
      }),
      recordForcedRepath: safe("record forced repath", () => {
        if (encounter) encounter.data.forcedRepaths++;
      }),
      recordStuckRecovery: safe("record stuck recovery", ({ noProgressDuration } = {}) => {
        if (!encounter) return;
        encounter.data.stuckRecoveries++;
        encounter.data.maxNoProgressDuration = Math.max(
          encounter.data.maxNoProgressDuration, nonNegative(noProgressDuration));
      }),
      recordBossObstruction: safe("record Boss obstruction", () => {
        if (encounter?.data.type === "boss") encounter.data.bossObstructionEvents++;
      }),
      recordPlayerObstacleContact: safe("record Player obstacle contact", () => {
        if (encounter) encounter.data.playerObstacleContacts++;
      }),
      recordIntermission: safe("record intermission", ({ deltaTime }) => {
        if (run) run.totalIntermissionTime += nonNegative(deltaTime);
      }),
      recordAttack: safe("record attack", recordAttack),
      recordAttackEvent: safe("record attack event", recordAttack),
      recordShot: safe("record shot", () => { if (encounter) encounter.data.shotsFired++; }),
      recordBulletHit: safe("record bullet hit", ({ enemyType, damage }) => {
        if (!encounter || nonNegative(damage) === 0) return;
        encounter.data.bulletHits++;
        increment(encounter.data.bulletHitsByEnemyType, enemyType);
        increment(encounter.data.bulletDamageByEnemyType, enemyType, nonNegative(damage));
      }),
      recordEnemyKill: safe("record kill", ({ enemyType }) => {
        if (encounter) increment(encounter.data.killsByEnemyType, enemyType);
      }),
      recordEnemyRemoval: safe("record removal", ({ enemyType, reason }) => {
        if (!encounter) return;
        increment(encounter.data.nonKillRemovalsByEnemyType, enemyType);
        increment(encounter.data.nonKillRemovalsByReason, reason);
      }),
      recordDamage: safe("record damage", recordDamage),
      recordBossChargeAttempt: safe("record Boss charge attempt", () => {
        if (encounter?.data.type === "boss") encounter.data.chargeAttempts++;
      }),
      recordBossChargeContact: safe("record Boss charge contact", () => {
        if (encounter?.data.type === "boss") encounter.data.chargeContacts++;
      }),
      recordInterceptorAttempt: safe("record Interceptor attempt", ({ enemyId, actionId } = {}) =>
        uniqueBehaviorEvent("interceptorAttempts", actionId ?? enemyId, data => { data.interceptor.attempts++; })),
      recordInterceptorCommit: safe("record Interceptor commit", ({ enemyId, actionId } = {}) =>
        uniqueBehaviorEvent("interceptorCommits", actionId ?? enemyId, data => { data.interceptor.chargeCommits++; })),
      recordInterceptorContact: safe("record Interceptor contact", ({ enemyId, actionId } = {}) =>
        uniqueBehaviorEvent("interceptorContacts", actionId ?? enemyId, data => { data.interceptor.chargeContacts++; })),
      recordInterceptorMiss: safe("record Interceptor miss", ({ enemyId, actionId } = {}) =>
        uniqueBehaviorEvent("interceptorMisses", actionId ?? enemyId, data => { data.interceptor.missedCharges++; })),
      recordInterceptorInterrupted: safe("record Interceptor interruption", ({ enemyId, actionId } = {}) =>
        uniqueBehaviorEvent("interceptorInterrupts", actionId ?? enemyId, data => { data.interceptor.interruptedTelegraphs++; })),
      recordDenierCast: safe("record Denier cast", ({ enemyId, actionId } = {}) =>
        uniqueBehaviorEvent("denierCasts", actionId ?? enemyId, data => { data.denier.casts++; })),
      recordDenierHazardCreated: safe("record Denier hazard", ({ hazardId } = {}) =>
        uniqueBehaviorEvent("denierHazards", hazardId, data => { data.denier.hazardsCreated++; })),
      recordDenierHazardContact: safe("record Denier hazard contact", ({ entryId, hazardId } = {}) =>
        uniqueBehaviorEvent("denierContacts", entryId ?? hazardId, data => { data.denier.hazardContacts++; })),
      recordDenierHazardDamage: safe("record Denier hazard damage", () => {
        if (encounter) encounter.data.denier.hazardDamageEvents++;
      }),
      recordBehaviorFrame: safe("record behavior frame", (details = {}) => {
        if (!encounter) return;
        encounter.data.denier.activeHazardTime += nonNegative(details.activeHazardTime);
        encounter.data.support.activeTime += nonNegative(details.supportActiveTime);
        encounter.data.support.affectedEnemyTime += nonNegative(details.affectedEnemyTime);
      }),
      recordSupportAffectedAction: safe("record Support affected action", () => {
        if (encounter) encounter.data.support.affectedSpecialActions++;
      }),
      recordSupportLinkCreated: safe("record Support link", ({ linkId } = {}) =>
        uniqueBehaviorEvent("supportLinks", linkId, data => { data.support.linksCreated++; })),
      recordFastStrikeTelegraph: safe("record Fast strike telegraph", () => {
        if (encounter) encounter.data.fast.telegraphs++;
      }),
      recordTankSlamTelegraph: safe("record Tank slam telegraph", () => {
        if (encounter) encounter.data.tank.telegraphs++;
      }),
      recordTankSlamImpact: safe("record Tank slam impact", () => {
        if (encounter) encounter.data.tank.impacts++;
      }),
      recordGunnerBurst: safe("record Gunner burst", () => {
        if (encounter) encounter.data.gunner.bursts++;
      }),
      recordArtilleryWarning: safe("record Artillery warning", () => {
        if (encounter) encounter.data.artillery.warnings++;
      }),
      recordArtilleryImpact: safe("record Artillery impact", () => {
        if (encounter) encounter.data.artillery.impacts++;
      }),
      recordTrapperArm: safe("record Trapper arm", () => {
        if (encounter) encounter.data.trapper.arms++;
      }),
      recordTrapperTrigger: safe("record Trapper trigger", () => {
        if (encounter) encounter.data.trapper.triggers++;
      }),
      recordTetherConnect: safe("record Tether connect", () => {
        if (encounter) encounter.data.tether.connects++;
      }),
      recordTetherBreak: safe("record Tether break", () => {
        if (encounter) encounter.data.tether.breaks++;
      }),
      recordWaveComing: safe("record Wave Coming", ({ startFill, selectedDelta, delta, target, budgetArea } = {}) => {
        if (!encounter) return;
        encounter.data.waveComingStartFill = nonNegative(startFill);
        encounter.data.waveComingSelectedDelta = nonNegative(selectedDelta);
        encounter.data.waveComingDelta = nonNegative(delta);
        encounter.data.waveComingTarget = nonNegative(target);
        encounter.data.waveComingBudgetArea = nonNegative(budgetArea);
      }),
      recordSpawnPlacementAttempt: safe("record spawn placement attempt", (details = {}) => {
        if (!encounter) return;
        encounter.data.spawnPlacementAttempts++;
        encounter.data.selectedType = details.selectedType || encounter.data.selectedType;
        encounter.data.preferredDistanceTag = details.preferredDistanceTag || encounter.data.preferredDistanceTag;
        encounter.data.fallbackDistanceBandUsed = details.fallbackDistanceBandUsed || null;
        encounter.data.placementRetryCount = nonNegative(details.placementRetryCount);
        encounter.data.spawnPlacementRetryCount = Math.max(encounter.data.spawnPlacementRetryCount,
          nonNegative(details.placementRetryCount));
        increment(encounter.data.selectedSpawnDistanceTag, details.preferredDistanceTag);
        if (details.fallbackDistanceBandUsed) increment(encounter.data.fallbackSpawnDistanceBand, details.fallbackDistanceBandUsed);
      }),
      recordSpawnPlacementFailure: safe("record spawn placement failure", (details = {}) => {
        if (!encounter) return;
        encounter.data.selectedType = details.selectedType || encounter.data.selectedType;
        encounter.data.preferredDistanceTag = details.preferredDistanceTag || encounter.data.preferredDistanceTag;
        encounter.data.spawnPlacementFailures++;
        increment(encounter.data.spawnPlacementFailureReason, details.reason || "unknown");
        increment(encounter.data.spawnTypeRejectedByPlacement, details.selectedType || "unknown");
      }),
      recordSpawnTypeRejected: safe("record rejected spawn type", ({ type, reason } = {}) => {
        if (!encounter) return;
        if (reason === "managed-cap") encounter.data.spawnBlockedByManagedCap++;
        if (reason === "fill") encounter.data.spawnBlockedByFill++;
        if (!type) return;
        if (reason === "cap") increment(encounter.data.spawnTypeRejectedByCap, type);
        if (reason === "fill") increment(encounter.data.spawnTypeRejectedByFill, type);
      }),
      recordLifecycleTransition: safe("record lifecycle transition", ({ from, to } = {}) => {
        if (encounter) increment(encounter.data.lifecycleTransitions, `${from || "NONE"}->${to || "UNKNOWN"}`);
      }),
      recordEncounterPhase: safe("record encounter phase", (details = {}) => {
        if (!encounter) return;
        encounter.data.N_ref = nonNegative(details.nRef);
        encounter.data.K_target = nonNegative(details.target);
        encounter.data.settlingDuration = nonNegative(details.settlingDuration);
      }),
      recordContinuousFrame: safe("record Continuous Encounter frame", ({ deltaTime, fill, controller,
        lifecycleCounts, effectiveOpeningTarget, managedCount } = {}) => {
        if (!encounter || !fill || !controller) return;
        for (const key of ["visibleFill", "spawnReservedFill", "returnReservedFill", "reservedFill", "projectedFill"]) {
          encounter.data[key] = nonNegative(fill[key]);
        }
        const sampleTime = nonNegative(deltaTime);
        encounter.data.fillIntegral += encounter.data.visibleFill * sampleTime;
        encounter.data.fillSampleTime += sampleTime;
        encounter.data.minimumVisibleFill = encounter.data.minimumVisibleFill === null
          ? encounter.data.visibleFill : Math.min(encounter.data.minimumVisibleFill, encounter.data.visibleFill);
        encounter.data.maximumVisibleFill = Math.max(encounter.data.maximumVisibleFill, encounter.data.visibleFill);
        encounter.data.spawnCreditNormal = nonNegative(controller.normalCredit);
        encounter.data.spawnCreditComing = nonNegative(controller.comingCredit);
        encounter.data.waveComingCommittedArea = nonNegative(controller.comingCommittedArea);
        encounter.data.waveComingPeakProjectedFill = Math.max(encounter.data.waveComingPeakProjectedFill,
          nonNegative(controller.comingPeakProjectedFill));
        encounter.data.effectiveOpeningTarget = nonNegative(effectiveOpeningTarget);
        encounter.data.managedRegularEnemyCount = nonNegative(managedCount);
        encounter.data.peakManagedRegularEnemyCount = Math.max(encounter.data.peakManagedRegularEnemyCount,
          nonNegative(managedCount));
        encounter.data.spawnTypeHistory = [...(controller.spawnHistory || [])];
        encounter.data.waveProgressArmed = Boolean(controller.waveProgressArmed);
        encounter.data.N_ref = nonNegative(controller.nRef);
        encounter.data.K_target = nonNegative(controller.target);
        encounter.data.currentWaveProgress = nonNegative(controller.progress);
        encounter.data.settlingDuration = nonNegative(controller.settlingDuration);
        encounter.data.enteringEnemyCount = lifecycleCounts?.ENTERING || 0;
        encounter.data.nearOffscreenEnemyCount = lifecycleCounts?.NEAR_OFFSCREEN || 0;
        encounter.data.returningEnemyCount = lifecycleCounts?.RETURNING || 0;
        encounter.data.lifecycleCounts = { ...(lifecycleCounts || {}),
          RESERVED: controller.pendingReservations?.length || 0 };
        encounter.data.reservedEnemyCount = controller.pendingReservations?.length || 0;
      }),
      recordContinuousSpawnCommitted: safe("record Continuous Encounter spawn", ({ type, area, phase } = {}) => {
        if (!encounter) return;
        if (phase !== "WAVE_COMING") {
          encounter.data.normalRefillEvents++;
          encounter.data.normalRefillRequestedArea += nonNegative(area);
        }
        if (type) increment(encounter.data.enemyComposition, type);
      }),
      recordDispatchPulse: safe("record dispatch pulse", ({ reservationsCommitted } = {}) => {
        if (!encounter) return;
        encounter.data.dispatchPulseCount++;
        encounter.data.reservationsCommittedByPulse.push(nonNegative(reservationsCommitted));
      }),
      recordEnemyEligibility: safe("record Enemy eligibility", (details = {}) => {
        if (!encounter) return;
        encounter.data.eligibleEnemyTypes = [...(details.eligibleTypes || [])];
        encounter.data.newlyUnlockedTypes = [...(details.newlyUnlockedTypes || [])];
        encounter.data.newlyIntroducedTypes = [...(details.newlyIntroducedTypes || [])];
        encounter.data.introductionSuppressedTypes = [...(details.introductionSuppressedTypes || [])];
      }),
      recordPlayerEnemyOverlap: safe("record Player Enemy overlap", ({ penetration, corrections } = {}) => {
        if (!encounter) return;
        encounter.data.playerEnemyOverlapEvents++;
        encounter.data.maxPlayerEnemyPenetration = Math.max(encounter.data.maxPlayerEnemyPenetration,
          nonNegative(penetration));
        encounter.data.playerEnemySeparationCorrections += nonNegative(corrections);
      }),
      recordWeaponSwitch: safe("record Weapon switch", ({ activeWeapon } = {}) => {
        if (!encounter) return;
        encounter.data.weaponSwitchCount++;
        encounter.data.activeWeapon = activeWeapon || encounter.data.activeWeapon;
      }),
      recordWeaponAttack: safe("record Weapon attack", ({ weaponId } = {}) => {
        if (!encounter || !weaponId) return;
        const metrics = encounter.data.weaponMetrics[weaponId] ||= { attacks: 0, projectiles: 0,
          hits: 0, damage: 0, kills: 0, pierceEvents: 0, explosionTargets: 0,
          arcBladeTargets: 0, burstShots: 0 };
        metrics.attacks++;
      }),
      recordWeaponProjectile: safe("record Weapon projectile", ({ weaponId } = {}) => {
        if (!encounter || !weaponId) return;
        const metrics = encounter.data.weaponMetrics[weaponId] ||= { attacks: 0, projectiles: 0,
          hits: 0, damage: 0, kills: 0, pierceEvents: 0, explosionTargets: 0,
          arcBladeTargets: 0, burstShots: 0 };
        metrics.projectiles++;
      }),
      recordWeaponHit: safe("record Weapon hit", ({ weaponId, damage } = {}) => {
        if (!encounter || !weaponId) return;
        const metrics = encounter.data.weaponMetrics[weaponId] ||= { attacks: 0, projectiles: 0,
          hits: 0, damage: 0, kills: 0, pierceEvents: 0, explosionTargets: 0,
          arcBladeTargets: 0, burstShots: 0 };
        metrics.hits++; metrics.damage += nonNegative(damage);
      }),
      recordWeaponKill: safe("record Weapon kill", ({ weaponId } = {}) => {
        if (!encounter || !weaponId) return;
        const metrics = encounter.data.weaponMetrics[weaponId] ||= { attacks: 0, projectiles: 0,
          hits: 0, damage: 0, kills: 0, pierceEvents: 0, explosionTargets: 0,
          arcBladeTargets: 0, burstShots: 0 };
        metrics.kills++;
      }),
      recordWeaponPierce: safe("record Weapon pierce", ({ weaponId } = {}) => {
        if (encounter?.data.weaponMetrics[weaponId]) encounter.data.weaponMetrics[weaponId].pierceEvents++;
      }),
      recordWeaponExplosion: safe("record Weapon explosion", ({ weaponId, targetCount } = {}) => {
        if (encounter?.data.weaponMetrics[weaponId]) encounter.data.weaponMetrics[weaponId].explosionTargets += nonNegative(targetCount);
      }),
      recordArcBladeSweep: safe("record Arc Blade sweep", ({ weaponId, targetCount } = {}) => {
        if (encounter?.data.weaponMetrics[weaponId]) encounter.data.weaponMetrics[weaponId].arcBladeTargets += nonNegative(targetCount);
      }),
      recordBurstShot: safe("record Burst shot", ({ weaponId } = {}) => {
        if (encounter?.data.weaponMetrics[weaponId]) encounter.data.weaponMetrics[weaponId].burstShots++;
      }),
      recordEnemyIntroduction: safe("record Enemy introduction", ({ enemyType } = {}) => {
        if (run && typeof enemyType === "string" && enemyType && !run.enemyIntroductionsShown.includes(enemyType)) {
          run.enemyIntroductionsShown.push(enemyType);
        }
      }),
      recordUpgrade: safe("record upgrade", recordUpgrade),
      recordUpgradeChoice: safe("record upgrade choice", recordUpgradeChoice),
      finishEncounter: safe("finish encounter", finishEncounter), finishRun: safe("finish run", finishRun),
      getCurrentRun: safe("current run snapshot", runSnapshot),
      getRunReport: safe("run report", () => { const current = runSnapshot(); return report(current ? [current] : []); }),
      getSessionReport: safe("session report", () => report(completedRuns))
    });
  }
  global.PlaytestTelemetry = Object.freeze({ isEnabled, createTelemetry });
})(globalThis);
