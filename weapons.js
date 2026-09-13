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
  const WEAPON_CALIBRATION = freeze({
    starter: { damage: 2, fireRate: 4, bulletSpeed: 480, bulletSize: 10,
      projectileCount: 1, spreadDegrees: 0, pierce: 0 },
    scatter: { damage: 1, fireRate: 2.2, bulletSpeed: 360, bulletSize: 9,
      projectileCount: 5, spreadDegrees: 14, pierce: 0, maxRange: 260 },
    piercer: { damage: 3, fireRate: 1.8, bulletSpeed: 720, bulletSize: 10,
      projectileCount: 1, spreadDegrees: 0, pierce: 4 },
    burst: { damage: 1.5, fireRate: 1.4, bulletSpeed: 520, bulletSize: 9,
      projectileCount: 1, spreadDegrees: 0, pierce: 0, burstCount: 3, burstSpacing: 0.11 },
    launcher: { damage: 2, fireRate: 0.8, bulletSpeed: 260, bulletSize: 14,
      projectileCount: 1, spreadDegrees: 0, pierce: 0, explosionRadius: 80 },
    "arc-blade": { damage: 2, fireRate: 1.5, sweepRange: 105, sweepHalfAngleDegrees: 55 }
  });
  const makeWeapon = (id, name, attackKind, supportedWeaponUpgrades, extra = {}) => freeze({
    id, name, attackKind, supportedWeaponUpgrades, ...WEAPON_CALIBRATION[id], ...extra
  });
  const DEFINITIONS = freeze({
    starter: makeWeapon("starter", "Starter", "projectile", ["rapid-fire", "heavy-shot", "split-shot"]),
    scatter: makeWeapon("scatter", "Scatter", "projectile", ["rapid-fire", "heavy-shot", "split-shot"]),
    piercer: makeWeapon("piercer", "Piercer", "projectile", ["rapid-fire", "heavy-shot", "split-shot"]),
    burst: makeWeapon("burst", "Burst", "burst", ["rapid-fire", "heavy-shot"]),
    launcher: makeWeapon("launcher", "Launcher", "launcher", ["rapid-fire", "heavy-shot"]),
    "arc-blade": makeWeapon("arc-blade", "Arc Blade", "arc", ["rapid-fire", "heavy-shot"], {
      bulletSpeed: 0, bulletSize: 0, projectileCount: 0, spreadDegrees: 0, pierce: 0
    })
  });
  const STARTER = DEFINITIONS.starter;
  const WEAPON_LIST = freeze(Object.values(DEFINITIONS));

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
    WEAPON_CALIBRATION,
    STARTER,
    STARTER_WEAPON: STARTER,
    DEFINITIONS,
    WEAPON_LIST,
    getProjectileAngles,
    getProjectileDirections,
    createSeededRng
  });
  global.Weapons = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
