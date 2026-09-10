# CANVA WAR

A 2D browser game built with HTML, CSS, vanilla JavaScript and an 800 x 600 logical Canvas. Only Stage 1 is implemented.

## Run locally

From this directory, run `python -m http.server 8080`, then open `http://localhost:8080`. Run the complete dependency-free automated suite with `node --test`.

Combat Variety v1.1 is an experimental behavior-validation correction pass, not permanent Stage 1 content. Launch it with `http://localhost:8080/?prototype=combat-variety-v1`. Add telemetry independently with `http://localhost:8080/?playtest=1&prototype=combat-variety-v1`; `?playtest=1` by itself keeps Calibration A gameplay unchanged.

Local script URLs use an explicit version query to prevent stale browser JavaScript during development and playtesting. Bump the shared version string when a new test build must load guaranteed fresh assets.

Controls: WASD movement, mouse aiming, hold the primary mouse button to fire, and click a level-up card or press 1/2/3 to choose its upgrade. R restarts after Victory, Game Over or Abandon. The HUD's Abandon button opens a paused confirmation overlay; Continue or Escape resumes. Held movement and firing input clear at encounter boundaries.

## Architecture and flow

`encounters.js` owns frozen Stage, Enemy evaluation, Template and Boss definitions, generation, validation, analysis, scaling and Wave runtime helpers. `behaviors.js` owns extensible regular-Enemy behavior profiles, per-Enemy mutable behavior runtimes, locked prediction, hazard lifetime and dynamic support relationships; Boss 1 deliberately keeps its curated state machine in `game.js`. `weapons.js` owns immutable Weapon definitions, the technical Fire Rate cap and deterministic projectile-direction math. `build.js` owns immutable Upgrade definitions plus pure Build creation, validation, choice and stat-resolution helpers. `layout.js` owns pure 800 x 600 display sizing and display-to-world pointer conversion. `game.js` coordinates those modules with movement, firing, collision, XP, Run phases and saves. `settlement.js` remains the authoritative Score-to-Points calculation and checkpoint implementation.

## Combat Variety v1.1 correction pass

The normal `STAGES` plan remains Calibration A. `getStagesForSearch()` selects a separate frozen prototype plan only for the exact `prototype=combat-variety-v1` value, without reading or writing Save data. The prototype retains the Stage 1 Threat curve `[8, 10, 12, 14, 17]`, MaxActiveThreat curve `[6, 7, 8.5, 10, 12]`, existing allocator/validation limits and all Enemy costs. Its generation constraints reserve room inside those budgets for exactly one Interceptor in Wave 3, one Denier in Wave 4, and one Support plus one Interceptor in Wave 5. The Wave 5 pair is additionally constrained to the same primary spawn group without bypassing normal allocation or adding budget.

Regular Enemy definitions now pair immutable stats and Roles with a behavior profile. Each spawned Enemy receives an independent runtime containing state, elapsed state time, cooldown and locked target data. Registry-dispatched profiles keep the main update loop free of type-specific branches:

- **Interceptor:** takes its first special action after about 0.9 seconds, then runs CHASE -> 0.55-second TELEGRAPH -> locked-vector CHARGE -> RECOVERY. It predicts once, commits for up to 520 logical pixels, never retargets during the charge, and stops at the arena boundary.
- **Denier:** takes its first cast after about 0.9 seconds, predicts once, telegraphs for 0.75 seconds, then leaves a fixed danger zone active for 3 seconds. Remaining inside can deal damage every second; all overlapping Denier zones share one Player-side cooldown so they cannot burst simultaneously.
- **Support:** establishes one persistent, distance-independent Link to an eligible Interceptor or Denier. The linked special recovers ability cooldown at x1.75. Removing the Support breaks the effect immediately; removing its target allows a new eligible target to be linked. Normal, Fast, Tank, Support and Boss targets are ineligible.

Each special receives a compact Enemy Introduction once per Run immediately before its first Wave. This is a noncombat phase after Intermission: movement, attacks, spawning, AI, hazards and combat timers remain frozen. Introduction state resets on a new Run. All provisional prototype stats and timings are centralized in `COMBAT_VARIETY_V1`. Behavior and hazard timers advance only from active Wave combat updates. Pending/active hazards and Support Links clear at Wave end, Boss entry, death, Abandon, Victory and restart. Charge movement uses the existing bounded Enemy collision and overlap-recovery policy.

