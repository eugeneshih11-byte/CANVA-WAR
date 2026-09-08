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
      return copy({ ...data, encounterElapsedTime: duration, actualClearTime, activeCombatTime: duration,
        clearTimeRatio: actualClearTime !== null && data.analysis.expectedClearTime > 0
          ? actualClearTime / data.analysis.expectedClearTime : null,
        averageActiveEnemyCount: duration > 0 ? encounter.enemyIntegral / duration : 0,
        averageActiveThreat: duration > 0 ? encounter.threatIntegral / duration : 0 });
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
    function startRun({ player } = {}) {
      const playerStart = copy(player || {});
      // A reset without a terminal game event still preserves the previous observations.
      if (run) finishRun({ endReason: "run-ended-other", player: { ...run.playerStart,
        playerHp: run.finalPlayerHp, playerLevel: run.finalPlayerLevel } });
      run = { runSequence: ++sequence, startedAt: timestamp(), endedAt: null, endReason: null,
        completed: false, stageReached: null, waveReached: 0, bossReached: false, victory: false,
        playerStart, finalPlayerHp: playerStart.playerHp, finalPlayerLevel: playerStart.playerLevel,
        totalActiveCombatTime: 0, totalIntermissionTime: 0, encounters: [], upgradeHistory: [], settlement: null };
    }
    function startEncounter({ type, definition, stageId, waveIndex, player }) {
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
        ...(type === "boss" ? { bossId: source.id } : { waveId: source.id, templateId: source.templateId,
          threatBudget: source.threatBudget, generatedThreat: source.analysis.threat,
          maxActiveThreat: source.maxActiveThreat, enemyComposition, spawnGroups }),
        analysis: source.analysis, playerStart, playerEnd: null,
        encounterElapsedTime: 0, actualClearTime: null,
        damageTaken: 0, damageEvents: 0, damageByEnemyType: {}, damageEventsByEnemyType: {},
        startHp: playerStart.playerHp, endHp: playerStart.playerHp, minimumHp: playerStart.playerHp,
        minimumHpRatio: playerStart.playerMaxHp > 0 ? playerStart.playerHp / playerStart.playerMaxHp : 0,
        timeAtOrBelow30PercentHp: 0, playerLevelStart: playerStart.playerLevel, playerLevelEnd: playerStart.playerLevel,
        killsByEnemyType: {}, nonKillRemovalsByEnemyType: {}, nonKillRemovalsByReason: {},
        shotsFired: 0, bulletHits: 0, bulletHitsByEnemyType: {}, bulletDamageByEnemyType: {}, enemySecondsByType: {},
        peakActiveEnemyCount: 0, peakActiveThreat: 0, configuredSpawnFloor: spawnGroups.reduce((sum, g) => sum + g.delay, 0),
        groupReleaseTimes: [], lastSpawnGroupReleaseTime: null, actualLastGroupReleaseTime: null,
        pressureBlockedTime: 0, pressureBlockedEvents: 0, threatBlockedTime: 0, enemyCountBlockedTime: 0, outcome: null };
      encounter = { data, enemyIntegral: 0, threatIntegral: 0, pressureBlocked: false, released: new Set() };
      run.stageReached = data.stageId;
      if (type === "wave") run.waveReached = Math.max(run.waveReached, data.waveIndex + 1);
      if (type === "boss") run.bossReached = true;
      run.finalPlayerHp = playerStart.playerHp;
      run.finalPlayerLevel = playerStart.playerLevel;
    }
    function recordEncounterFrame({ deltaTime, activeEnemyCount, activeThreat, hp, maxHp,
      nextSpawnGroupIndex, groupDelayElapsed, enemiesByType = {} }) {
      if (!run || !encounter) return;
      const dt = nonNegative(deltaTime), count = nonNegative(activeEnemyCount), threat = nonNegative(activeThreat);
      const data = encounter.data;
      data.encounterElapsedTime += dt;
      run.totalActiveCombatTime += dt;
      encounter.enemyIntegral += count * dt;
      encounter.threatIntegral += threat * dt;
      data.peakActiveEnemyCount = Math.max(data.peakActiveEnemyCount, count);
      data.peakActiveThreat = Math.max(data.peakActiveThreat, threat);
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
    function recordUpgrade({ playerLevel, upgradeId, upgradeName, weapon }) {
      if (!run) return;
      run.upgradeHistory.push(copy({ playerLevel, upgradeId, upgradeName, weapon,
        encounterIndex: encounter ? run.encounters.length : null, activeCombatTime: run.totalActiveCombatTime }));
      run.finalPlayerLevel = playerLevel;
      if (encounter) encounter.data.playerLevelEnd = playerLevel;
    }
    const report = runs => copy({ schemaVersion: 1, generatedAt: timestamp(), environment, configuration, runs });
    return Object.freeze({ enabled,
      startRun: safe("start run", startRun), startEncounter: safe("start encounter", startEncounter),
      recordEncounterFrame: safe("record frame", recordEncounterFrame),
      recordGroupRelease: safe("record group release", recordGroupRelease),
      recordIntermission: safe("record intermission", ({ deltaTime }) => {
        if (run) run.totalIntermissionTime += nonNegative(deltaTime);
      }),
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
      recordDamage: safe("record damage", recordDamage), recordUpgrade: safe("record upgrade", recordUpgrade),
      finishEncounter: safe("finish encounter", finishEncounter), finishRun: safe("finish run", finishRun),
      getCurrentRun: safe("current run snapshot", runSnapshot),
      getRunReport: safe("run report", () => { const current = runSnapshot(); return report(current ? [current] : []); }),
      getSessionReport: safe("session report", () => report(completedRuns))
    });
  }
  global.PlaytestTelemetry = Object.freeze({ isEnabled, createTelemetry });
})(globalThis);
