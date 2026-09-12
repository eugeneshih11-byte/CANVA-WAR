const assert = require("node:assert/strict");
const test = require("node:test");
require("../encounters.js");
const E = globalThis.Encounters;
const stage = E.STAGES[0];
const copy = value => JSON.parse(JSON.stringify(value));
function seeded(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function forceTemplate(index, templateId) {
  const forced = copy(stage);
  forced.templates[index] = [templateId];
  return forced;
}
function summarizeWave(wave) {
  const composition = {};
  const groups = wave.spawnGroups.map(group => {
    let count = 0, threat = 0;
    for (const entry of group.enemies) {
      count += entry.count;
      threat += E.ENEMIES[entry.type].threatCost * entry.count;
      composition[entry.type] = (composition[entry.type] || 0) + entry.count;
    }
    return { count, threat };
  });
  return { composition: Object.fromEntries(Object.entries(composition).sort()), groups,
    threat: groups.reduce((sum, group) => sum + group.threat, 0) };
}

test("Stage 1 calibration changes concurrency and analysis without changing total Threat or costs", () => {
  assert.deepEqual(stage.threatCurve, [8, 10, 12, 14, 17]);
  assert.deepEqual(stage.maxActiveThreatCurve, [6, 7, 8.5, 10, 12]);
  assert.equal(E.CONFIG.maxActiveEnemies, 8);
  assert.deepEqual(E.CONFIG.clearTime, { normal: 0.4, fast: 0.25, tank: 1 });
  assert.deepEqual(Object.fromEntries(["normal", "fast", "tank"]
    .map(type => [type, E.ENEMIES[type].threatCost])), { normal: 1, fast: 1.4, tank: 2.2 });
});

test("prototype selection is explicit and playtest telemetry alone is gameplay-neutral", () => {
  for (const search of ["", "?playtest=1", "?prototype=other", "?playtest=0&prototype=other"]) {
    assert.equal(E.isPrototypeEnabled(search), false);
    assert.equal(E.getStagesForSearch(search), E.STAGES);
  }
  for (const search of ["?prototype=combat-variety-v1", "?playtest=1&prototype=combat-variety-v1"]) {
    assert.equal(E.isPrototypeEnabled(search), true);
    assert.equal(E.getStagesForSearch(search), E.PROTOTYPE_STAGES);
  }
  assert.deepEqual(E.STAGES[0].enemyPool, ["normal", "fast", "tank"]);
  assert.equal(E.STAGES[0].requiredEnemies, undefined);
  assert.deepEqual(E.STAGES[0].threatCurve, E.PROTOTYPE_STAGES[0].threatCurve);
  assert.deepEqual(E.STAGES[0].maxActiveThreatCurve, E.PROTOTYPE_STAGES[0].maxActiveThreatCurve);
});

test("all ten production Enemy introductions are centralized and teach counterplay", () => {
  const introductions = copy(E.COMBAT_VARIETY_V1.introductions);
  assert.deepEqual(Object.keys(introductions), E.STAGES[0].continuousEnemyTypes);
  for (const introduction of Object.values(introductions)) {
    assert.ok(introduction.name && introduction.role && introduction.description && introduction.counterplay);
    assert.ok(introduction.preview?.color && introduction.preview?.shape);
  }
});

test("all ten Phase B Enemy identities expose separate footprints, policies, profiles and safety config", () => {
  const expected = {
    normal: [56, 56, 2, 110, "NEAR"], fast: [40, 40, 1, 180, "NEAR"],
    tank: [80, 80, 6, 65, "NEAR"], interceptor: [52, 52, 3, 100, "MID"],
    denier: [60, 60, 3, 80, "FAR"], support: [52, 52, 2, 75, "FAR"],
    gunner: [52, 52, 2, 90, "MID"], artillery: [68, 68, 3, 65, "FAR"],
    trapper: [48, 48, 2, 85, "MID"], tether: [56, 56, 3, 95, "MID"]
  };
  assert.deepEqual(E.STAGES[0].continuousEnemyTypes, Object.keys(expected));
  for (const [type, values] of Object.entries(expected)) {
    const definition = E.ENEMIES[type];
    assert.deepEqual([definition.visual.width, definition.visual.height, definition.stats.hp,
      definition.stats.speed, definition.spawnProfile.distance], values);
    assert.ok(definition.collision && definition.navigation && definition.behavior.profile && definition.behavior.attackPolicy);
    assert.equal(definition.mechanicSafetyCap ?? null, ["normal", "fast", "tank"].includes(type) ? null :
      { interceptor: 6, denier: 6, support: 4, gunner: 8, artillery: 4, trapper: 6, tether: 4 }[type]);
  }
  assert.equal(E.ENEMIES.normal.behavior.attackPolicy, "contact");
  for (const type of Object.keys(expected).filter(type => type !== "normal")) {
    assert.notEqual(E.ENEMIES[type].behavior.attackPolicy, "contact");
  }
  assert.equal(E.ENEMIES.support.stats.damage, 0);
});

test("prototype Waves require exact teaching compositions within every existing safety constraint", () => {
  const prototype = E.PROTOTYPE_STAGES[0];
  const expected = [{}, {}, { interceptor: 1 }, { denier: 1 }, { interceptor: 1, support: 1 }];
  for (let seed = 1; seed <= 200; seed++) {
    const rng = seeded(seed), recentTemplates = [];
    for (let index = 0; index < prototype.waveCount; index++) {
      const wave = E.generateWave(prototype, index, { recentTemplates }, rng);
      const validation = E.validateWave(wave, prototype);
      assert.equal(validation.valid, true, validation.errors.join(", "));
      assert.ok(validation.enemyCount <= E.CONFIG.maxEnemies);
      assert.ok(validation.threat <= wave.threatBudget * E.CONFIG.maximumFill + 1e-9);
      const composition = {};
      for (const group of wave.spawnGroups) {
        let groupCount = 0, groupThreat = 0;
        for (const entry of group.enemies) {
          composition[entry.type] = (composition[entry.type] || 0) + entry.count;
          groupCount += entry.count;
          groupThreat += E.ENEMIES[entry.type].threatCost * entry.count;
        }
        assert.ok(groupCount <= E.CONFIG.maxActiveEnemies);
        assert.ok(groupThreat <= wave.maxActiveThreat + 1e-9);
      }
      for (const type of ["interceptor", "denier", "support"]) {
        assert.equal(composition[type] || 0, expected[index][type] || 0, `seed ${seed}, Wave ${index + 1}, ${type}`);
      }
      if (index === 4) {
        const primaryGroupCount = E.TEMPLATES[wave.templateId].shares.length;
        const primaryTypes = new Set(wave.spawnGroups.slice(0, primaryGroupCount)
          .flatMap(group => group.enemies.map(entry => entry.type)));
        assert.equal(primaryTypes.has("support"), true, `seed ${seed}, Wave 5 Support primary`);
        assert.equal(primaryTypes.has("interceptor"), true, `seed ${seed}, Wave 5 Interceptor primary`);
        assert.ok(wave.spawnGroups.slice(0, primaryGroupCount).some(group => {
          const types = group.enemies.map(entry => entry.type);
          return types.includes("support") && types.includes("interceptor");
        }), `seed ${seed}, Wave 5 pair must share one primary group`);
        assert.equal(wave.spawnGroups.length, primaryGroupCount,
          `seed ${seed}, Wave 5 constraint must not create a continuation group`);
      }
      recentTemplates.push(wave.templateId);
    }
  }
});

test("generator enforces unlocks, templates, roles, tolerance and caps across 1000 Waves", () => {
  const seen = Array.from({ length: 5 }, () => new Set());
  const seenTemplates = Array.from({ length: 5 }, () => new Set());
  for (let seed = 1; seed <= 200; seed++) {
    const rng = seeded(seed), recentTemplates = [];
    for (let index = 0; index < 5; index++) {
      const wave = E.generateWave(stage, index, { recentTemplates }, rng);
      assert.equal(E.validateWave(wave, stage).valid, true);
      assert.ok(stage.templates[index].includes(wave.templateId));
      assert.ok(Object.isFrozen(wave.spawnGroups[0].enemies));
      for (const group of wave.spawnGroups) for (const entry of group.enemies) {
        assert.ok(stage.availability[index].includes(entry.type));
        assert.notEqual(entry.type, "boss");
        seen[index].add(entry.type);
      }
      seenTemplates[index].add(wave.templateId);
      recentTemplates.push(wave.templateId);
    }
  }
  seen.forEach((types, i) => assert.deepEqual([...types].sort(), [...stage.availability[i]].sort()));
  seenTemplates.forEach((types, i) => assert.deepEqual([...types].sort(), [...stage.templates[i]].sort()));
});
test("template target distributions retain their primary Group counts, delays, content and Roles", () => {
  const fixtures = [
    { index: 0, templateId: "basic", groupCount: 2, delays: [0, 2.5],
      composition: { normal: 8 }, threat: 8, roles: ["frontline"] },
    { index: 1, templateId: "rush", groupCount: 2, delays: [0, 1.5],
      composition: { fast: 1, normal: 8 }, threat: 9.4, roles: ["frontline", "pressure"] },
    { index: 2, templateId: "heavy", groupCount: 2, delays: [0, 2.8],
      composition: { normal: 9, tank: 1 }, threat: 11.2, roles: ["frontline", "heavy"] },
    { index: 3, templateId: "escalation", groupCount: 3, delays: [0, 2, 2.5],
      composition: { normal: 14 }, threat: 14, roles: ["frontline"] },
    { index: 4, templateId: "mixed", groupCount: 3, delays: [0, 2, 2.2],
      composition: { fast: 1, normal: 15 }, threat: 16.4, roles: ["frontline", "pressure"] }
  ];
  for (const fixture of fixtures) {
    const restricted = forceTemplate(fixture.index, fixture.templateId);
    const wave = E.generateWave(restricted, fixture.index, {}, () => 0);
    const summary = summarizeWave(wave);
    assert.equal(wave.spawnGroups.length, fixture.groupCount, fixture.templateId);
    assert.deepEqual(wave.spawnGroups.map(group => group.delay), fixture.delays, fixture.templateId);
    assert.deepEqual(summary.composition, fixture.composition, fixture.templateId);
    assert.ok(Math.abs(summary.threat - fixture.threat) < 1e-9, fixture.templateId);
    for (const group of summary.groups) {
      assert.ok(group.threat <= wave.maxActiveThreat + 1e-9, fixture.templateId);
      assert.ok(group.count <= E.CONFIG.maxActiveEnemies, fixture.templateId);
    }
    const roles = [...new Set(Object.keys(summary.composition)
      .flatMap(type => E.ENEMIES[type].roles))].sort();
    assert.deepEqual(roles, fixture.roles.slice().sort(), fixture.templateId);
    assert.equal(E.validateWave(wave, restricted).valid, true, fixture.templateId);
  }
});
test("Basic 8-Threat packing uses two balanced Groups and the corrected planned Spawn floor", () => {
  const restricted = forceTemplate(0, "basic");
  const wave = E.generateWave(restricted, 0, {}, () => 0);
  const summary = summarizeWave(wave);
  assert.deepEqual(summary.groups.map(group => group.threat), [4, 4]);
  assert.deepEqual(wave.spawnGroups.map(group => group.delay), [0, 2.5]);
  assert.equal(wave.spawnGroups.reduce((sum, group) => sum + group.delay, 0), 2.5);
  assert.deepEqual(wave.analysis, E.analyzeWave(wave));
  assert.equal(wave.analysis.expectedClearTime, 8.2);

  const floorProbe = copy(wave);
  floorProbe.spawnGroups[1].delay = 25;
  assert.equal(E.analyzeWave(floorProbe).expectedClearTime, 30.7);
});
test("7-Fast Rush reference has a 5.75-second build-independent expected time", () => {
  const rush = { spawnGroups: [
    { delay: 0, enemies: [{ type: "fast", count: 3 }] },
    { delay: 1.5, enemies: [{ type: "fast", count: 4 }] }
  ] };
  const analysis = E.analyzeWave(rush);
  assert.equal(analysis.expectedClearTime, 5.75);
  assert.deepEqual(E.analyzeWave({ ...rush, player: { damage: 999, projectileCount: 99 } }), analysis);
});
test("a genuine field-Threat constraint uses one zero-delay structural continuation Group", () => {
  const restricted = forceTemplate(0, "basic");
  restricted.threatCurve[0] = 12;
  restricted.maxActiveThreatCurve[0] = 4.5;
  restricted.availability[0] = ["normal"];
  const wave = E.generateWave(restricted, 0, {}, () => 0);
  const summary = summarizeWave(wave);
  assert.equal(wave.spawnGroups.length, 3);
  assert.deepEqual(wave.spawnGroups.map(group => group.delay), [0, 2.5, 0]);
  assert.deepEqual(summary.groups.map(group => group.threat), [4, 4, 4]);
  assert.deepEqual(summary.composition, { normal: 12 });
  assert.equal(summary.threat, 12);
  assert.equal(wave.spawnGroups.reduce((sum, group) => sum + group.delay, 0), 2.5);
  for (const group of summary.groups) {
    assert.ok(group.threat <= wave.maxActiveThreat + 1e-9);
    assert.ok(group.count <= E.CONFIG.maxActiveEnemies);
  }
  assert.equal(E.validateWave(wave, restricted).valid, true);
  assert.deepEqual(wave, E.generateWave(restricted, 0, {}, () => 0));
});
test("injected RNG fixes composition, with soft recent-template suppression", () => {
  assert.deepEqual(E.generateWave(stage, 4, {}, seeded(2)), E.generateWave(stage, 4, {}, seeded(2)));
  assert.equal(E.templateWeight("rush", ["rush"]), 0.35);
  assert.equal(E.templateWeight("rush", ["rush", "heavy"]), 0.7);
  assert.equal(E.templateWeight("rush", ["basic"]), 1);
  assert.equal(E.generateWave(stage, 0, { recentTemplates: ["basic"] }, () => 0.99).templateId, "basic");
  assert.equal(E.generateWave(stage, 1, {}, () => 0.4).templateId, "basic");
  assert.equal(E.generateWave(stage, 1, { recentTemplates: ["basic"] }, () => 0.4).templateId, "rush");
});
test("12 failed attempts use a deterministic terminating valid fallback", () => {
  let calls = 0;
  const wave = E.generateWave(stage, 4, {}, () => { calls++; return NaN; });
  assert.equal(calls, 12);
  assert.deepEqual(wave.generation, { attempts: 12, usedFallback: true });
  assert.ok(E.validateWave(wave, stage).valid);
  for (let i = 0; i < 5; i++) {
    const fallback = E.safeFallback(stage, i);
    assert.ok(E.validateWave(fallback, stage).valid);
    assert.deepEqual(fallback, E.safeFallback(stage, i));
  }
  assert.throws(() => E.safeFallback({ ...stage, maxActiveThreatCurve: [0.1] }, 0));
});
test("Mixed eligibility rejects a pool missing either required role", () => {
  for (const pool of [["normal"], ["fast"]]) {
    const restricted = { ...stage, availability: [pool], templates: [["mixed", "basic"]] };
    const wave = E.generateWave(restricted, 0, {}, () => 0);
    assert.equal(wave.templateId, "basic");
    assert.equal(E.validateWave({ ...wave, templateId: "mixed" }, restricted).valid, false);
  }
});
test("validator reports malformed content, restrictions, roles and budgets", () => {
  const wave = E.generateWave(stage, 4, {}, () => 0.99);
  const mutations = [
    w => { w.spawnGroups = []; }, w => { w.spawnGroups = [null]; },
    w => { w.spawnGroups[0].delay = Infinity; }, w => { w.spawnGroups[0].delay = -1; },
    w => { w.spawnGroups[0].enemies = null; }, w => { w.spawnGroups[0].enemies[0].type = "boss"; },
    w => { w.spawnGroups[0].enemies[0].count = 0; }, w => { w.spawnGroups[0].enemies[0].count = 1.5; },
    w => { w.spawnGroups[0].enemies[0].count = 19; }, w => { w.stageId = "stage-2"; },
    w => { w.maxActiveThreat = 100; }, w => { w.threatBudget = 100; },
    w => { w.spawnGroups = [{ delay: 0, enemies: [{ type: "normal", count: 1 }] }]; }
  ];
  for (const mutate of mutations) {
    const changed = copy(wave); mutate(changed);
    const result = E.validateWave(changed, stage);
    assert.equal(result.valid, false); assert.ok(result.errors.length);
  }
  for (const [templateId, index, removed] of [["rush", 1, "fast"], ["heavy", 2, "tank"], ["mixed", 4, "fast"]]) {
    const restricted = { ...stage, templates: stage.templates.map((t, i) => i === index ? [templateId] : t) };
    const generated = copy(E.generateWave(restricted, index, {}, () => 0));
    generated.spawnGroups.forEach(g => g.enemies.forEach(e => { if (e.type === removed) e.type = "normal"; }));
    assert.ok(E.validateWave(generated, restricted).errors.some(e => e.includes("Missing required Role")));
  }
  assert.equal(E.validateWave(wave, { ...stage, enemyPool: ["unknown"] }).valid, false);
});
test("Analyzer uses content and planned timing only, without mutations or awards", () => {
  const wave = E.generateWave(stage, 0, {}, () => 0);
  const before = JSON.stringify(wave), analysis = E.analyzeWave(wave);
  assert.equal(analysis.threat, 8);
  assert.equal(analysis.expectedClearTime, 8.2);
  assert.equal(analysis.expectedBaseScore, 8);
  assert.equal(analysis.performanceAllowance, 0);
  assert.equal(analysis.scoreCapacity, 8);
  assert.equal(JSON.stringify(wave), before);
  assert.deepEqual(E.analyzeWave({ ...wave, player: { damage: 999 } }), analysis);
  const slower = copy(wave); slower.spawnGroups[1].delay = 100;
  assert.equal(E.analyzeWave(slower).expectedClearTime, 105.7);
  const heavy = E.generateWave(stage, 4, {}, () => 0);
  assert.ok(Number.isFinite(heavy.analysis.expectedClearTime));
  assert.notEqual(heavy.analysis.expectedClearTime, analysis.expectedClearTime);
  assert.equal(globalThis.score, undefined);
  assert.equal(globalThis.points, undefined);
});
function runtimeFixture() {
  const wave = { id: "test", maxActiveThreat: 4.5, spawnGroups: [
    { delay: 0, enemies: [{ type: "normal", count: 3 }] },
    { delay: 2.5, enemies: [{ type: "normal", count: 3 }] }
  ] };
  const runtime = E.createWaveRuntime(wave), enemies = [];
  const tick = dt => E.updateWaveRuntime(wave, runtime, enemies, dt, (type, waveId) => enemies.push({ type, waveId, hp: 1 }));
  return { wave, runtime, enemies, tick };
}
test("atomic groups wait for relative delay and available field threat", () => {
  const { wave, runtime, enemies, tick } = runtimeFixture();
  tick(0); assert.equal(enemies.length, 3);
  tick(2.4); assert.equal(runtime.nextSpawnGroupIndex, 1);
  tick(0.1); assert.equal(enemies.length, 3);
  enemies.splice(0, 2); tick(0);
  assert.equal(enemies.length, 4); assert.equal(runtime.nextSpawnGroupIndex, 2);
  assert.equal(runtime.activeThreat, 4); assert.equal(runtime.isComplete, false);
  enemies.length = 0; E.syncWaveRuntime(wave, runtime, enemies);
  assert.equal(runtime.isComplete, true);
});
test("new Stage cap releases the whole second Basic Group while 2 Threat remains", () => {
  const wave = { id: "overlap", maxActiveThreat: stage.maxActiveThreatCurve[0], spawnGroups: [
    { delay: 0, enemies: [{ type: "normal", count: 4 }] },
    { delay: 2.5, enemies: [{ type: "normal", count: 4 }] }
  ] };
  const runtime = E.createWaveRuntime(wave), enemies = [];
  const released = [];
  const tick = dt => E.updateWaveRuntime(wave, runtime, enemies, dt, (type, waveId) => {
    enemies.push({ type, waveId, hp: 1 });
    released.push(type);
  });

  tick(0);
  assert.equal(enemies.length, 4);
  tick(2.5);
  assert.equal(runtime.nextSpawnGroupIndex, 1);
  assert.equal(released.length, 4);
  enemies.splice(0, 2);
  tick(0);
  assert.equal(runtime.nextSpawnGroupIndex, 2);
  assert.equal(enemies.length, 6);
  assert.equal(runtime.activeThreat, 6);
  assert.equal(released.length, 8);
});
test("gaps cannot clear, unrelated encounters cannot block, hard count cap also applies", () => {
  const { wave, runtime, enemies, tick } = runtimeFixture();
  tick(0); enemies.length = 0;
  enemies.push({ type: "tank", hp: 8, waveId: "unrelated" });
  tick(1); assert.equal(runtime.isComplete, false); assert.equal(runtime.activeThreat, 0);
  tick(1.5); assert.equal(runtime.nextSpawnGroupIndex, 2);
  enemies.splice(1); E.syncWaveRuntime(wave, runtime, enemies);
  assert.equal(runtime.isComplete, true);
  const f = runtimeFixture(); f.wave.maxActiveThreat = 99; f.tick(0);
  for (let i = 0; i < 3; i++) f.enemies.push({ type: "normal", waveId: "test", hp: 1 });
  f.tick(5); assert.equal(f.runtime.nextSpawnGroupIndex, 1);
});
test("Stage scaling preserves Stage 1 stats and never scales threat metadata", () => {
  const base = { hp: 3, maxHp: 3, damage: 1, speed: 120 };
  assert.deepEqual(E.getScaledEnemyStats(base, stage.enemyScaling), base);
  assert.equal(E.getScaledEnemyStats(base, { hpMultiplier: 2, damageMultiplier: 3, speedMultiplier: 1 }).hp, 6);
  assert.equal(E.ENEMIES.normal.threatCost, 1);
});
