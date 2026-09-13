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

function fixture(types = ["interceptor"], movement = {}) {
  const enemies = types.map((type, index) => enemy(type, index + 1));
  const hazards = [], events = [], damage = [];
  const player = { x: 300, y: 260, width: 40, height: 40 };
  const playerVelocity = { x: 120, y: 0 };
  const active = new Set(enemies);
  const update = (deltaTime, combatActive = true) => B.updateEnemies({
    enemies, definitions: E.ENEMIES, hazards, player, playerVelocity, deltaTime, combatActive,
    arena: { width: 800, height: 600 }, isActive: candidate => active.has(candidate) && candidate.hp > 0,
    moveChase(candidate, dt) { candidate.x += candidate.speed * dt; },
    moveToRange(candidate, preferredRange, dt, status) {
      if (movement.moveToRange) return movement.moveToRange(candidate, preferredRange, dt, status);
      const candidateCenter = { x: candidate.x + candidate.width / 2, y: candidate.y + candidate.height / 2 };
      const playerCenter = { x: player.x + player.width / 2, y: player.y + player.height / 2 };
      const dx = playerCenter.x - candidateCenter.x, dy = playerCenter.y - candidateCenter.y;
      const length = Math.hypot(dx, dy) || 1;
      const direction = status.range < preferredRange[0] ? -1 : 1;
      candidate.x += dx / length * candidate.speed * dt * direction;
      candidate.y += dy / length * candidate.speed * dt * direction;
    },
    moveCharge(candidate, x, y, speed, dt) {
      if (movement.moveCharge) return movement.moveCharge(candidate, x, y, speed, dt);
      const before = { x: candidate.x, y: candidate.y };
      candidate.x += x * speed * dt;
      candidate.y += y * speed * dt;
      return { distance: Math.hypot(candidate.x - before.x, candidate.y - before.y), reachedBoundary: false };
    },
    hasLineOfSight(first, second) { return movement.hasLineOfSight?.(first, second) ?? true; },
    moveEnemyProjectile(projectile, movementX, movementY) {
      if (movement.moveEnemyProjectile) return movement.moveEnemyProjectile(projectile, movementX, movementY);
      projectile.x += movementX; projectile.y += movementY; return { blocked: false };
    },
    resolvePlayablePoint(point) { return point; },
    overlaps(first, second) {
      return first.x < second.x + second.width && first.x + first.width > second.x &&
        first.y < second.y + second.height && first.y + first.height > second.y;
    },
    damagePlayer(amount, type) { damage.push({ amount, type }); },
    emit(name, details) { events.push({ name, details }); }
  });
  return { enemies, hazards, events, damage, player, playerVelocity, active, update };
}

test("Normal, Fast, and Tank use their Phase B behavior profiles", () => {
  for (const type of ["normal", "fast", "tank"]) {
    assert.equal(E.ENEMIES[type].behavior.profile, type === "normal" ? "chase" : type);
    const f = fixture([type]), before = f.enemies[0].x;
    f.update(0.25);
    assert.equal(f.enemies[0].x, before + E.ENEMIES[type].stats.speed * 0.25);
  }
});

test("Fast commits a telegraphed strike and Tank resolves a telegraphed slam", () => {
  const fast = fixture(["fast"]);
  fast.player.x = 180; fast.player.y = 100;
  fast.enemies[0].behaviorRuntime.attackCooldown = 0;
  fast.update(0);
  assert.equal(fast.enemies[0].behaviorRuntime.behaviorState, B.STATES.TELEGRAPH);
  fast.update(0.2);
  assert.equal(fast.enemies[0].behaviorRuntime.behaviorState, B.STATES.STRIKE);
  const before = fast.enemies[0].x;
  fast.update(0.45);
  assert.notEqual(fast.enemies[0].x, before);
  assert.equal(fast.enemies[0].behaviorRuntime.behaviorState, B.STATES.RECOVERY);

  const tank = fixture(["tank"]);
  tank.player.x = 170; tank.player.y = 100;
  tank.enemies[0].behaviorRuntime.attackCooldown = 0;
  tank.update(0);
  assert.equal(tank.enemies[0].behaviorRuntime.behaviorState, B.STATES.TELEGRAPH);
  tank.update(E.ENEMIES.tank.behavior.telegraphDuration);
  assert.deepEqual(tank.damage, [{ amount: 1, type: "tank" }]);
  assert.equal(tank.enemies[0].behaviorRuntime.behaviorState, B.STATES.RECOVERY);
});