Run phases sit underneath the existing menu, result and upgrade-pause state:

```text
New Run -> STAGE_ENTER -> WAVE_ACTIVE
Wave Clear -> INTERMISSION -> optional ENEMY_INTRODUCTION -> next WAVE_ACTIVE
Wave 5 Clear -> INTERMISSION -> BOSS_ACTIVE
Successful Boss Clear -> STAGE_CLEAR -> STAGE_REWARD -> RUN_VICTORY
Lethal damage -> RUN_DEAD
```

Stage entry loads Stage 1, resets Template history, generates/analyzes Wave 1 and creates its runtime. Each Wave is generated once. Definitions contain content; separate runtimes contain elapsed combat time, group delays, released/spawned/alive counts, active Threat, damage taken, completion and encounter identity. Analyzer output is retained for later performance systems.

## Weapons and Run Builds

The immutable `starter` Weapon is the only Weapon definition: name **Starter**, Damage 1, Fire Rate 4 attacks/second, Bullet Speed 480, Bullet Size 10, Projectile Count 1, Spread 0 degrees and Pierce 0. Runtime code resolves a fresh stat snapshot from that definition and the current Build; it does not rewrite the definition. Fire Rate has a technical ceiling of 12 attacks/second.

The Build is a current-Run stack map. `resolveWeaponStats()` and `resolvePlayerStats()` derive combat values in one place, `canSelectUpgrade()` enforces caps, `generateUpgradeChoices()` samples eligible definitions without replacement, and `applyUpgrade()` returns a new Build result. Heavy Shot's flat Damage is applied before Split Shot's per-projectile multiplier. The five equally weighted upgrades are:

| Upgrade | Effect per selection | Cap |
|---|---|---:|
| Rapid Fire | Fire Rate x1.2 | 4 |
| Heavy Shot | Damage +1, Bullet Size +1, Fire Rate x0.92 | 4 |
| Split Shot | Projectile Count +1 and 12-degree spacing; total Split stacks set per-projectile Damage to x0.75 / x0.65 | 2 |
| Vitality | Max HP +1 and heal 1 HP, capped at the resolved maximum | 3 |
| Swift Feet | movement Speed x1.08 | 4 |

Each level-up displays up to three formal cards with current stack and cap information. Mouse selection and 1/2/3 choose the matching visible card; Escape cannot dismiss the required choice. Maxed upgrades are excluded, and the Run resumes safely if every upgrade is already capped. Choice generation receives a private seeded RNG stream, so it does not consume or share the Wave Generator's RNG state.

Holding the primary mouse button requests attacks at the resolved Fire Rate. Cooldown advances only with active combat simulation, allows at most one attack per update and never emits a delayed burst to catch up after a long frame. Upgrade and Abandon pauses freeze it. Starting a new Encounter makes the Weapon ready and clears held firing state; Intermission, death, Victory, Abandon, restart and focus loss also clear held firing so input cannot leak across transitions.

An attack is one trigger event and may emit multiple projectiles. Split Shot places projectile directions symmetrically around the aim angle, while the unmodified Starter keeps the original single straight shot. Each projectile carries its resolved Damage, size, speed and Pierce budget. A projectile can hit each regular Enemy or Boss at most once; Pierce permits additional distinct targets before removal. Starter Pierce remains 0, so current base behavior is unchanged.

## Stage 1 configuration

Stage ID: `stage-1`. Five Waves. Enemy pool: normal, fast, tank. Mechanics: empty. Boss: `boss-1`. HP, Damage and Speed multipliers are all **1**, preserving original combat stats. `getScaledEnemyStats()` scales these independently and never scales Threat Cost.

| Wave | Threat Budget | MaxActiveThreat | Available Enemies | Templates |
|---|---:|---:|---|---|
| 1 | 8 | 6 | normal | Basic |
| 2 | 10 | 7 | normal, fast | Basic / Rush |
| 3 | 12 | 8.5 | normal, fast, tank | Basic / Rush / Heavy |
| 4 | 14 | 10 | normal, fast, tank | Rush / Heavy / Escalation |
| 5 | 17 | 12 | normal, fast, tank | Heavy / Escalation / Mixed |

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

