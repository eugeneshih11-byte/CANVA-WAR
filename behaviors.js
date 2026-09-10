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
      chargeContact: false,
      attemptResolved: true,
      actionSequence: 0,
      currentActionId: null,
      castHazardId: null,
      affectedBySupport: false,
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
        const rate = runtime.affectedBySupport ? context.supportCooldownRate : 1;
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
        const step = Math.min(remaining, config.chargeDuration - runtime.stateElapsed);
        context.moveCharge(enemy, runtime.chargeDirectionX, runtime.chargeDirectionY, config.chargeSpeed, step);
        runtime.stateElapsed += step;
        remaining -= step;
        if (runtime.stateElapsed >= config.chargeDuration - EPSILON) finishInterceptorCharge(enemy, context);
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
    const hazard = {
      id: nextHazardId++,
      sourceEnemyId: enemy.runtimeId,
      waveId: enemy.waveId,
      x: runtime.lockedTarget.x,
      y: runtime.lockedTarget.y,
      radius: config.hazardRadius,
      damage: config.hazardDamage,
      activeDuration: config.hazardActiveDuration,
      remaining: config.hazardActiveDuration,
      phase: STATES.TELEGRAPH,
      damagedPlayer: false
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
        const rate = runtime.affectedBySupport ? context.supportCooldownRate : 1;
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
    support(enemy, definition, context, deltaTime) { context.moveChase(enemy, deltaTime); }
  });

  function applySupportEffects(living, definitions, deltaTime) {
    const supports = living.filter(enemy => definitions[enemy.type]?.behavior.profile === "support");
    for (const enemy of living) {
      enemy.behaviorRuntime.affectedBySupport = false;
      enemy.behaviorRuntime.supportedEnemyIds = [];
    }
    const affected = new Set();
    for (const support of supports) {
      const config = definitions[support.type].behavior;
      for (const target of living) {
        const profile = definitions[target.type]?.behavior.profile;
        if (target === support || !config.eligibleProfiles.includes(profile) || distance(support, target) > config.radius) continue;
        target.behaviorRuntime.affectedBySupport = true;
        support.behaviorRuntime.supportedEnemyIds.push(target.runtimeId);
        affected.add(target);
      }
    }
    return { supportActiveTime: supports.length * deltaTime, affectedEnemyTime: affected.size * deltaTime,
      cooldownRate: supports[0] ? definitions[supports[0].type].behavior.cooldownRate : 1 };
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
    const support = applySupportEffects(living, options.definitions, deltaTime);
    const context = { ...options, supportCooldownRate: support.cooldownRate };
    for (const enemy of living) {
      const definition = options.definitions[enemy.type];
      const handler = PROFILE_HANDLERS[definition?.behavior.profile];
      if (!handler) throw new Error(`Unknown Enemy behavior profile: ${definition?.behavior.profile}`);
      handler(enemy, definition, context, deltaTime);
    }
    emit(context, "recordBehaviorFrame", { activeHazardTime,
      supportActiveTime: support.supportActiveTime, affectedEnemyTime: support.affectedEnemyTime });
  }

  function consumeHazardContacts(hazards, player, overlaps) {
    const contacts = [];
    for (const hazard of hazards) {
      if (hazard.phase !== "ACTIVE" || hazard.damagedPlayer) continue;
      const closestX = clamp(hazard.x, player.x, player.x + player.width);
      const closestY = clamp(hazard.y, player.y, player.y + player.height);
      const touching = typeof overlaps === "function"
        ? overlaps(player, { x: hazard.x - hazard.radius, y: hazard.y - hazard.radius,
          width: hazard.radius * 2, height: hazard.radius * 2 }) &&
          Math.hypot(hazard.x - closestX, hazard.y - closestY) <= hazard.radius
        : Math.hypot(hazard.x - closestX, hazard.y - closestY) <= hazard.radius;
      if (!touching) continue;
      hazard.damagedPlayer = true;
      contacts.push(hazard);
    }
    return contacts;
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

  function recordEnemyRemoval(enemy, hazards) {
    cancelPendingDenierHazard(enemy, hazards);
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
    cancelPendingDenierHazard(enemy, hazards);
  }

  function clearTransient(enemies, hazards) {
    hazards.length = 0;
    for (const enemy of enemies) {
      if (!enemy.behaviorRuntime) continue;
      enemy.behaviorRuntime.lockedTarget = null;
      enemy.behaviorRuntime.castHazardId = null;
      enemy.behaviorRuntime.affectedBySupport = false;
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
      ctx.beginPath();
      ctx.arc(supportCenter.x, supportCenter.y, definitions[support.type].behavior.radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(45, 212, 191, 0.04)";
      ctx.strokeStyle = "rgba(45, 212, 191, 0.45)";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      for (const targetId of support.behaviorRuntime.supportedEnemyIds) {
        const target = enemies.find(enemy => enemy.runtimeId === targetId);
        if (!target) continue;
        const targetCenter = center(target);
        ctx.strokeStyle = "rgba(94, 234, 212, 0.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(supportCenter.x, supportCenter.y);
        ctx.lineTo(targetCenter.x, targetCenter.y);
        ctx.stroke();
      }
    }
    for (const enemy of enemies) {
      const runtime = enemy.behaviorRuntime;
      if (runtime?.profile !== "interceptor" || runtime.behaviorState !== STATES.TELEGRAPH || !runtime.lockedTarget) continue;
      const enemyCenter = center(enemy);
      ctx.strokeStyle = "rgba(253, 224, 71, 0.95)";
      ctx.lineWidth = 7;
      ctx.setLineDash([15, 10]);
      ctx.beginPath();
      ctx.moveTo(enemyCenter.x, enemyCenter.y);
      ctx.lineTo(runtime.lockedTarget.x, runtime.lockedTarget.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(runtime.lockedTarget.x, runtime.lockedTarget.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  global.EnemyBehaviors = Object.freeze({ STATES, PROFILE_HANDLERS, createRuntime, predictedTarget,
    updateEnemies, consumeHazardContacts, recordEnemyContact, recordEnemyRemoval, recordEnemyDefeat,
    clearTransient, drawArenaCues });
})(globalThis);
