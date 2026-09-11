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

const ACTORS = [
  { id: "player", width: 40, height: 40 },
  ...Object.entries(Encounters.ENEMIES).map(([id, definition]) => ({ id,
    width: definition.stats.width, height: definition.stats.height })),
  ...Object.entries(Encounters.BOSSES).map(([id, definition]) => ({ id,
    width: definition.stats.width, height: definition.stats.height }))
];

function testField(bounds, obstacles) {
  return { id: "test-field", bounds, playerSpawn: { x: 0, y: 0 }, obstacles };
}

function generated(seed = 1, options = {}) {
  return Battlefields.generateBattlefield("stage-1-field-a", seed,
    { actorFootprints: ACTORS, ...options });
}

function assertSafeRoute(body, route, battlefield) {
  assert.ok(route && route.length > 0);
  let origin = { ...body };
  for (const point of route) {
    assert.equal(Battlefields.hasLineOfTravel(origin, point, battlefield), true);
    origin = { ...origin, ...point };
  }
}

test("Stage 1 uses one immutable derived world definition without authored obstacles", () => {
  const source = Battlefields.getDefinition("stage-1-field-a");
  assert.equal(Encounters.STAGES[0].battlefieldId, source.id);
  assert.deepEqual(source.viewport, { width: 800, height: 600 });
  assert.deepEqual(source.worldScale, { x: 2, y: 2 });
  assert.deepEqual(source.bounds, { width: 1600, height: 1200 });
  assert.equal("obstacles" in source, false);
  assert.equal(Object.isFrozen(Battlefields.DEFINITIONS), true);
  assert.equal(Object.isFrozen(source), true);
  assert.equal(Object.isFrozen(source.bounds), true);
});

test("same seed reproduces a frozen layout while different seeds vary it", () => {
  const before = JSON.stringify(Battlefields.DEFINITIONS);
  const first = generated(12345);
  const second = generated(12345);
  const different = generated(54321);
  assert.notEqual(first, second);
  assert.notEqual(first.definition, second.definition);
  assert.equal(JSON.stringify(first.definition), JSON.stringify(second.definition));
  assert.notEqual(JSON.stringify(first.definition.obstacles), JSON.stringify(different.definition.obstacles));
  assert.equal(first.seed, second.seed);
  assert.equal(Object.isFrozen(first.definition), true);
  assert.equal(Object.isFrozen(first.definition.obstacles), true);
  assert.equal(JSON.stringify(Battlefields.DEFINITIONS), before);
});

test("generated worlds validate every production actor footprint and cache static grids", () => {
  const runtime = generated(77);
  const result = Battlefields.validateGeneratedBattlefield(runtime, ACTORS);
  assert.deepEqual(result, { valid: true, errors: [] });
  assert.equal(runtime.definition.obstacles.length >= 7, true);
  assert.equal(runtime.navigationCache.size,
    new Set(ACTORS.map(actor => `${actor.width}x${actor.height}`)).size);
  for (const obstacle of runtime.definition.obstacles) {
    assert.equal(Battlefields.isInsideBounds(obstacle, runtime), true);
    assert.equal(obstacle.solid && obstacle.blocksProjectiles, true);
  }
});

test("bounded generation has a deterministic, derived and valid fallback", () => {
  const first = generated(9, { maxAttempts: 0 });
  const second = generated(999, { maxAttempts: 0 });
  assert.equal(first.generation.usedFallback, true);
  assert.equal(first.generation.attemptCount, 0);
  assert.equal(JSON.stringify(first.definition.obstacles), JSON.stringify(second.definition.obstacles));
  assert.deepEqual(Battlefields.validateGeneratedBattlefield(first, ACTORS), { valid: true, errors: [] });
  assert.ok(first.definition.obstacles.every(obstacle => obstacle.x !== 110 && obstacle.y !== 120));
});

