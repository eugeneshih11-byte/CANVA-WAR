// Seeded Battlefield content, static-world geometry, navigation and spawn queries.
(function (global) {
  const VIEWPORT = Object.freeze({ width: 800, height: 600 });
  const WORLD_SCALE = Object.freeze({ x: 2, y: 2 });
  const GRID_CELL_SIZE = 20;
  const SWEEP_STEP = 4;
  const EPSILON = 1e-6;
  const GENERATION = Object.freeze({
    maxAttempts: 6,
    placementsPerObstacle: 24,
    obstaclesPerViewport: 2.5,
    minimumObstacleCountRatio: 0.7,
    spawnSafetyActorLengths: 2,
    obstacleGapActorLengths: 1.2
  });

  function freeze(value) {
    if (value && typeof value === "object" && !(value instanceof Map)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const worldBounds = freeze({
    width: VIEWPORT.width * WORLD_SCALE.x,
    height: VIEWPORT.height * WORLD_SCALE.y
  });
  const DEFINITIONS = freeze({
    "stage-1-field-a": {
      id: "stage-1-field-a",
      viewport: VIEWPORT,
      worldScale: WORLD_SCALE,
      bounds: worldBounds,
      playerSpawnRatio: { x: 0.5, y: 0.5 },
      generation: GENERATION
    }
  });

  function normalizeSeed(seed) {
    const numeric = Number(seed);
    if (Number.isFinite(numeric)) return Math.trunc(numeric) >>> 0;
    const text = String(seed ?? "stage-1-field-a");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createSeededRng(seed) {
    let state = normalizeSeed(seed);
    return function next() {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function definitionOf(battlefield) {
    return battlefield?.definition || battlefield || null;
  }

  function getDefinition(id) {
    return DEFINITIONS[id] || null;
  }

  function overlaps(first, second, padding = 0) {
    return first.x < second.x + second.width + padding - EPSILON &&
      first.x + first.width + padding > second.x + EPSILON &&
      first.y < second.y + second.height + padding - EPSILON &&
      first.y + first.height + padding > second.y + EPSILON;
  }

  function solidObstacles(battlefield) {
    return (definitionOf(battlefield)?.obstacles || []).filter(obstacle => obstacle.solid);
  }

  function blockingProjectileObstacles(battlefield) {
    return (definitionOf(battlefield)?.obstacles || []).filter(obstacle => obstacle.blocksProjectiles);
  }

  function isInsideBounds(body, battlefield) {
    const bounds = definitionOf(battlefield)?.bounds;
    return Boolean(bounds && body.x >= -EPSILON && body.y >= -EPSILON &&
      body.x + body.width <= bounds.width + EPSILON &&
      body.y + body.height <= bounds.height + EPSILON);
  }

  function firstSolidCollision(body, battlefield) {
    return solidObstacles(battlefield).find(obstacle => overlaps(body, obstacle)) || null;
  }

  function isStaticPositionValid(body, battlefield) {
    return isInsideBounds(body, battlefield) && !firstSolidCollision(body, battlefield);
  }

  function traceMovement(body, movementX, movementY, battlefield, options = {}) {
    const distance = Math.hypot(movementX, movementY);
    const stepSize = Number.isFinite(options.stepSize) && options.stepSize > 0
      ? options.stepSize : SWEEP_STEP;
    const steps = Math.max(1, Math.ceil(distance / stepSize));
    let x = body.x;
    let y = body.y;
    let collision = null;
    let reachedBoundary = false;
    for (let step = 1; step <= steps; step++) {
      const candidate = {
        x: body.x + movementX * step / steps,
        y: body.y + movementY * step / steps,
        width: body.width,
        height: body.height
      };
      if (!isInsideBounds(candidate, battlefield)) {
        reachedBoundary = true;
        break;
      }
      collision = firstSolidCollision(candidate, battlefield);
      if (collision) break;
      x = candidate.x;
      y = candidate.y;
    }
    return { x, y, movementX: x - body.x, movementY: y - body.y,
      collided: Boolean(collision) || reachedBoundary, collision, reachedBoundary };
  }

  function moveAxis(body, amount, axis, battlefield) {
    return traceMovement(body, axis === "x" ? amount : 0, axis === "y" ? amount : 0, battlefield);
  }

  function hasLineOfTravel(body, target, battlefield) {
    const result = traceMovement(body, target.x - body.x, target.y - body.y, battlefield);
    return !result.collided;
  }

  function gridShape(body, battlefield, cellSize) {
    const bounds = definitionOf(battlefield)?.bounds;
    if (!bounds) return null;
    const maxX = bounds.width - body.width;
    const maxY = bounds.height - body.height;
    if (maxX < 0 || maxY < 0) return null;
    return { columns: Math.floor(maxX / cellSize) + 1, rows: Math.floor(maxY / cellSize) + 1,
      maxX, maxY };
  }

  function cellPoint(column, row, shape, cellSize) {
    return { x: Math.min(column * cellSize, shape.maxX), y: Math.min(row * cellSize, shape.maxY) };
  }

  function walkabilityKey(body, cellSize) {
    return `${body.width}x${body.height}@${cellSize}`;
  }

  function buildWalkability(body, battlefield, cellSize = GRID_CELL_SIZE) {
    const shape = gridShape(body, battlefield, cellSize);
    if (!shape) return null;
    const walkable = new Uint8Array(shape.columns * shape.rows);
    const validCells = [];
    for (let row = 0; row < shape.rows; row++) {
      for (let column = 0; column < shape.columns; column++) {
        const point = cellPoint(column, row, shape, cellSize);
        if (!isStaticPositionValid({ ...point, width: body.width, height: body.height }, battlefield)) continue;
        walkable[row * shape.columns + column] = 1;
        validCells.push({ column, row, x: point.x, y: point.y });
      }
    }
    return { shape, walkable, validCells, cellSize };
  }

  function getWalkability(body, battlefield, cellSize = GRID_CELL_SIZE) {
    const key = walkabilityKey(body, cellSize);
    if (battlefield?.navigationCache instanceof Map) {
      if (!battlefield.navigationCache.has(key)) {
        battlefield.navigationCache.set(key, buildWalkability(body, battlefield, cellSize));
      }
      return battlefield.navigationCache.get(key);
    }
    return buildWalkability(body, battlefield, cellSize);
  }

  function nearestValidCell(point, cache) {
    let best = null;
    for (const candidate of cache.validCells) {
      const distanceSquared = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
      if (!best || distanceSquared < best.distanceSquared - EPSILON ||
          (Math.abs(distanceSquared - best.distanceSquared) <= EPSILON &&
            (candidate.row < best.row ||
              (candidate.row === best.row && candidate.column < best.column)))) {
        best = { column: candidate.column, row: candidate.row, distanceSquared };
      }
    }
    return best;
  }

  const NEIGHBORS = Object.freeze([
    [1, 0], [0, 1], [-1, 0], [0, -1],
    [1, 1], [-1, 1], [-1, -1], [1, -1]
  ]);

  function heapCompare(first, second) {
    return first.f - second.f || first.g - second.g ||
      first.row - second.row || first.column - second.column;
  }

  function heapPush(heap, value) {
    heap.push(value);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (heapCompare(heap[parent], value) <= 0) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = value;
  }

  function heapPop(heap) {
    const first = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= heap.length) break;
        let child = left;
        if (right < heap.length && heapCompare(heap[right], heap[left]) < 0) child = right;
        if (heapCompare(last, heap[child]) <= 0) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    return first;
  }

  function reconstructPath(cameFrom, key, shape, cellSize) {
    const path = [];
    while (key != null) {
      const [column, row] = key.split(",").map(Number);
      path.push(cellPoint(column, row, shape, cellSize));
      key = cameFrom.get(key) ?? null;
    }
    return path.reverse();
  }

  function smoothPath(body, path, battlefield, target) {
    const points = path.slice(1);
    if (isStaticPositionValid({ ...target, width: body.width, height: body.height }, battlefield)) points.push(target);
    const smoothed = [];
    let origin = { x: body.x, y: body.y, width: body.width, height: body.height };
    let index = 0;
    while (index < points.length) {
      let selected = index;
      for (let candidate = points.length - 1; candidate >= index; candidate--) {
        if (hasLineOfTravel(origin, points[candidate], battlefield)) {
          selected = candidate;
          break;
        }
      }
      const point = points[selected];
      smoothed.push(point);
      origin = { ...point, width: body.width, height: body.height };
      index = selected + 1;
    }
    return smoothed;
  }

  function findPath(body, target, battlefield, cellSize = GRID_CELL_SIZE) {
    const cache = getWalkability(body, battlefield, cellSize);
    if (!cache) return null;
    const { shape, walkable } = cache;
    const clampedTarget = {
      x: Math.max(0, Math.min(Number(target?.x) || 0, shape.maxX)),
      y: Math.max(0, Math.min(Number(target?.y) || 0, shape.maxY))
    };
    const start = nearestValidCell(body, cache);
    const goal = nearestValidCell(clampedTarget, cache);
    if (!start || !goal) return null;
    const startKey = `${start.column},${start.row}`;
    const goalKey = `${goal.column},${goal.row}`;
    const open = [];
    heapPush(open, { column: start.column, row: start.row, key: startKey, g: 0, f: 0 });
    const scores = new Map([[startKey, 0]]);
    const cameFrom = new Map();
    const closed = new Set();
    const isWalkable = (column, row) => Boolean(walkable[row * shape.columns + column]);
    while (open.length) {
      const current = heapPop(open);
      if (closed.has(current.key)) continue;
      if (current.key === goalKey) {
        return smoothPath(body, reconstructPath(cameFrom, current.key, shape, cellSize), battlefield, clampedTarget);
      }
      closed.add(current.key);
      for (const [offsetX, offsetY] of NEIGHBORS) {
        const column = current.column + offsetX;
        const row = current.row + offsetY;
        if (column < 0 || row < 0 || column >= shape.columns || row >= shape.rows ||
            !isWalkable(column, row)) continue;
        if (offsetX && offsetY &&
            (!isWalkable(current.column + offsetX, current.row) ||
              !isWalkable(current.column, current.row + offsetY))) continue;
        const key = `${column},${row}`;
        if (closed.has(key)) continue;
        const tentative = current.g + (offsetX && offsetY ? Math.SQRT2 : 1);
        if (tentative + EPSILON >= (scores.get(key) ?? Infinity)) continue;
        scores.set(key, tentative);
        cameFrom.set(key, current.key);
        const dx = Math.abs(goal.column - column);
        const dy = Math.abs(goal.row - row);
        const heuristic = Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
        heapPush(open, { column, row, key, g: tentative, f: tentative + heuristic });
      }
    }
    return null;
  }

  function createNavigationRuntime(runtimeId = 0) {
    return { runtimeId, waypoints: [], waypointIndex: 0, targetCell: null,
      repathElapsed: 0, forceRepath: false, stuckElapsed: 0 };
  }

  function navigationIntent(body, target, battlefield, runtime, deltaTime) {
    runtime ||= createNavigationRuntime();
    runtime.repathElapsed += Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
    const definition = definitionOf(battlefield);
    const maxX = definition.bounds.width - body.width;
    const maxY = definition.bounds.height - body.height;
    const destination = {
      x: Math.max(0, Math.min(target.x + (target.width - body.width) / 2, maxX)),
      y: Math.max(0, Math.min(target.y + (target.height - body.height) / 2, maxY))
    };
    if (hasLineOfTravel(body, destination, battlefield)) {
      runtime.waypoints = [];
      runtime.waypointIndex = 0;
      runtime.targetCell = `${Math.floor(destination.x / GRID_CELL_SIZE)},${Math.floor(destination.y / GRID_CELL_SIZE)}`;
      runtime.forceRepath = false;
      return { destination, requested: false, failed: false, fallback: false, direct: true };
    }
    const targetCell = `${Math.floor(destination.x / GRID_CELL_SIZE)},${Math.floor(destination.y / GRID_CELL_SIZE)}`;
    const repathInterval = 0.65 + (Math.abs(runtime.runtimeId || 0) % 5) * 0.05;
    const routeInvalid = runtime.waypoints.slice(runtime.waypointIndex).some(point =>
      !isStaticPositionValid({ ...point, width: body.width, height: body.height }, battlefield));
    const needsRoute = runtime.forceRepath || routeInvalid || runtime.targetCell !== targetCell ||
      runtime.waypointIndex >= runtime.waypoints.length || runtime.repathElapsed >= repathInterval;
    let requested = false;
    let failed = false;
    if (needsRoute) {
      requested = true;
      const path = findPath(body, destination, battlefield);
      runtime.waypoints = path || [];
      runtime.waypointIndex = 0;
      runtime.targetCell = targetCell;
      runtime.repathElapsed = 0;
      runtime.forceRepath = false;
      failed = !path;
    }
    while (runtime.waypointIndex < runtime.waypoints.length) {
      const point = runtime.waypoints[runtime.waypointIndex];
      if (Math.hypot(point.x - body.x, point.y - body.y) > 5) break;
      runtime.waypointIndex++;
    }
    const waypoint = runtime.waypoints[runtime.waypointIndex];
    return { destination: waypoint || destination, requested, failed,
      fallback: failed || !waypoint, direct: false };
  }

  function recordNavigationProgress(runtime, attemptedDistance, movedDistance, deltaTime) {
    if (!runtime) return false;
    const dt = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
    if (attemptedDistance > 0.1 && movedDistance < Math.min(0.1, attemptedDistance * 0.1)) {
      runtime.stuckElapsed += dt;
    } else {
      runtime.stuckElapsed = 0;
    }
    if (runtime.stuckElapsed < 0.6) return false;
    runtime.stuckElapsed = 0;
    runtime.forceRepath = true;
    runtime.waypoints = [];
    runtime.waypointIndex = 0;
    return true;
  }

  function nearestPlayablePoint(point, battlefield) {
    const definition = definitionOf(battlefield);
    const clamped = {
      x: Math.max(0, Math.min(point.x, definition.bounds.width)),
      y: Math.max(0, Math.min(point.y, definition.bounds.height))
    };
    const obstacle = solidObstacles(battlefield).find(candidate =>
      clamped.x > candidate.x && clamped.x < candidate.x + candidate.width &&
      clamped.y > candidate.y && clamped.y < candidate.y + candidate.height);
    if (!obstacle) return clamped;
    const candidates = [
      { x: obstacle.x - 1, y: clamped.y },
      { x: obstacle.x + obstacle.width + 1, y: clamped.y },
      { x: clamped.x, y: obstacle.y - 1 },
      { x: clamped.x, y: obstacle.y + obstacle.height + 1 }
    ].map(candidate => ({
      x: Math.max(0, Math.min(candidate.x, definition.bounds.width)),
      y: Math.max(0, Math.min(candidate.y, definition.bounds.height))
    }));
    return candidates.reduce((best, candidate) => {
      const distanceSquared = (candidate.x - clamped.x) ** 2 + (candidate.y - clamped.y) ** 2;
      return !best || distanceSquared < best.distanceSquared
        ? { ...candidate, distanceSquared }
        : best;
    }, null);
  }

  function normalizedFootprints(actorFootprints = []) {
    const unique = new Map();
    for (const footprint of actorFootprints) {
      if (!Number.isFinite(footprint?.width) || !Number.isFinite(footprint?.height) ||
          footprint.width <= 0 || footprint.height <= 0) continue;
      unique.set(`${footprint.width}x${footprint.height}`,
        { width: footprint.width, height: footprint.height, id: footprint.id || null });
    }
    return [...unique.values()];
  }

  function centeredBody(ratio, bounds, footprint) {
    return {
      x: bounds.width * ratio.x - footprint.width / 2,
      y: bounds.height * ratio.y - footprint.height / 2,
      width: footprint.width,
      height: footprint.height
    };
  }

  function actorAnchorPoints(bounds, footprint) {
    const inset = GRID_CELL_SIZE * 2;
    const maxX = bounds.width - footprint.width;
    const maxY = bounds.height - footprint.height;
    return [
      { x: inset, y: inset },
      { x: Math.max(0, maxX - inset), y: inset },
      { x: inset, y: Math.max(0, maxY - inset) },
      { x: Math.max(0, maxX - inset), y: Math.max(0, maxY - inset) },
      { x: Math.max(0, maxX / 2), y: inset },
      { x: Math.max(0, maxX / 2), y: Math.max(0, maxY - inset) }
    ];
  }

  function validateGeneratedBattlefield(battlefield, actorFootprints = []) {
    const definition = definitionOf(battlefield);
    const errors = [];
    const footprints = normalizedFootprints(actorFootprints);
    if (!definition?.bounds || definition.bounds.width <= VIEWPORT.width ||
        definition.bounds.height <= VIEWPORT.height) errors.push("World must exceed viewport");
    for (const obstacle of definition?.obstacles || []) {
      if (!isInsideBounds(obstacle, { bounds: definition.bounds, obstacles: [] })) {
        errors.push(`Obstacle outside World: ${obstacle.id}`);
      }
    }
    for (const footprint of footprints) {
      const spawn = centeredBody(definition.playerSpawnRatio, definition.bounds, footprint);
      if (!isStaticPositionValid(spawn, battlefield)) {
        errors.push(`Invalid spawn for ${footprint.width}x${footprint.height}`);
        continue;
      }
      for (const target of actorAnchorPoints(definition.bounds, footprint)) {
        if (!isStaticPositionValid({ ...target, width: footprint.width, height: footprint.height }, battlefield) ||
            !findPath(spawn, target, battlefield)) {
          errors.push(`Disconnected route for ${footprint.width}x${footprint.height}`);
          break;
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  function alignToGrid(value) {
    return Math.max(GRID_CELL_SIZE, Math.round(value / GRID_CELL_SIZE) * GRID_CELL_SIZE);
  }

  function expanded(body, padding) {
    return { x: body.x - padding, y: body.y - padding,
      width: body.width + padding * 2, height: body.height + padding * 2 };
  }

  function generateCandidate(source, rng, actorFootprints, attempt) {
    const bounds = source.bounds;
    const footprints = normalizedFootprints(actorFootprints);
    const playerFootprint = footprints[0] || { width: 40, height: 40 };
    const largestActor = Math.max(GRID_CELL_SIZE,
      ...footprints.flatMap(footprint => [footprint.width, footprint.height]));
    const count = Math.max(4, Math.round(
      bounds.width * bounds.height / (source.viewport.width * source.viewport.height) *
      source.generation.obstaclesPerViewport));
    const minimumCount = Math.ceil(count * source.generation.minimumObstacleCountRatio);
    const border = alignToGrid(largestActor + GRID_CELL_SIZE);
    const gap = alignToGrid(largestActor * source.generation.obstacleGapActorLengths);
    const spawnBody = centeredBody(source.playerSpawnRatio, bounds, playerFootprint);
    const safeSpawn = expanded(spawnBody,
      largestActor * source.generation.spawnSafetyActorLengths);
    const shortMinimum = GRID_CELL_SIZE * 2;
    const shortMaximum = alignToGrid(Math.min(source.viewport.width, source.viewport.height) * 0.12);
    const longMinimum = alignToGrid(Math.min(source.viewport.width, source.viewport.height) * 0.16);
    const longMaximum = alignToGrid(Math.min(source.viewport.width, source.viewport.height) * 0.36);
    const obstacles = [];
    for (let index = 0; index < count; index++) {
      for (let placement = 0; placement < source.generation.placementsPerObstacle; placement++) {
        const horizontal = rng() >= 0.5;
        const longCells = Math.max(1, Math.round((longMinimum + rng() * (longMaximum - longMinimum)) / GRID_CELL_SIZE));
        const shortCells = Math.max(1, Math.round((shortMinimum + rng() * (shortMaximum - shortMinimum)) / GRID_CELL_SIZE));
        const width = (horizontal ? longCells : shortCells) * GRID_CELL_SIZE;
        const height = (horizontal ? shortCells : longCells) * GRID_CELL_SIZE;
        const columns = Math.max(1, Math.floor((bounds.width - border * 2 - width) / GRID_CELL_SIZE));
        const rows = Math.max(1, Math.floor((bounds.height - border * 2 - height) / GRID_CELL_SIZE));
        const candidate = {
          id: `generated-${attempt + 1}-${index + 1}`,
          x: border + Math.floor(rng() * (columns + 1)) * GRID_CELL_SIZE,
          y: border + Math.floor(rng() * (rows + 1)) * GRID_CELL_SIZE,
          width, height, solid: true, blocksProjectiles: true
        };
        if (overlaps(candidate, safeSpawn) || obstacles.some(obstacle => overlaps(candidate, obstacle, gap))) continue;
        obstacles.push(candidate);
        break;
      }
    }
    if (obstacles.length < minimumCount) return null;
    return freeze({ id: source.id, viewport: source.viewport, bounds: source.bounds,
      playerSpawnRatio: source.playerSpawnRatio, playerSpawn: { x: spawnBody.x, y: spawnBody.y }, obstacles });
  }

  function deterministicFallback(source, actorFootprints) {
    const footprints = normalizedFootprints(actorFootprints);
    const playerFootprint = footprints[0] || { width: 40, height: 40 };
    const bounds = source.bounds;
    const length = alignToGrid(Math.min(source.viewport.width, source.viewport.height) * 0.28);
    const thickness = alignToGrid(Math.min(source.viewport.width, source.viewport.height) * 0.1);
    const offsetX = alignToGrid(source.viewport.width * 0.42);
    const offsetY = alignToGrid(source.viewport.height * 0.42);
    const centerX = bounds.width * source.playerSpawnRatio.x;
    const centerY = bounds.height * source.playerSpawnRatio.y;
    const primitives = [
      { x: centerX - offsetX - length / 2, y: centerY - offsetY - thickness / 2,
        width: length, height: thickness },
      { x: centerX + offsetX - thickness / 2, y: centerY - offsetY - length / 2,
        width: thickness, height: length },
      { x: centerX - offsetX - thickness / 2, y: centerY + offsetY - length / 2,
        width: thickness, height: length },
      { x: centerX + offsetX - length / 2, y: centerY + offsetY - thickness / 2,
        width: length, height: thickness }
    ];
    const obstacles = primitives.map((primitive, index) => freeze({
      id: `fallback-${index + 1}`,
      x: alignToGrid(primitive.x), y: alignToGrid(primitive.y),
      width: primitive.width, height: primitive.height,
      solid: true, blocksProjectiles: true
    }));
    return freeze({ id: source.id, viewport: source.viewport, bounds: source.bounds,
      playerSpawnRatio: source.playerSpawnRatio,
      playerSpawn: { x: centerX - playerFootprint.width / 2,
        y: centerY - playerFootprint.height / 2 }, obstacles });
  }

  function runtimeFor(source, seed, definition, attemptCount, usedFallback) {
    return { id: source.id, seed: normalizeSeed(seed), definition, sourceDefinition: source,
      navigationCache: new Map(), generation: { attemptCount, usedFallback } };
  }

  function generateBattlefield(definitionOrId, seed, options = {}) {
    const source = typeof definitionOrId === "string" ? getDefinition(definitionOrId) : definitionOrId;
    if (!source) throw new Error(`Unknown Battlefield: ${definitionOrId}`);
    const actorFootprints = normalizedFootprints(options.actorFootprints || []);
    const rng = createSeededRng(seed);
    const maxAttempts = Number.isInteger(options.maxAttempts)
      ? Math.max(0, options.maxAttempts) : source.generation.maxAttempts;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const generated = generateCandidate(source, rng, actorFootprints, attempt);
      if (!generated) continue;
      const runtime = runtimeFor(source, seed, generated, attempt + 1, false);
      if (validateGeneratedBattlefield(runtime, actorFootprints).valid) return runtime;
    }
    const fallback = deterministicFallback(source, actorFootprints);
    const runtime = runtimeFor(source, seed, fallback, maxAttempts, true);
    const validation = validateGeneratedBattlefield(runtime, actorFootprints);
    if (!validation.valid) throw new Error(`Invalid Battlefield fallback: ${validation.errors.join(", ")}`);
    return runtime;
  }

  function createRuntime(id, options = {}) {
    return generateBattlefield(id, options.seed, options);
  }

  function isOutsideRect(body, rectangle, margin = 0) {
    return body.x + body.width <= rectangle.x - margin ||
      body.x >= rectangle.x + rectangle.width + margin ||
      body.y + body.height <= rectangle.y - margin ||
      body.y >= rectangle.y + rectangle.height + margin;
  }

  function offscreenSpawnRegions(body, cameraRect, battlefield, bandDepth = GRID_CELL_SIZE * 6) {
    const bounds = definitionOf(battlefield).bounds;
    const margin = GRID_CELL_SIZE;
    const regions = [];
    const horizontalStart = Math.max(0, cameraRect.x - bandDepth);
    const horizontalEnd = Math.min(bounds.width - body.width,
      cameraRect.x + cameraRect.width + bandDepth - body.width);
    const verticalStart = Math.max(0, cameraRect.y - bandDepth);
    const verticalEnd = Math.min(bounds.height - body.height,
      cameraRect.y + cameraRect.height + bandDepth - body.height);
    const topEnd = cameraRect.y - body.height - margin;
    if (topEnd >= 0) regions.push({ side: "top", minX: horizontalStart, maxX: horizontalEnd,
      minY: Math.max(0, topEnd - bandDepth), maxY: topEnd });
    const rightStart = cameraRect.x + cameraRect.width + margin;
    if (rightStart + body.width <= bounds.width) regions.push({ side: "right", minX: rightStart,
      maxX: Math.min(bounds.width - body.width, rightStart + bandDepth), minY: verticalStart, maxY: verticalEnd });
    const bottomStart = cameraRect.y + cameraRect.height + margin;
    if (bottomStart + body.height <= bounds.height) regions.push({ side: "bottom", minX: horizontalStart,
      maxX: horizontalEnd, minY: bottomStart,
      maxY: Math.min(bounds.height - body.height, bottomStart + bandDepth) });
    const leftEnd = cameraRect.x - body.width - margin;
    if (leftEnd >= 0) regions.push({ side: "left", minX: Math.max(0, leftEnd - bandDepth), maxX: leftEnd,
      minY: verticalStart, maxY: verticalEnd });
    return regions.filter(region => region.minX <= region.maxX && region.minY <= region.maxY);
  }

  function spawnCandidates(body, cameraRect, battlefield, sideSample, offsetSample,
    bandDepth = GRID_CELL_SIZE * 6) {
    const regions = offscreenSpawnRegions(body, cameraRect, battlefield, bandDepth);
    if (!regions.length) return [];
    const start = Math.floor((((sideSample % 1) + 1) % 1) * regions.length) % regions.length;
    const offsets = [0, 0.5, 0.25, 0.75];
    const candidates = [];
    for (let pass = 0; pass < offsets.length; pass++) {
      for (let sideOffset = 0; sideOffset < regions.length; sideOffset++) {
        const region = regions[(start + sideOffset) % regions.length];
        const ratio = ((offsetSample + offsets[pass]) % 1 + 1) % 1;
        const alongX = region.minX + (region.maxX - region.minX) * ratio;
        const alongY = region.minY + (region.maxY - region.minY) * ratio;
        const candidate = region.side === "top" || region.side === "bottom"
          ? { x: alongX, y: (region.minY + region.maxY) / 2 }
          : { x: (region.minX + region.maxX) / 2, y: alongY };
        if (isOutsideRect({ ...candidate, width: body.width, height: body.height }, cameraRect)) {
          candidates.push(candidate);
        }
      }
    }
    for (const region of regions) {
      const startY = Math.ceil(region.minY / GRID_CELL_SIZE) * GRID_CELL_SIZE;
      const startX = Math.ceil(region.minX / GRID_CELL_SIZE) * GRID_CELL_SIZE;
      for (let y = startY; y <= region.maxY + EPSILON; y += GRID_CELL_SIZE) {
        for (let x = startX; x <= region.maxX + EPSILON; x += GRID_CELL_SIZE) {
          if (isOutsideRect({ x, y, width: body.width, height: body.height }, cameraRect)) candidates.push({ x, y });
        }
      }
    }
    return candidates;
  }

  const api = Object.freeze({ DEFINITIONS, VIEWPORT, WORLD_SCALE, GENERATION, GRID_CELL_SIZE,
    normalizeSeed, createSeededRng, getDefinition, generateBattlefield, createRuntime,
    validateGeneratedBattlefield, overlaps, solidObstacles, blockingProjectileObstacles,
    isInsideBounds, firstSolidCollision, isStaticPositionValid, traceMovement, moveAxis,
    hasLineOfTravel, buildWalkability, findPath, createNavigationRuntime,
    navigationIntent, recordNavigationProgress, nearestPlayablePoint, isOutsideRect,
    offscreenSpawnRegions, spawnCandidates });
  global.Battlefields = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
