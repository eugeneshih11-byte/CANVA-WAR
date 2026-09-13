const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const GameLayout = require("../layout.js");
const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const styleSource = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);
}

test("layout module exposes the unchanged logical Canvas size", () => {
  assert.equal(GameLayout.LOGICAL_WIDTH, 800);
  assert.equal(GameLayout.LOGICAL_HEIGHT, 600);
  assert.equal(Object.isFrozen(GameLayout), true);
});

test("1280 by 551 representative arena region is constrained by height", () => {
  const result = GameLayout.calculateCanvasDisplaySize(800, 600, 1024, 483);
  close(result.scale, 0.805);
  close(result.width, 644);
  close(result.height, 483);
  assert.ok(result.width <= 1024);
  assert.ok(result.height <= 483);
});

test("display sizing respects width-limited and height-limited regions", () => {
  assert.deepEqual(GameLayout.calculateCanvasDisplaySize(800, 600, 400, 1000), {
    scale: 0.5,
    width: 400,
    height: 300
  });
  assert.deepEqual(GameLayout.calculateCanvasDisplaySize(800, 600, 1000, 300), {
    scale: 0.5,
    width: 400,
    height: 300
  });
});

test("display sizing preserves the logical 4:3 aspect ratio", () => {
  for (const [availableWidth, availableHeight] of [[1600, 1200], [777, 333], [321, 900]]) {
    const result = GameLayout.calculateCanvasDisplaySize(800, 600, availableWidth, availableHeight);
    close(result.width / result.height, 4 / 3);
    assert.ok(result.width <= availableWidth);
    assert.ok(result.height <= availableHeight);
  }
});

test("pointer conversion maps a scaled Canvas center and corners to logical coordinates", () => {
  const rect = { left: 100, top: 50, width: 400, height: 300 };
  assert.deepEqual(GameLayout.clientToCanvasPoint(300, 200, rect), { x: 400, y: 300 });
  assert.deepEqual(GameLayout.clientToCanvasPoint(100, 50, rect), { x: 0, y: 0 });
  assert.deepEqual(GameLayout.clientToCanvasPoint(500, 350, rect), { x: 800, y: 600 });
});

test("pointer conversion supports explicit logical dimensions without clamping aim", () => {
  const rect = { left: 20, top: 10, width: 200, height: 100 };
  assert.deepEqual(GameLayout.clientToCanvasPoint(120, 60, rect, 1000, 500), {
    x: 500,
    y: 250
  });
  assert.deepEqual(GameLayout.clientToCanvasPoint(0, 0, rect, 1000, 500), {
    x: -100,
    y: -50
  });
});

test("invalid sizing inputs return finite nonnegative zero dimensions", () => {
  const cases = [
    [0, 600, 400, 300],
    [800, -1, 400, 300],
    [800, 600, NaN, 300],
    [800, 600, 400, Infinity],
    [undefined, undefined, undefined, undefined]
  ];
  for (const values of cases) {
    const result = GameLayout.calculateCanvasDisplaySize(...values);
    assert.deepEqual(result, { scale: 0, width: 0, height: 0 });
    assert.equal(Object.values(result).every(value => Number.isFinite(value) && value >= 0), true);
  }
});

test("invalid pointer inputs and nonpositive display rectangles return null", () => {
  const validRect = { left: 0, top: 0, width: 400, height: 300 };
  assert.equal(GameLayout.clientToCanvasPoint(NaN, 10, validRect), null);
  assert.equal(GameLayout.clientToCanvasPoint(10, 10, null), null);
  assert.equal(GameLayout.clientToCanvasPoint(10, 10, { ...validRect, width: 0 }), null);
  assert.equal(GameLayout.clientToCanvasPoint(10, 10, { ...validRect, height: -1 }), null);
  assert.equal(GameLayout.clientToCanvasPoint(10, 10, validRect, Infinity, 600), null);
});

test("Camera follows the Player center and clamps at all World edges", () => {
  const camera = GameLayout.createCamera(800, 600);
  const world = { width: 1600, height: 1200 };
  GameLayout.updateCamera(camera, { x: 780, y: 580, width: 40, height: 40 }, world);
  assert.deepEqual(camera, { x: 400, y: 300, width: 800, height: 600 });
  GameLayout.updateCamera(camera, { x: 0, y: 0, width: 40, height: 40 }, world);
  assert.deepEqual(camera, { x: 0, y: 0, width: 800, height: 600 });
  GameLayout.updateCamera(camera, { x: 1560, y: 1160, width: 40, height: 40 }, world);
  assert.deepEqual(camera, { x: 800, y: 600, width: 800, height: 600 });
});

test("screen/world transforms are explicit round trips and Camera rects are copies", () => {
  const camera = { x: 400, y: 300, width: 800, height: 600 };
  const screen = { x: 123, y: 234 };
  const world = GameLayout.screenToWorld(screen, camera);
  assert.deepEqual(world, { x: 523, y: 534 });
  assert.deepEqual(GameLayout.worldToScreen(world, camera), screen);
  const rectangle = GameLayout.getCameraWorldRect(camera);
  assert.deepEqual(rectangle, camera);
  assert.notEqual(rectangle, camera);
  assert.equal(GameLayout.intersectsCamera({ x: 1200, y: 400, width: 20, height: 20 }, camera), true);
  assert.equal(GameLayout.intersectsCamera({ x: 1221, y: 400, width: 20, height: 20 }, camera), false);
});

test("viewport shell keeps logical Canvas dimensions and isolates overlay input", () => {
  assert.match(indexSource, /<canvas id="gameCanvas" width="800" height="600"><\/canvas>/);
  assert.match(styleSource, /\.game-screen\s*\{[^}]*height:\s*100dvh;/s);
  assert.match(styleSource, /\.arena-overlay\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(styleSource, /\.intermission-banner\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(styleSource, /\.abandon-overlay,\s*\.upgrade-overlay\s*\{[^}]*pointer-events:\s*auto;/s);
  assert.match(styleSource, /\.playtest-panel\s*\{[^}]*position:\s*fixed;[^}]*overflow:\s*auto;/s);
});

test("Hub, meta, and Codex views remain viewport-bound with a dominant Play control", () => {
  assert.match(styleSource, /html,\s*body\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(styleSource, /\.hub-view,\s*\.meta-view,\s*\.codex-view\s*\{[^}]*min-height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
  assert.match(styleSource, /\.hub-panel,\s*\.meta-panel\s*\{[^}]*width:\s*min\(720px, calc\(100vw - 48px\)\);/s);
  assert.match(styleSource, /\.play-button\s*\{[^}]*min-height:\s*82px;/s);
  assert.match(styleSource, /\.meta-menu\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/s);
  assert.match(styleSource, /\.codex-panel\s*\{[^}]*max-height:\s*calc\(100dvh - 32px\);/s);
});