test("swept collision blocks high-speed tunneling and preserves a legal slide axis", () => {
  const battlefield = testField({ width: 800, height: 600 }, [
    { id: "cover", x: 110, y: 120, width: 240, height: 60, solid: true, blocksProjectiles: true }
  ]);
  const body = { x: 40, y: 130, width: 40, height: 40 };
  const horizontal = Battlefields.traceMovement(body, 500, 0, battlefield);
  assert.equal(horizontal.collided, true);
  assert.ok(horizontal.x + body.width <= 110);
  const vertical = Battlefields.moveAxis({ ...body, x: horizontal.x }, 180, "y", battlefield);
  assert.equal(vertical.y, 310);
});

test("production footprints receive safe routes in a generated world", () => {
  const runtime = generated(2026);
  const target = runtime.definition.playerSpawn;
  for (const actor of ACTORS) {
    const start = { x: 20, y: 20, width: actor.width, height: actor.height };
    Object.assign(start, Battlefields.nearestPlayablePoint(start, runtime));
    assertSafeRoute(start, Battlefields.findPath(start, target, runtime), runtime);
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
  const runtime = testField({ width: 400, height: 300 }, [
    { x: 150, y: 60, width: 80, height: 180, solid: true }
  ]);
  const body = { x: 60, y: 120, width: 40, height: 40 };
  const target = { x: 280, y: 120, width: 40, height: 40 };
  const originalRandom = Math.random;
  let calls = 0;
  Math.random = () => { calls++; return 0.5; };
  try {
    const firstRuntime = Battlefields.createNavigationRuntime(7);
    const secondRuntime = Battlefields.createNavigationRuntime(7);
    const first = Battlefields.navigationIntent(body, target, runtime, firstRuntime, 0.1);
    const second = Battlefields.navigationIntent(body, target, runtime, secondRuntime, 0.1);
    assert.deepEqual(first, second);
    assert.deepEqual(firstRuntime, secondRuntime);
    assert.equal(first.requested, true);
    assert.equal(first.failed, false);
    Battlefields.navigationIntent(body, target, runtime, firstRuntime, 0.1);
    assert.equal(firstRuntime.repathElapsed, 0.1);
    assert.equal(calls, 0);
  } finally {
    Math.random = originalRandom;
  }
});

test("stuck recovery invalidates a cached route after a bounded delay", () => {
  const runtime = Battlefields.createNavigationRuntime(1);
  runtime.waypoints = [{ x: 20, y: 20 }];
  const noRouteProgress = deltaTime => ({
    attemptedDistance: 2,
    movedDistance: 2,
    deltaTime,
    beforeDistance: 100,
    afterDistance: 100,
    waypointIndexBefore: 0,
    waypointIndexAfter: 0
  });
  assert.equal(Battlefields.recordNavigationProgress(runtime, noRouteProgress(0.4)), false);
  assert.equal(Battlefields.recordNavigationProgress(runtime, noRouteProgress(0.4)), true);
  assert.equal(runtime.forceRepath, true);
  assert.deepEqual(runtime.waypoints, []);
  assert.equal(runtime.forcedRepaths, 1);
  assert.equal(runtime.stuckRecoveries, 1);
  assert.equal(runtime.routeVariant, 1);
  assert.equal(runtime.lastRecoveryDuration, 0.8);
  assert.equal(runtime.maxNoProgressDuration, 0.8);
});

test("stuck recovery selects a deterministic alternate side of symmetric cover", () => {
  const battlefield = testField({ width: 500, height: 400 }, [
    { id: "center-wall", x: 220, y: 100, width: 60, height: 200, solid: true }
  ]);
  const body = { x: 60, y: 180, width: 40, height: 40 };
  const target = { x: 400, y: 180, width: 40, height: 40 };
  const first = Battlefields.findPath(body, target, battlefield, 20, 0);
  const alternate = Battlefields.findPath(body, target, battlefield, 20, 1);
  assertSafeRoute(body, first, battlefield);
  assertSafeRoute(body, alternate, battlefield);
  assert.notEqual(JSON.stringify(first), JSON.stringify(alternate));
  assert.notEqual(
    first.some(point => point.y < 100),
    alternate.some(point => point.y < 100)
  );
  assert.deepEqual(Battlefields.findPath(body, target, battlefield, 20, 1), alternate);
});

test("problem seed 785540978 is reproducible, locally populated, and mostly open", () => {
  const first = generated(785540978);
  const second = generated(785540978);
  const density = Battlefields.analyzeLocalDensity(first, ACTORS);
  assert.equal(JSON.stringify(first.definition), JSON.stringify(second.definition));
  assert.equal(first.seed, 785540978);
  assert.equal(first.generation.usedFallback, false);
  assert.equal(density.sampleCount, 25);
  assert.equal(density.requiredLocalArea, 2000);
  assert.equal(density.emptySampleCount, 0);
  assert.ok(density.minimumLocalCoverage > 0);
  assert.ok(density.worldOpenAreaRatio >= Battlefields.GENERATION.minimumWorldOpenAreaRatio);
  assert.ok(density.maximumLocalCoverage < 0.15);
  assert.deepEqual(Battlefields.validateGeneratedBattlefield(first, ACTORS),
    { valid: true, errors: [] });
});

test("validation rejects a viewport-scale empty terrain desert", () => {
  const definition = {
    id: "empty-region-test",
    viewport: { width: 800, height: 600 },
    bounds: { width: 1600, height: 1200 },
    playerSpawn: { x: 780, y: 580 },
    obstacles: [
      { id: "isolated-cover", x: 20, y: 20, width: 80, height: 80, solid: true }
    ]
  };
  const validation = Battlefields.validateGeneratedBattlefield(definition, []);
  const density = Battlefields.analyzeLocalDensity(definition);
  assert.equal(density.emptySampleCount > 0, true);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes("Viewport-scale empty terrain region"));
});

