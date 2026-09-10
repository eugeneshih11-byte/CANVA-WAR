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
    baseHandlingTime: 2.5, specialMechanicTime: 0, clearTime: { normal: 0.4, fast: 0.25, tank: 1 },
    // Analysis-only references: current kills award 1; no clear/performance awards exist yet.
    scoreReference: { normal: 1, fast: 1, tank: 1, boss: 0, clear: 0, performance: 0 }
  });
  // Combat Variety v1 is experimental content. Its values are intentionally kept
  // together so the protected Calibration A values remain easy to audit.
  const COMBAT_VARIETY_V1 = freeze({
    id: "combat-variety-v1",
    introductions: {
      interceptor: { name: "INTERCEPTOR", role: "Predictive Attacker",
        description: "Predicts your movement and commits to a long charge.",
        counterplay: "Change direction after it locks on.",
        preview: { color: "#eab308", shape: "diamond" } },
      denier: { name: "DENIER", role: "Area Controller",
        description: "Creates persistent danger zones along your predicted route.",
        counterplay: "Leave marked areas before repeated damage builds up.",
        preview: { color: "#be123c", shape: "zone" } },
      support: { name: "SUPPORT", role: "Enemy Enhancer",
        description: "Links to a special enemy and accelerates its abilities.",
        counterplay: "Destroy the Support to break the link.",
        preview: { color: "#0f766e", shape: "link" } }
    },
    enemies: {
      interceptor: {
        roles: ["pressure", "interceptor"], threatCost: 1.6,
        stats: { width: 34, height: 34, speed: 105, hp: 3, maxHp: 3, damage: 1 },
        behavior: { profile: "interceptor", initialCooldown: 0.9, cooldown: 3,
          telegraphDuration: 0.55, chargeDuration: 1.6, recoveryDuration: 0.65,
          chargeSpeed: 340, maxChargeDistance: 520, predictionLeadTime: 0.5 }
      },
      denier: {
        roles: ["control"], threatCost: 1.8,
        stats: { width: 40, height: 40, speed: 85, hp: 3, maxHp: 3, damage: 1 },
        behavior: { profile: "denier", initialCooldown: 0.9, cooldown: 4,
          predictionLeadTime: 0.75, telegraphDuration: 0.75,
          hazardRadius: 55, hazardActiveDuration: 3, hazardDamage: 1, hazardDamageInterval: 1 }
      },
      support: {
        roles: ["support"], threatCost: 1.7,
        stats: { width: 38, height: 38, speed: 80, hp: 3, maxHp: 3, damage: 1 },
        behavior: { profile: "support", cooldownRate: 1.75,
          eligibleProfiles: ["interceptor", "denier"] }
      }
    },
    requiredEnemies: [{}, {}, { interceptor: 1 }, { denier: 1 }, { support: 1, interceptor: 1 }],
    clearTime: { interceptor: 0.4, denier: 0.4, support: 0.4 },
    scoreReference: { interceptor: 1, denier: 1, support: 1 }
  });
  const ENEMIES = freeze({
    normal: { roles: ["frontline"], threatCost: 1,
      stats: { width: 40, height: 40, speed: 120, hp: 3, maxHp: 3, damage: 1 },
      behavior: { profile: "chase" } },
    fast: { roles: ["pressure"], threatCost: 1.4,
      stats: { width: 30, height: 30, speed: 200, hp: 1, maxHp: 1, damage: 1 },
      behavior: { profile: "chase" } },
    tank: { roles: ["frontline", "heavy"], threatCost: 2.2,
      stats: { width: 60, height: 60, speed: 70, hp: 8, maxHp: 8, damage: 1 },
      behavior: { profile: "chase" } },
    ...COMBAT_VARIETY_V1.enemies
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
    maxActiveThreatCurve: [6, 7, 8.5, 10, 12],
    availability: [["normal"], ["normal", "fast"], ["normal", "fast", "tank"],
      ["normal", "fast", "tank"], ["normal", "fast", "tank"]],
    templates: [["basic"], ["basic", "rush"], ["basic", "rush", "heavy"],
      ["rush", "heavy", "escalation"], ["heavy", "escalation", "mixed"]],
    mechanics: [], enemyScaling: { hpMultiplier: 1, damageMultiplier: 1, speedMultiplier: 1 }, boss: "boss-1"
  }]);
  const PROTOTYPE_STAGES = freeze([{
    ...STAGES[0],
    enemyPool: ["normal", "fast", "tank", "interceptor", "denier", "support"],
    availability: [["normal"], ["normal", "fast"], ["normal", "fast", "tank", "interceptor"],
      ["normal", "fast", "tank", "denier"], ["normal", "fast", "tank", "support", "interceptor"]],
    requiredEnemies: COMBAT_VARIETY_V1.requiredEnemies,
    requiredTogether: [[], [], [], [], [["support", "interceptor"]]],
    introductions: [[], [], ["interceptor"], ["denier"], ["support"]],
    mechanics: [COMBAT_VARIETY_V1.id]
  }]);
  const BOSSES = freeze({ "boss-1": { id: "boss-1",
    stats: { width: 100, height: 100, speed: 60, hp: 100, maxHp: 100, damage: 1 },
    contactCooldown: 1, phases: ["chase", "telegraph", "charge", "recovery"],
    chargeCycle: { initialChaseDuration: 2.5, chaseDuration: 2, telegraphDuration: 0.65,
      chargeDuration: 0.45, chargeSpeed: 420, recoveryDuration: 0.55 },
    adds: [], mechanics: ["charge-cycle"], supportEnemies: [],
    analysis: { threat: 0, expectedClearTime: 15, expectedBaseScore: 0, performanceAllowance: 0, scoreCapacity: 0 }
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
    const requiredEnemies = stage.requiredEnemies?.[index] || {};
    if (Object.entries(requiredEnemies).some(([type, count]) =>
      !pool.includes(type) || !Number.isInteger(count) || count < 0)) {
      throw new Error("Invalid required Enemy restriction");
    }
    const requiredTogether = stage.requiredTogether?.[index] || [];
    if (!Array.isArray(requiredTogether) || requiredTogether.some(group => !Array.isArray(group) || group.length < 2 ||
      group.some(type => !Object.hasOwn(requiredEnemies, type) || requiredEnemies[type] < 1))) {
      throw new Error("Invalid required-together restriction");
    }
    return { pool, templates, budget: stage.threatCurve[index], cap: stage.maxActiveThreatCurve[index],
      requiredEnemies, requiredTogether };
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
    const composition = {};
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
        composition[entry.type] = (composition[entry.type] || 0) + entry.count;
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
    for (const [type, requiredCount] of Object.entries(rule.requiredEnemies)) {
      if ((composition[type] || 0) !== requiredCount) errors.push(`Invalid required Enemy count: ${type}`);
    }
    const primaryGroupCount = TEMPLATES[wave?.templateId]?.shares.length || 0;
    for (const together of rule.requiredTogether) {
      const found = wave?.spawnGroups?.slice(0, primaryGroupCount).some(group =>
        together.every(type => group.enemies.some(entry => entry.type === type && entry.count > 0)));
      if (!found) errors.push(`Missing required primary Group: ${together.join("+")}`);
    }
    return { valid: errors.length === 0, errors, threat, enemyCount: count };
  }
  function analyzeWave(wave) {
    let threat = 0, combatEstimate = 0, plannedSpawnFloor = 0, expectedBaseScore = CONFIG.scoreReference.clear;
    for (const group of wave.spawnGroups) {
      plannedSpawnFloor += group.delay;
      for (const { type, count } of group.enemies) {
        threat += ENEMIES[type].threatCost * count;
        combatEstimate += (CONFIG.clearTime[type] ?? COMBAT_VARIETY_V1.clearTime[type] ?? 0) * count;
        expectedBaseScore += (CONFIG.scoreReference[type] ?? COMBAT_VARIETY_V1.scoreReference[type] ?? 0) * count;
      }
    }
    const performanceAllowance = CONFIG.scoreReference.performance;
    return { threat, expectedClearTime: CONFIG.baseHandlingTime + combatEstimate + plannedSpawnFloor + CONFIG.specialMechanicTime,
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
  function packGroups(selected, shares, cap, requiredTogetherIndexGroups = [], primaryGroupCount = shares.length) {
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
    const togetherMasks = requiredTogetherIndexGroups.map(indexes =>
      indexes.reduce((mask, index) => mask | (1 << index), 0));
    const keepsTogether = mask => togetherMasks.every(togetherMask =>
      (mask & togetherMask) === 0 || (mask & togetherMask) === togetherMask);
    const containsTogether = mask => togetherMasks.some(togetherMask => (mask & togetherMask) === togetherMask);
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
        const result = keepsTogether(remainingMask) && (!containsTogether(remainingMask) || slot < primaryGroupCount) &&
          counts[remainingMask] <= CONFIG.maxActiveEnemies && threats[remainingMask] <= cap + 1e-9 ?
          [remainingMask] : null;
        memo.set(key, result); return result;
      }
      const target = totalThreat * shares[slot], candidates = [];
      for (let mask = remainingMask; mask; mask = (mask - 1) & remainingMask) {
        const rest = remainingMask ^ mask;
        if (!keepsTogether(mask) || (containsTogether(mask) && slot >= primaryGroupCount) ||
            counts[mask] > CONFIG.maxActiveEnemies || threats[mask] > cap + 1e-9 ||
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
  function allocateGroups(selected, template, cap, requiredTogether = []) {
    const primaryCount = template.shares.length;
    const togetherIndexGroups = requiredTogether.map(group => group.map(type => selected.indexOf(type)));
    for (let groupCount = primaryCount; groupCount <= selected.length; groupCount++) {
      const extraCount = groupCount - primaryCount, finalSlotParts = extraCount + 1;
      const shares = extraCount ? [...template.shares.slice(0, -1),
        ...Array(finalSlotParts).fill(template.shares.at(-1) / finalSlotParts)] : template.shares;
      const groups = packGroups(selected, shares, cap, togetherIndexGroups, primaryCount);
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
    for (const [type, count] of Object.entries(rule.requiredEnemies)) {
      for (let requiredIndex = 0; requiredIndex < count; requiredIndex++) add(type);
    }
    for (const role of template.required) {
      if (selected.some(t => hasRole(t, role))) continue;
      const candidates = rule.pool.filter(t => hasRole(t, role) && ENEMIES[t].threatCost <= rule.cap);
      if (candidates.length) add(fallback ? candidates[0] : choose(candidates, () => 1, rng));
    }
    for (let i = selected.length; i < CONFIG.maxEnemies; i++) {
      const candidates = rule.pool.filter(t => !Object.hasOwn(rule.requiredEnemies, t) &&
        ENEMIES[t].threatCost <= rule.cap && threat + ENEMIES[t].threatCost <= rule.budget + 1e-9);
      if (!candidates.length) break;
      add(fallback ? ["normal", "fast", "tank"].find(t => candidates.includes(t)) : choose(candidates, t => {
        let weight = ENEMIES[t].roles.reduce((w, r) => w * (template.bias[r] || 1), 1);
        if (templateId === "mixed") weight /= 1 + selected.filter(e => ENEMIES[t].roles.some(r => hasRole(e, r))).length;
        return weight;
      }, rng));
    }
    if (threat < rule.budget * CONFIG.minimumFill && selected.length < CONFIG.maxEnemies) {
      const extra = rule.pool.find(t => !Object.hasOwn(rule.requiredEnemies, t) &&
        ENEMIES[t].threatCost <= rule.cap && threat + ENEMIES[t].threatCost <= rule.budget * CONFIG.maximumFill);
      if (extra) add(extra);
    }
    const spawnGroups = allocateGroups(selected, template, rule.cap, rule.requiredTogether);
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
  function isPrototypeEnabled(search = "") {
    try {
      if (typeof global.URLSearchParams === "function") {
        return new global.URLSearchParams(search).get("prototype") === COMBAT_VARIETY_V1.id;
      }
      return String(search).replace(/^\?/, "").split("&").some(part => {
        const [key, value = ""] = part.split("=");
        return decodeURIComponent(key) === "prototype" && decodeURIComponent(value) === COMBAT_VARIETY_V1.id;
      });
    } catch { return false; }
  }
  function getStagesForSearch(search = "") {
    return isPrototypeEnabled(search) ? PROTOTYPE_STAGES : STAGES;
  }
  global.Encounters = Object.freeze({ CONFIG, COMBAT_VARIETY_V1, ENEMIES, TEMPLATES, STAGES, PROTOTYPE_STAGES, BOSSES,
    isPrototypeEnabled, getStagesForSearch, templateWeight,
    validateWave, analyzeWave, generateWave, safeFallback, createWaveRuntime, syncWaveRuntime, updateWaveRuntime, getScaledEnemyStats });
})(globalThis);
