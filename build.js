// Immutable Run Upgrade content and pure Build/stat resolution.
(function (global) {
  const Weapons = global.Weapons ||
    (typeof require === "function" ? require("./weapons.js") : null);
  if (!Weapons) throw new Error("Weapons module must load before Run Build");

  function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const PLAYER_BASE_STATS = freeze({ maxHp: 5, speed: 240 });
  const UPGRADES = freeze({
    "rapid-fire": {
      id: "rapid-fire", name: "Rapid Fire", maxStacks: 4,
      description: "+20% Fire Rate", effectLines: ["+20% Fire Rate"],
      effects: { fireRateMultiplier: 1.2 }
    },
    "heavy-shot": {
      id: "heavy-shot", name: "Heavy Shot", maxStacks: 4,
      description: "+1 Damage, larger shots", effectLines: ["+1 Damage, larger shots", "-8% Fire Rate"],
      effects: { damageAdd: 1, bulletSizeAdd: 1, fireRateMultiplier: 0.92 }
    },
    "split-shot": {
      id: "split-shot", name: "Split Shot", maxStacks: 2,
      description: "+1 Projectile", effectLines: ["+1 Projectile", "Reduced damage per projectile"],
      effects: { projectileCountAdd: 1, spreadDegrees: 12, damageMultipliers: [1, 0.75, 0.65] }
    },
    vitality: {
      id: "vitality", name: "Vitality", maxStacks: 3,
      description: "+1 Max HP", effectLines: ["+1 Max HP", "Heal 1 HP"],
      effects: { maxHpAdd: 1, healOnSelect: 1 }
    },
    "swift-feet": {
      id: "swift-feet", name: "Swift Feet", maxStacks: 4,
      description: "+8% Move Speed", effectLines: ["+8% Move Speed"],
      effects: { speedMultiplier: 1.08 }
    }
  });
  const UPGRADE_LIST = freeze(Object.values(UPGRADES));

  function stackValue(buildState, upgradeId) {
    const value = buildState?.upgradeStacks?.[upgradeId];
    if (!Number.isInteger(value) || value <= 0) return 0;
    return Math.min(value, UPGRADES[upgradeId].maxStacks);
  }

  function createBuildState(source = {}) {
    const supplied = source?.upgradeStacks || source || {};
    const upgradeStacks = {};
    for (const upgrade of UPGRADE_LIST) {
      const value = supplied?.[upgrade.id];
      upgradeStacks[upgrade.id] = Number.isInteger(value) && value > 0
        ? Math.min(value, upgrade.maxStacks) : 0;
    }
    return { upgradeStacks };
  }

  function getUpgradeStacks(buildState, upgradeId) {
    return UPGRADES[upgradeId] ? stackValue(buildState, upgradeId) : 0;
  }

  function resolveWeaponStats(baseWeapon, buildState) {
    const rapidFire = stackValue(buildState, "rapid-fire");
    const heavyShot = stackValue(buildState, "heavy-shot");
    const splitShot = stackValue(buildState, "split-shot");
    const splitEffects = UPGRADES["split-shot"].effects;
    const preSplitDamage = baseWeapon.damage + heavyShot * UPGRADES["heavy-shot"].effects.damageAdd;
    const damageMultiplier = splitEffects.damageMultipliers[splitShot];
    const fireRate = baseWeapon.fireRate *
      UPGRADES["rapid-fire"].effects.fireRateMultiplier ** rapidFire *
      UPGRADES["heavy-shot"].effects.fireRateMultiplier ** heavyShot;

    return {
      ...baseWeapon,
      damage: preSplitDamage * damageMultiplier,
      fireRate: Math.min(Weapons.MAX_FIRE_RATE, fireRate),
      bulletSize: baseWeapon.bulletSize + heavyShot * UPGRADES["heavy-shot"].effects.bulletSizeAdd,
      projectileCount: baseWeapon.projectileCount + splitShot * splitEffects.projectileCountAdd,
      spreadDegrees: splitShot > 0 ? splitEffects.spreadDegrees : baseWeapon.spreadDegrees,
      bulletSpeed: baseWeapon.bulletSpeed,
      pierce: baseWeapon.pierce
    };
  }

  function resolvePlayerStats(basePlayer, buildState) {
    const vitality = stackValue(buildState, "vitality");
    const swiftFeet = stackValue(buildState, "swift-feet");
    return {
      ...basePlayer,
      maxHp: basePlayer.maxHp + vitality * UPGRADES.vitality.effects.maxHpAdd,
      speed: basePlayer.speed * UPGRADES["swift-feet"].effects.speedMultiplier ** swiftFeet
    };
  }

  function canSelectUpgrade(buildState, upgradeId) {
    const upgrade = UPGRADES[upgradeId];
    return Boolean(upgrade && stackValue(buildState, upgradeId) < upgrade.maxStacks);
  }

  function generateUpgradeChoices(buildState, count = 3, rng = Math.random) {
    const wanted = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
    const pool = UPGRADE_LIST.filter(upgrade => canSelectUpgrade(buildState, upgrade.id));
    if (wanted >= pool.length) return pool.slice();
    const choices = [];
    while (choices.length < wanted) {
      const random = rng();
      if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error("Invalid RNG value");
      choices.push(pool.splice(Math.floor(random * pool.length), 1)[0]);
    }
    return choices;
  }

  function applyUpgrade(buildState, upgradeId, options = {}) {
    const current = createBuildState(buildState);
    const upgrade = UPGRADES[upgradeId] || null;
    if (!canSelectUpgrade(current, upgradeId)) {
      return { applied: false, buildState: current, playerHp: options.playerHp, upgrade };
    }

    const buildStateAfter = createBuildState(current);
    buildStateAfter.upgradeStacks[upgradeId]++;
    let playerHp = options.playerHp;
    if (upgradeId === "vitality" && Number.isFinite(playerHp)) {
      const playerStats = resolvePlayerStats(options.basePlayer || PLAYER_BASE_STATS, buildStateAfter);
      playerHp = Math.min(playerStats.maxHp, playerHp + upgrade.effects.healOnSelect);
    }
    return { applied: true, buildState: buildStateAfter, playerHp, upgrade };
  }

  const api = Object.freeze({
    PLAYER_BASE_STATS,
    UPGRADES,
    UPGRADE_LIST,
    createBuildState,
    getUpgradeStacks,
    resolveWeaponStats,
    resolvePlayerStats,
    canSelectUpgrade,
    generateUpgradeChoices,
    applyUpgrade
  });
  global.RunBuild = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
