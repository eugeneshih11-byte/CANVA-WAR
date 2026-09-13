const test = require("node:test");
const assert = require("node:assert/strict");
const Continuous = require("../continuous-encounter.js");

const viewport = { x: 0, y: 0, width: 800, height: 600 };
const fillAt = (projectedFill, overrides = {}) => ({
  capacityArea: Continuous.capacityArea(), visibleFill: projectedFill,
  spawnReservedFill: 0, returnReservedFill: 0, reservedFill: 0, projectedFill,
  ...overrides
});
const visibleEnemy = (lifecycle = Continuous.LIFECYCLES.ACTIVE) => ({
  x: 100, y: 100, width: 40, height: 40, visualWidth: 40, visualHeight: 40,
  hp: 1, lifecycle, countsTowardEncounterProgress: true
});

test("Fill capacity and additive visible occupancy use visual footprints", () => {
  const expected = 800 * 600 - Math.PI * 100 ** 2;
  assert.equal(Continuous.capacityArea(), expected);
  const enemies = [
    { x: 10, y: 10, width: 50, height: 50, visualWidth: 50, visualHeight: 50, hp: 1, lifecycle: "ACTIVE" },
    { x: 10, y: 10, width: 50, height: 50, visualWidth: 50, visualHeight: 50, hp: 1, lifecycle: "ACTIVE" },
    { x: 790, y: 590, width: 20, height: 20, visualWidth: 20, visualHeight: 20, hp: 1, lifecycle: "ACTIVE" }
  ];
  const fill = Continuous.computeFill(enemies, viewport);
  assert.equal(fill.visibleArea, 2500 + 2500 + 100);
  assert.equal(fill.spawnReservedArea, 0);
});

test("spawn reservation transfers to visible area without double counting", () => {
  const enemy = { x: 780, y: 100, width: 40, height: 40, visualWidth: 40, visualHeight: 40,
    hp: 1, lifecycle: Continuous.LIFECYCLES.ENTERING };
  const fill = Continuous.computeFill([enemy], viewport);
  assert.equal(fill.visibleArea, 800);
  assert.equal(fill.spawnReservedArea, 800);
  assert.equal(fill.visibleArea + fill.spawnReservedArea, 1600);
});

test("near-offscreen return reservation and far returning release are distinct", () => {
  const enemy = { x: -20, y: 100, width: 40, height: 40, visualWidth: 40, visualHeight: 40,
    hp: 1, hasEnteredViewport: true, lifecycle: Continuous.LIFECYCLES.ACTIVE };
  assert.equal(Continuous.updateLifecycle(enemy, viewport), Continuous.LIFECYCLES.ACTIVE);
  enemy.x = -45;
  assert.equal(Continuous.updateLifecycle(enemy, viewport), Continuous.LIFECYCLES.NEAR_OFFSCREEN);
  assert.equal(Continuous.computeFill([enemy], viewport).returnReservedArea, 1600);
  enemy.x = -500;
  assert.equal(Continuous.updateLifecycle(enemy, viewport, 100), Continuous.LIFECYCLES.RETURNING);
  assert.equal(Continuous.computeFill([enemy], viewport).returnReservedArea, 0);
});

test("spawn exclusion includes visual half diagonal", () => {
  assert.equal(Continuous.minimumSpawnCenterDistance({ visualWidth: 60, visualHeight: 80 }), 150);
});

test("normal refill uses the exact 15/20/25 density band", () => {
  assert.deepEqual({ minimum: Continuous.STRUCTURE.normalFillMinimum,
    target: Continuous.STRUCTURE.normalFillTarget,
    maximum: Continuous.STRUCTURE.normalFillMaximum },
  { minimum: 0.15, target: 0.20, maximum: 0.25 });
  assert.equal(Continuous.shouldEnableNormalRefill(0.14, false), true);
  assert.equal(Continuous.shouldEnableNormalRefill(0.17, true), true);
  assert.equal(Continuous.shouldEnableNormalRefill(0.20, true), false);
  assert.equal(Continuous.shouldEnableNormalRefill(0.24, false), false);
});

