// Extensible regular-Enemy behavior runtime. Boss 1 intentionally remains in game.js.
(function (global) {
  const STATES = Object.freeze({
    CHASE: "CHASE",
    TELEGRAPH: "TELEGRAPH",
    CHARGE: "CHARGE",
    RECOVERY: "RECOVERY"
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

  const PROFILE_HANDLERS = Object.freeze({
    chase(enemy, definition, context, deltaTime) { context.moveChase(enemy, deltaTime); },
    interceptor: updateInterceptor,
    denier: updateDenier,
    support(enemy, definition, context, deltaTime) {
      enemy.behaviorRuntime.stateElapsed += deltaTime;
      context.moveChase(enemy, deltaTime);
    }
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

  function updateActiveHazards(hazards, deltaTime) {
    let activeHazardTime = 0;
    for (let index = hazards.length - 1; index >= 0; index--) {
      const hazard = hazards[index];
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
    const activeHazardTime = updateActiveHazards(options.hazards, deltaTime);
    const context = { ...options };
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
      if (hazard.phase !== "ACTIVE") return false;
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

  function drawArenaCues(ctx, enemies, hazards, definitions) {
    ctx.save();
    for (const hazard of hazards) {
      ctx.beginPath();
      ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
      if (hazard.phase === STATES.TELEGRAPH) {
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
    ctx.setLineDash([]);
    for (const support of enemies) {
      if (definitions[support.type]?.behavior.profile !== "support" || !support.behaviorRuntime) continue;
      const supportCenter = center(support);
      const pulse = 44 + Math.sin(support.behaviorRuntime.stateElapsed * 5) * 5;
      ctx.beginPath();
      ctx.arc(supportCenter.x, supportCenter.y, pulse, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(45, 212, 191, 0.09)";
      ctx.strokeStyle = "rgba(45, 212, 191, 0.75)";
      ctx.lineWidth = 3;
      ctx.fill();
      ctx.stroke();
      for (const targetId of support.behaviorRuntime.supportedEnemyIds) {
        const target = enemies.find(enemy => enemy.runtimeId === targetId);
        if (!target) continue;
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
      if (!target.behaviorRuntime?.affectedBySupport) continue;
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
      const enemyCenter = center(enemy);
      const config = definitions[enemy.type].behavior;
      const axisDistance = (position, direction, maximum) => direction > 0
        ? (maximum - position) / direction : direction < 0 ? -position / direction : Infinity;
      const laneLength = Math.min(config.maxChargeDistance,
        axisDistance(enemyCenter.x, runtime.chargeDirectionX, ctx.canvas.width),
        axisDistance(enemyCenter.y, runtime.chargeDirectionY, ctx.canvas.height));
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
