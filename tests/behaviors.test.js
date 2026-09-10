const assert = require("node:assert/strict");
const test = require("node:test");
require("../encounters.js");
require("../behaviors.js");

const E = globalThis.Encounters;
const B = globalThis.EnemyBehaviors;

function enemy(type, runtimeId, overrides = {}) {
  const definition = E.ENEMIES[type];
  return { type, runtimeId, waveId: "wave", x: 100, y: 100,
    ...definition.stats, behaviorRuntime: B.createRuntime(definition), ...overrides };
}

function fixture(types = ["interceptor"]) {
  const enemies = types.map((type, index) => enemy(type, index + 1));
  const hazards = [];
  const events = [];
  const player = { x: 300, y: 260, width: 40, height: 40 };
  const playerVelocity = { x: 120, y: 0 };
  const active = new Set(enemies);
  const update = (deltaTime, combatActive = true) => B.updateEnemies({
    enemies, definitions: E.ENEMIES, hazards, player, playerVelocity, deltaTime, combatActive,
    arena: { width: 800, height: 600 }, isActive: candidate => active.has(candidate) && candidate.hp > 0,
    moveChase(candidate, dt) { candidate.x += candidate.speed * dt; },
    moveCharge(candidate, x, y, speed, dt) { candidate.x += x * speed * dt; candidate.y += y * speed * dt; },
    emit(name, details) { events.push({ name, details }); }
  });
  return { enemies, hazards, events, player, playerVelocity, active, update };
}

test("Normal, Fast, and Tank use the unchanged baseline chase profile", () => {
  for (const type of ["normal", "fast", "tank"]) {
    assert.equal(E.ENEMIES[type].behavior.profile, "chase");
    const f = fixture([type]);
    const before = f.enemies[0].x;
    f.update(0.25);
    assert.equal(f.enemies[0].x, before + E.ENEMIES[type].stats.speed * 0.25);
  }
});

test("Interceptor locks prediction at Telegraph start and follows the full state sequence", () => {
  const f = fixture();
  const interceptor = f.enemies[0];
  f.update(1.99);
  assert.equal(interceptor.behaviorRuntime.behaviorState, B.STATES.CHASE);
  assert.equal(f.events.some(event => event.name === "recordInterceptorAttempt"), false);
  f.update(0.01);
  assert.equal(interceptor.behaviorRuntime.behaviorState, B.STATES.TELEGRAPH);
  const locked = { ...interceptor.behaviorRuntime.lockedTarget };
  assert.deepEqual(locked, { x: 380, y: 280 });
  f.player.x = 20;
  f.playerVelocity.x = -240;
  f.update(0.3);
  assert.deepEqual(interceptor.behaviorRuntime.lockedTarget, locked);
  f.update(0.25);
  assert.equal(interceptor.behaviorRuntime.behaviorState, B.STATES.CHARGE);
  assert.deepEqual(interceptor.behaviorRuntime.lockedTarget, locked);
  f.update(0.45);
  assert.equal(interceptor.behaviorRuntime.behaviorState, B.STATES.RECOVERY);
  f.update(0.65);
  assert.equal(interceptor.behaviorRuntime.behaviorState, B.STATES.CHASE);
  assert.equal(interceptor.behaviorRuntime.cooldown, 3);
  assert.deepEqual(f.events.filter(event => event.name.startsWith("recordInterceptor")).map(event => event.name),
    ["recordInterceptorAttempt", "recordInterceptorCommit", "recordInterceptorMiss"]);
});

test("Interceptor contacts, misses, and interrupted Telegraphs resolve once", () => {
  const hit = fixture();
  hit.update(2.55);
  B.recordEnemyContact(hit.enemies[0], { emit(name, details) { hit.events.push({ name, details }); } });
  B.recordEnemyContact(hit.enemies[0], { emit(name, details) { hit.events.push({ name, details }); } });
  hit.update(0.45);
  assert.equal(hit.events.filter(event => event.name === "recordInterceptorContact").length, 1);
  assert.equal(hit.events.filter(event => event.name === "recordInterceptorMiss").length, 0);

  const interrupted = fixture();
  interrupted.update(2);
  B.recordEnemyDefeat(interrupted.enemies[0], interrupted.hazards,
    { emit(name, details) { interrupted.events.push({ name, details }); } });
  B.recordEnemyDefeat(interrupted.enemies[0], interrupted.hazards,
    { emit(name, details) { interrupted.events.push({ name, details }); } });
  assert.equal(interrupted.events.filter(event => event.name === "recordInterceptorInterrupted").length, 1);
});