test("controller ceiling rejects commitments above 70 percent", () => {
  const capacity = Continuous.capacityArea();
  assert.equal(Continuous.candidateFits(0.69, capacity * 0.01, capacity), true);
  assert.equal(Continuous.candidateFits(0.695, capacity * 0.01, capacity), false);
});

test("Wave Coming snapshots an additive budget and fast kills do not refill it", () => {
  const controller = Continuous.createController({ waveCount: 5, seed: 7 });
  const budget = Continuous.beginWaveComing(controller, 0.25, () => 0.5);
  assert.ok(Math.abs(controller.comingSelectedDelta - 0.25) < 1e-12);
  assert.ok(Math.abs(controller.comingTarget - 0.5) < 1e-12);
  assert.ok(Math.abs(budget - Continuous.capacityArea() * 0.25) < 1e-7);
  controller.comingCredit = 10000;
  const reservation = Continuous.commitSpawn(controller, "normal", 3136);
  assert.ok(reservation);
  const remaining = controller.comingRemainingArea;
  Continuous.recordKill(controller, true);
  assert.equal(controller.comingRemainingArea, remaining);
});

test("phase-specific token buckets do not bank normal refill during Wave Coming", () => {
  const controller = Continuous.createController({ waveCount: 5 });
  controller.normalCredit = 123;
  Continuous.beginWaveComing(controller, 0.25, () => 0.5);
  Continuous.addCredit(controller, 1);
  assert.equal(controller.normalCredit, 123);
  assert.ok(controller.comingCredit > 0);
  controller.phase = Continuous.PHASES.FINAL_COMPLETE;
  const coming = controller.comingCredit;
  Continuous.addCredit(controller, 10);
  assert.equal(controller.comingCredit, coming);
  assert.equal(controller.normalCredit, 123);
});

test("Coming random delta stays in range, clamps to 70 percent, and settles", () => {
  const controller = Continuous.createController({ waveCount: 5 });
  Continuous.beginWaveComing(controller, 0.6, () => 0.999999);
  assert.ok(controller.comingSelectedDelta >= 0.2 && controller.comingSelectedDelta < 0.3);
  assert.equal(controller.comingTarget, 0.7);
  controller.comingRemainingArea = 0;
  Continuous.updateController(controller, 0.1,
    { capacityArea: Continuous.capacityArea(), projectedFill: 0.7, visibleFill: 0.7, reservedFill: 0 }, [], viewport);
  assert.equal(controller.phase, Continuous.PHASES.SETTLING);
  assert.equal(controller.waveProgressArmed, false);
});

test("Wave Progress snapshots N_ref and immutable K_target", () => {
  const controller = Continuous.createController({ waveCount: 5 });
  const enemies = [
    { x: 0, y: 0, width: 40, height: 40, visualWidth: 40, visualHeight: 40, hp: 1 },
    { x: 780, y: 0, width: 40, height: 40, visualWidth: 40, visualHeight: 40, hp: 1 }
  ];
  assert.equal(Continuous.armProgress(controller, enemies, viewport), 3);
  assert.equal(controller.nRef, 1.5);
  enemies.push({ x: 0, y: 0, width: 40, height: 40, visualWidth: 40, visualHeight: 40, hp: 1 });
  assert.equal(controller.target, 3);
  assert.equal(Continuous.recordKill(controller, false), false);
  assert.equal(controller.progress, 0);
  assert.equal(Continuous.recordKill(controller, true), false);
  assert.equal(Continuous.recordKill(controller, true), false);
  controller.waveProgressReadinessStableTime = 0.4;
  assert.equal(Continuous.recordKill(controller, true), true);
  assert.equal(controller.waveProgressArmed, false);
  assert.equal(controller.waveProgressReadinessStableTime, 0);
  assert.equal(controller.waveProgressReadinessBlockedReason, "wave-transition");
});

