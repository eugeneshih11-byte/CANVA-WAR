# CANVA WAR

A 2D browser game built with HTML, CSS, vanilla JavaScript and an 800 x 600 logical Canvas. Only Stage 1 is implemented.

## Run locally

From this directory, run `python -m http.server 8080`, then open `http://localhost:8080`. Run the complete dependency-free automated suite with `node --test`.

Controls: WASD movement, mouse aiming, click to shoot, and 1/2/3 to choose a level-up upgrade. R restarts after Victory, Game Over or Abandon. The HUD's Abandon button opens a paused confirmation overlay; Continue or Escape resumes. Held movement input clears at encounter boundaries.

## Architecture and flow

`encounters.js` owns frozen Stage, Enemy evaluation, Template and Boss definitions, generation, validation, analysis, scaling and Wave runtime helpers. `game.js` retains existing movement, shooting, collision, XP, upgrades and saves and coordinates Run phases. `settlement.js` remains the authoritative Score-to-Points calculation and checkpoint implementation.

Run phases sit underneath the existing menu, result and upgrade-pause state:

```text
New Run -> STAGE_ENTER -> WAVE_ACTIVE
Wave Clear -> INTERMISSION -> next WAVE_ACTIVE
Wave 5 Clear -> INTERMISSION -> BOSS_ACTIVE
Successful Boss Clear -> STAGE_CLEAR -> STAGE_REWARD -> RUN_VICTORY
Lethal damage -> RUN_DEAD
```

Stage entry loads Stage 1, resets Template history, generates/analyzes Wave 1 and creates its runtime. Each Wave is generated once. Definitions contain content; separate runtimes contain elapsed combat time, group delays, released/spawned/alive counts, active Threat, damage taken, completion and encounter identity. Analyzer output is retained for later performance systems.

## Stage 1 configuration

Stage ID: `stage-1`. Five Waves. Enemy pool: normal, fast, tank. Mechanics: empty. Boss: `boss-1`. HP, Damage and Speed multipliers are all **1**, preserving original combat stats. `getScaledEnemyStats()` scales these independently and never scales Threat Cost.

| Wave | Threat Budget | MaxActiveThreat | Available Enemies | Templates |
|---|---:|---:|---|---|
| 1 | 8 | 4.5 | normal | Basic |
| 2 | 10 | 5.5 | normal, fast | Basic / Rush |
| 3 | 12 | 6.5 | normal, fast, tank | Basic / Rush / Heavy |
| 4 | 14 | 7.5 | normal, fast, tank | Rush / Heavy / Escalation |
| 5 | 17 | 9 | normal, fast, tank | Heavy / Escalation / Mixed |

Enemy evaluation: normal = frontline, Threat 1; fast = pressure, Threat 1.4; tank = frontline + heavy, Threat 2.2. Threat measures pressure independently of HP, Damage, XP and Score. Field pressure uses MaxActiveThreat, with safety guards of 8 active regular enemies and 18 generated enemies per Wave. The old infinite spawning and global 10-enemy difficulty limit are removed.

## Templates and generation

| Template | Threat allocation | Relative delays (seconds) | Bias / requirements |
|---|---|---|---|
| Basic | 55% / 45% | 0 / 2.5 | frontline weight x1.25 |
| Rush | 35% / 65% | 0 / 1.5 | pressure x1.8; requires pressure if available |
| Heavy | 45% / 55% | 0 / 2.8 | heavy x1.8; requires heavy if available |
| Escalation | 20% / 30% / 50% | 0 / 2 / 2.5 | increasing allocations |
| Mixed | 34% / 33% / 33% | 0 / 2 / 2.2 | requires frontline and pressure; reduces subsequent weights for already common Roles |