test("hazard projection and projectile blocking use shared static geometry", () => {
  const battlefield = testField({ width: 800, height: 600 }, [
    { id: "cover", x: 110, y: 120, width: 240, height: 60, solid: true, blocksProjectiles: true }
  ]);
  const projected = Battlefields.nearestPlayablePoint({ x: 200, y: 150 }, battlefield);
  assert.equal(Battlefields.firstSolidCollision(
    { x: projected.x, y: projected.y, width: 1, height: 1 }, battlefield), null);
  const projectile = { x: 20, y: 140, width: 10, height: 10 };
  const result = Battlefields.traceMovement(projectile, 700, 0, battlefield);
  assert.equal(result.collision?.id, "cover");
  assert.ok(result.x + projectile.width <= result.collision.x);
});

test("offscreen spawn candidates stay near the clamped Camera band", () => {
  const runtime = generated(31415);
  const body = { width: 60, height: 60 };
  for (const camera of [
    { x: 0, y: 0, width: 800, height: 600 },
    { x: 400, y: 300, width: 800, height: 600 },
    { x: 800, y: 600, width: 800, height: 600 }
  ]) {
    const candidates = Battlefields.spawnCandidates(body, camera, runtime, 0.25, 0.75);
    assert.ok(candidates.length > 0);
    for (const candidate of candidates) {
      const placed = { ...candidate, ...body };
      assert.equal(Battlefields.isInsideBounds(placed, runtime), true);
      assert.equal(Battlefields.isOutsideRect(placed, camera), true);
    }
  }
});

test("1000 seeded battlefields stay valid with Player and widest Boss footprints", () => {
  const stressActors = [ACTORS[0], ACTORS.find(actor => actor.id === "boss-1")];
  for (let seed = 0; seed < 1000; seed++) {
    const runtime = Battlefields.generateBattlefield("stage-1-field-a", seed,
      { actorFootprints: stressActors });
    const validation = Battlefields.validateGeneratedBattlefield(runtime, stressActors);
    assert.equal(validation.valid, true, `seed ${seed}: ${validation.errors.join(", ")}`);
  }
});