test("Progress readiness waits for the opening ramp and 0.5 stable seconds", () => {
  const controller = Continuous.createController({ waveCount: 5 });
  const enemies = [visibleEnemy()];
  Continuous.updateController(controller, 4.9, fillAt(0.2), enemies, viewport);
  assert.equal(controller.waveProgressArmed, false);
  assert.equal(controller.waveProgressReadinessStableTime, 0);
  assert.equal(controller.waveProgressReadinessBlockedReason, "opening-ramp");

  Continuous.updateController(controller, 0.1, fillAt(0.2), enemies, viewport);
  assert.equal(controller.waveProgressReadinessStableTime, 0.1);
  assert.equal(controller.waveProgressReadinessBlockedReason, "ready-stabilizing");
  Continuous.updateController(controller, 0.39, fillAt(0.2), enemies, viewport);
  assert.equal(controller.waveProgressArmed, false);
  Continuous.updateController(controller, 0.01, fillAt(0.2), enemies, viewport);
  assert.equal(controller.waveProgressArmed, true);
  assert.ok(controller.nRef > 0);
  assert.ok(controller.target > 0);
  assert.equal(controller.waveProgressReadinessBlockedReason, "armed");
});

test("transient invalid readiness resets its stability timer", () => {
  const controller = Continuous.createController({ waveCount: 5 });
  controller.combatElapsed = 5;
  const enemies = [visibleEnemy()];
  Continuous.updateController(controller, 0.3, fillAt(0.2), enemies, viewport);
  assert.equal(controller.waveProgressReadinessStableTime, 0.3);
  Continuous.updateController(controller, 0.1, fillAt(0.14), enemies, viewport);
  assert.equal(controller.waveProgressReadinessStableTime, 0);
  assert.equal(controller.waveProgressReadinessBlockedReason, "projected-fill-low");
  Continuous.updateController(controller, 0.3, fillAt(0.2), enemies, viewport);
  Continuous.updateController(controller, 0.19, fillAt(0.2), enemies, viewport);
  assert.equal(controller.waveProgressArmed, false);
  Continuous.updateController(controller, 0.01, fillAt(0.2), enemies, viewport);
  assert.equal(controller.waveProgressArmed, true);
});

test("only unresolved RESERVED placement blocks lifecycle readiness", () => {
  for (const lifecycle of [Continuous.LIFECYCLES.ENTERING, Continuous.LIFECYCLES.NEAR_OFFSCREEN,
    Continuous.LIFECYCLES.RETURNING]) {
    const controller = Continuous.createController({ waveCount: 5 });
    controller.combatElapsed = 5;
    const enemies = [visibleEnemy(), { ...visibleEnemy(lifecycle), x: 180 }];
    Continuous.updateController(controller, 0.5, fillAt(0.2), enemies, viewport);
    assert.equal(controller.waveProgressArmed, true, lifecycle);
  }

  const pending = Continuous.createController({ waveCount: 5 });
  pending.combatElapsed = 5;
  pending.pendingReservations.push({ reservation: { status: "PENDING" } });
  Continuous.updateController(pending, 1, fillAt(0.2), [visibleEnemy()], viewport);
  assert.equal(pending.waveProgressArmed, false);
  assert.equal(pending.waveProgressReadinessBlockedReason, "unresolved-reserved");

  const reservedEnemy = Continuous.createController({ waveCount: 5 });
  reservedEnemy.combatElapsed = 5;
  Continuous.updateController(reservedEnemy, 1, fillAt(0.2),
    [visibleEnemy(), visibleEnemy(Continuous.LIFECYCLES.RESERVED)], viewport);
  assert.equal(reservedEnemy.waveProgressArmed, false);
  assert.equal(reservedEnemy.waveProgressReadinessBlockedReason, "unresolved-reserved");
});