test("Gunner fires two spaced projectiles and Artillery resolves its warning", () => {
  const gunner = fixture(["gunner"]);
  gunner.enemies[0].behaviorRuntime.attackCooldown = 0;
  gunner.update(0);
  gunner.update(E.ENEMIES.gunner.behavior.telegraphDuration);
  gunner.update(0);
  assert.equal(gunner.hazards.filter(hazard => hazard.kind === "enemy-projectile").length, 1);
  gunner.update(E.ENEMIES.gunner.behavior.shotSpacing);
  assert.equal(gunner.hazards.filter(hazard => hazard.kind === "enemy-projectile").length, 2);

  const artillery = fixture(["artillery"]);
  artillery.enemies[0].behaviorRuntime.attackCooldown = 0;
  artillery.update(0);
  assert.equal(artillery.hazards[0].phase, B.STATES.TELEGRAPH);
  artillery.update(E.ENEMIES.artillery.behavior.telegraphDuration);
  assert.equal(artillery.hazards[0].phase, "ACTIVE");
  assert.deepEqual(artillery.damage, [{ amount: 1, type: "artillery" }]);
});

test("Gunner preserves its authored range, telegraph, burst, projectile, and cooldown values", () => {
  const config = E.ENEMIES.gunner.behavior;
  assert.deepEqual(config.preferredRange, [220, 320]);
  assert.equal(config.telegraphDuration, 0.3);
  assert.equal(config.burstCount, 2);
  assert.equal(config.shotSpacing, 0.15);
  assert.equal(config.projectileSpeed, 300);
  assert.equal(config.cooldown, 1.6);
});

test("Gunner repositions from too close and too far before firing", () => {
  for (const setup of [
    { playerX: 380, enemyX: 300, expectedDirection: -1 },
    { playerX: 650, enemyX: 100, expectedDirection: 1 }
  ]) {
    const f = fixture(["gunner"]), gunner = f.enemies[0];
    f.player.x = setup.playerX; f.player.y = 100;
    gunner.x = setup.enemyX;
    gunner.behaviorRuntime.attackCooldown = 0;
    const startX = gunner.x;
    for (let frame = 0; frame < 400 && f.hazards.length < 2; frame++) f.update(1 / 60);
    assert.equal(Math.sign(gunner.x - startX), setup.expectedDirection);
    assert.equal(f.hazards.filter(hazard => hazard.kind === "enemy-projectile").length, 2,
      `playerX ${setup.playerX}, gunnerX ${gunner.x}, state ${gunner.behaviorRuntime.behaviorState}`);
    assert.ok(f.events.some(event => event.name === "recordGunnerRangeBlocked"));
    assert.ok(f.events.some(event => event.name === "recordGunnerTelegraph"));
  }
});

test("temporary LOS obstruction cancels safely, repositions, and later fires", () => {
  let hasLos = false;
  const f = fixture(["gunner"], { hasLineOfSight: () => hasLos });
  const gunner = f.enemies[0];
  gunner.behaviorRuntime.attackCooldown = 0;
  f.update(0.5);
  assert.equal(gunner.behaviorRuntime.behaviorState, B.STATES.CHASE);
  assert.ok(f.events.some(event => event.name === "recordGunnerLosBlocked"));
  hasLos = true;
  for (let frame = 0; frame < 400 && f.hazards.length < 2; frame++) f.update(1 / 60);
  assert.equal(f.hazards.filter(hazard => hazard.kind === "enemy-projectile").length, 2);

  const interrupted = fixture(["gunner"], { hasLineOfSight: () => hasLos });
  interrupted.enemies[0].behaviorRuntime.attackCooldown = 0;
  interrupted.update(0);
  hasLos = false;
  interrupted.update(0.3);
  assert.equal(interrupted.enemies[0].behaviorRuntime.behaviorState, B.STATES.CHASE);
  assert.equal(interrupted.events.filter(event => event.name === "recordGunnerTelegraphCancel").length, 1);
  hasLos = true;
  for (let frame = 0; frame < 400 && interrupted.hazards.length < 2; frame++) interrupted.update(1 / 60);
  assert.equal(interrupted.hazards.filter(hazard => hazard.kind === "enemy-projectile").length, 2);
});

