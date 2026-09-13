// Persistent Enemy discovery state, deliberately separate from gameplay Save v2.
(function (global) {
  const STORAGE_KEY = "canva-war-enemy-discovery-v1";
  const VERSION = 1;

  function normalize(value, knownTypes = []) {
    if (!value || typeof value !== "object" || value.version !== VERSION || !Array.isArray(value.discovered)) {
      return { version: VERSION, discovered: [] };
    }
    const known = new Set(knownTypes);
    return { version: VERSION, discovered: [...new Set(value.discovered.filter(type =>
      typeof type === "string" && known.has(type)))] };
  }

  function load(storage, knownTypes) {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw), knownTypes) : normalize(null, knownTypes);
    } catch {
      return normalize(null, knownTypes);
    }
  }

  function createStore({ storage = global.localStorage, knownTypes = [] } = {}) {
    const allowed = new Set(knownTypes);
    const initial = load(storage, knownTypes);
    const discovered = new Set(initial.discovered);

    function persist() {
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, discovered: [...discovered] }));
      } catch {
        // Discovery persistence is optional and must never stop gameplay.
      }
    }

    function discover(type) {
      if (!allowed.has(type)) return false;
      const changed = !discovered.has(type);
      discovered.add(type);
      if (changed) persist();
      return changed;
    }

    return Object.freeze({
      has: type => discovered.has(type),
      discover,
      snapshot: () => Object.freeze([...discovered]),
      storageKey: STORAGE_KEY
    });
  }

  const api = Object.freeze({ STORAGE_KEY, VERSION, normalize, load, createStore });
  global.EnemyDiscovery = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