Spawn placement keeps the original two random samples per Enemy, then checks a bounded deterministic sequence of edge candidates only when the first position overlaps another living Enemy from the active Wave. If overlap still exists, movement may accept a step only when it lowers total AABB penetration without introducing a new collider. A deterministic axis recovery handles pursuit steps that cannot improve the overlap. New collisions remain rejected, dead or stale-Wave Enemies do not block movement, and no recovery path consumes randomness.

`analyzeWave()` is pure evaluation metadata and awards nothing. It returns Threat, expected clear time, expected base Score, performance allowance and score capacity. Expected time is:

```text
2.5 seconds + sum of Enemy handling weights + sum of relative delays + 0 mechanic time
```

Handling weights: normal 0.40 seconds, fast 0.25 seconds, tank 1.00 second. Player Damage and Build never change this expectation. Eight Normal enemies in the two-group Basic Wave produce `2.5 + (8 x 0.40) + 2.5 = 8.2` seconds; a two-group seven-Fast Rush reference produces `2.5 + (7 x 0.25) + 1.5 = 5.75` seconds. Analysis-only Score references mirror current kills at 1 per Enemy; clear, Boss and performance references remain 0 because no live awards exist for them yet. Wave score capacity is expected base Score plus performance allowance. Boss analysis uses a provisional 15-second expected time and zero/unassigned Threat and Score references. None of this analysis feeds Settlement Capacity yet.

Intermission lasts 4 seconds of active simulation time. Bullets and input clear on entry, movement remains available, and shooting, regular AI and spawning stop. A compact translucent upper-arena banner displays the cleared Wave, next Wave or Boss Incoming, and the actual countdown without covering the central playfield. Upgrade choices and Abandon confirmation freeze all simulation timers.

## Boss and Stage completion

Boss 1 starts only after Wave 5 and its Intermission, independently of Level. It is 100 x 100 with HP 100, chase speed 60 and 1 contact damage with the existing 1-second cooldown. Its deterministic cycle is CHASE -> TELEGRAPH -> CHARGE -> RECOVERY -> CHASE. The initial chase lasts 2.5 seconds; later chase windows last 2 seconds. TELEGRAPH lasts 0.65 seconds, stops chase movement and displays the locked charge direction. CHARGE lasts at most 0.45 seconds at speed 420 without homing, ending early at an arena boundary. RECOVERY freezes the Boss for 0.55 seconds. No phase consumes RNG.

A dedicated top HP bar appears only in Boss combat. Lethal HP alone does not persist a Boss defeat: the Player must survive collision resolution and formally complete the encounter. Player death takes priority over simultaneous Boss death.

Stage Clear records completion, preserves the save schema, and displays for 1.25 active seconds. `handleStageReward(stageContext)` is an empty boundary: no healing, rewards or Build changes. With no Stage 2 configured, the following phase settles Victory. There is no fake reward screen.

## Settlement and saves

Wave/Boss completion uses the existing ordered clear-Score and performance hooks before taking one secured checkpoint. The hooks currently award no new Score. Stage Clear does not create a second Boss checkpoint. Boss persistence occurs only after successful encounter completion.

Death and Victory settle the current Run state. Abandon settles the last secured encounter checkpoint; without a checkpoint, no settlement is awarded. Results display the returned Settlement Score and Points without recalculation. The existing logarithmic excess-Score curve, positive-exponent fallback and Capacity/performance-capacity placeholders are unchanged.

Only meta progression, unlocks, Points and statistics use localStorage. Existing storage-error fallback remains. The current Build is Run-only state and is never saved. Refresh, closing the page or a crash loses the active Run without settlement. There is no active-Run persistence or exit handler. New runs reset the Build, resolved Player/Weapon stats, encounter state, timers, input, bullets and enemies while retaining meta data. Existing `totalRuns` behavior is preserved: Play increments it; R uses the canonical reset without another increment. `highestStage` remains the highest reached Stage, currently 1; completed Boss IDs persist separately.

The game uses a `100dvh` application shell with a compact top HUD, a height-and-width constrained arena region and a 190-240 px desktop BUILD side panel. A `ResizeObserver` plus resize fallback uniformly scales only the Canvas display; its logical resolution, world coordinates and game state remain 800 x 600. Pointer input maps the actual displayed rectangle back to logical coordinates. On narrow screens, the BUILD panel becomes a five-stat strip above the arena instead of a long page section. The document does not scroll during play; detailed Playtest reports use their own fixed, scrollable panel. Level-Up and Abandon remain interactive overlays aligned to the exact displayed Canvas, while the arena message layer ignores pointer input.