test("Denier locks a predicted point, creates one fixed hazard, expires, and damages at most once", () => {
  const f = fixture(["denier"]);
  const denier = f.enemies[0];
  f.playerVelocity.x = 100;
  f.update(2.5);
  assert.equal(denier.behaviorRuntime.behaviorState, B.STATES.TELEGRAPH);
  assert.equal(f.hazards.length, 1);
  assert.equal(f.hazards[0].phase, B.STATES.TELEGRAPH);
  const target = { x: f.hazards[0].x, y: f.hazards[0].y };
  f.player.x = 0;
  f.playerVelocity.x = -100;
  f.update(0.75);
  assert.equal(f.hazards[0].phase, "ACTIVE");
  assert.deepEqual({ x: f.hazards[0].x, y: f.hazards[0].y }, target);
  const playerInHazard = { x: target.x - 10, y: target.y - 10, width: 20, height: 20 };
  assert.equal(B.consumeHazardContacts(f.hazards, playerInHazard).length, 1);
  assert.equal(B.consumeHazardContacts(f.hazards, playerInHazard).length, 0);
  f.update(1.8);
  assert.equal(f.hazards.length, 0);
  assert.deepEqual(f.events.filter(event => event.name.startsWith("recordDenier")).map(event => event.name),
    ["recordDenierCast", "recordDenierHazardCreated"]);
});

test("a defeated Denier cancels only its pending Telegraph hazard", () => {
  const f = fixture(["denier"]);
  f.update(2.5);
  B.recordEnemyDefeat(f.enemies[0], f.hazards, { emit() {} });
  assert.equal(f.hazards.length, 0);
});

test("a contact-removed Denier cannot leave an orphaned pending hazard", () => {
  const f = fixture(["denier"]);
  f.update(2.5);
  B.recordEnemyRemoval(f.enemies[0], f.hazards);
  assert.equal(f.hazards.length, 0);
});

test("Support dynamically accelerates only eligible regular special enemies", () => {
  const f = fixture(["support", "interceptor", "denier", "normal", "fast", "tank", "support"]);
  f.enemies.forEach((candidate, index) => { candidate.x = index * 10; candidate.y = 0; });
  f.update(1);
  assert.equal(f.enemies[1].behaviorRuntime.cooldown, 0.5);
  assert.equal(f.enemies[2].behaviorRuntime.cooldown, 1);
  for (const index of [0, 3, 4, 5, 6]) assert.equal(f.enemies[index].behaviorRuntime.affectedBySupport, false);
  assert.equal(f.events.at(-1).details.supportActiveTime, 2);
  assert.equal(f.events.at(-1).details.affectedEnemyTime, 2);
  f.active.delete(f.enemies[0]);
  f.active.delete(f.enemies[6]);
  f.update(0.25);
  assert.equal(f.enemies[1].behaviorRuntime.cooldown, 0.25);
  assert.equal(f.enemies[2].behaviorRuntime.cooldown, 0.75);
  assert.equal(f.enemies[1].behaviorRuntime.affectedBySupport, false);
});

test("Support affected actions count only when a special starts inside the live aura", () => {
  const f = fixture(["support", "interceptor"]);
  f.enemies[0].x = 100;
  f.enemies[1].x = 120;
  f.update(2 / 1.5);
  assert.equal(f.enemies[1].behaviorRuntime.behaviorState, B.STATES.TELEGRAPH);
  assert.equal(f.events.filter(event => event.name === "recordSupportAffectedAction").length, 1);
});

test("noncombat updates freeze behavior and hazards; cleanup removes all transient zones", () => {
  const f = fixture(["denier"]);
  f.update(2.5);
  const before = JSON.stringify({ runtime: f.enemies[0].behaviorRuntime, hazards: f.hazards });
  f.update(60, false);
  assert.equal(JSON.stringify({ runtime: f.enemies[0].behaviorRuntime, hazards: f.hazards }), before);
  B.clearTransient(f.enemies, f.hazards);
  assert.equal(f.hazards.length, 0);
  assert.equal(f.enemies[0].behaviorRuntime.lockedTarget, null);
});
