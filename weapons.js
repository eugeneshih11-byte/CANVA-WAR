// Immutable Weapon content and deterministic projectile math.
(function (global) {
  function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const MAX_FIRE_RATE = 12;
  const STARTER = freeze({
    id: "starter",
    name: "Starter",
    damage: 1,
    fireRate: 4,
    bulletSpeed: 480,
    bulletSize: 10,
    projectileCount: 1,
    spreadDegrees: 0,
    pierce: 0
  });
  const DEFINITIONS = freeze({ starter: STARTER });

  function getProjectileAngles(aimAngle, projectileCount = 1, spreadDegrees = 0) {
    if (!Number.isFinite(aimAngle)) throw new Error("Invalid aim angle");
    if (!Number.isInteger(projectileCount) || projectileCount < 1) throw new Error("Invalid projectile count");
    if (!Number.isFinite(spreadDegrees) || spreadDegrees < 0) throw new Error("Invalid projectile spacing");
    const spacing = spreadDegrees * Math.PI / 180;
    return Array.from({ length: projectileCount }, (_, index) =>
      aimAngle + (index - (projectileCount - 1) / 2) * spacing);
  }

  function getProjectileDirections(aimAngle, projectileCount = 1, spreadDegrees = 0) {
    return getProjectileAngles(aimAngle, projectileCount, spreadDegrees)
      .map(angle => ({ angle, x: Math.cos(angle), y: Math.sin(angle) }));
  }

  // This small private-state generator lets Upgrade choices use an RNG stream that
  // is independent from Encounter generation. Tests can inject any RNG directly.
  function createSeededRng(seed) {
    let state = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : Date.now() >>> 0;
    return function seededRandom() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  const api = Object.freeze({
    MAX_FIRE_RATE,
    TECHNICAL_FIRE_RATE_CAP: MAX_FIRE_RATE,
    STARTER,
    STARTER_WEAPON: STARTER,
    DEFINITIONS,
    getProjectileAngles,
    getProjectileDirections,
    createSeededRng
  });
  global.Weapons = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