test("ordinary movement does not reset a Gunner telegraph forever", () => {
  const f = fixture(["gunner"]), gunner = f.enemies[0];
  gunner.behaviorRuntime.attackCooldown = 0;
  f.update(0);
  for (let frame = 0; frame < 30 && f.hazards.length < 2; frame++) {
    f.player.x += 0.5;
    f.update(1 / 60);
  }
  assert.equal(f.events.filter(event => event.name === "recordGunnerTelegraph").length, 1);
  assert.equal(f.events.filter(event => event.name === "recordGunnerTelegraphCancel").length, 0);
  assert.equal(f.hazards.filter(hazard => hazard.kind === "enemy-projectile").length, 2);
});

test("Gunner projectiles stop when the movement context reports blocking terrain", () => {
  let movements = 0;
  const f = fixture(["gunner"], { moveEnemyProjectile(projectile, movementX, movementY) {
    movements++;
    projectile.x += movementX / 2; projectile.y += movementY / 2;
    return { blocked: true };
  } });
  f.enemies[0].behaviorRuntime.attackCooldown = 0;
  f.update(0); f.update(0.3); f.update(0);
  assert.equal(f.hazards.filter(hazard => hazard.kind === "enemy-projectile").length, 1);
  f.update(1 / 60);
  assert.equal(movements, 1);
  assert.equal(f.hazards.filter(hazard => hazard.kind === "enemy-projectile").length, 0);
});

test("Trapper arms a route hazard and Tether connects, ticks, and breaks", () => {
  const trapper = fixture(["trapper"]);
  trapper.player.x = 100; trapper.player.y = 100;
  trapper.enemies[0].behaviorRuntime.attackCooldown = 0;
  trapper.update(0);
  assert.equal(trapper.hazards[0].phase, "ARMING");
  trapper.update(E.ENEMIES.trapper.behavior.armDuration);
  trapper.update(0);
  assert.equal(trapper.hazards.length, 0);
  assert.deepEqual(trapper.damage, [{ amount: 1, type: "trapper" }]);

  let lineOfSight = true;
  const tether = fixture(["tether"], { hasLineOfSight: () => lineOfSight });
  tether.player.x = 280; tether.player.y = 100;
  tether.enemies[0].behaviorRuntime.attackCooldown = 0;
  tether.update(0);
  tether.update(E.ENEMIES.tether.behavior.windupDuration);
  assert.equal(tether.enemies[0].behaviorRuntime.behaviorState, B.STATES.CONNECTED);
  tether.update(E.ENEMIES.tether.behavior.damageInterval);
  assert.deepEqual(tether.damage, [{ amount: 1, type: "tether" }]);
  lineOfSight = false;
  tether.update(E.ENEMIES.tether.behavior.losBreakDuration);
  assert.equal(tether.enemies[0].behaviorRuntime.behaviorState, B.STATES.CHASE);
});

test("Interceptor locks one direction after 0.9s and commits through a long lane", () => {
  const f = fixture(), interceptor = f.enemies[0];
  f.update(0.89);
  assert.equal(interceptor.behaviorRuntime.behaviorState, B.STATES.CHASE);
  f.update(0.01);
  assert.equal(interceptor.behaviorRuntime.behaviorState, B.STATES.TELEGRAPH);
  const locked = { ...interceptor.behaviorRuntime.lockedTarget };
  const direction = { x: interceptor.behaviorRuntime.chargeDirectionX, y: interceptor.behaviorRuntime.chargeDirectionY };
  assert.deepEqual(locked, { x: 380, y: 280 });
  f.player.x = 20;
  f.playerVelocity.x = -240;
  f.update(0.65);
  assert.equal(interceptor.behaviorRuntime.behaviorState, B.STATES.CHARGE);
  assert.deepEqual(interceptor.behaviorRuntime.lockedTarget, locked);
  assert.deepEqual({ x: interceptor.behaviorRuntime.chargeDirectionX,
    y: interceptor.behaviorRuntime.chargeDirectionY }, direction);
  const start = { x: interceptor.x, y: interceptor.y };
  f.update(1.6);
  assert.equal(interceptor.behaviorRuntime.behaviorState, B.STATES.RECOVERY);
  assert.ok(Math.hypot(interceptor.x - start.x, interceptor.y - start.y) >= 519.99);
  f.update(0.55);
  assert.equal(interceptor.behaviorRuntime.behaviorState, B.STATES.CHASE);
  assert.ok(interceptor.behaviorRuntime.cooldown > 2.5 && interceptor.behaviorRuntime.cooldown <= 3);
  assert.deepEqual(f.events.filter(event => event.name.startsWith("recordInterceptor")).map(event => event.name),
    ["recordInterceptorAttempt", "recordInterceptorCommit", "recordInterceptorMiss"]);
});

