// Immutable Battlefield content plus deterministic static-world geometry and navigation.
(function (global) {
  const GRID_CELL_SIZE = 20;
  const SWEEP_STEP = 4;
  const EPSILON = 1e-6;

  function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const DEFINITIONS = freeze({
    "stage-1-field-a": {
      id: "stage-1-field-a",
      bounds: { width: 800, height: 600 },
      playerSpawn: { x: 380, y: 280 },
      obstacles: [
        { id: "northwest-cover", x: 110, y: 120, width: 240, height: 60,
          solid: true, blocksProjectiles: true },
        { id: "northeast-wall", x: 560, y: 0, width: 60, height: 230,
          solid: true, blocksProjectiles: true },
        { id: "southwest-wall", x: 180, y: 370, width: 60, height: 230,
          solid: true, blocksProjectiles: true },
        { id: "southeast-cover", x: 450, y: 420, width: 240, height: 60,
          solid: true, blocksProjectiles: true }
      ]
    }
  });

  function definitionOf(battlefield) {
    return battlefield?.definition || battlefield || null;
  }

  function getDefinition(id) {
    return DEFINITIONS[id] || null;
  }

  function createRuntime(id) {
    const definition = getDefinition(id);
    if (!definition) throw new Error(`Unknown Battlefield: ${id}`);
    return { id: definition.id, definition };
  }

  function overlaps(first, second) {
    return first.x < second.x + second.width - EPSILON &&
      first.x + first.width > second.x + EPSILON &&
      first.y < second.y + second.height - EPSILON &&
      first.y + first.height > second.y + EPSILON;
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

  function nearestValidCell(body, point, battlefield, cellSize, shape) {
    let best = null;
    for (let row = 0; row < shape.rows; row++) {
      for (let column = 0; column < shape.columns; column++) {
        const candidate = cellPoint(column, row, shape, cellSize);
        if (!isStaticPositionValid({ ...candidate, width: body.width, height: body.height }, battlefield)) continue;
        const distanceSquared = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
        if (!best || distanceSquared < best.distanceSquared - EPSILON ||
            (Math.abs(distanceSquared - best.distanceSquared) <= EPSILON &&
              (row < best.row || (row === best.row && column < best.column)))) {
          best = { column, row, distanceSquared };
        }
      }
    }
    return best;
  }

  const NEIGHBORS = Object.freeze([
    [1, 0], [0, 1], [-1, 0], [0, -1],
    [1, 1], [-1, 1], [-1, -1], [1, -1]
  ]);

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
    const shape = gridShape(body, battlefield, cellSize);
    if (!shape) return null;
    const clampedTarget = {
      x: Math.max(0, Math.min(Number(target?.x) || 0, shape.maxX)),
      y: Math.max(0, Math.min(Number(target?.y) || 0, shape.maxY))
    };
    const start = nearestValidCell(body, body, battlefield, cellSize, shape);
    const goal = nearestValidCell(body, clampedTarget, battlefield, cellSize, shape);
    if (!start || !goal) return null;
    const startKey = `${start.column},${start.row}`;
    const goalKey = `${goal.column},${goal.row}`;
    const open = [{ column: start.column, row: start.row, key: startKey, g: 0, f: 0 }];
    const scores = new Map([[startKey, 0]]);
    const cameFrom = new Map();
    const closed = new Set();
    while (open.length) {
      open.sort((first, second) => first.f - second.f || first.g - second.g ||
        first.row - second.row || first.column - second.column);
      const current = open.shift();
      if (closed.has(current.key)) continue;
      if (current.key === goalKey) {
        return smoothPath(body, reconstructPath(cameFrom, current.key, shape, cellSize), battlefield, clampedTarget);
      }
      closed.add(current.key);
      for (const [offsetX, offsetY] of NEIGHBORS) {
        const column = current.column + offsetX;
        const row = current.row + offsetY;
        if (column < 0 || row < 0 || column >= shape.columns || row >= shape.rows) continue;
        const point = cellPoint(column, row, shape, cellSize);
        const candidate = { ...point, width: body.width, height: body.height };
        if (!isStaticPositionValid(candidate, battlefield)) continue;
        if (offsetX && offsetY) {
          const sideX = cellPoint(current.column + offsetX, current.row, shape, cellSize);
          const sideY = cellPoint(current.column, current.row + offsetY, shape, cellSize);
          if (!isStaticPositionValid({ ...sideX, width: body.width, height: body.height }, battlefield) ||
              !isStaticPositionValid({ ...sideY, width: body.width, height: body.height }, battlefield)) continue;
        }
        const key = `${column},${row}`;
        if (closed.has(key)) continue;
        const movementCost = offsetX && offsetY ? Math.SQRT2 : 1;
        const tentative = current.g + movementCost;
        if (tentative + EPSILON >= (scores.get(key) ?? Infinity)) continue;
        scores.set(key, tentative);
        cameFrom.set(key, current.key);
        const dx = Math.abs(goal.column - column);
        const dy = Math.abs(goal.row - row);
        const heuristic = Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
        open.push({ column, row, key, g: tentative, f: tentative + heuristic });
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

  const api = Object.freeze({ DEFINITIONS, GRID_CELL_SIZE, getDefinition, createRuntime, overlaps,
    solidObstacles, blockingProjectileObstacles, isInsideBounds, firstSolidCollision,
    isStaticPositionValid, traceMovement, moveAxis, hasLineOfTravel, findPath,
    createNavigationRuntime, navigationIntent, recordNavigationProgress, nearestPlayablePoint });
  global.Battlefields = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
