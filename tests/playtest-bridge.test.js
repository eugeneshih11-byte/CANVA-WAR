const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "playtest-bridge.js"), "utf8");
const validHash = "#session=CW-0123456789ABCDEF0123&testPlan=CW-GENERAL-MVP-01&build=0123456789abcdef0123456789abcdef01234567";
const plain = value => JSON.parse(JSON.stringify(value));

function completedRun(sequence = 1, overrides = {}) {
  const second = String(sequence).padStart(2, "0");
  return { runSequence: sequence, startedAt: `2026-09-20T00:00:${second}.000Z`,
    endedAt: `2026-09-20T00:01:${second}.000Z`, endReason: "death", completed: true,
    encounters: [{ waveIndex: 0 }], ...overrides };
}

function report(run = completedRun(), overrides = {}) {
  return { schemaVersion: 1, generatedAt: "2026-09-20T00:02:00.000Z",
    environment: { playtestMode: true }, configuration: { marker: "config" }, runs: [run], ...overrides };
}

function fixture(options = {}) {
  const listeners = {}, messages = [], historyCalls = [], storageMap = new Map(), downloads = [];
  const opener = options.opener === undefined ? {
    closed: false,
    postMessage(message, origin) { messages.push([plain(message), origin]); }
  } : options.opener;
  const storage = options.storage || {
    getItem(key) { return storageMap.get(key) ?? null; },
    setItem(key, value) { storageMap.set(key, String(value)); }
  };
  let uuid = 0;
  const context = {
    Date, URLSearchParams, Uint32Array,
    location: { search: options.search ?? "?playtest=1", hash: options.hash ?? validHash,
      pathname: "/CANVA-WAR/" },
    history: { state: { portal: true }, replaceState(...args) { historyCalls.push(args); } },
    localStorage: storage,
    opener,
    crypto: { randomUUID() { return `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`; } },
    console: { warn() {} },
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "playtest-bridge.js" });
  const bridge = context.PlaytestBridge.create({
    getTelemetry: options.getTelemetry || (() => null),
    download: data => downloads.push(data),
    now: options.now || (() => "2026-09-20T00:03:00.000Z")
  });
  const dispatch = (type, event = {}) => (listeners[type] || []).forEach(listener => listener(event));
  return { bridge, context, opener, storage, storageMap, messages, historyCalls, downloads, dispatch };
}

test("valid launch metadata enables relay and is removed while the playtest query remains", () => {
  const f = fixture();
  assert.equal(f.bridge.getStatus().relayEnabled, true);
  assert.deepEqual(plain(f.historyCalls), [[{ portal: true }, "", "/CANVA-WAR/?playtest=1"]]);
});

test("missing or invalid launch fields disable only the relay", () => {
  for (const hash of ["", "#session=CW-0123&testPlan=CW-GENERAL-MVP-01&build=0123456789abcdef0123456789abcdef01234567",
    "#session=CW-0123456789ABCDEF0123&testPlan=bad_plan&build=0123456789abcdef0123456789abcdef01234567",
    "#session=CW-0123456789ABCDEF0123&testPlan=CW-GENERAL-MVP-01&build=short"]) {
    const f = fixture({ hash });
    assert.equal(f.bridge.enabled, true);
    assert.equal(f.bridge.relayEnabled, false);
    assert.equal(f.messages.length, 0);
  }
});

test("one completed Run becomes one schema-v1 payload containing only that Run", () => {
  const f = fixture();
  const run = completedRun();
  const payload = f.bridge.submitCompletedRun(report(run), "death");
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.uploadReason, "run-death");
  assert.equal(payload.runs.length, 1);
  assert.deepEqual(plain(payload.runs[0]), run);
  assert.equal(f.messages.length, 1);
  assert.deepEqual(f.messages[0][0].payload, plain(payload));
  assert.equal(f.messages[0][1], f.context.PlaytestBridge.PORTAL_ORIGIN);
});