test("Interceptor contacts and interrupted Telegraphs resolve once", () => {
  const hit = fixture();
  hit.update(1.55);
  B.recordEnemyContact(hit.enemies[0], { emit(name, details) { hit.events.push({ name, details }); } });
  B.recordEnemyContact(hit.enemies[0], { emit(name, details) { hit.events.push({ name, details }); } });
  hit.update(1.6);
  assert.equal(hit.events.filter(event => event.name === "recordInterceptorContact").length, 1);
  assert.equal(hit.events.filter(event => event.name === "recordInterceptorMiss").length, 0);
  const interrupted = fixture();
  interrupted.update(0.9);
  B.recordEnemyDefeat(interrupted.enemies[0], interrupted.hazards,
    { emit(name, details) { interrupted.events.push({ name, details }); } });
  B.recordEnemyDefeat(interrupted.enemies[0], interrupted.hazards,
    { emit(name, details) { interrupted.events.push({ name, details }); } });
  assert.equal(interrupted.events.filter(event => event.name === "recordInterceptorInterrupted").length, 1);
});

test("Interceptor stops at an arena boundary", () => {
  const f = fixture(["interceptor"], { moveCharge(candidate, x, y, speed, dt) {
    const before = { x: candidate.x, y: candidate.y };
    candidate.x = Math.min(766, candidate.x + x * speed * dt);
    candidate.y = Math.min(566, candidate.y + y * speed * dt);
    return { distance: Math.hypot(candidate.x - before.x, candidate.y - before.y),
      reachedBoundary: candidate.x === 766 || candidate.y === 566 };
  } });
  f.enemies[0].x = 750;
  f.player.x = 780;
  f.playerVelocity.x = 0;
  f.update(1.55);
  f.update(0.2);
  assert.equal(f.enemies[0].behaviorRuntime.behaviorState, B.STATES.RECOVERY);
  assert.ok(f.enemies[0].x <= 766);
});

test("Denier locks a point, persists for 3s, and applies periodic damage", () => {
  const f = fixture(["denier"]), denier = f.enemies[0];
  f.playerVelocity.x = 100;
  f.update(0.9);
  assert.equal(denier.behaviorRuntime.behaviorState, B.STATES.TELEGRAPH);
  assert.equal(f.hazards[0].phase, B.STATES.TELEGRAPH);
  const target = { x: f.hazards[0].x, y: f.hazards[0].y };
  f.player.x = 0;
  f.update(0.55);
  assert.equal(f.hazards[0].phase, "ACTIVE");
  assert.deepEqual({ x: f.hazards[0].x, y: f.hazards[0].y }, target);
  const runtime = B.createHazardDamageRuntime();
  const playerInHazard = { x: target.x - 10, y: target.y - 10, width: 20, height: 20 };
  assert.equal(B.updateHazardDamageRuntime(runtime, f.hazards, playerInHazard, 0).damage, 1);
  assert.equal(B.updateHazardDamageRuntime(runtime, f.hazards, playerInHazard, 0.25).damage, 0);
  assert.equal(B.updateHazardDamageRuntime(runtime, f.hazards, playerInHazard, 0.75).damage, 1);
  assert.equal(B.updateHazardDamageRuntime(runtime, f.hazards, playerInHazard, 1).damage, 1);
  const firstHazardId = f.hazards[0].id;
  f.update(2.99);
  assert.equal(f.hazards.length, 1);
  f.update(0.01);
  assert.equal(f.hazards.some(hazard => hazard.id === firstHazardId), false);
});

test("overlapping Denier hazards share one tick cooldown and count union entries", () => {
  const hazards = [1, 2].map(id => ({ id, phase: "ACTIVE", x: 100, y: 100,
    radius: 60, damage: 1, damageInterval: 1, remaining: 3 }));
  const player = { x: 90, y: 90, width: 20, height: 20 };
  const runtime = B.createHazardDamageRuntime();
  let result = B.updateHazardDamageRuntime(runtime, hazards, player, 0);
  assert.equal(result.entered, true);
  assert.equal(result.activeHazardCount, 2);
  assert.equal(result.damage, 1);
  assert.equal(B.updateHazardDamageRuntime(runtime, hazards, player, 0.2).damage, 0);
  player.x = 300;
  B.updateHazardDamageRuntime(runtime, hazards, player, 0.1);
  player.x = 90;
  result = B.updateHazardDamageRuntime(runtime, hazards, player, 0.1);
  assert.equal(result.entered, true);
  assert.equal(result.damage, 0);
  assert.equal(runtime.entrySequence, 2);
});

