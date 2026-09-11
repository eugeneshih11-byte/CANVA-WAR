const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const Battlefields = require("../battlefields.js");
const encounterContext = { URLSearchParams };
encounterContext.globalThis = encounterContext;
vm.createContext(encounterContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "encounters.js"), "utf8"), encounterContext);
const Encounters = encounterContext.Encounters;

function testField(bounds, obstacles) {
  return { id: "test-field", bounds, playerSpawn: { x: 0, y: 0 }, obstacles };
}

function assertSafeRoute(body, route, battlefield) {
  assert.ok(route && route.length > 0);
  let origin = { ...body };
  for (const point of route) {
    assert.equal(Battlefields.hasLineOfTravel(origin, point, battlefield), true);
    origin = { ...origin, ...point };
  }
}

test("Stage 1 references one immutable Battlefield for every Wave and its Boss", () => {
  const definition = Battlefields.getDefinition("stage-1-field-a");
  assert.equal(Encounters.STAGES[0].battlefieldId, definition.id);
  assert.deepEqual(definition.bounds, { width: 800, height: 600 });
  assert.deepEqual(definition.playerSpawn, { x: 380, y: 280 });
  assert.equal(definition.obstacles.length, 4);
  assert.ok(definition.obstacles.every(obstacle => obstacle.solid && obstacle.blocksProjectiles));
  assert.equal(Object.isFrozen(Battlefields.DEFINITIONS), true);
  assert.equal(Object.isFrozen(definition), true);
  assert.equal(Object.isFrozen(definition.obstacles), true);
  assert.equal(Object.isFrozen(definition.obstacles[0]), true);
  assert.equal(Battlefields.firstSolidCollision({ ...definition.playerSpawn, width: 40, height: 40 }, definition), null);
});

test("runtime construction never mutates the immutable Battlefield definition", () => {
  const before = JSON.stringify(Battlefields.DEFINITIONS);
  const first = Battlefields.createRuntime("stage-1-field-a");
  const second = Battlefields.createRuntime("stage-1-field-a");
  first.transient = { visited: true };
  assert.notEqual(first, second);
  assert.equal(first.definition, second.definition);
  assert.equal(JSON.stringify(Battlefields.DEFINITIONS), before);
});

test("swept collision blocks high-speed tunneling and preserves a legal slide axis", () => {
  const battlefield = Battlefields.getDefinition("stage-1-field-a");
  const body = { x: 40, y: 130, width: 40, height: 40 };
  const horizontal = Battlefields.traceMovement(body, 500, 0, battlefield);
  assert.equal(horizontal.collided, true);
  assert.ok(horizontal.x + body.width <= 110);
  const vertical = Battlefields.moveAxis({ ...body, x: horizontal.x }, 180, "y", battlefield);
  assert.equal(vertical.y, 310);
});

test("Normal, Fast, and Tank footprints receive smoothed safe routes around cover", () => {
  const battlefield = Battlefields.getDefinition("stage-1-field-a");
  for (const body of [
    { x: 200, y: 40, width: 40, height: 40 },
    { x: 200, y: 50, width: 30, height: 30 },
    { x: 200, y: 20, width: 60, height: 60 }
  ]) {
    const target = { x: 200, y: 240 };
    const route = Battlefields.findPath(body, target, battlefield);
    assertSafeRoute(body, route, battlefield);
    assert.deepEqual(route.at(-1), target);
  }
});

test("Tank cannot use a corridor narrower than its footprint", () => {
  const battlefield = testField({ width: 200, height: 160 }, [
    { x: 0, y: 70, width: 70, height: 20, solid: true },
    { x: 120, y: 70, width: 80, height: 20, solid: true }
  ]);
  const normal = { x: 80, y: 10, width: 40, height: 40 };
  const tank = { x: 70, y: 0, width: 60, height: 60 };
  assertSafeRoute(normal, Battlefields.findPath(normal, { x: 80, y: 110 }, battlefield), battlefield);
  assert.equal(Battlefields.findPath(tank, { x: 70, y: 100 }, battlefield), null);
});

test("A-star rejects unreachable components and diagonal corner cutting", () => {
  const battlefield = testField({ width: 180, height: 180 }, [
    { x: 0, y: 80, width: 180, height: 20, solid: true }
  ]);
  assert.equal(Battlefields.findPath(
    { x: 20, y: 20, width: 20, height: 20 }, { x: 20, y: 130 }, battlefield), null);

  const corner = testField({ width: 80, height: 80 }, [
    { x: 20, y: 0, width: 20, height: 20, solid: true },
    { x: 0, y: 20, width: 20, height: 20, solid: true }
  ]);
  assert.equal(Battlefields.findPath(
    { x: 0, y: 0, width: 20, height: 20 }, { x: 40, y: 40 }, corner), null);
});

test("navigation requests are deterministic, bounded, and consume no RNG", () => {
  const battlefield = Battlefields.getDefinition("stage-1-field-a");
  const body = { x: 200, y: 40, width: 40, height: 40 };
  const target = { x: 200, y: 240, width: 40, height: 40 };
  const originalRandom = Math.random;
  let calls = 0;
  Math.random = () => { calls++; return 0.5; };
  try {
    const firstRuntime = Battlefields.createNavigationRuntime(7);
    const secondRuntime = Battlefields.createNavigationRuntime(7);
    const first = Battlefields.navigationIntent(body, target, battlefield, firstRuntime, 0.1);
    const second = Battlefields.navigationIntent(body, target, battlefield, secondRuntime, 0.1);
    assert.deepEqual(first, second);
    assert.deepEqual(firstRuntime, secondRuntime);
    assert.equal(first.requested, true);
    assert.equal(first.failed, false);
    Battlefields.navigationIntent(body, target, battlefield, firstRuntime, 0.1);
    assert.equal(firstRuntime.repathElapsed, 0.1);
    assert.equal(calls, 0);
  } finally {
    Math.random = originalRandom;
  }
});

test("stuck recovery invalidates a cached route after a bounded delay", () => {
  const runtime = Battlefields.createNavigationRuntime(1);
  runtime.waypoints = [{ x: 20, y: 20 }];
  assert.equal(Battlefields.recordNavigationProgress(runtime, 2, 0, 0.3), false);
  assert.equal(Battlefields.recordNavigationProgress(runtime, 2, 0, 0.3), true);
  assert.equal(runtime.forceRepath, true);
  assert.deepEqual(runtime.waypoints, []);
});

test("hazard projection and projectile blocking use the same static geometry", () => {
  const battlefield = Battlefields.getDefinition("stage-1-field-a");
  const projected = Battlefields.nearestPlayablePoint({ x: 200, y: 150 }, battlefield);
  assert.equal(Battlefields.firstSolidCollision({ x: projected.x, y: projected.y, width: 1, height: 1 }, battlefield), null);
  const projectile = { x: 20, y: 140, width: 10, height: 10 };
  const result = Battlefields.traceMovement(projectile, 700, 0, battlefield);
  assert.equal(result.collision?.id, "northwest-cover");
  assert.ok(result.x + projectile.width <= result.collision.x);
});
