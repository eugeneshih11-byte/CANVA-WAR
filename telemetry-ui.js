// Development UI only. It reads reports and never changes game state.
(function (global) {
  function create(telemetry, bridge = null) {
    if (!telemetry?.enabled) return null;
    const element = (tag, text, className) => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    const badge = element("span", "PLAYTEST MODE", "playtest-badge");
    document.body.append(badge);
    const controls = element("div", "", "playtest-results");
    controls.hidden = true;
    document.querySelector(".canvas-area").append(controls);
    const panel = element("section", "", "playtest-panel");
    panel.hidden = true;
    panel.setAttribute("aria-label", "Playtest report");
    const closeReport = element("button", "CLOSE REPORT", "playtest-report-close");
    closeReport.type = "button";
    closeReport.addEventListener("click", () => { panel.hidden = true; });
    const summary = element("div");
    const raw = element("textarea");
    raw.readOnly = true;
    raw.hidden = true;
    raw.setAttribute("aria-label", "Report JSON for manual copy");
    const status = element("p", "", "playtest-status");
    status.setAttribute("role", "status");
    const transportStatus = element("p", "", "playtest-status playtest-transport-status");
    transportStatus.setAttribute("role", "status");
    panel.append(closeReport, summary, raw);
    document.getElementById("gameView").append(panel);
    controls.append(status, transportStatus);
    const warn = error => console.warn("Playtest report unavailable; gameplay continues.", error);
    const safe = action => (...args) => {
      try { return action(...args); } catch (error) { warn(error); return null; }
    };
    const format = value => Number.isFinite(value) ? Number(value.toFixed(2)).toString() : "—";
    const seconds = value => Number.isFinite(value) ? `${format(value)}s` : "—";
    const encounterTimeSummary = encounter => {
      const elapsed = encounter.encounterElapsedTime ?? encounter.activeCombatTime;
      const clear = encounter.outcome === "clear" ? encounter.actualClearTime : null;
      return `Elapsed: ${seconds(elapsed)} · Clear: ${seconds(clear)} · Expected: ${seconds(encounter.analysis?.expectedClearTime)}`;
    };
    const encounterClearRatio = encounter => encounter.outcome === "clear"
      ? format(encounter.clearTimeRatio)
      : "—";
    function renderReport() {
      summary.replaceChildren();
      for (const run of telemetry.getSessionReport().runs) {
        const result = run.settlement?.result;
        summary.append(element("h3", `Run ${run.runSequence} · ${run.endReason} · Level ${run.finalPlayerLevel}`));
        summary.append(element("p", result
          ? `Score ${result.finalScore} · Capacity ${format(result.efficientScoreCapacity)} · Effective Score ${format(result.effectiveScore)} · Points ${result.points}`
          : "No secured checkpoint · No settlement · Points 0"));
        const wrapper = element("div", "", "playtest-table-scroll");
        const table = element("table");
        const head = element("tr");
        ["Encounter", "Controller", "Fill / Progress", "Encounter time", "Clear ratio", "Attacks / projectiles", "Damage", "Peak count", "Placement", "Lifecycle", "Navigation health", "Special behavior", "Outcome"]
          .forEach(label => head.append(element("th", label)));
        const thead = element("thead"); thead.append(head); table.append(thead);
        const body = element("tbody");
        for (const encounter of run.encounters) {
          const row = element("tr");
          const values = [encounter.type === "boss" ? encounter.bossId : `Wave ${encounter.waveIndex + 1}`,
            encounter.type === "boss" ? "Boss" : (encounter.templateId || "continuous"), encounter.type === "boss" ? "—" :
              `V/P ${format(encounter.visibleFill)}/${format(encounter.projectedFill)} · avg ${format(encounter.averageVisibleFill)} · K ${format(encounter.currentWaveProgress)}/${format(encounter.K_target)} · N ${format(encounter.N_ref)} · Arm ${encounter.waveProgressReadinessBlockedReason || "unknown"} ${seconds(encounter.waveProgressReadinessStableTime)}`,
            encounterTimeSummary(encounter), encounterClearRatio(encounter),
            `${format(encounter.attackEvents)} / ${format(encounter.shotsFired)}`,
            format(encounter.damageTaken), format(encounter.peakActiveEnemyCount),
            `${format(encounter.spawnPlacementFailures)}/${format(encounter.spawnPlacementAttempts)} · fallback ${JSON.stringify(encounter.fallbackSpawnDistanceBand || {})}`,
            `E ${format(encounter.enteringEnemyCount)} · N ${format(encounter.nearOffscreenEnemyCount)} · R ${format(encounter.returningEnemyCount)} · ` +
              `Sep ${format(encounter.enemyEnemyOverlapEvents)}/${format(encounter.enemyEnemySeparationCorrections)}/${format(encounter.maxEnemyEnemyPenetration)}`,
            `Path ${format(encounter.pathRequests)}/${format(encounter.pathFailures)} · ` +
              `Recover ${format(encounter.forcedRepaths)}/${format(encounter.stuckRecoveries)} · ` +
              `No-progress ${seconds(encounter.maxNoProgressDuration)} · ` +
              `Offscreen ${seconds(encounter.enemyOffscreenEngagementTime + encounter.bossOffscreenTime)} · ` +
              `Boss blocks ${format(encounter.bossObstructionEvents)} · ` +
              `Empty camera ${seconds(encounter.cameraEmptyTerrainTime)}`,
            `${encounter.type === "boss" ? "—" :
              `I ${format(encounter.interceptor?.attempts)}/${format(encounter.interceptor?.chargeContacts)}/${format(encounter.interceptor?.missedCharges)} · ` +
              `D ${format(encounter.denier?.hazardsCreated)}/${format(encounter.denier?.hazardContacts)}/${format(encounter.denier?.hazardDamageEvents)} · ` +
              `S ${seconds(encounter.support?.affectedEnemyTime)}/${format(encounter.support?.affectedSpecialActions)}/${format(encounter.support?.linksCreated)} · ` +
              `G ${format(encounter.gunner?.bursts)}/${format(encounter.gunner?.telegraphs)}/${format(encounter.gunner?.telegraphCancels)} · ` +
              `Block ${seconds(encounter.gunner?.rangeBlockedTime)}/${seconds(encounter.gunner?.losBlockedTime)}`} · ` +
              `Burst ${format(encounter.burstEffects?.burstAttacksInitiated)}/${format(encounter.burstEffects?.burstShotsFired)}` +
              ` · Exec ${format(encounter.burstEffects?.executionRounds)}/${format(encounter.burstEffects?.executionFollowupsFired)}` +
              ` · Cancel ${format(encounter.burstEffects?.burstShotsCanceled)}`,
            encounter.outcome];
          values.forEach(value => row.append(element("td", String(value))));
          body.append(row);
        }
        table.append(body); wrapper.append(table); summary.append(wrapper);
      }
    }
    async function copyReport(session) {
      try {
        const report = session ? telemetry.getSessionReport() : telemetry.getRunReport();
        if (!report || !Array.isArray(report.runs)) throw new Error("Report snapshot could not be created");
        const json = JSON.stringify(report, null, 2);
        try {
          await navigator.clipboard.writeText(json);
          status.textContent = session ? "Session report copied." : "Run report copied.";
          raw.hidden = true;
        } catch (error) {
          console.warn("Playtest clipboard unavailable; use the selected report text.", error);
          panel.hidden = false;
          renderReport();
          raw.hidden = false;
          raw.value = json;
          raw.focus();
          raw.select();
          status.textContent = "Clipboard unavailable. Copy the selected JSON below.";
        }
        return json;
      } catch (error) {
        status.textContent = "Report unavailable. Gameplay is unaffected.";
        warn(error);
        return null;
      }
    }
    function button(label, action) {
      const node = element("button", label);
      node.type = "button";
      node.addEventListener("click", safe(action));
      controls.prepend(node);
      return node;
    }
    button("VIEW REPORT", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) renderReport();
    });
    const sessionButton = button("COPY SESSION REPORT", () => copyReport(true));
    button("COPY RUN REPORT", () => copyReport(false));
    const retryButton = button("RETRY TELEMETRY", () => bridge?.retry());
    const downloadButton = button("DOWNLOAD TELEMETRY JSON", () => bridge?.downloadPending());
    function refreshTransport(transport = bridge?.getStatus?.()) {
      retryButton.hidden = !transport?.queueCount;
      downloadButton.hidden = !bridge?.enabled;
      transportStatus.textContent = transport?.message || "";
    }
    bridge?.subscribe?.(refreshTransport);
    const refresh = safe(() => {
      const run = telemetry.getCurrentRun();
      controls.hidden = !(run?.completed || bridge?.enabled);
      sessionButton.hidden = telemetry.getSessionReport().runs.length < 2;
      panel.hidden = true;
      raw.hidden = true;
      status.textContent = "";
      refreshTransport();
    });
    global.CanvaWarPlaytest = Object.freeze({
      getCurrentRun: safe(() => telemetry.getCurrentRun()),
      getSessionReport: safe(() => telemetry.getSessionReport()),
      copySessionReport: () => copyReport(true)
    });
    refresh();
    return Object.freeze({ refresh, refreshTransport });
  }
  global.PlaytestUI = Object.freeze({ create });
})(globalThis);
