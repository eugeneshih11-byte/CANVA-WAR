const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.textContent = "";
    this.hidden = false;
    this.className = "";
  }
  append(...children) { this.children.push(...children); }
  prepend(...children) { this.children.unshift(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute() {}
  addEventListener(type, callback) { this.listeners[type] = callback; }
  focus() {}
  select() {}
  click() { return this.listeners.click?.(); }
}

function descendants(node) {
  return [node, ...node.children.flatMap(descendants)];
}

function loadUi(encounters) {
  const body = new Element("body");
  const canvasArea = new Element("div");
  const gameInterface = new Element("main");
  body.append(canvasArea, gameInterface);
  const document = {
    body,
    createElement(tagName) { return new Element(tagName); },
    querySelector(selector) {
      assert.equal(selector, ".canvas-area");
      return canvasArea;
    },
    getElementById(id) {
      assert.equal(id, "gameInterface");
      return gameInterface;
    }
  };
  const run = {
    runSequence: 1,
    endReason: "death",
    finalPlayerLevel: 1,
    completed: true,
    settlement: null,
    encounters
  };
  const telemetry = {
    enabled: true,
    getCurrentRun() { return run; },
    getRunReport() { return { runs: [run] }; },
    getSessionReport() { return { runs: [run] }; }
  };
  const context = {
    document,
    navigator: { clipboard: { async writeText() {} } },
    console: { warn() {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "telemetry-ui.js"), "utf8");
  vm.runInContext(source, context, { filename: "telemetry-ui.js" });
  context.PlaytestUI.create(telemetry);
  const viewButton = descendants(body).find(node => node.tagName === "BUTTON" && node.textContent === "VIEW REPORT");
  assert.ok(viewButton);
  viewButton.click();
  return descendants(body);
}

function encounter(overrides) {
  return {
    type: "wave",
    waveIndex: 0,
    templateId: "basic",
    generatedThreat: 8,
    threatBudget: 8,
    encounterElapsedTime: 12.4,
    activeCombatTime: 12.4,
    actualClearTime: null,
    clearTimeRatio: null,
    analysis: { expectedClearTime: 22.5 },
    damageTaken: 2,
    peakActiveThreat: 4,
    averageActiveThreat: 3,
    pressureBlockedTime: 0,
    outcome: "death",
    ...overrides
  };
}

test("report UI shows elapsed time but no clear time or ratio for incomplete encounters", () => {
  const nodes = loadUi([
    encounter({ outcome: "death", actualClearTime: 12.4, clearTimeRatio: 0.55 }),
    encounter({ waveIndex: 1, outcome: "abandon", encounterElapsedTime: 7.25, activeCombatTime: 7.25 })
  ]);
  const cells = nodes.filter(node => node.tagName === "TD").map(node => node.textContent);
  assert.ok(cells.includes("Elapsed: 12.4s · Clear: — · Expected: 22.5s"));
  assert.ok(cells.includes("Elapsed: 7.25s · Clear: — · Expected: 22.5s"));
  assert.equal(cells.filter(value => value === "—").length >= 2, true);
  assert.equal(cells.includes("0.55"), false);
});

test("report UI shows numeric clear time and ratio for a cleared encounter", () => {
  const nodes = loadUi([encounter({
    outcome: "clear",
    encounterElapsedTime: 10,
    activeCombatTime: 10,
    actualClearTime: 10,
    clearTimeRatio: 10 / 22.5
  })]);
  const cells = nodes.filter(node => node.tagName === "TD").map(node => node.textContent);
  assert.ok(cells.includes("Elapsed: 10s · Clear: 10s · Expected: 22.5s"));
  assert.ok(cells.includes("0.44"));
});
