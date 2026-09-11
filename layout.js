// Pure display sizing plus explicit screen/world Camera coordinate conversion.
(function (global) {
  const LOGICAL_WIDTH = 800;
  const LOGICAL_HEIGHT = 600;

  function positiveFinite(value) {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function calculateCanvasDisplaySize(logicalWidth, logicalHeight, availableWidth, availableHeight) {
    const width = positiveFinite(logicalWidth);
    const height = positiveFinite(logicalHeight);
    const availableW = positiveFinite(availableWidth);
    const availableH = positiveFinite(availableHeight);

    if (width === 0 || height === 0 || availableW === 0 || availableH === 0) {
      return { scale: 0, width: 0, height: 0 };
    }

    const widthScale = availableW / width;
    const heightScale = availableH / height;
    const calculatedScale = Math.min(widthScale, heightScale);
    if (!Number.isFinite(calculatedScale) || calculatedScale < 0) {
      return { scale: 0, width: 0, height: 0 };
    }

    // Keep the limiting dimension exact so floating-point multiplication cannot
    // place the displayed Canvas a fraction of a pixel outside its region.
    if (widthScale <= heightScale) {
      return {
        scale: widthScale,
        width: availableW,
        height: availableW * height / width
      };
    }
    return {
      scale: heightScale,
      width: availableH * width / height,
      height: availableH
    };
  }

  function clientToCanvasPoint(
    clientX,
    clientY,
    rect,
    logicalWidth = LOGICAL_WIDTH,
    logicalHeight = LOGICAL_HEIGHT
  ) {
    const width = positiveFinite(logicalWidth);
    const height = positiveFinite(logicalHeight);
    if (
      !rect ||
      !Number.isFinite(clientX) ||
      !Number.isFinite(clientY) ||
      !Number.isFinite(rect.left) ||
      !Number.isFinite(rect.top) ||
      !Number.isFinite(rect.width) ||
      !Number.isFinite(rect.height) ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      width === 0 ||
      height === 0
    ) {
      return null;
    }

    return {
      x: (clientX - rect.left) * width / rect.width,
      y: (clientY - rect.top) * height / rect.height
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(value, maximum));
  }

  function createCamera(viewportWidth = LOGICAL_WIDTH, viewportHeight = LOGICAL_HEIGHT) {
    return { x: 0, y: 0, width: viewportWidth, height: viewportHeight };
  }

  function updateCamera(camera, target, worldBounds) {
    if (!camera || !target || !worldBounds) return camera;
    const maxX = Math.max(0, worldBounds.width - camera.width);
    const maxY = Math.max(0, worldBounds.height - camera.height);
    camera.x = clamp(target.x + target.width / 2 - camera.width / 2, 0, maxX);
    camera.y = clamp(target.y + target.height / 2 - camera.height / 2, 0, maxY);
    return camera;
  }

  function getCameraWorldRect(camera) {
    return camera ? { x: camera.x, y: camera.y, width: camera.width, height: camera.height } : null;
  }

  function worldToScreen(point, camera) {
    if (!point || !camera) return null;
    return { x: point.x - camera.x, y: point.y - camera.y };
  }

  function screenToWorld(point, camera) {
    if (!point || !camera) return null;
    return { x: point.x + camera.x, y: point.y + camera.y };
  }

  function intersectsCamera(body, camera, padding = 0) {
    if (!body || !camera) return false;
    return body.x + body.width >= camera.x - padding &&
      body.x <= camera.x + camera.width + padding &&
      body.y + body.height >= camera.y - padding &&
      body.y <= camera.y + camera.height + padding;
  }

  const api = Object.freeze({
    LOGICAL_WIDTH,
    LOGICAL_HEIGHT,
    calculateCanvasDisplaySize,
    clientToCanvasPoint,
    createCamera,
    updateCamera,
    getCameraWorldRect,
    worldToScreen,
    screenToWorld,
    intersectsCamera
  });

  global.GameLayout = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