test("return-reserved Fill does not block Projected Fill readiness", () => {
  const controller = Continuous.createController({ waveCount: 5 });
  controller.combatElapsed = 5;
  const fill = fillAt(0.2, { visibleFill: 0.1, returnReservedFill: 0.1, reservedFill: 0.1 });
  Continuous.updateController(controller, 0.5, fill, [visibleEnemy()], viewport);
  assert.equal(controller.waveProgressArmed, true);
  assert.ok(controller.nRef > 0);
  assert.ok(controller.target > 0);
});

test("spawn selection suppression stays soft and type RNG is position-independent", () => {
  const history = ["normal", "fast", "normal", "normal"];
  assert.ok(Continuous.spawnWeight("normal", history) < Continuous.spawnWeight("fast", history));
  assert.ok(Continuous.spawnWeight("normal", history) > 0);
  const first = Continuous.createController({ waveCount: 5, seed: 123 });
  const second = Continuous.createController({ waveCount: 5, seed: 123 });
  second.positionRng(); second.positionRng(); second.positionRng();
  assert.equal(first.typeRng(), second.typeRng());
});

test("distance bands derive from viewport short side", () => {
  assert.deepEqual(Continuous.distanceBandPixels("NEAR"), { minimum: 48, maximum: 120 });
  assert.deepEqual(Continuous.distanceBandPixels("MID"), { minimum: 120, maximum: 240 });
  assert.deepEqual(Continuous.distanceBandPixels("FAR"), { minimum: 240, maximum: 420 });
});

test("reservation cancellation restores credit and fixed Coming budget", () => {
  const controller = Continuous.createController({ waveCount: 5 });
  Continuous.beginWaveComing(controller, 0.25, () => 0.5);
  controller.comingCredit = 5000;
  const before = controller.comingRemainingArea;
  const reservation = Continuous.commitSpawn(controller, "fast", 1600);
  Continuous.cancelSpawn(controller, reservation);
  assert.equal(controller.comingRemainingArea, before);
  assert.equal(controller.comingCommittedArea, 0);
  assert.ok(controller.comingCredit >= 5000);
  assert.deepEqual(controller.spawnHistory, []);
  const restoredCredit = controller.comingCredit;
  Continuous.cancelSpawn(controller, reservation);
  assert.equal(controller.comingCredit, restoredCredit);
  assert.equal(controller.comingRemainingArea, before);
});

test("death during entry or near-offscreen return cannot leave phantom Fill", () => {
  const viewport = { x: 0, y: 0, width: 800, height: 600 };
  const entering = { x: -80, y: 200, width: 56, height: 56, visualWidth: 56, visualHeight: 56, hp: 0,
    lifecycle: Continuous.LIFECYCLES.ENTERING };
  const departing = { x: 810, y: 200, width: 56, height: 56, visualWidth: 56, visualHeight: 56, hp: 0,
    lifecycle: Continuous.LIFECYCLES.NEAR_OFFSCREEN };
  const fill = Continuous.computeFill([entering, departing], viewport, 0);
  assert.equal(fill.visibleFill, 0);
  assert.equal(fill.returnReservedFill, 0);
  assert.equal(fill.projectedFill, 0);
  assert.equal(Continuous.updateLifecycle(entering, viewport), Continuous.LIFECYCLES.DEAD);
  assert.equal(Continuous.updateLifecycle(departing, viewport), Continuous.LIFECYCLES.DEAD);
});

