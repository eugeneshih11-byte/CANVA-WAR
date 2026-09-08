// Encounter content and evaluation. All tuning here is provisional playtest data.
(function (global) {
  function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  const CONFIG = freeze({ attempts: 12, maxEnemies: 18, maxActiveEnemies: 8,
    minimumFill: 0.85, maximumFill: 1.1, intermission: 4, stageClear: 1.25,
    baseHandlingTime: 2.5, specialMechanicTime: 0, clearTime: { normal: 2.5, fast: 2, tank: 5.5 },
    // Analysis-only references: current kills award 1; no clear/performance awards exist yet.
    scoreReference: { normal: 1, fast: 1, tank: 1, boss: 0, clear: 0, performance: 0 }
  });
  const ENEMIES = freeze({
    normal: { roles: ["frontline"], threatCost: 1 },
    fast: { roles: ["pressure"], threatCost: 1.4 },
    tank: { roles: ["frontline", "heavy"], threatCost: 2.2 }
  });
  const TEMPLATES = freeze({
    basic: { shares: [0.55, 0.45], delays: [0, 2.5], bias: { frontline: 1.25 }, required: [] },
    rush: { shares: [0.35, 0.65], delays: [0, 1.5], bias: { pressure: 1.8 }, required: ["pressure"] },
    heavy: { shares: [0.45, 0.55], delays: [0, 2.8], bias: { heavy: 1.8 }, required: ["heavy"] },
    escalation: { shares: [0.2, 0.3, 0.5], delays: [0, 2, 2.5], bias: {}, required: [] },
    mixed: { shares: [0.34, 0.33, 0.33], delays: [0, 2, 2.2], bias: {}, required: ["frontline", "pressure"] }
  });
  const STAGES = freeze([{
    id: "stage-1", waveCount: 5, enemyPool: ["normal", "fast", "tank"],
    templatePool: Object.keys(TEMPLATES), threatCurve: [8, 10, 12, 14, 17],
    maxActiveThreatCurve: [4.5, 5.5, 6.5, 7.5, 9],
    availability: [["normal"], ["normal", "fast"], ["normal", "fast", "tank"],
      ["normal", "fast", "tank"], ["normal", "fast", "tank"]],
    templates: [["basic"], ["basic", "rush"], ["basic", "rush", "heavy"],
      ["rush", "heavy", "escalation"], ["heavy", "escalation", "mixed"]],
    mechanics: [], enemyScaling: { hpMultiplier: 1, damageMultiplier: 1, speedMultiplier: 1 }, boss: "boss-1"
  }]);
  const BOSSES = freeze({ "boss-1": { id: "boss-1",
    stats: { width: 100, height: 100, speed: 50, hp: 50, maxHp: 50, damage: 1 },
    contactCooldown: 1, phases: [], adds: [], mechanics: [], supportEnemies: [],
    analysis: { threat: 0, expectedClearTime: 30, expectedBaseScore: 0, performanceAllowance: 0, scoreCapacity: 0 }
  } });
  const hasRole = (type, role) => ENEMIES[type].roles.includes(role);
  function rules(stage, index) {
    if (!stage || typeof stage.id !== "string" || !stage.id || !Number.isInteger(stage.waveCount) ||
        !Number.isInteger(index) || index < 0 || index >= stage.waveCount ||
        !Array.isArray(stage.enemyPool) || stage.enemyPool.some(t => !ENEMIES[t]) ||
        !Array.isArray(stage.templatePool) || !Array.isArray(stage.mechanics) ||
        !Number.isFinite(stage.threatCurve?.[index]) || stage.threatCurve[index] <= 0 ||
        !Number.isFinite(stage.maxActiveThreatCurve?.[index]) || stage.maxActiveThreatCurve[index] <= 0 ||
        !Array.isArray(stage.availability?.[index]) || !Array.isArray(stage.templates?.[index])) {
      throw new Error("Invalid Stage restriction");
    }
    if (stage.availability[index].some(t => !stage.enemyPool.includes(t))) throw new Error("Invalid Stage Enemy restriction");
    const pool = stage.availability[index].filter(t => stage.enemyPool.includes(t));
    const templates = stage.templates[index].filter(t => stage.templatePool.includes(t) && TEMPLATES[t] &&
      (t !== "mixed" || TEMPLATES[t].required.every(r => pool.some(e => hasRole(e, r)))));
    if (!pool.length || !templates.length) throw new Error("No eligible encounter content");
    return { pool, templates, budget: stage.threatCurve[index], cap: stage.maxActiveThreatCurve[index] };
  }
  function templateWeight(id, history = []) {
    if (history.at(-1) === id) return 0.35;
    if (history.at(-2) === id) return 0.7;
    return 1;
  }
  function choose(items, weight, rng) {
    const weights = items.map(weight);
    const random = rng();
    if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error("Invalid RNG value");
    let target = random * weights.reduce((a, b) => a + b, 0);
    return items.find((item, i) => (target -= weights[i]) < 0) || items.at(-1);
  }
  function groupStats(group) {
    return group.enemies.reduce((sum, entry) => ({ count: sum.count + entry.count,
      threat: sum.threat + ENEMIES[entry.type].threatCost * entry.count }), { count: 0, threat: 0 });
  }
  function validateWave(wave, stage, index = wave?.waveIndex) {
    const errors = [];
    let rule;
    try { rule = rules(stage, index); } catch (error) { return { valid: false, errors: [error.message] }; }
    if (!wave || typeof wave.id !== "string" || !wave.id || !Array.isArray(wave.mechanics) ||
        wave.stageId !== stage.id || wave.waveIndex !== index || !rule.templates.includes(wave.templateId) ||
        wave.threatBudget !== rule.budget || wave.maxActiveThreat !== rule.cap) errors.push("Invalid Stage restriction");
    let count = 0, threat = 0;
    const roles = new Set();
    if (!Array.isArray(wave?.spawnGroups) || !wave.spawnGroups.length) errors.push("Empty Wave");
    for (const group of Array.isArray(wave?.spawnGroups) ? wave.spawnGroups : []) {
      if (!group || !Number.isFinite(group.delay) || group.delay < 0 || !Array.isArray(group.enemies) || !group.enemies.length) {
        errors.push("Malformed Spawn Group or delay"); continue;
      }
      let groupCount = 0, groupThreat = 0;
      for (const entry of group.enemies) {
        if (!entry || !ENEMIES[entry.type] || !rule.pool.includes(entry.type) || !Number.isInteger(entry.count) || entry.count <= 0) {
          errors.push("Unknown/unavailable Enemy or invalid count"); continue;
        }
        groupCount += entry.count;
        groupThreat += ENEMIES[entry.type].threatCost * entry.count;
        ENEMIES[entry.type].roles.forEach(r => roles.add(r));
      }
      if (groupCount > CONFIG.maxActiveEnemies || groupThreat > rule.cap + 1e-9) errors.push("Spawn Group exceeds field capacity");
      count += groupCount; threat += groupThreat;
    }
    if (!count || count > CONFIG.maxEnemies) errors.push("Invalid total Enemy count");
    if (threat < rule.budget * CONFIG.minimumFill - 1e-9 || threat > rule.budget * CONFIG.maximumFill + 1e-9) errors.push("Threat outside tolerance");
    for (const role of TEMPLATES[wave?.templateId]?.required || []) {
      if ((wave.templateId === "mixed" || rule.pool.some(e => hasRole(e, role))) && !roles.has(role)) errors.push(`Missing required Role: ${role}`);
    }
    return { valid: errors.length === 0, errors, threat, enemyCount: count };
  }
  function analyzeWave(wave) {
    let threat = 0, combatEstimate = 0, plannedSpawnFloor = 0, expectedBaseScore = CONFIG.scoreReference.clear;
    for (const group of wave.spawnGroups) {
      plannedSpawnFloor += group.delay;
      for (const { type, count } of group.enemies) {
        threat += ENEMIES[type].threatCost * count;
        combatEstimate += CONFIG.clearTime[type] * count;
        expectedBaseScore += CONFIG.scoreReference[type] * count;
      }
    }
    const performanceAllowance = CONFIG.scoreReference.performance;
    return { threat, expectedClearTime: CONFIG.baseHandlingTime + Math.max(combatEstimate, plannedSpawnFloor) + CONFIG.specialMechanicTime,
      expectedBaseScore, performanceAllowance, scoreCapacity: expectedBaseScore + performanceAllowance };
  }
  function compareMaskOrder(first, second, itemCount) {
    for (let index = 0; index < itemCount; index++) {
      const bit = 1 << index;
      if ((first & bit) !== (second & bit)) return first & bit ? -1 : 1;
    }
    return 0;
  }
  // A Wave has at most 18 selected Enemies, so bitmasks provide a bounded exact
  // search. Each slot chooses the closest legal subset; the final slot gets the remainder.
  function packGroups(selected, shares, cap) {
    if (selected.length < shares.length) return null;
    const maskLimit = 1 << selected.length, fullMask = maskLimit - 1;
    const counts = new Uint8Array(maskLimit), threats = new Float64Array(maskLimit);
    for (let mask = 1; mask < maskLimit; mask++) {
      const bit = mask & -mask, previous = mask ^ bit;
      const index = 31 - Math.clz32(bit);
      counts[mask] = counts[previous] + 1;
      threats[mask] = threats[previous] + ENEMIES[selected[index]].threatCost;
    }
    const totalThreat = threats[fullMask], memo = new Map();
    function search(remainingMask, slot) {
      const key = slot * maskLimit + remainingMask;
      if (memo.has(key)) return memo.get(key);
      const groupsLeft = shares.length - slot;
      if (counts[remainingMask] < groupsLeft ||
          counts[remainingMask] > groupsLeft * CONFIG.maxActiveEnemies ||
          threats[remainingMask] > groupsLeft * cap + 1e-9) {
        memo.set(key, null); return null;
      }
      if (groupsLeft === 1) {
        const result = counts[remainingMask] <= CONFIG.maxActiveEnemies && threats[remainingMask] <= cap + 1e-9 ?
          [remainingMask] : null;
        memo.set(key, result); return result;
      }
      const target = totalThreat * shares[slot], candidates = [];
      for (let mask = remainingMask; mask; mask = (mask - 1) & remainingMask) {
        const rest = remainingMask ^ mask;
        if (counts[mask] > CONFIG.maxActiveEnemies || threats[mask] > cap + 1e-9 ||
            counts[rest] < groupsLeft - 1 || counts[rest] > (groupsLeft - 1) * CONFIG.maxActiveEnemies ||
            threats[rest] > (groupsLeft - 1) * cap + 1e-9) continue;
        candidates.push({ mask, distance: Math.abs(threats[mask] - target),
          overshoots: threats[mask] > target + 1e-9 });
      }
      candidates.sort((first, second) => {
        const distance = first.distance - second.distance;
        if (Math.abs(distance) > 1e-9) return distance;
        if (first.overshoots !== second.overshoots) return first.overshoots ? 1 : -1;
        return compareMaskOrder(first.mask, second.mask, selected.length);
      });
      for (const candidate of candidates) {
        const remaining = search(remainingMask ^ candidate.mask, slot + 1);
        if (remaining) {
          const result = [candidate.mask, ...remaining];
          memo.set(key, result); return result;
        }
      }
      memo.set(key, null); return null;
    }
    const masks = search(fullMask, 0);
    return masks?.map(mask => selected.flatMap((type, index) => mask & (1 << index) ? [{ type, count: 1 }] : [])) || null;
  }
  function allocateGroups(selected, template, cap) {
    const primaryCount = template.shares.length;
    for (let groupCount = primaryCount; groupCount <= selected.length; groupCount++) {
      const extraCount = groupCount - primaryCount, finalSlotParts = extraCount + 1;
      const shares = extraCount ? [...template.shares.slice(0, -1),
        ...Array(finalSlotParts).fill(template.shares.at(-1) / finalSlotParts)] : template.shares;
      const groups = packGroups(selected, shares, cap);
      if (!groups) continue;
      // Structural continuations split only the final slot. Its configured delay occurs
      // once; zero-delay continuations are then paced by the existing field-capacity gate.
      const delays = extraCount ? [...template.delays, ...Array(extraCount).fill(0)] : template.delays;
      return groups.map((enemies, slot) => ({ delay: delays[slot], enemies }));
    }
    return [];
  }
  // Fill content first, then allocate it around the template's target shares.
  function build(stage, index, rule, templateId, rng, fallback) {
    const template = TEMPLATES[templateId], selected = [];
    let threat = 0;
    const add = type => { selected.push(type); threat += ENEMIES[type].threatCost; };
    for (const role of template.required) {
      if (selected.some(t => hasRole(t, role))) continue;
      const candidates = rule.pool.filter(t => hasRole(t, role) && ENEMIES[t].threatCost <= rule.cap);
      if (candidates.length) add(fallback ? candidates[0] : choose(candidates, () => 1, rng));
    }
    for (let i = selected.length; i < CONFIG.maxEnemies; i++) {
      const candidates = rule.pool.filter(t => ENEMIES[t].threatCost <= rule.cap && threat + ENEMIES[t].threatCost <= rule.budget + 1e-9);
      if (!candidates.length) break;
      add(fallback ? ["normal", "fast", "tank"].find(t => candidates.includes(t)) : choose(candidates, t => {
        let weight = ENEMIES[t].roles.reduce((w, r) => w * (template.bias[r] || 1), 1);
        if (templateId === "mixed") weight /= 1 + selected.filter(e => ENEMIES[t].roles.some(r => hasRole(e, r))).length;
        return weight;
      }, rng));
    }
    if (threat < rule.budget * CONFIG.minimumFill && selected.length < CONFIG.maxEnemies) {
      const extra = rule.pool.find(t => ENEMIES[t].threatCost <= rule.cap && threat + ENEMIES[t].threatCost <= rule.budget * CONFIG.maximumFill);
      if (extra) add(extra);
    }
    const spawnGroups = allocateGroups(selected, template, rule.cap);
    return { id: `${stage.id}-wave-${index + 1}`, stageId: stage.id, waveIndex: index, templateId,
      threatBudget: rule.budget, maxActiveThreat: rule.cap, spawnGroups, mechanics: [...stage.mechanics] };
  }
  function safeFallback(stage, index) {
    const rule = rules(stage, index);
    for (const id of rule.templates) {
      const wave = build(stage, index, rule, id, () => 0, true);
      if (validateWave(wave, stage).valid) return wave;
    }
    throw new Error("Stage restrictions cannot support a safe encounter");
  }
  function generateWave(stage, index, context = {}, rng = Math.random) {
    const rule = rules(stage, index);
    let wave, attempts = 0;
    for (; attempts < CONFIG.attempts; attempts++) {
      try {
        const id = choose(rule.templates, t => templateWeight(t, context.recentTemplates), rng);
        const candidate = build(stage, index, rule, id, rng, false);
        if (validateWave(candidate, stage).valid) { wave = candidate; attempts++; break; }
      } catch { /* Invalid random candidates retry within the fixed bound. */ }
    }
    const usedFallback = !wave;
    wave ||= safeFallback(stage, index);
    return freeze({ ...wave, analysis: analyzeWave(wave), generation: { attempts, usedFallback } });
  }
  function createWaveRuntime(wave) {
    return { waveId: wave.id, elapsedTime: 0, nextSpawnGroupIndex: 0, groupDelayElapsed: 0,
      spawnedEnemyCount: 0, aliveEnemyCount: 0, activeThreat: 0, damageTaken: 0, isComplete: false, analysis: wave.analysis };
  }
  function syncWaveRuntime(wave, runtime, enemies) {
    const living = enemies.filter(e => e.waveId === runtime.waveId && e.hp > 0);
    runtime.aliveEnemyCount = living.length;
    runtime.activeThreat = living.reduce((sum, e) => sum + ENEMIES[e.type].threatCost, 0);
    runtime.isComplete = runtime.nextSpawnGroupIndex === wave.spawnGroups.length && !living.length;
  }
  function updateWaveRuntime(wave, runtime, enemies, deltaTime, spawn) {
    runtime.elapsedTime += deltaTime; runtime.groupDelayElapsed += deltaTime;
    syncWaveRuntime(wave, runtime, enemies);
    const group = wave.spawnGroups[runtime.nextSpawnGroupIndex];
    if (!group) return;
    const stats = groupStats(group);
    if (runtime.groupDelayElapsed + 1e-9 < group.delay || runtime.activeThreat + stats.threat > wave.maxActiveThreat + 1e-9 ||
        runtime.aliveEnemyCount + stats.count > CONFIG.maxActiveEnemies) return;
    for (const entry of group.enemies) for (let i = 0; i < entry.count; i++) spawn(entry.type, wave.id);
    runtime.spawnedEnemyCount += stats.count;
    runtime.nextSpawnGroupIndex++; runtime.groupDelayElapsed = 0;
    syncWaveRuntime(wave, runtime, enemies);
  }
  function getScaledEnemyStats(base, scaling) {
    return { ...base, hp: base.hp * scaling.hpMultiplier, maxHp: base.maxHp * scaling.hpMultiplier,
      damage: (base.damage ?? 1) * scaling.damageMultiplier, speed: base.speed * scaling.speedMultiplier };
  }
  global.Encounters = Object.freeze({ CONFIG, ENEMIES, TEMPLATES, STAGES, BOSSES, templateWeight,
    validateWave, analyzeWave, generateWave, safeFallback, createWaveRuntime, syncWaveRuntime, updateWaveRuntime, getScaledEnemyStats });
})(globalThis);
