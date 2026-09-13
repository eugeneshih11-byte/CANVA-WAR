const test = require("node:test");
const assert = require("node:assert/strict");
const Weapons = require("../weapons.js");

const close = (actual, expected, tolerance = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected}`);

test("six immutable production Weapons expose distinct attack identities", () => {
  assert.deepEqual(Weapons.STARTER, {
    id: "starter", name: "Starter", attackKind: "projectile",
    supportedWeaponUpgrades: ["rapid-fire", "heavy-shot", "split-shot"], damage: 2, fireRate: 4,
    bulletSpeed: 480, bulletSize: 10, projectileCount: 1,
    spreadDegrees: 0, pierce: 0
  });
  assert.deepEqual(Object.keys(Weapons.DEFINITIONS),
    ["starter", "scatter", "piercer", "burst", "launcher", "arc-blade"]);
  assert.equal(Weapons.DEFINITIONS.scatter.projectileCount, 5);
  assert.equal(Weapons.DEFINITIONS.piercer.pierce, 4);
  assert.equal(Weapons.DEFINITIONS.burst.burstCount, 3);
  assert.equal(Weapons.DEFINITIONS.launcher.explosionRadius, 80);
  assert.equal(Weapons.DEFINITIONS["arc-blade"].attackKind, "arc");
  assert.equal(Weapons.DEFINITIONS.starter, Weapons.STARTER);
  assert.equal(Object.isFrozen(Weapons.STARTER), true);
  assert.equal(Object.isFrozen(Weapons.DEFINITIONS), true);
  assert.equal(Weapons.MAX_FIRE_RATE, 12);
});

test("Scatter fan is wide, symmetric, and deterministic", () => {
  const scatter = Weapons.DEFINITIONS.scatter;
  const angles = Weapons.getProjectileAngles(0, scatter.projectileCount, scatter.spreadDegrees);
  assert.equal(angles.length, 5);
  assert.equal(angles[0], -angles[4]);
  assert.equal(angles[1], -angles[3]);
  assert.equal(angles[2], 0);
});

test("one projectile follows the exact aim angle", () => {
  const [direction] = Weapons.getProjectileDirections(Math.PI / 3, 1, 0);
  close(direction.angle, Math.PI / 3);
  close(direction.x, 0.5);
  close(direction.y, Math.sqrt(3) / 2);
});

test("two projectile angles are symmetric with 12-degree adjacent spacing", () => {
  const angles = Weapons.getProjectileAngles(0, 2, 12).map(angle => angle * 180 / Math.PI);
  close(angles[0], -6);
  close(angles[1], 6);
});

test("three projectile angles are symmetric and include the aim direction", () => {
  const angles = Weapons.getProjectileAngles(Math.PI / 2, 3, 12)
    .map(angle => angle * 180 / Math.PI);
  close(angles[0], 78);
  close(angles[1], 90);
  close(angles[2], 102);
});

test("seeded RNG streams are deterministic and independent", () => {
  const first = Weapons.createSeededRng(12345);
  const second = Weapons.createSeededRng(12345);
  const different = Weapons.createSeededRng(12346);
  const values = Array.from({ length: 5 }, () => first());
  assert.deepEqual(values, Array.from({ length: 5 }, () => second()));
  assert.notDeepEqual(values, Array.from({ length: 5 }, () => different()));
  assert.ok(values.every(value => value >= 0 && value < 1));
});