Templates describe tendencies, not fixed lists. Shares are target distributions because Enemy costs are discrete: the allocator chooses the closest legal grouping while preserving the Template's primary Group count whenever possible. If the selected composition cannot fit those Groups under Threat or count caps, it adds only the minimum required structural continuation Groups. A continuation after the final Template slot has delay 0, so the configured Template delay is counted once and the existing field-capacity gate controls its actual release. Delays remain relative to the previous Group's actual release.

`generateWave(stage, zeroBasedWaveIndex, context, rng = Math.random)` supports deterministic injected RNG. Recent Template weights are x0.35 for the previous Wave and x0.70 for two Waves ago; repeats remain possible. Each attempt selects an eligible Template, satisfies available required Roles, fills Threat, allocates groups and validates. Normal generation prefers at most 100% of budget; accepted fill is 85-110%.

Validation returns structured errors for malformed groups/delays/counts, unknown or locked Enemies, invalid Stage/Template restrictions, missing required Roles, unsafe group pressure/count, total count and fill tolerance. Generation makes at most 12 attempts. Failure uses a bounded deterministic fallback, satisfying required Roles first and then preferring normal, fast, tank. It splits content safely and validates before use. Impossible developer-supplied Stage restrictions fail explicitly; all five configured Waves have tested valid fallbacks. Errors are not shown in player UI.

## Runtime and analysis

A group releases in full only after its minimum delay and when both Threat and count capacity permit. There are no partial releases or `setTimeout` schedules. Every generated Enemy carries its Wave ID. Completion requires every group released and no living Enemy belonging to that Wave; a gap between groups cannot clear it. Contact removal reduces living count without awarding a kill, Score or XP. Existing bullet kills still award 1 Score, 1 XP and a persistent kill statistic.

`analyzeWave()` is pure evaluation metadata and awards nothing. It returns Threat, expected clear time, expected base Score, performance allowance and score capacity. Expected time is:

```text
2.5 seconds + max(sum of Enemy handling weights, sum of relative delays) + 0 mechanic time
```

Handling weights: normal 2.5 seconds, fast 2 seconds, tank 5.5 seconds. Player Damage and Build never change this expectation. Analysis-only Score references mirror current kills at 1 per Enemy; clear, Boss and performance references remain 0 because no live awards exist for them yet. Wave score capacity is expected base Score plus performance allowance. Boss analysis uses an uncalibrated 30-second expected time and zero/unassigned Threat and Score references. None of this analysis feeds Settlement Capacity yet.

Intermission lasts 4 seconds of active simulation time. Bullets and input clear on entry, movement remains available, and shooting, regular AI and spawning stop. The overlay displays the cleared Wave, next Wave or Boss Incoming, and the actual countdown. Upgrade choices and Abandon confirmation freeze all simulation timers.

## Boss and Stage completion

Boss 1 starts only after Wave 5 and its Intermission, independently of Level. Original size 100 x 100, HP 50, speed 50 and 1 contact damage with a 1-second cooldown remain. A dedicated top HP bar appears only in Boss combat. Future phase/add/support/mechanic fields are empty. Lethal HP alone does not persist a Boss defeat: the Player must survive collision resolution and formally complete the encounter. Player death takes priority over simultaneous Boss death.

Stage Clear records completion, preserves the save schema, and displays for 1.25 active seconds. `handleStageReward(stageContext)` is an empty boundary: no healing, rewards or Build changes. With no Stage 2 configured, the following phase settles Victory. There is no fake reward screen.

## Settlement and saves

Wave/Boss completion uses the existing ordered clear-Score and performance hooks before taking one secured checkpoint. The hooks currently award no new Score. Stage Clear does not create a second Boss checkpoint. Boss persistence occurs only after successful encounter completion.

Death and Victory settle the current Run state. Abandon settles the last secured encounter checkpoint; without a checkpoint, no settlement is awarded. Results display the returned Settlement Score and Points without recalculation. The existing logarithmic excess-Score curve, positive-exponent fallback and Capacity/performance-capacity placeholders are unchanged.