## Verification and calibration notes

### Development-only Playtest Mode

Open `http://localhost:8080/?playtest=1` to record encounter composition, analysis/Build snapshots, active combat and Intermission time, damage/low HP, attacks, projectiles/hits, kills versus contact removals, field pressure, spawn waiting, offered and selected upgrades, Boss charge attempts/contacts, and the exact existing Settlement result. Without that parameter there is no recording, badge, report UI or console API. Telemetry does not affect gameplay or Save; it stays in memory, keeps the latest 20 completed Runs, and disappears on refresh.

Under the Combat Variety prototype, the same memory-only report also records introductions shown; Interceptor attempts/commits/contacts/misses/interrupted telegraphs; Denier casts, hazards created, zone-entry contacts, periodic damage ticks and active hazard time; and Support active time, affected-enemy time, affected special actions and Links created. The existing report adds one compact Special behavior column; gameplay remains viewport-first and the report keeps local scrolling.

At a result, choose **COPY RUN REPORT**, or **COPY SESSION REPORT** after multiple Runs. Both copy pretty-printed JSON; clipboard failure reveals selected text for manual copying. **VIEW REPORT** shows a concise session summary. The optional read-only `CanvaWarPlaytest` console API offers `getCurrentRun()`, `getSessionReport()` and `copySessionReport()`.

Timings follow active simulation updates, excluding upgrade/Abandon pauses. `encounterElapsedTime` and `activeCombatTime` measure observed combat for every Encounter; `actualClearTime` and `clearTimeRatio` are numeric only after a successful clear and remain `null` for Death, Abandon or other unfinished outcomes. `attackEvents` counts accepted trigger events, while `shotsFired` remains the number of projectiles emitted, so Split Shot can increase shots without inflating attacks. Encounter and Upgrade snapshots include the exact Build stacks, resolved Weapon fields and resolved Player Speed/Max HP. `upgradeChoiceHistory` separately records Player level, offered IDs and the selected ID without changing the existing `upgradeHistory`. Boss encounters count actual Charge entries and damaging Charge contacts. Telemetry configuration includes the immutable Starter definition, Upgrade definitions and Fire Rate cap. Pressure and low-HP durations use pre-update state; averages integrate value × deltaTime. Pressure waiting counts only the part of a frame after the pending group's minimum delay, with separate blocked-interval counts. Spawn release times/peaks are sampled after scheduling. `waveIndex` is zero-based; `waveReached` is one-based. Per-type enemy-seconds measure presence, not causal difficulty. Export values are observations for later unassisted playtesting, not balance conclusions.

Run `node --test` for the complete dependency-free suite, `node --check` for each JavaScript source and `git diff --check` before review. Automated coverage includes Weapon immutability, pure Build resolution and caps, firing cadence, Split Shot, Pierce, Build UI, telemetry, responsive sizing and scaled pointer input. Movement coverage includes each Enemy type, active ownership, deterministic bounded Spawn placement, overlap recovery, dense groups, normal collision, edge sliding, pushing, new Waves, Boss isolation and ghost colliders. Existing coverage remains for Templates, injected Wave RNG, malformed content, 1,000 generated Waves, Analyzer purity, atomic release/ownership, pauses, complete Stage flow, Boss death priority/persistence, checkpoint ordering, Abandon, reset and protected Settlement math.

Manual browser validation should exercise held firing across normal and long frames, upgrade card mouse/keyboard selection, all pause and Encounter transitions, the BUILD panel at desktop and narrow widths, Split Shot telemetry, the complete Stage/Boss flow and browser console output. This README does not record a completed unassisted balance playthrough.

This first data-driven Stage 1 calibration raises only MaxActiveThreat to increase legal group overlap, recalibrates analysis-only clear-time weights, and gives Boss 1 its first curated mechanic. Total Wave Threat, Enemy Threat costs, Template delays, hard active count, ordinary Enemy stats, Weapon/Upgrade values and contact removal are unchanged. Collect new unassisted clear times, damage, composition, group waiting, Boss charge attempts/contacts and offered/selected Upgrade histories before tuning again. Capacity, Points, Settlement economics, Score awards, Save schema and Run progression remain deliberately unchanged. No Quick Clear award, Stage 2, Equipment/Item systems, Boss adds, reward content or Run persistence are implemented.
