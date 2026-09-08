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
  assert.equal(wave.analysis.expectedClearTime, 22.5);

  const floorProbe = copy(wave);
  floorProbe.spawnGroups[1].delay = 25;
  assert.equal(E.analyzeWave(floorProbe).expectedClearTime, 27.5);
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
  assert.equal(analysis.expectedClearTime, 22.5);
  assert.equal(analysis.expectedBaseScore, 8);
  assert.equal(analysis.performanceAllowance, 0);
  assert.equal(analysis.scoreCapacity, 8);
  assert.equal(JSON.stringify(wave), before);
  assert.deepEqual(E.analyzeWave({ ...wave, player: { damage: 999 } }), analysis);
  const slower = copy(wave); slower.spawnGroups[1].delay = 100;
  assert.ok(E.analyzeWave(slower).expectedClearTime >= 102.5);
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
