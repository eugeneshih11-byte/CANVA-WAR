// Immutable Build content and pure Run Build/stat/reward resolution.
(function (global) {
  const Weapons = global.Weapons ||
    (typeof require === "function" ? require("./weapons.js") : null);
  if (!Weapons) throw new Error("Weapons module must load before Build");

  function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const REWARD_CATEGORIES = freeze({
    SHARED_UPGRADE: "shared-upgrade",
    WEAPON_MOD: "weapon-mod",
    PASSIVE: "passive",
    WEAPON_EVOLUTION: "weapon-evolution"
  });
  const BUILD_TAGS = freeze(["Melee", "Projectile", "AoE", "Pierce", "Mobility", "Multi-hit"]);
  const PLAYER_BASE_STATS = freeze({ maxHp: 5, speed: 240, damage: 2 });
  const LAUNCHER_EFFECTS = freeze({
    clusterDistributionRadiusMultiplier: 1,
    chainReactionDistributionMultiplier: 0.6,
    siegeBloomDelay: 0.45,
    siegeBloomRadiusMultiplier: 1.5
  });
  const SHARED_UPGRADES = freeze({
    "rapid-fire": {
      id: "rapid-fire", name: "Rapid Fire", category: REWARD_CATEGORIES.SHARED_UPGRADE, maxRank: 4,
      description: "+20% Attack Rate", effectLines: ["+20% Attack Rate"],
      compatibleWeaponIds: Weapons.WEAPON_LIST.map(weapon => weapon.id)
    },
    "heavy-shot": {
      id: "heavy-shot", name: "Heavy Shot", category: REWARD_CATEGORIES.SHARED_UPGRADE, maxRank: 4,
      description: "+1 Player Damage, -8% Attack Rate", effectLines: ["+1 Player Damage", "-8% Attack Rate"],
      compatibleWeaponIds: Weapons.WEAPON_LIST.map(weapon => weapon.id)
    },
    "split-shot": {
      id: "split-shot", name: "Split Shot", category: REWARD_CATEGORIES.SHARED_UPGRADE, maxRank: 2,
      description: "+1 Projectile", effectLines: ["+1 Projectile", "Reduced damage per projectile"],
      compatibleWeaponIds: ["starter", "scatter", "piercer"],
      damageMultipliers: [1, 0.75, 0.65]
    }
  });
  const PASSIVES = freeze({
    vitality: {
      id: "vitality", name: "Vitality", category: REWARD_CATEGORIES.PASSIVE, maxRank: 3,
      description: "+1 Max HP", effectLines: ["+1 Max HP", "Heal 1 HP"]
    },
    "swift-feet": {
      id: "swift-feet", name: "Swift Feet", category: REWARD_CATEGORIES.PASSIVE, maxRank: 4,
      description: "+8% Move Speed", effectLines: ["+8% Move Speed"]
    }
  });
  const WEAPON_MODS = freeze({
    "wide-arc": {
      id: "wide-arc", name: "Wide Arc", displayName: "Arc Blade — Wide Arc",
      category: REWARD_CATEGORIES.WEAPON_MOD, weaponId: "arc-blade", maxRank: 2,
      description: "+10° sweep half-angle", effectLines: ["+10° sweep half-angle"]
    },
    "cluster-shell": {
      id: "cluster-shell", name: "Cluster Shell", displayName: "Launcher — Cluster Shell",
      category: REWARD_CATEGORIES.WEAPON_MOD, weaponId: "launcher", maxRank: 2,
      description: "Primary impacts create secondary cluster explosions",
      effectLines: ["Rank I: 2 cluster explosions", "Rank II: 3 cluster explosions"]
    }
  });
  const WEAPON_EVOLUTIONS = freeze({
    "cyclone-blade": {
      id: "cyclone-blade", name: "Cyclone Blade", displayName: "Arc Blade — Cyclone Blade",
      category: REWARD_CATEGORIES.WEAPON_EVOLUTION, weaponId: "arc-blade", maxRank: 1,
      requirements: freeze([
        { kind: "weapon-mod", weaponId: "arc-blade", id: "wide-arc", rank: 2 },
        { kind: "shared-upgrade", id: "rapid-fire", rank: 2 }
      ]),
      description: "Every 3rd Arc Blade attack is a 360° sweep",
      effectLines: ["Every 3rd attack: 360° sweep"]
    },
    "siege-bloom": {
      id: "siege-bloom", name: "Siege Bloom", displayName: "Launcher — Siege Bloom",
      category: REWARD_CATEGORIES.WEAPON_EVOLUTION, weaponId: "launcher", maxRank: 1,
      requirements: freeze([
        { kind: "weapon-mod", weaponId: "launcher", id: "cluster-shell", rank: 2 },
        { kind: "shared-upgrade", id: "heavy-shot", rank: 2 }
      ]),
      description: "Primary impacts create a delayed larger blast",
      effectLines: ["After 0.45s: 1.5× radius center blast"]
    }
  });
  const COMBOS = freeze({
    "blade-dance": {
      id: "blade-dance", name: "Blade Dance", hidden: true,
      requirements: freeze([
        { kind: "weapon-evolution", weaponId: "arc-blade", id: "cyclone-blade" },
        { kind: "passive", id: "swift-feet", rank: 2 }
      ]),
      description: "Cyclone Blade becomes a full sweep every 2nd Arc Blade attack."
    },
    "chain-reaction": {
      id: "chain-reaction", name: "Chain Reaction", hidden: true,
      requirements: freeze([
        { kind: "weapon-evolution", weaponId: "launcher", id: "siege-bloom" },
        { kind: "passive", id: "vitality", rank: 2 }
      ]),
      description: "Cluster Shell explosions concentrate closer to the primary impact."
    }
  });
  const REWARDS = freeze({ ...SHARED_UPGRADES, ...PASSIVES, ...WEAPON_MODS, ...WEAPON_EVOLUTIONS });
  const REWARD_LIST = freeze(Object.values(REWARDS));
  const UPGRADES = freeze({ ...SHARED_UPGRADES, ...PASSIVES });
  const UPGRADE_LIST = freeze(Object.values(UPGRADES));
  const PLAYER_UPGRADE_IDS = freeze(Object.keys(PASSIVES));

  const rank = (value, maximum) => Number.isInteger(value) && value > 0
    ? Math.min(value, maximum) : 0;
  const cloneRanks = (source, definitions) => Object.fromEntries(Object.keys(definitions)
    .map(id => [id, rank(source?.[id], definitions[id].maxRank)]));

  function createBuildState(source = {}) {
    const legacy = source?.upgradeStacks || (!source.sharedUpgrades && !source.passives ? source : {});
    const sharedUpgrades = cloneRanks(source.sharedUpgrades || legacy, SHARED_UPGRADES);
    const passiveRanks = cloneRanks(source.passives || legacy, PASSIVES);
    const passives = Object.fromEntries(Object.entries(passiveRanks)
      .filter(([, value]) => value > 0).slice(0, 3));
    const weaponModsByWeaponId = {};
    for (const [weaponId, mods] of Object.entries(source.weaponModsByWeaponId || {})) {
      const legal = Object.fromEntries(Object.entries(mods || {})
        .filter(([id]) => WEAPON_MODS[id]?.weaponId === weaponId)
        .map(([id, value]) => [id, rank(value, WEAPON_MODS[id].maxRank)])
        .filter(([, value]) => value > 0));
      if (Object.keys(legal).length) weaponModsByWeaponId[weaponId] = legal;
    }
    const weaponEvolutionByWeaponId = {};
    for (const [weaponId, evolutionId] of Object.entries(source.weaponEvolutionByWeaponId || {})) {
      if (WEAPON_EVOLUTIONS[evolutionId]?.weaponId === weaponId) weaponEvolutionByWeaponId[weaponId] = evolutionId;
    }
    const discoveredCombos = [...new Set(Array.isArray(source.discoveredCombos) ? source.discoveredCombos : [])]
      .filter(id => COMBOS[id]);
    return { sharedUpgrades, weaponModsByWeaponId, weaponEvolutionByWeaponId, passives, discoveredCombos };
  }

  function getSharedUpgradeRank(state, id) {
    return SHARED_UPGRADES[id] ? rank(state?.sharedUpgrades?.[id], SHARED_UPGRADES[id].maxRank) : 0;
  }
  function getPassiveRank(state, id) {
    return PASSIVES[id] ? rank(state?.passives?.[id], PASSIVES[id].maxRank) : 0;
  }
  function getWeaponModRank(state, weaponId, id) {
    return WEAPON_MODS[id]?.weaponId === weaponId
      ? rank(state?.weaponModsByWeaponId?.[weaponId]?.[id], WEAPON_MODS[id].maxRank) : 0;
  }
  function getWeaponEvolution(state, weaponId) {
    const id = state?.weaponEvolutionByWeaponId?.[weaponId];
    return WEAPON_EVOLUTIONS[id]?.weaponId === weaponId ? id : null;
  }
  function hasDiscoveredCombo(state, id) {
    return Boolean(COMBOS[id] && state?.discoveredCombos?.includes(id));
  }
  function getUpgradeStacks(state, id) {
    return SHARED_UPGRADES[id] ? getSharedUpgradeRank(state, id) : getPassiveRank(state, id);
  }
  function getRewardRank(state, id) {
    const reward = REWARDS[id];
    if (!reward) return 0;
    if (reward.category === REWARD_CATEGORIES.SHARED_UPGRADE) return getSharedUpgradeRank(state, id);
    if (reward.category === REWARD_CATEGORIES.PASSIVE) return getPassiveRank(state, id);
    if (reward.category === REWARD_CATEGORIES.WEAPON_MOD) return getWeaponModRank(state, reward.weaponId, id);
    return getWeaponEvolution(state, reward.weaponId) === id ? 1 : 0;
  }

  function isUpgradeCompatible(baseWeapon, upgradeId) {
    if (PASSIVES[upgradeId]) return true;
    return Boolean(baseWeapon && SHARED_UPGRADES[upgradeId]?.compatibleWeaponIds.includes(baseWeapon.id));
  }
  function normalizeLoadout(loadout) {
    const values = Array.isArray(loadout) ? loadout : [loadout || Weapons.STARTER];
    return [...new Set(values.map(value => typeof value === "string" ? value : value?.id))]
      .filter(id => Weapons.DEFINITIONS[id]);
  }
  function requirementSatisfied(state, requirement) {
    if (requirement.kind === "shared-upgrade") return getSharedUpgradeRank(state, requirement.id) >= requirement.rank;
    if (requirement.kind === "passive") return getPassiveRank(state, requirement.id) >= requirement.rank;
    if (requirement.kind === "weapon-mod") return getWeaponModRank(state, requirement.weaponId, requirement.id) >= requirement.rank;
    if (requirement.kind === "weapon-evolution") return getWeaponEvolution(state, requirement.weaponId) === requirement.id;
    return false;
  }
  function requirementsSatisfied(state, definition) {
    return definition.requirements.every(requirement => requirementSatisfied(state, requirement));
  }
  function canSelectReward(state, rewardId, loadout = Weapons.STARTER) {
    const reward = REWARDS[rewardId];
    if (!reward || getRewardRank(state, rewardId) >= reward.maxRank) return false;
    const weaponIds = normalizeLoadout(loadout);
    if (reward.category === REWARD_CATEGORIES.SHARED_UPGRADE) {
      return weaponIds.some(id => reward.compatibleWeaponIds.includes(id));
    }
    if (reward.category === REWARD_CATEGORIES.PASSIVE) {
      return getPassiveRank(state, rewardId) > 0 || Object.keys(state?.passives || {}).length < 3;
    }
    if (!weaponIds.includes(reward.weaponId)) return false;
    if (reward.category === REWARD_CATEGORIES.WEAPON_MOD) return true;
    return requirementsSatisfied(state, reward);
  }
  function canSelectUpgrade(state, id, baseWeapon = Weapons.STARTER) {
    return canSelectReward(state, id, baseWeapon);
  }
  function generateRewardChoices(state, count = 3, rng = Math.random, loadout = [Weapons.STARTER.id]) {
    const wanted = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
    const pool = REWARD_LIST.filter(reward => canSelectReward(state, reward.id, loadout));
    if (wanted >= pool.length) return pool.slice();
    const choices = [];
    while (choices.length < wanted) {
      const random = rng();
      if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error("Invalid RNG value");
      choices.push(pool.splice(Math.floor(random * pool.length), 1)[0]);
    }
    return choices;
  }
  function generateUpgradeChoices(state, count = 3, rng = Math.random, baseWeapon = Weapons.STARTER) {
    return generateRewardChoices(state, count, rng, baseWeapon);
  }

  function discoverCombos(state) {
    const next = createBuildState(state), discovered = [];
    for (const combo of Object.values(COMBOS)) {
      if (!hasDiscoveredCombo(next, combo.id) && requirementsSatisfied(next, combo)) {
        next.discoveredCombos.push(combo.id);
        discovered.push(combo);
      }
    }
    return { buildState: next, discovered };
  }
  function applyReward(state, rewardId, options = {}) {
    const current = createBuildState(state), reward = REWARDS[rewardId] || null;
    const loadout = options.loadout || options.baseWeapon || Weapons.STARTER;
    if (!canSelectReward(current, rewardId, loadout)) {
      return { applied: false, buildState: current, playerHp: options.playerHp, reward, upgrade: reward, discoveries: [] };
    }
    const next = createBuildState(current);
    const beforeRank = getRewardRank(next, rewardId);
    if (reward.category === REWARD_CATEGORIES.SHARED_UPGRADE) next.sharedUpgrades[rewardId]++;
    else if (reward.category === REWARD_CATEGORIES.PASSIVE) next.passives[rewardId] = beforeRank + 1;
    else if (reward.category === REWARD_CATEGORIES.WEAPON_MOD) {
      next.weaponModsByWeaponId[reward.weaponId] ||= {};
      next.weaponModsByWeaponId[reward.weaponId][rewardId] = beforeRank + 1;
    } else next.weaponEvolutionByWeaponId[reward.weaponId] = rewardId;
    let playerHp = options.playerHp;
    if (rewardId === "vitality" && Number.isFinite(playerHp)) {
      const stats = resolvePlayerStats(options.basePlayer || PLAYER_BASE_STATS, next);
      playerHp = Math.min(stats.maxHp, playerHp + 1);
    }
    const discovery = discoverCombos(next);
    return { applied: true, buildState: discovery.buildState, playerHp, reward, upgrade: reward,
      rankBefore: beforeRank, rankAfter: getRewardRank(discovery.buildState, rewardId),
      discoveries: discovery.discovered };
  }
  function applyUpgrade(state, id, options = {}) { return applyReward(state, id, options); }

  function resolvePlayerStats(basePlayer, state) {
    const source = { ...PLAYER_BASE_STATS, ...(basePlayer || {}) };
    return { ...source,
      maxHp: source.maxHp + getPassiveRank(state, "vitality"),
      speed: source.speed * (1 + 0.08 * getPassiveRank(state, "swift-feet")),
      damage: source.damage + getSharedUpgradeRank(state, "heavy-shot") };
  }
  function resolveWeaponStats(baseWeapon, state, basePlayer = PLAYER_BASE_STATS) {
    const rapid = isUpgradeCompatible(baseWeapon, "rapid-fire") ? getSharedUpgradeRank(state, "rapid-fire") : 0;
    const heavy = isUpgradeCompatible(baseWeapon, "heavy-shot") ? getSharedUpgradeRank(state, "heavy-shot") : 0;
    const split = isUpgradeCompatible(baseWeapon, "split-shot") ? getSharedUpgradeRank(state, "split-shot") : 0;
    const playerDamage = resolvePlayerStats(basePlayer, state).damage;
    const splitDefinition = SHARED_UPGRADES["split-shot"];
    const wideArc = getWeaponModRank(state, baseWeapon.id, "wide-arc");
    return { ...baseWeapon,
      damage: playerDamage * splitDefinition.damageMultipliers[split],
      playerDamage,
      fireRate: Math.min(Weapons.MAX_FIRE_RATE, baseWeapon.fireRate * Math.max(0, 1 + 0.20 * rapid - 0.08 * heavy)),
      bulletSize: (baseWeapon.bulletSize || 0) + heavy,
      projectileCount: baseWeapon.projectileCount + split,
      spreadDegrees: split > 0 ? 12 : baseWeapon.spreadDegrees,
      ...(Number.isFinite(baseWeapon.sweepHalfAngleDegrees) ? {
        sweepHalfAngleDegrees: baseWeapon.sweepHalfAngleDegrees + wideArc * 10,
        evolutionId: getWeaponEvolution(state, baseWeapon.id)
      } : {}),
      ...(baseWeapon.id === "launcher" ? {
        evolutionId: getWeaponEvolution(state, baseWeapon.id),
        launcherEffects: getLauncherEffectProfile(state, baseWeapon.explosionRadius)
      } : {}) };
  }
  function getArcBladeSweep(state, attackNumber) {
    const evolved = getWeaponEvolution(state, "arc-blade") === "cyclone-blade";
    const cadence = hasDiscoveredCombo(state, "blade-dance") ? 2 : 3;
    const fullSweep = evolved && Number.isInteger(attackNumber) && attackNumber > 0 && attackNumber % cadence === 0;
    return { fullSweep, cadence, halfAngleDegrees: fullSweep ? 180 : 55 + getWeaponModRank(state, "arc-blade", "wide-arc") * 10 };
  }
  function getLauncherClusterOffsets(count, distributionRadius) {
    const amount = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
    const radius = Number.isFinite(distributionRadius) ? Math.max(0, distributionRadius) : 0;
    return Array.from({ length: amount }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / amount;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
  }
  function getLauncherEffectProfile(state, primaryExplosionRadius) {
    const clusterShellRank = getWeaponModRank(state, "launcher", "cluster-shell");
    const clusterExplosionCount = clusterShellRank > 0 ? clusterShellRank + 1 : 0;
    const siegeBloom = getWeaponEvolution(state, "launcher") === "siege-bloom";
    const chainReactionActive = siegeBloom && hasDiscoveredCombo(state, "chain-reaction");
    const primaryRadius = Number.isFinite(primaryExplosionRadius) ? Math.max(0, primaryExplosionRadius) : 0;
    const defaultDistributionRadius = primaryRadius * LAUNCHER_EFFECTS.clusterDistributionRadiusMultiplier;
    const clusterDistributionRadius = defaultDistributionRadius *
      (chainReactionActive ? LAUNCHER_EFFECTS.chainReactionDistributionMultiplier : 1);
    return {
      clusterShellRank,
      clusterExplosionCount,
      defaultDistributionRadius,
      clusterDistributionRadius,
      clusterOffsets: getLauncherClusterOffsets(clusterExplosionCount, clusterDistributionRadius),
      siegeBloom,
      siegeBloomDelay: LAUNCHER_EFFECTS.siegeBloomDelay,
      siegeBloomRadius: primaryRadius * LAUNCHER_EFFECTS.siegeBloomRadiusMultiplier,
      chainReactionActive
    };
  }
  function createRewardRng(seed) {
    const initialSeed = (Number(seed) >>> 0) || 0x43414e56;
    let state = initialSeed;
    const rng = function rewardRandom() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    rng.seed = initialSeed;
    rng.getState = () => state;
    return rng;
  }

  const api = Object.freeze({
    BUILD_TAGS, REWARD_CATEGORIES, PLAYER_BASE_STATS, LAUNCHER_EFFECTS,
    SHARED_UPGRADES, PASSIVES, WEAPON_MODS, WEAPON_EVOLUTIONS, COMBOS,
    REWARDS, REWARD_LIST, UPGRADES, UPGRADE_LIST, PLAYER_UPGRADE_IDS,
    createBuildState, getSharedUpgradeRank, getPassiveRank, getWeaponModRank,
    getWeaponEvolution, hasDiscoveredCombo, getUpgradeStacks, getRewardRank,
    isUpgradeCompatible, canSelectReward, canSelectUpgrade,
    generateRewardChoices, generateUpgradeChoices, applyReward, applyUpgrade,
    discoverCombos, resolvePlayerStats, resolveWeaponStats, getArcBladeSweep,
    getLauncherClusterOffsets, getLauncherEffectProfile, createRewardRng
  });
  global.RunBuild = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
