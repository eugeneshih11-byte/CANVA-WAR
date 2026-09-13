const assert = require("node:assert/strict");
const test = require("node:test");
const EnemyDiscovery = require("../enemy-discovery.js");

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

const types = ["normal", "fast", "tank"];

test("missing and malformed discovery storage fail safely", () => {
  assert.deepEqual(EnemyDiscovery.createStore({ storage: storage(), knownTypes: types }).snapshot(), []);
  const broken = storage({ [EnemyDiscovery.STORAGE_KEY]: "{bad json" });
  assert.deepEqual(EnemyDiscovery.createStore({ storage: broken, knownTypes: types }).snapshot(), []);
  const wrongShape = storage({ [EnemyDiscovery.STORAGE_KEY]: JSON.stringify({ version: 2, discovered: ["normal"] }) });
  assert.deepEqual(EnemyDiscovery.createStore({ storage: wrongShape, knownTypes: types }).snapshot(), []);
});

test("discovery persists across independent Run and page-level stores", () => {
  const shared = storage();
  const first = EnemyDiscovery.createStore({ storage: shared, knownTypes: types });
  assert.equal(first.discover("normal"), true);
  assert.equal(first.discover("normal"), false);
  assert.equal(first.discover("unknown"), false);
  const reloaded = EnemyDiscovery.createStore({ storage: shared, knownTypes: types });
  assert.equal(reloaded.has("normal"), true);
  assert.deepEqual(reloaded.snapshot(), ["normal"]);
});

test("normalization removes unknown and duplicate Type ids", () => {
  assert.deepEqual(EnemyDiscovery.normalize({ version: 1,
    discovered: ["normal", "future", "normal", 4, "tank"] }, types),
  { version: 1, discovered: ["normal", "tank"] });
});
