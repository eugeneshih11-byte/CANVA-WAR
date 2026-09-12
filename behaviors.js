// Extensible regular-Enemy behavior runtime. Boss 1 intentionally remains in game.js.
(function (global) {
  const STATES = Object.freeze({
    CHASE: "CHASE",
    TELEGRAPH: "TELEGRAPH",
    CHARGE: "CHARGE",
    RECOVERY: "RECOVERY",
    STRIKE: "STRIKE",
    CONNECTED: "CONNECTED"
  });
  const EPSILON = 1e-9;
  let nextHazardId = 1;

  const center = entity => ({
    x: entity.x + entity.width / 2,
    y: entity.y + entity.height / 2
  });
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(value, maximum));
  const distance = (first, second) => {
    const a = center(first), b = center(second);
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const emit = (context, event, details = {}) => context.emit?.(event, details);

  function createRuntime(definition) {
    const behavior = definition?.behavior || { profile: "chase" };
    const initialCooldown = Number.isFinite(behavior.initialCooldown) ? behavior.initialCooldown : null;
    return {
      profile: behavior.profile,
      behaviorState: STATES.CHASE,
      stateElapsed: 0,
      cooldown: initialCooldown,
      lockedTarget: null,
      chargeDirectionX: 0,
      chargeDirectionY: 0,
      chargeDistanceTravelled: 0,
      chargeContact: false,
      attemptResolved: true,
      actionSequence: 0,
      currentActionId: null,
      castHazardId: null,
      affectedBySupport: false,
      supportCooldownRate: 1,
      linkedTargetId: null,
      linkSequence: 0,
      supportedEnemyIds: []
      , attackCooldown: Number.isFinite(behavior.initialCooldown) ? behavior.initialCooldown : 0.8
      , attackDamageApplied: false
      , shotsRemaining: 0
      , shotTimer: 0
      , tetherDamageTimer: 0
      , lineOfSightLost: 0
    };
  }

  function setState(runtime, state) {
    runtime.behaviorState = state;
    runtime.stateElapsed = 0;
  }

  function predictedTarget(enemy, player, velocity, leadTime, arena) {
    const playerCenter = center(player);
    const halfWidth = player.width / 2;
    const halfHeight = player.height / 2;
    return {
      x: clamp(playerCenter.x + (velocity?.x || 0) * leadTime, halfWidth, arena.width - halfWidth),
      y: clamp(playerCenter.y + (velocity?.y || 0) * leadTime, halfHeight, arena.height - halfHeight)
    };
  }

  function beginInterceptorTelegraph(enemy, definition, context) {
    const runtime = enemy.behaviorRuntime;
    runtime.lockedTarget = predictedTarget(enemy, context.player, context.playerVelocity,
      definition.behavior.predictionLeadTime, context.arena);
    const enemyCenter = center(enemy);
    const directionX = runtime.lockedTarget.x - enemyCenter.x;
    const directionY = runtime.lockedTarget.y - enemyCenter.y;
    const length = Math.hypot(directionX, directionY);
    runtime.chargeDirectionX = length > 0 ? directionX / length : 1;
    runtime.chargeDirectionY = length > 0 ? directionY / length : 0;
    runtime.chargeContact = false;
    runtime.chargeDistanceTravelled = 0;
    runtime.attemptResolved = false;
    runtime.currentActionId = `${enemy.runtimeId}:${++runtime.actionSequence}`;
    setState(runtime, STATES.TELEGRAPH);
    emit(context, "recordInterceptorAttempt", { enemyId: enemy.runtimeId, actionId: runtime.currentActionId });
    if (runtime.affectedBySupport) emit(context, "recordSupportAffectedAction", { enemyType: enemy.type });
  }

  function finishInterceptorCharge(enemy, context) {
    const runtime = enemy.behaviorRuntime;
    if (!runtime.chargeContact && !runtime.attemptResolved) {
      runtime.attemptResolved = true;
      emit(context, "recordInterceptorMiss", { enemyId: enemy.runtimeId, actionId: runtime.currentActionId });
    }
    setState(runtime, STATES.RECOVERY);
  }

  function updateInterceptor(enemy, definition, context, deltaTime) {
    const runtime = enemy.behaviorRuntime;
    const config = definition.behavior;
    let remaining = deltaTime;
    for (let transitions = 0; remaining > EPSILON && transitions < 8; transitions++) {
      if (runtime.behaviorState === STATES.CHASE) {
        const rate = runtime.affectedBySupport ? runtime.supportCooldownRate : 1;
        const untilReady = Math.max(0, runtime.cooldown) / rate;
        const step = Math.min(remaining, untilReady);
        if (step > 0) {
          context.moveChase(enemy, step);
          runtime.cooldown = Math.max(0, runtime.cooldown - step * rate);
          runtime.stateElapsed += step;
          remaining -= step;
        }
        if (runtime.cooldown <= EPSILON) beginInterceptorTelegraph(enemy, definition, context);
        else break;
      } else if (runtime.behaviorState === STATES.TELEGRAPH) {
        const step = Math.min(remaining, config.telegraphDuration - runtime.stateElapsed);
        runtime.stateElapsed += step;
        remaining -= step;
        if (runtime.stateElapsed >= config.telegraphDuration - EPSILON) {
          setState(runtime, STATES.CHARGE);
          emit(context, "recordInterceptorCommit", { enemyId: enemy.runtimeId, actionId: runtime.currentActionId });
        } else break;
      } else if (runtime.behaviorState === STATES.CHARGE) {
        const distanceRemaining = Math.max(0, config.maxChargeDistance - runtime.chargeDistanceTravelled);
        if (distanceRemaining <= EPSILON) {
          finishInterceptorCharge(enemy, context);
          continue;
        }
        const step = Math.min(remaining, config.chargeDuration - runtime.stateElapsed,
          distanceRemaining / config.chargeSpeed);
        const movement = context.moveCharge(enemy, runtime.chargeDirectionX, runtime.chargeDirectionY,
          config.chargeSpeed, step) || {};
        const travelled = Number.isFinite(movement.distance) ? movement.distance : config.chargeSpeed * step;
        runtime.chargeDistanceTravelled += Math.max(0, travelled);
        runtime.stateElapsed += step;
        remaining -= step;
        if (movement.reachedBoundary || runtime.chargeDistanceTravelled >= config.maxChargeDistance - EPSILON ||
            runtime.stateElapsed >= config.chargeDuration - EPSILON) finishInterceptorCharge(enemy, context);
        else break;
      } else {
        const step = Math.min(remaining, config.recoveryDuration - runtime.stateElapsed);
        runtime.stateElapsed += step;
        remaining -= step;
        if (runtime.stateElapsed >= config.recoveryDuration - EPSILON) {
          setState(runtime, STATES.CHASE);
          runtime.cooldown = config.cooldown;
          runtime.lockedTarget = null;
        } else break;
      }
    }
  }

  function beginDenierTelegraph(enemy, definition, context) {
    const runtime = enemy.behaviorRuntime;
    const config = definition.behavior;
    runtime.lockedTarget = predictedTarget(enemy, context.player, context.playerVelocity,
      config.predictionLeadTime, context.arena);
    if (typeof context.resolvePlayablePoint === "function") {
      runtime.lockedTarget = context.resolvePlayablePoint(runtime.lockedTarget);
    }
    const hazard = {
      id: nextHazardId++,
      sourceEnemyId: enemy.runtimeId,
      waveId: enemy.waveId,
      x: runtime.lockedTarget.x,
      y: runtime.lockedTarget.y,
      radius: config.hazardRadius,
      damage: config.hazardDamage,
      damageInterval: config.hazardDamageInterval,
      activeDuration: config.hazardActiveDuration,
      remaining: config.hazardActiveDuration,
      phase: STATES.TELEGRAPH
    };
    context.hazards.push(hazard);
    runtime.castHazardId = hazard.id;
    runtime.currentActionId = `${enemy.runtimeId}:${++runtime.actionSequence}`;
    setState(runtime, STATES.TELEGRAPH);
    emit(context, "recordDenierCast", { enemyId: enemy.runtimeId, actionId: runtime.currentActionId, hazardId: hazard.id });
    if (runtime.affectedBySupport) emit(context, "recordSupportAffectedAction", { enemyType: enemy.type });
  }

  function activateDenierHazard(enemy, context) {
    const runtime = enemy.behaviorRuntime;
    const hazard = context.hazards.find(candidate => candidate.id === runtime.castHazardId);
    if (hazard) {
      hazard.phase = "ACTIVE";
      hazard.remaining = hazard.activeDuration;
      emit(context, "recordDenierHazardCreated", { enemyId: enemy.runtimeId, hazardId: hazard.id });
    }
    setState(runtime, STATES.CHASE);
    runtime.cooldown = context.definitions[enemy.type].behavior.cooldown;
    runtime.lockedTarget = null;
    runtime.castHazardId = null;
  }

  function updateDenier(enemy, definition, context, deltaTime) {
    const runtime = enemy.behaviorRuntime;
    const config = definition.behavior;
    let remaining = deltaTime;
    for (let transitions = 0; remaining > EPSILON && transitions < 8; transitions++) {
      if (runtime.behaviorState === STATES.CHASE) {
        const rate = runtime.affectedBySupport ? runtime.supportCooldownRate : 1;
        const untilReady = Math.max(0, runtime.cooldown) / rate;
        const step = Math.min(remaining, untilReady);
        if (step > 0) {
          context.moveChase(enemy, step);
          runtime.cooldown = Math.max(0, runtime.cooldown - step * rate);
          runtime.stateElapsed += step;
          remaining -= step;
        }
        if (runtime.cooldown <= EPSILON) beginDenierTelegraph(enemy, definition, context);
        else break;
      } else {
        const step = Math.min(remaining, config.telegraphDuration - runtime.stateElapsed);
        runtime.stateElapsed += step;
        remaining -= step;
        if (runtime.stateElapsed >= config.telegraphDuration - EPSILON) activateDenierHazard(enemy, context);
        else break;
      }
    }
  }

  function directionToPlayer(enemy, player) {
    const from = center(enemy), to = center(player);
    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length, distance: length };
  }

  function updateFast(enemy, definition, context, deltaTime) {
    const runtime = enemy.behaviorRuntime, config = definition.behavior;
    runtime.attackCooldown = Math.max(0, runtime.attackCooldown - deltaTime);
    if (runtime.behaviorState === STATES.CHASE) {
      context.moveChase(enemy, deltaTime);
      if (runtime.attackCooldown <= EPSILON && distance(enemy, context.player) <= 150) {
        const direction = directionToPlayer(enemy, context.player);
        runtime.chargeDirectionX = direction.x; runtime.chargeDirectionY = direction.y;
        runtime.attackDamageApplied = false; setState(runtime, STATES.TELEGRAPH);
        emit(context, "recordFastStrikeTelegraph", { enemyId: enemy.runtimeId });
      }
    } else if (runtime.behaviorState === STATES.TELEGRAPH) {
      runtime.stateElapsed += deltaTime;
      if (runtime.stateElapsed >= config.telegraphDuration) setState(runtime, STATES.STRIKE);
    } else if (runtime.behaviorState === STATES.STRIKE) {
      context.moveCharge(enemy, runtime.chargeDirectionX, runtime.chargeDirectionY, config.strikeSpeed, deltaTime);
      runtime.stateElapsed += deltaTime;
      if (runtime.stateElapsed >= config.strikeDuration) setState(runtime, STATES.RECOVERY);
    } else {
      runtime.stateElapsed += deltaTime;
      if (runtime.stateElapsed >= config.recoveryDuration) {
        runtime.attackCooldown = config.cooldown; setState(runtime, STATES.CHASE);
      }
    }
  }

  function updateTank(enemy, definition, context, deltaTime) {
    const runtime = enemy.behaviorRuntime, config = definition.behavior;
    runtime.attackCooldown = Math.max(0, runtime.attackCooldown - deltaTime);
    if (runtime.behaviorState === STATES.CHASE) {
      context.moveChase(enemy, deltaTime);
      if (runtime.attackCooldown <= EPSILON && distance(enemy, context.player) <= config.slamRadius + 30) {
        runtime.attackDamageApplied = false; setState(runtime, STATES.TELEGRAPH);
        emit(context, "recordTankSlamTelegraph", { enemyId: enemy.runtimeId });
      }
    } else if (runtime.behaviorState === STATES.TELEGRAPH) {
      runtime.stateElapsed += deltaTime;
      if (runtime.stateElapsed >= config.telegraphDuration) {
        if (distance(enemy, context.player) <= config.slamRadius) context.damagePlayer?.(1, enemy.type);
        emit(context, "recordTankSlamImpact", { enemyId: enemy.runtimeId });
        setState(runtime, STATES.RECOVERY);
      }
    } else {
      runtime.stateElapsed += deltaTime;
      if (runtime.stateElapsed >= config.recoveryDuration) {
        runtime.attackCooldown = config.cooldown; setState(runtime, STATES.CHASE);
      }
    }
  }

  function spawnEnemyProjectile(enemy, config, context) {
    const direction = directionToPlayer(enemy, context.player), origin = center(enemy);
    context.hazards.push({ id: nextHazardId++, kind: "enemy-projectile", sourceEnemyId: enemy.runtimeId,
      x: origin.x - 5, y: origin.y - 5, width: 10, height: 10,
      directionX: direction.x, directionY: direction.y, speed: config.projectileSpeed, damage: 1, remaining: 4, phase: "ACTIVE" });
    emit(context, "recordGunnerBurst", { enemyId: enemy.runtimeId });
  }

  function updateGunner(enemy, definition, context, deltaTime) {
    const runtime = enemy.behaviorRuntime, config = definition.behavior;
    runtime.attackCooldown = Math.max(0, runtime.attackCooldown - deltaTime);
    const range = distance(enemy, context.player);
    if (runtime.behaviorState === STATES.CHASE) {
      if (range < config.preferredRange[0] || range > config.preferredRange[1]) context.moveChase(enemy, deltaTime);
      if (runtime.attackCooldown <= EPSILON && context.hasLineOfSight?.(enemy, context.player) !== false) {
        setState(runtime, STATES.TELEGRAPH); runtime.shotsRemaining = config.burstCount;
      }
    } else if (runtime.behaviorState === STATES.TELEGRAPH) {
      runtime.stateElapsed += deltaTime;
      if (runtime.stateElapsed >= config.telegraphDuration) { setState(runtime, STATES.STRIKE); runtime.shotTimer = 0; }
    } else if (runtime.behaviorState === STATES.STRIKE) {
      runtime.shotTimer -= deltaTime;
      while (runtime.shotsRemaining > 0 && runtime.shotTimer <= EPSILON) {
        spawnEnemyProjectile(enemy, config, context); runtime.shotsRemaining--; runtime.shotTimer += config.shotSpacing;
      }
      if (runtime.shotsRemaining <= 0) { runtime.attackCooldown = config.cooldown; setState(runtime, STATES.CHASE); }
    }
  }

  function updateArtillery(enemy, definition, context, deltaTime) {
    const runtime = enemy.behaviorRuntime, config = definition.behavior;
    runtime.attackCooldown = Math.max(0, runtime.attackCooldown - deltaTime);
    if (runtime.attackCooldown > EPSILON) { context.moveChase(enemy, deltaTime); return; }
    const target = context.resolvePlayablePoint?.(center(context.player)) || center(context.player);
    context.hazards.push({ id: nextHazardId++, kind: "artillery", sourceEnemyId: enemy.runtimeId,
      x: target.x, y: target.y, radius: config.impactRadius, damage: 1,
      remaining: config.telegraphDuration, activeDuration: 0.12, phase: STATES.TELEGRAPH });
    runtime.attackCooldown = config.cooldown;
    emit(context, "recordArtilleryWarning", { enemyId: enemy.runtimeId });
  }

  function updateTrapper(enemy, definition, context, deltaTime) {
    const runtime = enemy.behaviorRuntime, config = definition.behavior;
    runtime.attackCooldown = Math.max(0, runtime.attackCooldown - deltaTime);
    const owned = context.hazards.filter(item => item.kind === "trap" && item.sourceEnemyId === enemy.runtimeId);
    if (runtime.attackCooldown <= EPSILON && owned.length < config.maxOwnedTraps) {
      const point = context.resolvePlayablePoint?.(center(enemy)) || center(enemy);
      context.hazards.push({ id: nextHazardId++, kind: "trap", sourceEnemyId: enemy.runtimeId,
        x: point.x, y: point.y, radius: config.triggerRadius, damage: 1,
        remaining: config.armDuration, phase: "ARMING", countsTowardEncounterProgress: false });
      runtime.attackCooldown = config.cooldown;
      emit(context, "recordTrapperArm", { enemyId: enemy.runtimeId });
    }
    context.moveChase(enemy, deltaTime);
  }

  function updateTether(enemy, definition, context, deltaTime) {
    const runtime = enemy.behaviorRuntime, config = definition.behavior;
    const range = distance(enemy, context.player);
    const hasLos = context.hasLineOfSight?.(enemy, context.player) !== false;
    if (runtime.behaviorState === STATES.CONNECTED) {
      runtime.lineOfSightLost = hasLos ? 0 : runtime.lineOfSightLost + deltaTime;
      if (range > config.breakRange || runtime.lineOfSightLost >= config.losBreakDuration) {
        setState(runtime, STATES.CHASE); runtime.attackCooldown = config.cooldown;
        emit(context, "recordTetherBreak", { enemyId: enemy.runtimeId }); return;
      }
      runtime.tetherDamageTimer -= deltaTime;
      if (runtime.tetherDamageTimer <= EPSILON) {
        context.damagePlayer?.(1, enemy.type); runtime.tetherDamageTimer += config.damageInterval;
      }
      return;
    }
    runtime.attackCooldown = Math.max(0, runtime.attackCooldown - deltaTime);
    if (runtime.behaviorState === STATES.TELEGRAPH) {
      runtime.stateElapsed += deltaTime;
      if (!hasLos || range > config.breakRange) { setState(runtime, STATES.CHASE); return; }
      if (runtime.stateElapsed >= config.windupDuration) {
        setState(runtime, STATES.CONNECTED); runtime.tetherDamageTimer = config.damageInterval;
        emit(context, "recordTetherConnect", { enemyId: enemy.runtimeId });
      }
      return;
    }
    if (range < config.preferredRange[0] || range > config.preferredRange[1]) context.moveChase(enemy, deltaTime);
    if (runtime.attackCooldown <= EPSILON && hasLos && range <= config.preferredRange[1]) setState(runtime, STATES.TELEGRAPH);
  }

  const PROFILE_HANDLERS = Object.freeze({
    chase(enemy, definition, context, deltaTime) { context.moveChase(enemy, deltaTime); },
    fast: updateFast,
    tank: updateTank,
    interceptor: updateInterceptor,
    denier: updateDenier,
    support(enemy, definition, context, deltaTime) {
      enemy.behaviorRuntime.stateElapsed += deltaTime;
      context.moveChase(enemy, deltaTime);
    },
    gunner: updateGunner,
    artillery: updateArtillery,
    trapper: updateTrapper,
    tether: updateTether
  });

  function isEligibleSupportTarget(support, target, definitions) {
    const config = definitions[support.type]?.behavior;
    return target !== support && Boolean(config?.eligibleProfiles?.includes(
      definitions[target.type]?.behavior.profile));
  }

  function applySupportLinks(living, definitions, deltaTime, context) {
    const supports = living.filter(enemy => definitions[enemy.type]?.behavior.profile === "support");
    for (const enemy of living) {
      enemy.behaviorRuntime.affectedBySupport = false;
      enemy.behaviorRuntime.supportCooldownRate = 1;
      enemy.behaviorRuntime.supportedEnemyIds = [];
    }
    const affected = new Set();
    for (const support of supports) {
      const config = definitions[support.type].behavior;
      const eligible = target => isEligibleSupportTarget(support, target, definitions);
      let target = living.find(candidate => candidate.runtimeId === support.behaviorRuntime.linkedTargetId && eligible(candidate));
      if (!target) {
        support.behaviorRuntime.linkedTargetId = null;
        target = living.find(eligible) || null;
        if (target) {
          support.behaviorRuntime.linkedTargetId = target.runtimeId;
          const linkId = `${support.runtimeId}:${++support.behaviorRuntime.linkSequence}`;
          emit(context, "recordSupportLinkCreated", { supportId: support.runtimeId,
            targetId: target.runtimeId, targetType: target.type, linkId });
        }
      }
      if (target) {
        target.behaviorRuntime.affectedBySupport = true;
        target.behaviorRuntime.supportCooldownRate = Math.max(target.behaviorRuntime.supportCooldownRate, config.cooldownRate);
        support.behaviorRuntime.supportedEnemyIds.push(target.runtimeId);
        affected.add(target);
      }
    }
    return { supportActiveTime: supports.length * deltaTime, affectedEnemyTime: affected.size * deltaTime,
      linkedEnemyCount: affected.size };
  }

  function updateActiveHazards(hazards, deltaTime, context) {
    let activeHazardTime = 0;
    for (let index = hazards.length - 1; index >= 0; index--) {
      const hazard = hazards[index];
      if (!hazard) continue;
      if (hazard.kind === "enemy-projectile") {
        hazard.x += hazard.directionX * hazard.speed * deltaTime;
        hazard.y += hazard.directionY * hazard.speed * deltaTime;
        hazard.remaining -= deltaTime;
        if (context.overlaps?.(hazard, context.player)) {
          context.damagePlayer?.(hazard.damage, "gunner"); hazards.splice(index, 1); continue;
        }
        if (hazard.remaining <= EPSILON || hazard.x < 0 || hazard.y < 0 ||
            hazard.x > context.arena.width || hazard.y > context.arena.height) hazards.splice(index, 1);
        continue;
      }
      if (hazard.kind === "artillery" && hazard.phase === STATES.TELEGRAPH) {
        hazard.remaining -= deltaTime;
        if (hazard.remaining <= EPSILON) {
          hazard.phase = "ACTIVE"; hazard.remaining = hazard.activeDuration;
          const closestX = clamp(hazard.x, context.player.x, context.player.x + context.player.width);
          const closestY = clamp(hazard.y, context.player.y, context.player.y + context.player.height);
          if (Math.hypot(hazard.x - closestX, hazard.y - closestY) <= hazard.radius) context.damagePlayer?.(hazard.damage, "artillery");
          emit(context, "recordArtilleryImpact", { hazardId: hazard.id });
        }
        continue;
      }
      if (hazard.kind === "trap") {
        if (hazard.phase === "ARMING") {
          hazard.remaining -= deltaTime;
          if (hazard.remaining <= EPSILON) hazard.phase = "ACTIVE";
        } else {
          const closestX = clamp(hazard.x, context.player.x, context.player.x + context.player.width);
          const closestY = clamp(hazard.y, context.player.y, context.player.y + context.player.height);
          if (Math.hypot(hazard.x - closestX, hazard.y - closestY) <= hazard.radius) {
            context.damagePlayer?.(hazard.damage, "trapper"); emit(context, "recordTrapperTrigger", { hazardId: hazard.id });
            hazards.splice(index, 1);
          }
        }
        continue;
      }
      if (hazard.phase !== "ACTIVE") continue;
      const step = Math.min(deltaTime, Math.max(0, hazard.remaining));
      activeHazardTime += step;
      hazard.remaining = Math.max(0, hazard.remaining - deltaTime);
      if (hazard.remaining <= EPSILON) hazards.splice(index, 1);
    }
    return activeHazardTime;
  }

  function updateEnemies(options) {
    if (options.combatActive === false) return;
    const deltaTime = Number.isFinite(options.deltaTime) ? Math.max(0, options.deltaTime) : 0;
    const living = options.enemies.filter(options.isActive);
    for (const enemy of living) {
      enemy.behaviorRuntime ||= createRuntime(options.definitions[enemy.type]);
    }
    const context = { ...options };
    const activeHazardTime = updateActiveHazards(options.hazards, deltaTime, context);
    const support = applySupportLinks(living, options.definitions, deltaTime, context);
    for (const enemy of living) {
      const definition = options.definitions[enemy.type];
      const handler = PROFILE_HANDLERS[definition?.behavior.profile];
      if (!handler) throw new Error(`Unknown Enemy behavior profile: ${definition?.behavior.profile}`);
      handler(enemy, definition, context, deltaTime);
    }
    emit(context, "recordBehaviorFrame", { activeHazardTime,
      supportActiveTime: support.supportActiveTime, affectedEnemyTime: support.affectedEnemyTime });
  }

  function getActiveHazardsContainingPlayer(hazards, player, overlaps) {
    return hazards.filter(hazard => {
      if (hazard.phase !== "ACTIVE" || (hazard.kind && hazard.kind !== "denier")) return false;
      const closestX = clamp(hazard.x, player.x, player.x + player.width);
      const closestY = clamp(hazard.y, player.y, player.y + player.height);
      return typeof overlaps === "function"
        ? overlaps(player, { x: hazard.x - hazard.radius, y: hazard.y - hazard.radius,
          width: hazard.radius * 2, height: hazard.radius * 2 }) &&
          Math.hypot(hazard.x - closestX, hazard.y - closestY) <= hazard.radius
        : Math.hypot(hazard.x - closestX, hazard.y - closestY) <= hazard.radius;
    });
  }

  function createHazardDamageRuntime() {
    return { cooldown: 0, inside: false, entrySequence: 0 };
  }

  function updateHazardDamageRuntime(runtime, hazards, player, deltaTime, overlaps) {
    const dt = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
    runtime.cooldown = Math.max(0, runtime.cooldown - dt);
    const containing = getActiveHazardsContainingPlayer(hazards, player, overlaps);
    const inside = containing.length > 0;
    const entered = inside && !runtime.inside;
    const entryId = entered ? ++runtime.entrySequence : null;
    let damage = 0;
    let hazardId = null;
    if (inside && runtime.cooldown <= EPSILON) {
      const hazard = containing[0];
      damage = hazard.damage;
      hazardId = hazard.id;
      runtime.cooldown = hazard.damageInterval;
    }
    runtime.inside = inside;
    return { entered, entryId, damage, hazardId, activeHazardCount: containing.length };
  }

  function recordEnemyContact(enemy, context) {
    const runtime = enemy?.behaviorRuntime;
    if (runtime?.profile !== "interceptor" || runtime.behaviorState !== STATES.CHARGE || runtime.chargeContact) return;
    runtime.chargeContact = true;
    runtime.attemptResolved = true;
    emit(context, "recordInterceptorContact", { enemyId: enemy.runtimeId, actionId: runtime.currentActionId });
  }

  function cancelPendingDenierHazard(enemy, hazards) {
    const runtime = enemy?.behaviorRuntime;
    if (runtime?.profile !== "denier" || runtime.behaviorState !== STATES.TELEGRAPH) return;
    const index = hazards.findIndex(hazard => hazard.id === runtime.castHazardId && hazard.phase === STATES.TELEGRAPH);
    if (index >= 0) hazards.splice(index, 1);
  }

  function recordEnemyRemoval(enemy, hazards, enemies = []) {
    cancelPendingDenierHazard(enemy, hazards);
    const runtime = enemy?.behaviorRuntime;
    if (!runtime) return;
    if (runtime.profile === "support" && runtime.linkedTargetId != null) {
      const target = enemies.find(candidate => candidate.runtimeId === runtime.linkedTargetId);
      if (target?.behaviorRuntime) {
        target.behaviorRuntime.affectedBySupport = false;
        target.behaviorRuntime.supportCooldownRate = 1;
      }
      runtime.linkedTargetId = null;
      runtime.supportedEnemyIds = [];
    }
    for (const candidate of enemies) {
      if (candidate.behaviorRuntime?.profile === "support" &&
          candidate.behaviorRuntime.linkedTargetId === enemy.runtimeId) {
        candidate.behaviorRuntime.linkedTargetId = null;
        candidate.behaviorRuntime.supportedEnemyIds = [];
      }
    }
    runtime.affectedBySupport = false;
    runtime.supportCooldownRate = 1;
  }

  function recordEnemyDefeat(enemy, hazards, context) {
    const runtime = enemy?.behaviorRuntime;
    if (!runtime) return;
    if (runtime.profile === "support" && runtime.linkedTargetId != null) {
      emit(context, "recordSupportLinkBroken", { supportId: enemy.runtimeId });
    }
    if (runtime.profile === "interceptor" && !runtime.attemptResolved) {
      runtime.attemptResolved = true;
      if (runtime.behaviorState === STATES.TELEGRAPH) {
        emit(context, "recordInterceptorInterrupted", { enemyId: enemy.runtimeId, actionId: runtime.currentActionId });
      } else if (runtime.behaviorState === STATES.CHARGE && !runtime.chargeContact) {
        emit(context, "recordInterceptorMiss", { enemyId: enemy.runtimeId, actionId: runtime.currentActionId });
      }
    }
    recordEnemyRemoval(enemy, hazards, context.enemies);
  }

  function clearTransient(enemies, hazards) {
    hazards.length = 0;
    for (const enemy of enemies) {
      if (!enemy.behaviorRuntime) continue;
      enemy.behaviorRuntime.lockedTarget = null;
      enemy.behaviorRuntime.castHazardId = null;
      enemy.behaviorRuntime.affectedBySupport = false;
      enemy.behaviorRuntime.supportCooldownRate = 1;
      enemy.behaviorRuntime.linkedTargetId = null;
      enemy.behaviorRuntime.supportedEnemyIds = [];
    }
    nextHazardId = 1;
  }

  function drawArenaCues(ctx, enemies, hazards, definitions, world = {}) {
    const bounds = world.bounds || { width: ctx.canvas.width, height: ctx.canvas.height };
    const isVisible = world.isVisible || (() => true);
    ctx.save();
    for (const hazard of hazards) {
      if (hazard.kind === "enemy-projectile") {
        if (!isVisible(hazard, 8)) continue;
        ctx.fillStyle = "#fb7185";
        ctx.fillRect(hazard.x, hazard.y, hazard.width, hazard.height);
        continue;
      }
      if (!isVisible({ x: hazard.x - hazard.radius, y: hazard.y - hazard.radius,
        width: hazard.radius * 2, height: hazard.radius * 2 }, 8)) continue;
      ctx.beginPath();
      ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
      if (hazard.phase === STATES.TELEGRAPH || hazard.phase === "ARMING") {
        ctx.fillStyle = "rgba(250, 204, 21, 0.12)";
        ctx.strokeStyle = "rgba(250, 204, 21, 0.95)";
        ctx.setLineDash([10, 7]);
      } else {
        ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
        ctx.strokeStyle = "rgba(185, 28, 28, 0.95)";
        ctx.setLineDash([]);
      }
      ctx.lineWidth = 4;
      ctx.fill();
      ctx.stroke();
    }
    for (const enemy of enemies) {
      const runtime = enemy.behaviorRuntime;
      const profile = definitions[enemy.type]?.behavior.profile;
      if (profile === "tank" && runtime?.behaviorState === STATES.TELEGRAPH) {
        const point = center(enemy), radius = definitions[enemy.type].behavior.slamRadius;
        ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(168,85,247,.12)"; ctx.strokeStyle = "rgba(216,180,254,.95)";
        ctx.lineWidth = 5; ctx.setLineDash([12, 8]); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      }
      if (profile === "tether" && runtime?.behaviorState === STATES.CONNECTED) {
        const from = center(enemy), to = center(world.player || enemy);
        ctx.strokeStyle = "rgba(34,211,238,.92)"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    for (const support of enemies) {
      if (definitions[support.type]?.behavior.profile !== "support" || !support.behaviorRuntime) continue;
      const linkedTargets = support.behaviorRuntime.supportedEnemyIds
        .map(targetId => enemies.find(enemy => enemy.runtimeId === targetId)).filter(Boolean);
      if (!isVisible(support, 60) && !linkedTargets.some(target => isVisible(target, 20))) continue;
      const supportCenter = center(support);
      const pulse = 44 + Math.sin(support.behaviorRuntime.stateElapsed * 5) * 5;
      ctx.beginPath();
      ctx.arc(supportCenter.x, supportCenter.y, pulse, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(45, 212, 191, 0.09)";
      ctx.strokeStyle = "rgba(45, 212, 191, 0.75)";
      ctx.lineWidth = 3;
      ctx.fill();
      ctx.stroke();
      for (const target of linkedTargets) {
        const targetCenter = center(target);
        ctx.strokeStyle = "rgba(94, 234, 212, 0.9)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(supportCenter.x, supportCenter.y);
        ctx.lineTo(targetCenter.x, targetCenter.y);
        ctx.stroke();
      }
    }
    for (const target of enemies) {
      if (!target.behaviorRuntime?.affectedBySupport || !isVisible(target, 20)) continue;
      const targetCenter = center(target);
      const pulse = 7 + Math.sin(target.behaviorRuntime.stateElapsed * 7) * 2;
      ctx.strokeStyle = "rgba(153, 246, 228, 0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(targetCenter.x, targetCenter.y, Math.max(target.width, target.height) / 2 + pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const enemy of enemies) {
      const runtime = enemy.behaviorRuntime;
      if (runtime?.profile !== "interceptor" || runtime.behaviorState !== STATES.TELEGRAPH || !runtime.lockedTarget) continue;
      if (!isVisible(enemy, definitions[enemy.type].behavior.maxChargeDistance)) continue;
      const enemyCenter = center(enemy);
      const config = definitions[enemy.type].behavior;
      const axisDistance = (position, direction, maximum) => direction > 0
        ? (maximum - position) / direction : direction < 0 ? -position / direction : Infinity;
      const laneLength = Math.min(config.maxChargeDistance,
        axisDistance(enemyCenter.x, runtime.chargeDirectionX, bounds.width),
        axisDistance(enemyCenter.y, runtime.chargeDirectionY, bounds.height));
      ctx.strokeStyle = "rgba(253, 224, 71, 0.95)";
      ctx.lineWidth = 7;
      ctx.setLineDash([15, 10]);
      ctx.beginPath();
      ctx.moveTo(enemyCenter.x, enemyCenter.y);
      ctx.lineTo(enemyCenter.x + runtime.chargeDirectionX * laneLength,
        enemyCenter.y + runtime.chargeDirectionY * laneLength);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(runtime.lockedTarget.x, runtime.lockedTarget.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  global.EnemyBehaviors = Object.freeze({ STATES, PROFILE_HANDLERS, createRuntime, predictedTarget,
    updateEnemies, isEligibleSupportTarget, getActiveHazardsContainingPlayer,
    createHazardDamageRuntime, updateHazardDamageRuntime,
    recordEnemyContact, recordEnemyRemoval, recordEnemyDefeat, clearTransient, drawArenaCues });
})(globalThis);