test("queued retries preserve the stable submission ID", () => {
  const opener = { closed: true, postMessage() { throw new Error("closed"); } };
  const f = fixture({ opener });
  const payload = f.bridge.submitCompletedRun(report(), "death");
  assert.equal(f.bridge.getStatus().queueCount, 1);
  opener.closed = false;
  opener.postMessage = (message, origin) => f.messages.push([plain(message), origin]);
  f.bridge.retry();
  f.bridge.retry();
  assert.equal(f.messages.length, 2);
  assert.equal(f.messages[0][0].payload.submissionId, payload.submissionId);
  assert.equal(f.messages[1][0].payload.submissionId, payload.submissionId);
});

test("a later matching Playtest Portal load sends the persisted retry queue", () => {
  const first = fixture({ opener: null });
  const payload = first.bridge.submitCompletedRun(report(), "death");
  const later = fixture({ storage: first.storage });
  assert.equal(later.messages.length, 1);
  assert.equal(later.messages[0][0].payload.submissionId, payload.submissionId);
});

test("retry queue keeps only the newest ten payloads", () => {
  const f = fixture({ opener: null });
  for (let sequence = 1; sequence <= 12; sequence++) {
    f.bridge.submitCompletedRun(report(completedRun(sequence)), "death");
  }
  const stored = JSON.parse(f.storageMap.get(f.context.PlaytestBridge.STORAGE_KEY));
  assert.equal(stored.length, 10);
  assert.equal(stored[0].runs[0].runSequence, 3);
  assert.equal(stored.at(-1).runs[0].runSequence, 12);
});

test("a valid acknowledgement removes only its matching queue item", () => {
  const f = fixture();
  const first = f.bridge.submitCompletedRun(report(completedRun(1)), "death");
  const second = f.bridge.submitCompletedRun(report(completedRun(2)), "victory");
  f.dispatch("message", { origin: f.context.PlaytestBridge.PORTAL_ORIGIN, source: f.opener,
    data: { type: "canva-war:telemetry-result", submissionId: first.submissionId, ok: true, duplicate: false } });
  assert.equal(f.bridge.getStatus().queueCount, 1);
  const stored = JSON.parse(f.storageMap.get(f.context.PlaytestBridge.STORAGE_KEY));
  assert.deepEqual(stored.map(item => item.submissionId), [second.submissionId]);
});

test("wrong origin, source, or submission ID cannot clear queued data", () => {
  const f = fixture();
  const payload = f.bridge.submitCompletedRun(report(), "death");
  const result = { type: "canva-war:telemetry-result", submissionId: payload.submissionId, ok: true };
  f.dispatch("message", { origin: "https://example.com", source: f.opener, data: result });
  f.dispatch("message", { origin: f.context.PlaytestBridge.PORTAL_ORIGIN, source: {}, data: result });
  f.dispatch("message", { origin: f.context.PlaytestBridge.PORTAL_ORIGIN, source: f.opener,
    data: { ...result, submissionId: "cw:unmatched-submission" } });
  assert.equal(f.bridge.getStatus().queueCount, 1);
});

test("Portal failure acknowledgement leaves the exact submission queued for export", () => {
  const f = fixture();
  const payload = f.bridge.submitCompletedRun(report(), "death");
  f.dispatch("message", { origin: f.context.PlaytestBridge.PORTAL_ORIGIN, source: f.opener,
    data: { type: "canva-war:telemetry-result", submissionId: payload.submissionId,
      ok: false, error: "temporary rejection" } });
  assert.equal(f.bridge.getStatus().queueCount, 1);
  assert.match(f.bridge.getStatus().message, /temporary rejection/);
  assert.equal(JSON.parse(f.bridge.downloadPending()).payloads[0].submissionId, payload.submissionId);
});

test("missing or closed opener leaves the submission queued", () => {
  for (const opener of [null, { closed: true, postMessage() {} }]) {
    const f = fixture({ opener });
    f.bridge.submitCompletedRun(report(), "death");
    assert.equal(f.bridge.getStatus().queueCount, 1);
    assert.equal(f.messages.length, 0);
  }
});