Only meta progression, unlocks, Points and statistics use localStorage. Existing storage-error fallback remains. Refresh, closing the page or a crash loses the active Run without settlement. There is no active-Run persistence or exit handler. New runs reset encounter state, timers, input, Player, bullets and enemies while retaining meta data. Existing `totalRuns` behavior is preserved: Play increments it; R uses the canonical reset without another increment. `highestStage` remains the highest reached Stage, currently 1; completed Boss IDs persist separately.

The dark HUD groups HP/Level/XP, Stage/Wave, and Score/Abandon. Inventory remains a placeholder. At <=1100 px it stacks below the Canvas; at <=600 px spacing compacts. CSS can shrink the display while drawing coordinates stay 800 x 600 and mouse aiming maps back to those coordinates.

## Verification and calibration notes

### Development-only Playtest Mode

Open `http://localhost:8080/?playtest=1` to record encounter composition, analysis/build snapshots, active combat and Intermission time, damage/low HP, shots/hits, kills versus contact removals, field pressure, spawn waiting, upgrades, and the exact existing Settlement result. Without that parameter there is no recording, badge, report UI or console API. Telemetry does not affect gameplay or Save; it stays in memory, keeps the latest 20 completed Runs, and disappears on refresh. Calibration constants remain placeholders and are unchanged.

At a result, choose **COPY RUN REPORT**, or **COPY SESSION REPORT** after multiple Runs. Both copy pretty-printed JSON; clipboard failure reveals selected text for manual copying. **VIEW REPORT** shows a concise session summary. The optional read-only `CanvaWarPlaytest` console API offers `getCurrentRun()`, `getSessionReport()` and `copySessionReport()`.

Timings follow active simulation updates, excluding upgrade/Abandon pauses. `encounterElapsedTime` and `activeCombatTime` measure observed combat for every Encounter; `actualClearTime` and `clearTimeRatio` are numeric only after a successful clear and remain `null` for Death, Abandon or other unfinished outcomes. Pressure and low-HP durations use pre-update state; averages integrate value × deltaTime. Pressure waiting counts only the part of a frame after the pending group's minimum delay, with separate blocked-interval counts. Spawn release times/peaks are sampled after scheduling. `waveIndex` is zero-based; `waveReached` is one-based. Per-type enemy-seconds measure presence, not causal difficulty. Export values are observations for later unassisted playtesting, not balance conclusions.

Baseline: 19 existing checks passed before editing. The expanded suite covers unlocks, Templates, injected RNG, recent weights, bounded retry/fallback, malformed content, 1,000 generated Waves, Analyzer purity, atomic release/ownership, contact removal, pauses, Intermission, complete Stage flow, Boss death priority/persistence, checkpoint ordering, Abandon, reset and protected Settlement math. The legacy Boss test now expects persistence at formal completion; its damage checks and the cooldown regression remain.

Browser verification used the local HTTP server. Live controls verified Play, Abandon cancel/confirm and restart. Temporary browser-only test controls drove real collision and update functions through Waves 1-5, Intermissions, Level 5 without Boss spawning, Boss HP presentation, Stage Clear, the empty reward boundary, Victory and Game Over. Intermission movement changed position while shooting produced no bullets. Desktop, 1000 px and 390 px layouts were inspected; no horizontal overflow or console warnings/errors were observed. Temporary controls were removed afterward. This was an assisted functional run, not a completed unassisted balance playthrough.

Threat curves/costs, active pressure, Template rhythm/bias, clear-time weights, Boss analysis and Stage scaling are **initial calibration placeholders**, not final balance. One assisted sample produced 43 kill Score and 12 Points with unchanged settlement economics; it does not establish a balance target. Collect unassisted clear times, damage, composition, Score and group-wait duration before tuning. Capacity and Points remain deliberately unrecalibrated. No final performance scoring, Stage 2, Weapon/Equipment/Item systems, Boss phases/adds, reward content or Run persistence are implemented.
