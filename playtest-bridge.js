// Optional Playtest transport. This module never participates in gameplay state or RNG.
(function (global) {
  const PORTAL_ORIGIN = "https://canva-war-private-playtest.eugeneshih11.chatgpt.site";
  const STORAGE_KEY = "canva-war-playtest-relay-v1";
  const MAX_QUEUE_ITEMS = 10;
  const TARGET_BYTES = 180000;
  const SESSION_PATTERN = /^CW-[0-9A-F]{20}$/;
  const BUILD_PATTERN = /^[0-9a-fA-F]{40}$/;
  const TEST_PLAN_PATTERN = /^[A-Z0-9-]{4,60}$/;
  const SUBMISSION_PATTERN = /^[A-Za-z0-9._:-]{8,80}$/;

  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const isPlaytest = search => {
    try { return new URLSearchParams(search || "").get("playtest") === "1"; }
    catch { return false; }
  };
  const byteLength = value => {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    let bytes = 0;
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : (code >= 0xd800 && code <= 0xdbff ? 4 : 3);
      if (code >= 0xd800 && code <= 0xdbff) index++;
    }
    return bytes;
  };
  const validDate = value => typeof value === "string" && Number.isFinite(Date.parse(value));
  const runKey = run => `${run?.runSequence ?? "?"}:${run?.startedAt || "?"}`;

  function readMetadata(hash) {
    try {
      const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
      const metadata = {
        sessionId: params.get("session") || "",
        testPlanId: params.get("testPlan") || "",
        buildId: params.get("build") || ""
      };
      return SESSION_PATTERN.test(metadata.sessionId) &&
        TEST_PLAN_PATTERN.test(metadata.testPlanId) && BUILD_PATTERN.test(metadata.buildId)
        ? Object.freeze(metadata) : null;
    } catch { return null; }
  }

  function create(options = {}) {
    const target = options.window || global;
    const location = options.location || target.location || {};
    const enabled = isPlaytest(options.search ?? location.search ?? "");
    if (!enabled) {
      const status = Object.freeze({ enabled: false, relayEnabled: false, queueCount: 0,
        status: "unavailable", message: "Telemetry relay unavailable outside Playtest Mode." });
      return Object.freeze({ enabled: false, relayEnabled: false, getStatus: () => status,
        submitCompletedRun: () => null, retry: () => 0, downloadPending: () => null,
        subscribe: () => () => {} });
    }

    const warn = (message, error) => {
      try { (options.warn || target.console?.warn)?.(`[Playtest bridge] ${message}`, error); }
      catch { /* Transport diagnostics must also fail open. */ }
    };
    const now = () => {
      try { return options.now ? options.now() : new Date().toISOString(); }
      catch { return new Date(0).toISOString(); }
    };
    const getTelemetry = options.getTelemetry || (() => null);
    const metadata = readMetadata(options.hash ?? location.hash ?? "");
    const history = options.history || target.history;
    if ((options.hash ?? location.hash) && history?.replaceState) {
      try { history.replaceState(history.state ?? null, "", `${location.pathname || ""}${location.search || ""}`); }
      catch (error) { warn("could not remove launch metadata from the URL", error); }
    }

    let opener = null;
    try { opener = options.opener !== undefined ? options.opener : target.opener; }
    catch (error) { warn("could not access the Portal opener", error); }
    let storage = null, storageAvailable = true;
    try { storage = options.storage !== undefined ? options.storage : target.localStorage; }
    catch (error) { storageAvailable = false; warn("retry storage unavailable", error); }
    let queue = [], state = "available", stateMessage = metadata
      ? "Telemetry relay ready."
      : "Relay unavailable: valid Session, Test Plan, and build metadata are required.";
    let lastSubmissionId = null;
    const listeners = new Set();
    const terminalRuns = new Set();
    const partialRuns = new Set();

    function snapshotStatus() {
      return Object.freeze({ enabled: true, relayEnabled: Boolean(metadata), queueCount: queue.length,
        status: state, message: stateMessage, storageAvailable, lastSubmissionId });
    }
    function notify() {
      const status = snapshotStatus();
      for (const listener of listeners) {
        try { listener(status); } catch (error) { warn("status listener failed", error); }
      }
    }
    function setStatus(nextState, message, submissionId = lastSubmissionId) {
      state = nextState;
      stateMessage = message;
      lastSubmissionId = submissionId || null;
      notify();
    }
    function isQueuePayload(payload) {
      return isObject(payload) && payload.schemaVersion === 1 &&
        SUBMISSION_PATTERN.test(payload.submissionId || "") && Array.isArray(payload.runs);
    }
    function loadQueue() {
      if (!storage?.getItem) { storageAvailable = false; return; }
      try {
        const stored = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
        if (Array.isArray(stored)) queue = stored.filter(isQueuePayload).slice(-MAX_QUEUE_ITEMS);
      } catch (error) {
        storageAvailable = false;
        warn("could not read retry queue", error);
      }
    }
    function saveQueue() {
      if (!storageAvailable || !storage?.setItem) return false;
      try { storage.setItem(STORAGE_KEY, JSON.stringify(queue)); return true; }
      catch (error) {
        storageAvailable = false;
        warn("could not save retry queue", error);
        return false;
      }
    }
    function createSubmissionId() {
      const crypto = options.crypto || target.crypto;
      try {
        if (typeof crypto?.randomUUID === "function") return `cw:${crypto.randomUUID()}`;
        if (typeof crypto?.getRandomValues === "function") {
          const values = new Uint32Array(4);
          crypto.getRandomValues(values);
          return `cw:${[...values].map(value => value.toString(16).padStart(8, "0")).join("")}`;
        }
      } catch (error) { warn("Web Crypto submission ID generation failed", error); }
      return null;
    }
    function preparePayload(report, run, uploadReason) {
      if (!metadata || !isObject(report) || !isObject(run)) return null;
      const submissionId = createSubmissionId();
      const startedAt = run.startedAt;
      const finishedAt = run.endedAt || now();
      if (!submissionId || !validDate(startedAt) || !validDate(finishedAt) ||
          Date.parse(finishedAt) < Date.parse(startedAt)) return null;
      const environment = isObject(report.environment) ? copy(report.environment) : {};
      const payload = { schemaVersion: 1, submissionId,
        sessionId: metadata.sessionId, buildId: metadata.buildId, testPlanId: metadata.testPlanId,
        startedAt, finishedAt, uploadReason, environment,
        configuration: isObject(report.configuration) ? copy(report.configuration) : {},
        runs: [copy(run)] };
      let size = byteLength(payload), omittedConfiguration = false;
      if (size >= TARGET_BYTES) {
        delete payload.configuration;
        const omissions = Array.isArray(payload.environment.transportOmissions)
          ? payload.environment.transportOmissions.filter(value => value !== "configuration") : [];
        payload.environment.transportOmissions = [...omissions, "configuration"];
        omittedConfiguration = true;
        size = byteLength(payload);
      }
      return { payload, size, omittedConfiguration, oversized: size >= TARGET_BYTES };
    }
    function enqueue(prepared) {
      if (!prepared) return null;
      queue = queue.filter(item => item.submissionId !== prepared.payload.submissionId);
      queue.push(prepared.payload);
      if (queue.length > MAX_QUEUE_ITEMS) queue = queue.slice(-MAX_QUEUE_ITEMS);
      saveQueue();
      setStatus("queued", prepared.oversized
        ? `Telemetry queued but too large to relay (${prepared.size} bytes). Download it manually.`
        : `Telemetry queued (${queue.length}).`, prepared.payload.submissionId);
      return prepared.payload;
    }
    function hasUsableOpener() {
      try { return Boolean(opener && !opener.closed && typeof opener.postMessage === "function"); }
      catch (error) { warn("Portal opener is unavailable", error); return false; }
    }
    function matchesLaunch(payload) {
      return metadata && payload.sessionId === metadata.sessionId &&
        payload.testPlanId === metadata.testPlanId && payload.buildId === metadata.buildId;
    }
    function sendPending() {
      if (!queue.length) return 0;
      if (!metadata || !hasUsableOpener()) {
        setStatus("unavailable", metadata
          ? `Telemetry queued (${queue.length}); keep or reopen it from the Playtest Portal to retry.`
          : `Telemetry queued (${queue.length}); relay metadata is unavailable.`);
        return 0;
      }
      let sent = 0;
      for (const payload of queue) {
        if (!matchesLaunch(payload) || byteLength(payload) >= TARGET_BYTES) continue;
        try {
          opener.postMessage({ type: "canva-war:telemetry", payload }, PORTAL_ORIGIN);
          sent++;
        } catch (error) { warn("postMessage failed", error); }
      }
      if (sent) setStatus("sent", `Sent ${sent} queued telemetry submission${sent === 1 ? "" : "s"}; awaiting acknowledgement.`);
      else setStatus("queued", `Telemetry remains queued (${queue.length}).`);
      return sent;
    }
    function submitCompletedRun(report, endReason) {
      try {
        const runs = Array.isArray(report?.runs) ? report.runs : [];
        const run = runs.at(-1);
        if (!metadata || !run?.completed) return null;
        const key = runKey(run);
        if (terminalRuns.has(key)) return null;
        const reason = ({ victory: "run-victory", death: "run-death", abandon: "run-abandon" })
          [endReason || run.endReason] || "run-complete";
        const prepared = preparePayload(report, run, reason);
        if (!prepared) {
          setStatus("unavailable", "Telemetry relay payload could not be created. Download the report manually.");
          return null;
        }
        terminalRuns.add(key);
        const payload = enqueue(prepared);
        if (!prepared.oversized) sendPending();
        return copy(payload);
      } catch (error) { warn("completed Run submission failed", error); return null; }
    }
    function pagehide() {
      try {
        if (!metadata) return;
        const report = getTelemetry()?.getRunReport?.();
        const run = Array.isArray(report?.runs) ? report.runs[0] : null;
        if (!run || run.completed !== false) return;
        const key = runKey(run);
        if (terminalRuns.has(key) || partialRuns.has(key)) return;
        const prepared = preparePayload(report, run, "pagehide");
        if (!prepared) return;
        partialRuns.add(key);
        enqueue(prepared);
        if (!prepared.oversized) sendPending();
      } catch (error) { warn("pagehide snapshot failed", error); }
    }
    function handleResult(event) {
      try {
        if (event.origin !== PORTAL_ORIGIN || event.source !== opener) return;
        const result = event.data;
        if (!isObject(result) || result.type !== "canva-war:telemetry-result" ||
            !SUBMISSION_PATTERN.test(result.submissionId || "")) return;
        const index = queue.findIndex(item => item.submissionId === result.submissionId);
        if (index < 0) return;
        if (result.ok !== true) {
          setStatus("queued", `Portal rejected telemetry; submission remains queued${result.error ? `: ${String(result.error).slice(0, 160)}` : "."}`,
            result.submissionId);
          return;
        }
        queue.splice(index, 1);
        saveQueue();
        setStatus("acknowledged", `Telemetry acknowledged${result.duplicate ? " as an existing submission" : ""}.`, result.submissionId);
      } catch (error) { warn("acknowledgement handling failed", error); }
    }
    function manualBundle() {
      if (queue.length) return { schemaVersion: 1, exportedAt: now(), payloads: copy(queue) };
      const telemetry = getTelemetry();
      const report = telemetry?.getRunReport?.() || telemetry?.getSessionReport?.();
      const run = Array.isArray(report?.runs) ? report.runs.at(-1) : null;
      if (metadata && run) return preparePayload(report, run, "manual-export")?.payload || report;
      return report || { schemaVersion: 1, runs: [] };
    }
    function downloadPending() {
      try {
        const json = JSON.stringify(manualBundle(), null, 2);
        const filename = `canva-war-playtest-telemetry-${now().replace(/[:.]/g, "-")}.json`;
        if (typeof options.download === "function") options.download({ filename, json });
        else {
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = target.document?.createElement?.("a");
          if (!link) throw new Error("Download link unavailable");
          link.href = url; link.download = filename; link.hidden = true;
          target.document.body?.append?.(link); link.click(); link.remove?.();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }
        setStatus(state, "Telemetry JSON downloaded.");
        return json;
      } catch (error) {
        setStatus("unavailable", "Telemetry download is unavailable; existing report copy controls still work.");
        warn("manual download failed", error);
        return null;
      }
    }

    loadQueue();
    if (queue.length) stateMessage = `Telemetry queued (${queue.length}).`;
    if (metadata && target.addEventListener) {
      target.addEventListener("message", handleResult);
      target.addEventListener("pagehide", pagehide);
    }
    if (queue.length) sendPending();

    return Object.freeze({ enabled: true, relayEnabled: Boolean(metadata),
      getStatus: () => snapshotStatus(),
      submitCompletedRun, retry: sendPending, downloadPending,
      subscribe(listener) {
        if (typeof listener !== "function") return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    });
  }

  global.PlaytestBridge = Object.freeze({ create, PORTAL_ORIGIN, STORAGE_KEY });
})(globalThis);