test("storage exceptions are contained while in-memory relay and export remain usable", () => {
  const storage = { getItem() { throw new Error("read denied"); }, setItem() { throw new Error("write denied"); } };
  const f = fixture({ storage });
  assert.doesNotThrow(() => f.bridge.submitCompletedRun(report(), "death"));
  assert.equal(f.messages.length, 1);
  assert.equal(f.bridge.getStatus().queueCount, 1);
  assert.equal(f.bridge.getStatus().storageAvailable, false);
  assert.ok(f.bridge.downloadPending().includes("submissionId"));
});

test("size fallback omits only configuration and never truncates Run data", () => {
  const f = fixture();
  const marker = "c".repeat(190000);
  const payload = f.bridge.submitCompletedRun(report(completedRun(), { configuration: { marker } }), "death");
  assert.equal("configuration" in payload, false);
  assert.deepEqual(plain(payload.environment.transportOmissions), ["configuration"]);
  assert.equal(payload.runs[0].encounters[0].waveIndex, 0);

  const oversized = fixture();
  const run = completedRun(1, { untruncatedRunData: "r".repeat(190000) });
  const largePayload = oversized.bridge.submitCompletedRun(report(run), "death");
  assert.equal(largePayload.runs[0].untruncatedRunData.length, 190000);
  assert.equal(oversized.messages.length, 0);
  assert.match(oversized.bridge.getStatus().message, /too large/i);
});

test("pagehide sends a partial snapshot without mutating or completing the Run", () => {
  const run = completedRun(1, { endedAt: null, completed: false, endReason: null });
  const original = JSON.stringify(run);
  const f = fixture({ getTelemetry: () => ({ getRunReport: () => report(run) }) });
  f.dispatch("pagehide");
  assert.equal(JSON.stringify(run), original);
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0][0].payload.uploadReason, "pagehide");
  assert.equal(f.messages[0][0].payload.runs[0].completed, false);
  f.dispatch("pagehide");
  assert.equal(f.messages.length, 1);
});

test("manual JSON download remains available without relay metadata", () => {
  const run = completedRun();
  const f = fixture({ hash: "", getTelemetry: () => ({ getSessionReport: () => report(run) }) });
  const json = f.bridge.downloadPending();
  assert.deepEqual(JSON.parse(json).runs, [run]);
  assert.equal(f.downloads.length, 1);
  assert.match(f.downloads[0].filename, /^canva-war-playtest-telemetry-/);
});

test("manual download uses a one-Run manual-export payload when launch metadata is valid", () => {
  const run = completedRun();
  const f = fixture({ getTelemetry: () => ({ getRunReport: () => report(run) }) });
  const payload = JSON.parse(f.bridge.downloadPending());
  assert.equal(payload.uploadReason, "manual-export");
  assert.equal(payload.runs.length, 1);
  assert.deepEqual(payload.runs[0], run);
});

test("normal mode performs no fragment, storage, opener, or messaging work", () => {
  let storageReads = 0, openerReads = 0, listeners = 0;
  const context = { Date, URLSearchParams,
    location: { search: "", get hash() { throw new Error("hash accessed"); }, pathname: "/CANVA-WAR/" },
    get localStorage() { storageReads++; return {}; },
    get opener() { openerReads++; return {}; },
    addEventListener() { listeners++; }, console: { warn() {} } };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  const bridge = context.PlaytestBridge.create();
  assert.equal(bridge.enabled, false);
  assert.deepEqual({ storageReads, openerReads, listeners }, { storageReads: 0, openerReads: 0, listeners: 0 });
});

test("telemetry owner remains free of storage, messaging, and RNG transport dependencies", () => {
  const telemetrySource = fs.readFileSync(path.join(__dirname, "..", "telemetry.js"), "utf8");
  assert.doesNotMatch(telemetrySource, /localStorage|postMessage|Math\.random|randomUUID|getRandomValues/);
});