test("a removed Denier cancels a pending hazard but leaves an active zone", () => {
  const pending = fixture(["denier"]);
  pending.update(0.9);
  B.recordEnemyDefeat(pending.enemies[0], pending.hazards, { emit() {} });
  assert.equal(pending.hazards.length, 0);
  const active = fixture(["denier"]);
  active.update(1.65);
  B.recordEnemyRemoval(active.enemies[0], active.hazards);
  assert.equal(active.hazards.length, 1);
  assert.equal(active.hazards[0].phase, "ACTIVE");
});

test("Support keeps a distance-independent link and accelerates one eligible special", () => {
  const f = fixture(["support", "interceptor", "normal"]);
  f.enemies[0].x = 0;
  f.enemies[1].x = 700;
  f.update(0.2);
  assert.equal(f.enemies[0].behaviorRuntime.linkedTargetId, f.enemies[1].runtimeId);
  assert.equal(f.enemies[1].behaviorRuntime.affectedBySupport, true);
  assert.equal(f.enemies[1].behaviorRuntime.cooldown, 0.63);
  assert.equal(f.enemies[2].behaviorRuntime.affectedBySupport, false);
  assert.equal(f.events.filter(event => event.name === "recordSupportLinkCreated").length, 1);
  f.enemies[1].x = 5000;
  f.update(0.1);
  assert.equal(f.enemies[1].behaviorRuntime.cooldown, 0.495);
  assert.equal(f.events.filter(event => event.name === "recordSupportLinkCreated").length, 1);
});

test("Support links to Denier, relinks after death, and stops on Support removal", () => {
  const f = fixture(["support", "interceptor", "denier"]);
  f.update(0.1);
  assert.equal(f.enemies[0].behaviorRuntime.linkedTargetId, f.enemies[1].runtimeId);
  f.active.delete(f.enemies[1]);
  B.recordEnemyRemoval(f.enemies[1], f.hazards, f.enemies);
  f.update(0.1);
  assert.equal(f.enemies[0].behaviorRuntime.linkedTargetId, f.enemies[2].runtimeId);
  assert.equal(f.events.filter(event => event.name === "recordSupportLinkCreated").length, 2);
  B.recordEnemyRemoval(f.enemies[0], f.hazards, f.enemies);
  f.active.delete(f.enemies[0]);
  f.update(0.1);
  assert.equal(f.enemies[2].behaviorRuntime.affectedBySupport, false);
  assert.equal(f.enemies[2].behaviorRuntime.supportCooldownRate, 1);
});

test("Support eligibility excludes baseline enemies, Supports, and bosses", () => {
  const support = enemy("support", 1);
  const definitions = { ...E.ENEMIES, bossFixture: { behavior: { profile: "boss" } } };
  for (const type of ["normal", "fast", "tank", "support", "bossFixture"]) {
    assert.equal(B.isEligibleSupportTarget(support, { type, runtimeId: 2 }, definitions), false);
  }
  assert.equal(B.isEligibleSupportTarget(support, { type: "interceptor", runtimeId: 2 }, definitions), true);
  assert.equal(B.isEligibleSupportTarget(support, { type: "denier", runtimeId: 2 }, definitions), true);
  const f = fixture(["support", "normal", "fast", "tank", "support"]);
  f.update(1);
  assert.equal(f.enemies[0].behaviorRuntime.linkedTargetId, null);
  assert.equal(f.enemies[4].behaviorRuntime.linkedTargetId, null);
});

test("Support affected actions are counted when the linked special acts", () => {
  const f = fixture(["support", "interceptor"]);
  f.update(0.9 / 1.35);
  assert.equal(f.enemies[1].behaviorRuntime.behaviorState, B.STATES.TELEGRAPH);
  assert.equal(f.events.filter(event => event.name === "recordSupportAffectedAction").length, 1);
});

test("noncombat freezes behavior; cleanup removes all transient state", () => {
  const f = fixture(["support", "denier"]);
  f.update(0.2);
  const before = JSON.stringify({ runtime: f.enemies[1].behaviorRuntime, hazards: f.hazards });
  f.update(60, false);
  assert.equal(JSON.stringify({ runtime: f.enemies[1].behaviorRuntime, hazards: f.hazards }), before);
  B.clearTransient(f.enemies, f.hazards);
  assert.equal(f.hazards.length, 0);
  assert.equal(f.enemies[0].behaviorRuntime.linkedTargetId, null);
  assert.equal(f.enemies[1].behaviorRuntime.affectedBySupport, false);
});
