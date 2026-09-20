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

function reportContent(panel) {
  return descendants(panel)
    .filter(node => ["H3", "P", "TH", "TD"].includes(node.tagName))
    .map(node => [node.tagName, node.textContent]);
}

function loadUi(encounters, bridge = null) {
  const body = new Element("body");
  const canvasArea = new Element("div");
  const gameView = new Element("main");
  body.append(canvasArea, gameView);
  const document = {
    body,
    createElement(tagName) { return new Element(tagName); },
    querySelector(selector) {
      assert.equal(selector, ".canvas-area");
      return canvasArea;
    },
    getElementById(id) {
      assert.equal(id, "gameView");
      return gameView;
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
  context.PlaytestUI.create(telemetry, bridge);
  const viewButton = descendants(body).find(node => node.tagName === "BUTTON" && node.textContent === "VIEW REPORT");
  assert.ok(viewButton);
  viewButton.click();
  const panel = descendants(body).find(node => node.className === "playtest-panel");
  const closeButton = descendants(body)
    .find(node => node.tagName === "BUTTON" && node.textContent === "CLOSE REPORT");
  assert.ok(panel);
  assert.ok(closeButton);
  return { body, gameView, run, telemetry, viewButton, panel, closeButton,
    nodes() { return descendants(body); } };
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
    attackEvents: 4,
    shotsFired: 6,
    burstEffects: { burstAttacksInitiated: 0, burstShotsFired: 0,
      executionRounds: 0, executionFollowupsFired: 0, burstShotsCanceled: 0 },
    outcome: "death",
    ...overrides
  };
}

test("report UI shows elapsed time but no clear time or ratio for incomplete encounters", () => {
  const fixture = loadUi([
    encounter({ outcome: "death", actualClearTime: 12.4, clearTimeRatio: 0.55 }),
    encounter({ waveIndex: 1, outcome: "abandon", encounterElapsedTime: 7.25, activeCombatTime: 7.25 })
  ]);
  const nodes = fixture.nodes();
  const cells = nodes.filter(node => node.tagName === "TD").map(node => node.textContent);
  assert.ok(cells.includes("Elapsed: 12.4s · Clear: — · Expected: 22.5s"));
  assert.ok(cells.includes("Elapsed: 7.25s · Clear: — · Expected: 22.5s"));
  assert.equal(cells.filter(value => value === "—").length >= 2, true);
  assert.equal(cells.includes("0.55"), false);
  assert.ok(cells.includes("4 / 6"));
});

test("report UI shows numeric clear time and ratio for a cleared encounter", () => {
  const fixture = loadUi([encounter({
    outcome: "clear",
    encounterElapsedTime: 10,
    activeCombatTime: 10,
    actualClearTime: 10,
    clearTimeRatio: 10 / 22.5
  })]);
  const nodes = fixture.nodes();
  const cells = nodes.filter(node => node.tagName === "TD").map(node => node.textContent);
  assert.ok(cells.includes("Elapsed: 10s · Clear: 10s · Expected: 22.5s"));
  assert.ok(cells.includes("0.44"));
});

test("report UI exposes special behavior and enemy-separation outcomes", () => {
  const fixture = loadUi([encounter({
    interceptor: { attempts: 4, chargeContacts: 1, missedCharges: 3 },
    denier: { hazardsCreated: 2, hazardContacts: 1, hazardDamageEvents: 4 },
    support: { affectedEnemyTime: 5.25, affectedSpecialActions: 2, linksCreated: 3 },
    gunner: { bursts: 2, telegraphs: 2, telegraphCancels: 1,
      rangeBlockedTime: 1.25, losBlockedTime: 0.5 },
    enteringEnemyCount: 3, nearOffscreenEnemyCount: 2, returningEnemyCount: 1,
    enemyEnemyOverlapEvents: 8, enemyEnemySeparationCorrections: 12,
    maxEnemyEnemyPenetration: 17
  })]);
  const cells = fixture.nodes().filter(node => node.tagName === "TD").map(node => node.textContent);
  assert.ok(cells.includes("I 4/1/3 · D 2/1/4 · S 5.25s/2/3 · G 2/2/1 · Block 1.25s/0.5s · " +
    "Burst 0/0 · Exec 0/0 · Cancel 0"));
  assert.ok(cells.includes("E 3 · N 2 · R 1 · Sep 8/12/17"));
});

test("fixed report closes and reopens without either control changing report content", () => {
  const fixture = loadUi([encounter({ outcome: "clear", actualClearTime: 12.4, clearTimeRatio: 12.4 / 22.5 })]);
  const reportBefore = JSON.stringify(fixture.telemetry.getSessionReport());
  const contentBefore = reportContent(fixture.panel);

  assert.equal(fixture.panel.hidden, false);
  assert.equal(fixture.gameView.children.includes(fixture.panel), true);
  fixture.closeButton.click();
  assert.equal(fixture.panel.hidden, true);
  assert.deepEqual(reportContent(fixture.panel), contentBefore);
  assert.equal(JSON.stringify(fixture.telemetry.getSessionReport()), reportBefore);

  fixture.viewButton.click();
  assert.equal(fixture.panel.hidden, false);
  assert.deepEqual(reportContent(fixture.panel), contentBefore);
  assert.equal(JSON.stringify(fixture.telemetry.getSessionReport()), reportBefore);

  fixture.viewButton.click();
  assert.equal(fixture.panel.hidden, true);
  assert.deepEqual(reportContent(fixture.panel), contentBefore);
});

test("relay controls expose live status, retry, and manual download actions", () => {
  let retried = 0, downloaded = 0, listener = null;
  const bridge = {
    enabled: true,
    getStatus() { return { queueCount: 1, message: "Telemetry queued (1)." }; },
    subscribe(callback) { listener = callback; return () => {}; },
    retry() { retried++; },
    downloadPending() { downloaded++; }
  };
  const fixture = loadUi([encounter({ outcome: "clear" })], bridge);
  const retry = fixture.nodes().find(node => node.tagName === "BUTTON" && node.textContent === "RETRY TELEMETRY");
  const download = fixture.nodes().find(node => node.tagName === "BUTTON" && node.textContent === "DOWNLOAD TELEMETRY JSON");
  const transport = fixture.nodes().find(node => node.className.includes("playtest-transport-status"));
  assert.equal(retry.hidden, false);
  assert.equal(download.hidden, false);
  assert.equal(transport.textContent, "Telemetry queued (1).");
  retry.click(); download.click();
  assert.deepEqual({ retried, downloaded }, { retried: 1, downloaded: 1 });
  listener({ queueCount: 0, message: "Telemetry acknowledged." });
  assert.equal(retry.hidden, true);
  assert.equal(transport.textContent, "Telemetry acknowledged.");
});