test("camera motion transfers a living enemy between active and return-reserved states without duplication", () => {
  const enemy = { x: 850, y: 250, width: 56, height: 56, visualWidth: 56, visualHeight: 56, hp: 1,
    hasEnteredViewport: true, lifecycle: Continuous.LIFECYCLES.ACTIVE };
  const firstViewport = { x: 800, y: 0, width: 800, height: 600 };
  assert.equal(Continuous.updateLifecycle(enemy, firstViewport), Continuous.LIFECYCLES.ACTIVE);
  const shiftedViewport = { x: 0, y: 0, width: 800, height: 600 };
  assert.equal(Continuous.updateLifecycle(enemy, shiftedViewport), Continuous.LIFECYCLES.NEAR_OFFSCREEN);
  const fill = Continuous.computeFill([enemy], shiftedViewport, 0);
  assert.equal(fill.visibleFill, 0);
  assert.equal(fill.returnReservedArea, 56 * 56);
  assert.equal(fill.returnReservedFill, (56 * 56) / fill.capacityArea);
  assert.equal(fill.reservedFill, fill.returnReservedFill);
  assert.equal(fill.projectedFill, fill.returnReservedFill);
});

test("seeded high-volume decisions never violate caps or negative credit", () => {
  for (let seed = 1; seed <= 250; seed++) {
    const controller = Continuous.createController({ waveCount: 5, seed });
    controller.normalCredit = Continuous.capacityArea();
    let projected = 0;
    for (let decision = 0; decision < 200; decision++) {
      const area = [1600, 2304, 2704, 3136, 3600, 4624, 6400][Math.floor(controller.typeRng() * 7)];
      if (!Continuous.candidateFits(projected, area)) break;
      const reservation = Continuous.commitSpawn(controller, "normal", area, Continuous.PHASES.NORMAL);
      if (!reservation) break;
      projected += area / Continuous.capacityArea();
      assert.ok(projected <= 0.7 + 1e-9);
      assert.ok(controller.normalCredit >= 0);
    }
  }
});

test("Wave 1 opening target ramps from 5 to 15 to 20 percent", () => {
  const controller = Continuous.createController({ waveCount: 5 });
  controller.waveIndex = 0;
  controller.combatElapsed = 0;
  assert.equal(Continuous.effectiveNormalTarget(controller), 0.05);
  controller.combatElapsed = 2;
  assert.equal(Continuous.effectiveNormalTarget(controller), 0.15);
  controller.combatElapsed = 5;
  assert.equal(Continuous.effectiveNormalTarget(controller), 0.20);
  controller.waveIndex = 1;
  controller.combatElapsed = 0;
  assert.equal(Continuous.effectiveNormalTarget(controller), 0.20);
});

test("dispatch pulse policies cap Normal at 2 and Coming at 3", () => {
  const controller = Continuous.createController({ waveCount: 5 });
  controller.phase = Continuous.PHASES.NORMAL;
  assert.deepEqual(Continuous.dispatchPolicy(controller.phase), { maximum: 2, interval: 0.20 });
  Continuous.recordDispatchPulse(controller, 2);
  assert.equal(Continuous.canDispatchPulse(controller), false);
  Continuous.updateController(controller, 0.20,
    { capacityArea: Continuous.capacityArea(), projectedFill: 0.25, visibleFill: 0.25, reservedFill: 0 }, [], viewport);
  assert.equal(Continuous.canDispatchPulse(controller), true);
  assert.deepEqual(Continuous.dispatchPolicy(Continuous.PHASES.WAVE_COMING), { maximum: 3, interval: 0.15 });
});

test("managed regular-enemy accounting is capped at 40 without phantom reservations", () => {
  const enemies = Array.from({ length: 39 }, () => ({ hp: 1, lifecycle: Continuous.LIFECYCLES.ACTIVE }));
  assert.equal(Continuous.managedRegularEnemyCount(enemies, 1), 40);
  assert.equal(Continuous.canReserveManagedEnemy(enemies, 1), false);
  enemies[0].lifecycle = Continuous.LIFECYCLES.DEAD;
  assert.equal(Continuous.managedRegularEnemyCount(enemies, 1), 39);
  assert.equal(Continuous.canReserveManagedEnemy(enemies, 1), true);
});
