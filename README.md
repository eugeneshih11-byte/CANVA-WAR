# CANVA WAR

A roguelite 2D browser game built with HTML, CSS, vanilla JavaScript and an 800 x 600 logical Canvas. Only Stage 1 is implemented.

## Run locally

From this directory, run `python -m http.server 8080`, then open `http://localhost:8080`. Run the complete dependency-free automated suite with `node --test`.

CANVA WAR now boots into a clean non-combat Main Hub. Choose **PLAY** to begin a Run, open the standalone **SHOP**, **ARMORY**, and **EQUIPMENT** foundations, or review learned enemies in the **ENEMY CODEX**. The Codex shares the persistent Introduction discovery state and never creates gameplay state.

Phase B makes all ten regular Enemy identities and the Continuous Encounter controller production Stage 1 content. Add observation-only telemetry with `http://localhost:8080/?playtest=1`; the older `?prototype=combat-variety-v1` selector remains only as a compatibility fixture for historical tests.

Local script URLs use an explicit version query to prevent stale browser JavaScript during development and playtesting. Bump the shared version string when a new test build must load guaranteed fresh assets.

Controls: use the menu buttons in the Hub and meta views. In combat, use WASD movement, mouse aiming, hold the primary mouse button to fire, press Q to switch between equipped Weapon Slots A and B, and click a level-up card or press 1/2/3 to choose its upgrade. R restarts after Victory, Game Over or Abandon. **Back to Hub** opens the existing paused Abandon confirmation during an active Run; after Death, Victory, or Abandon it returns immediately. Continue or Escape resumes a Run from that confirmation. Held movement and firing input clear at view and encounter boundaries. `?playtest=1` exposes a Hub selector for equipping one or two of the six implemented Weapons; ordinary production still starts with Starter alone.

## Architecture and flow

`index.html` contains six sibling top-level roots: Hub, Shop, Armory, Equipment, Enemy Codex, and Game. A lightweight in-memory router in `game.js` keeps exactly one active; navigation state is not saved. Application boot only loads existing durable progression and Enemy discovery, then shows the Hub. PLAY initializes optional playtest telemetry, creates the in-memory Run, increments the existing Run statistic, and enters Game. Hidden non-combat views reject gameplay keyboard and firing input, and the game loop does not simulate or render combat outside Game.

`battlefields.js` owns immutable Battlefield source parameters, seeded runtime generation, validation, shared static geometry and footprint-aware navigation helpers. `encounters.js` owns frozen Stage, per-Wave eligibility, Enemy evaluation, Template and Boss definitions, generation, validation, analysis, scaling and Wave runtime helpers. `behaviors.js` owns extensible regular-Enemy behavior profiles, per-Enemy mutable behavior runtimes, locked prediction, hazard lifetime and dynamic support relationships; Boss 1 deliberately keeps its curated state machine in `game.js`. `weapons.js` owns the six immutable Weapon definitions, provisional calibration, technical Fire Rate cap and deterministic projectile-direction math. `build.js` owns immutable Upgrade definitions plus pure Build creation, compatibility, validation, choice and stat-resolution helpers. `enemy-discovery.js` owns the independent `canva-war-enemy-discovery-v1` persistence used by Introductions and the Codex. `layout.js` owns pure 800 x 600 display sizing, Camera following/clamping and explicit screen/world conversion. `game.js` coordinates the view router and those modules with movement, firing, collision, XP, Run phases and saves. `settlement.js` remains the authoritative Score-to-Points calculation and checkpoint implementation.

## Phase B Continuous Encounter

`continuous-encounter.js` is the single production authority for regular-Enemy field pressure, spawn credits, logical-Wave progress, spawn reservations, return reservations and Enemy lifecycle state. The older generated Spawn Group, Threat-budget and MaxActiveThreat code remains isolated in `encounters.js` for analyzer and regression compatibility; it no longer schedules production regular combat. Regular Wave boundaries do not clear surviving Enemies or enter the four-second Intermission. The existing Intermission is retained only for the transition from the final logical Wave to Boss 1.

The controller phases are `SETTLING`, `NORMAL`, `WAVE_COMING` and `FINAL_COMPLETE`. Enemy lifecycles are `RESERVED`, `ENTERING`, `ACTIVE`, `NEAR_OFFSCREEN`, `RETURNING` and `DEAD`. For the 800 x 600 viewport, Capacity Area is `800 × 600 − π × 100² ≈ 448584.07 px²`; obstacle area is not deducted. Visible Fill is the sum of every living Enemy's visual-rectangle intersection with the viewport divided by Capacity Area. Projected Fill adds committed off-screen spawn and fully off-screen return reservations exactly once. Normal refill uses a 20%/25%/30% hysteresis band and a hard 70% controller commitment ceiling. Wave 1 ramps its effective target from 10% for the first two seconds of actual combat, to 20% until five seconds, then to the normal 25% target. A 120-pixel spatial hash replaces the former all-pairs dynamic-Enemy neighbor scan in the hot movement/placement path.

The provisional calibration is deliberately centralized: TurnoverCycles `1.5`; Normal area-credit rate `0.12 Capacity Area/second`; Wave Coming area-credit rate `0.32 Capacity Area/second`; credit cap `0.14 Capacity Area`; seeded Wave Coming delta `0.20–0.30`; eight placement attempts per distance band; six-entry recency history with multipliers `[0.35, 0.50, 0.65, 0.80, 0.90, 1.00]`; same-type streak multiplier `0.55`; and mechanic caps Interceptor 6, Denier 6, Support 4, Gunner 8, Artillery 4, Trapper 6 and Tether 4. Normal dispatch commits at most two reservations per 0.20-second pulse; Wave Coming commits at most three per 0.15-second pulse. Fill legality is supplemented by a hard cap of 40 managed regular Enemies across ENTERING, ACTIVE, NEAR_OFFSCREEN and RETURNING. These are first-pass values awaiting playtest tuning, not final balance.

Logical-Wave progress arms only after the initial field settles inside the Normal band. It snapshots `N_ref`, computes `K_target = max(1, ceil(N_ref * TurnoverCycles))`, and advances only from qualifying kills. On a non-final target, the normal refill is suspended, the previous Wave's clear/performance hooks and secured checkpoint execute immediately, and a fixed additive Wave Coming budget is committed without resetting the field. Wave Coming captures its starting Projected Fill and seeded delta exactly once, then spends the resulting fixed area budget; kills cannot enlarge it. Introduction discovery persists across death, Restart, New Run and reload under its own storage key, separate from Save v2. Each Wave briefs newly eligible undiscovered Types before regular spawning resumes, so an unknown Type cannot enter production early. Already discovered Types are suppressed without delaying combat.

Stage 1 uses cumulative, data-driven eligibility: Wave 1 has Normal/Fast; Wave 2 adds Tank/Gunner; Wave 3 adds Interceptor/Trapper; Wave 4 adds Denier/Support; Wave 5 adds Artillery/Tether. The Stage definition owns these pools, so future Stages can define different rosters without assuming every Stage unlocks all Types. Each spawn performs one seeded weighted selection from the current pool intersected with hard-legal Types. Recent occurrence and streak suppression are soft weights, not forced rotations. Type selection and position sampling use separate seeded RNG streams; exactly two position samples seed deterministic candidate scans, so placement retries cannot perturb future type selection. Profiles use NEAR/MID/FAR distance bands plus geometry tags (`none`, `approach-space`, `large-clearance`, `lane-required`, `open-space-preferred`, `support-access`, `los-preferred`, and `route-space-preferred`). Telemetry records preferred/fallback bands, attempts, failures, cap/fill/placement rejection counts and lifecycle transitions.

Moving Player/Camera geometry can invalidate a candidate while a reservation is being resolved. Phase B deliberately handles that measured risk with bounded same-Type revalidation, deterministic band fallback and clean cancellation/credit return; it does not predict the Camera, teleport actors or phase through walls. Playtest telemetry should determine whether the observed failure rate needs a later follow-up.

The production roster is Normal (56, HP 2, speed 110 contact pursuer), Fast (40, HP 1, speed 180 committed strike), Tank (80, HP 6, speed 65 radial slam), Interceptor (52, HP 3, speed 100 predictive charge), Denier (60, HP 3, speed 80 persistent hazard), Support (52, HP 2, speed 75 special cooldown link), Gunner (52, HP 2, speed 90 two-shot burst), Artillery (68, HP 3, speed 65 delayed 80-radius impact), Trapper (48, HP 2, speed 85 armed route trap) and Tether (56, HP 3, speed 95 line-of-sight tether). Their immutable visual, collision, navigation, spawn-profile, safety-cap and attack-policy data lives in `encounters.js`; runtime behavior lives in `behaviors.js`.

All ten first-discovery Introductions and Codex previews use the shared production Enemy renderer with deterministic preview-only cues. Denier receives a representative hazard marker and Support a short representative Link without creating gameplay hazards, targets, timers, telemetry, or consuming gameplay RNG. Undiscovered Codex cards remain silhouettes with hidden names, behavior and counterplay.

Player/regular-Enemy body separation is independent from attack policy. Nearby overlaps are resolved in bounded, terrain-safe steps through the existing spatial hash; large Tank footprints and multi-Enemy compression use their actual collision rectangles. Normal alone retains generic body-contact damage. Fast Strike, Tank Slam, Interceptor Charge, Gunner projectiles, Artillery impacts, Denier hazards, Trapper traps and Tether effects keep their authored mechanisms, while Support has no direct damage.

`audio.js` provides a gesture-unlocked procedural Web Audio foundation with Master, SFX and reserved Music buses, per-cue retrigger/concurrency limits, global priority preemption and camera-relative stereo panning for world cues. Mute, Master volume and SFX volume persist under the separate `canva-war-settings` key; Save v2 is unchanged. Audio failure is isolated from gameplay.

The Hub does not begin a Run, create a Battlefield runtime, generate a Wave, advance combat timers, increment `totalRuns`, or initialize a playtest telemetry session. The Shop reads current Points from Save; Armory reads the existing Starter Weapon from `weapons.js`; Equipment reflects the existing owned-equipment list. Save v2 reserves empty `deployables` and `summons` unlock lists without exposing unfinished systems in the Hub. Returning from an active Run cannot hide or discard it: the same Abandon confirmation and secured-checkpoint Settlement semantics run first. Returning after an abandoned or completed Run clears Battlefield, navigation, Enemy, projectile, hazard and Boss runtime state. Death and Victory have already settled and may return directly to the Hub. The broader development focus remains **Core Direction Realignment**; this navigation foundation does not complete that work.

## Battlefield and navigation foundation

Stage 1 references the frozen `stage-1-field-a` source definition for all five Waves and Boss 1. The visible Canvas remains an 800 x 600 viewport while the derived World is 1600 x 1200. A private Battlefield seed generates roughly ten solid structures once per Stage; `?battlefieldSeed=value` is an optional local reproduction override. The same seed and inputs reproduce the same frozen layout, while a bounded validator protects World bounds, a broad center spawn-safety region, and connected routes for every production actor footprint. Exhausted attempts use a deterministic fallback derived from current viewport, World and actor dimensions rather than the retired fixed coordinates.

All actors, bullets, hazards, obstacles and navigation paths use World coordinates. A centered Camera follows the Player and clamps at World edges; rendering translates World content by the Camera while HUD, Boss bar, messages and modal overlays remain screen-space. Pointer input first maps CSS pixels to the logical viewport and then converts screen to World coordinates. Off-screen entities continue simulation, while draw culling is a presentation optimization only.

Player and world movement share swept static collision helpers. Player axes resolve independently, so the blocked component stops while the legal component continues as a wall slide; substeps prevent ordinary frame spikes from tunneling through cover. Normal, Fast, Tank and ordinary Interceptor movement first steer directly when their full footprint has line of travel, otherwise use deterministic approximately 20-pixel-grid A* with corner-cut prevention, footprint-aware cells and safe line-of-travel smoothing. Paths are cached, repathed on meaningful target/path changes or a bounded interval, and invalidated after bounded lack of progress. Dynamic Enemies remain movement colliders but are not A* walls, and navigation consumes no gameplay RNG.

Regular and Boss spawns keep exactly two gameplay random samples, choose an off-screen band near an available Camera edge, then reject World bounds, terrain, living-Enemy overlap and unreachable-component candidates before bounded deterministic scanning. Battlefield generation has its own seeded RNG and never advances encounter or spawn randomness. Player pushes and Enemy overlap recovery accept only statically valid results. Standard projectiles, including projectiles with Enemy Pierce remaining, persist outside the viewport and are removed only at World bounds or blocking terrain. Interceptor and Boss committed charges stay straight, stop at the first terrain collision or World boundary and enter their existing Recovery; neither bends or retargets. Denier hazard centers projected into terrain move deterministically to the nearest playable edge, while Support Links intentionally remain distance- and line-of-sight-independent.

## Phase A.1 pursuit reliability and battlefield density correction

Navigation progress is now measured against the remaining waypoint route, not actor displacement alone. Small legitimate route gains accumulate, while sideways motion that does not shorten the route cannot indefinitely hide a stall. After 0.75 seconds without meaningful route progress, the cached path is invalidated and rebuilt; repeated recovery rotates through deterministic A* tie-break variants so an actor can choose another side of symmetric cover without randomness. Walkability retains a tiny terrain-clearance tolerance at obstacle corners, regular Enemy steering follows the validated two-axis route segment before collision-axis fallback, and moving targets are repathed only after a bounded target-cell interval instead of every frame.

Boss 1 checks the full planned committed-charge segment before entering Telegraph and checks it again before Charge. A terrain-blocked lane returns the Boss to normal navigation pursuit until a useful lane exists. Once Charge begins it remains straight, locked, non-homing, and uses the unchanged collision and Recovery behavior.

Battlefield acceptance now samples every possible Camera region on a viewport-quarter grid, requires visible structure in every sample, and separately keeps at least 85% of the World open. These thresholds are derived from the existing viewport, World, grid and actor-clearance architecture; generation remains seeded, bounded and deterministic, with the existing deterministic fallback. Seed `785540978` is a permanent reproduction fixture for pursuit and density tests.

Playtest Encounter telemetry now includes `forcedRepaths`, `stuckRecoveries`, `maxNoProgressDuration`, regular-Enemy offscreen engagement time, Boss offscreen time, Boss obstruction events, and Camera time without visible terrain. These remain observation-only, memory-only fields and do not enter Save v2 or gameplay decisions.

## Historical Combat Variety v1.1 correction pass

The following finite-Wave notes are retained as historical design and regression context. `getStagesForSearch()` still exposes the frozen prototype plan for compatibility, but production regular combat now uses the Phase B controller above.

Regular Enemy definitions now pair immutable stats and Roles with a behavior profile. Each spawned Enemy receives an independent runtime containing state, elapsed state time, cooldown and locked target data. Registry-dispatched profiles keep the main update loop free of type-specific branches:

- **Interceptor:** takes its first special action after about 0.9 seconds, then runs CHASE -> 0.55-second TELEGRAPH -> locked-vector CHARGE -> RECOVERY. It predicts once, commits for up to 520 logical pixels, never retargets during the charge, and stops at the World boundary or solid terrain.
- **Denier:** takes its first cast after about 0.9 seconds, predicts once, telegraphs for 0.75 seconds, then leaves a fixed danger zone active for 3 seconds. Remaining inside can deal damage every second; all overlapping Denier zones share one Player-side cooldown so they cannot burst simultaneously.
- **Support:** establishes one persistent, distance-independent Link to an eligible Interceptor or Denier. The linked special recovers ability cooldown at x1.75. Removing the Support breaks the effect immediately; removing its target allows a new eligible target to be linked. Normal, Fast, Tank, Support and Boss targets are ineligible.

Each special receives a prominent Enemy Introduction once per Run immediately before its first Wave. After Intermission it enters an explicit pending state, opens a fully dimmed modal with the Enemy's Role, behavior, counterplay and representative visual, then waits for the player to click Continue or press Enter/Space. It never auto-dismisses. Movement, navigation, attacks, spawning, AI, hazards, Weapon cooldown, Wave timing and telemetry timing remain frozen, and the next Wave does not start until confirmation. Held input is cleared so confirmation cannot leak into combat. Introduction state resets on a new Run. All provisional prototype stats and introduction content are centralized in `COMBAT_VARIETY_V1`. Behavior and hazard timers advance only from active Wave combat updates. Pending/active hazards and Support Links clear at Wave end, Boss entry, death, Abandon, Victory and restart.

Run phases sit underneath the existing menu, result and upgrade-pause state:

```text
New Run -> STAGE_ENTER -> WAVE_ACTIVE
Wave Clear -> INTERMISSION -> optional INTRODUCTION_PENDING -> INTRODUCTION_ACTIVE -> explicit Continue -> next WAVE_ACTIVE
Wave 5 Clear -> INTERMISSION -> BOSS_ACTIVE
Successful Boss Clear -> STAGE_CLEAR -> STAGE_REWARD -> RUN_VICTORY
Lethal damage -> RUN_DEAD
```

Stage entry loads Stage 1, resets Template history, generates/analyzes Wave 1 and creates its runtime. Each Wave is generated once. Definitions contain content; separate runtimes contain elapsed combat time, group delays, released/spawned/alive counts, active Threat, damage taken, completion and encounter identity. Analyzer output is retained for later performance systems.

## Weapons and Run Builds

The immutable six-Weapon roster is deliberately provisional balance data:

| Weapon | Attack identity |
|---|---|
| Starter | Precise baseline projectile: Damage 2, Fire Rate 4, one straight shot |
| Scatter | Five-pellet wide fan for nearby crowd clearing |
| Piercer | Fast narrow projectile with Damage 3 and four-enemy Pierce |
| Burst | Three focused shots at deterministic 0.11-second internal spacing |
| Launcher | Slow projectile producing one 80-pixel multi-target explosion |
| Arc Blade | Directional 105-pixel frontal sweep; not a bullet or 360-degree area effect |

Runtime code resolves fresh stat snapshots from these definitions and the current Build; it does not rewrite them. Fire Rate has a technical ceiling of 12 attacks/second. A Run owns at most two Weapons in Slots A and B. Only the active slot attacks, Q switches slots, and each slot retains its own cooldown and internal burst state so switching cannot reset or recharge it. Burst work clears on death, restart, Run end and combat teardown. Ordinary production currently equips Starter in Slot A and leaves Slot B empty; `?playtest=1` is the comparison-only path for selecting one or two of all six.

Each Weapon slot owns a current-Run Build stack map. `resolveWeaponStats()` and `resolvePlayerStats()` derive combat values in one place, `canSelectUpgrade()` enforces caps and Weapon compatibility, `generateUpgradeChoices()` samples compatible definitions without replacement, and `applyUpgrade()` returns a new Build result for the active slot. Player-oriented Vitality and Swift Feet synchronize across slots. Heavy Shot's flat Damage applies once before Split Shot's per-projectile multiplier and works once per pellet, explosion target or Arc Blade target. Split Shot is excluded from Burst, Launcher and Arc Blade rather than cloning nonsensical attack forms. The five upgrades remain:

| Upgrade | Effect per selection | Cap |
|---|---|---:|
| Rapid Fire | Fire Rate x1.2 | 4 |
| Heavy Shot | Damage +1, Bullet Size +1, Fire Rate x0.92 | 4 |
| Split Shot | Projectile Count +1 and 12-degree spacing; total Split stacks set per-projectile Damage to x0.75 / x0.65 | 2 |
| Vitality | Max HP +1 and heal 1 HP, capped at the resolved maximum | 3 |
| Swift Feet | movement Speed x1.08 | 4 |

Each level-up displays up to three formal cards with current stack and cap information. Mouse selection and 1/2/3 choose the matching visible card; Escape cannot dismiss the required choice. Maxed upgrades are excluded, and the Run resumes safely if every upgrade is already capped. Choice generation receives a private seeded RNG stream, so it does not consume or share the Wave Generator's RNG state.

Holding the primary mouse button requests attacks from the active slot at its resolved Fire Rate. Cooldowns advance only with active combat simulation, allow at most one newly initiated attack per update and never emit delayed catch-up attacks after a long frame. Upgrade and Abandon pauses freeze them. Starting a new Encounter makes each Weapon ready and clears held firing state; Intermission, death, Victory, Abandon, restart and focus loss also clear held firing so input cannot leak across transitions.

An attack is one trigger event and may emit multiple projectiles or one Arc Blade sweep. Split Shot places projectile directions symmetrically around the aim angle. Each projectile carries its resolved Damage, size, speed, Pierce budget, Weapon identity and attack identity. A projectile can hit each regular Enemy or Boss at most once; Pierce permits additional distinct targets before removal, while a Launcher explosion visits each target once. Projectile traversal uses identity snapshots and explicitly terminates after synchronous Wave completion, so final-Wave cleanup cannot leave a live loop dereferencing or applying stale projectiles.

## Legacy finite-Wave configuration (analysis/test compatibility)

Stage ID: `stage-1`. Battlefield: `stage-1-field-a`. Five Waves. Enemy pool: normal, fast, tank. Mechanics: empty. Boss: `boss-1`. HP, Damage and Speed multipliers are all **1**, preserving original combat stats. `getScaledEnemyStats()` scales these independently and never scales Threat Cost.

| Wave | Threat Budget | MaxActiveThreat | Available Enemies | Templates |
|---|---:|---:|---|---|
| 1 | 8 | 6 | normal | Basic |
| 2 | 10 | 7 | normal, fast | Basic / Rush |
| 3 | 12 | 8.5 | normal, fast, tank | Basic / Rush / Heavy |
| 4 | 14 | 10 | normal, fast, tank | Rush / Heavy / Escalation |
| 5 | 17 | 12 | normal, fast, tank | Heavy / Escalation / Mixed |

Enemy evaluation: normal = frontline, Threat 1; fast = pressure, Threat 1.4; tank = frontline + heavy, Threat 2.2. Threat measures pressure independently of HP, Damage, XP and Score. Field pressure uses MaxActiveThreat, with safety guards of 8 active regular enemies and 18 generated enemies per Wave. The old infinite spawning and global 10-enemy difficulty limit are removed.

## Legacy templates and generation

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

Spawn placement keeps the original two random samples per Enemy, validates static geometry, living-Enemy overlap and A* reachability to the Player component, then checks a bounded deterministic sequence in off-screen Camera-edge bands. A World-perimeter scan remains only as the small-fixture fallback when no off-screen band exists. If dynamic overlap still occurs during movement, a step is accepted only when it lowers total AABB penetration without introducing a new collider or entering terrain. A deterministic axis recovery handles pursuit steps that cannot improve the overlap. New collisions remain rejected, dead or stale-Wave Enemies do not block movement, and no placement or recovery path consumes additional randomness.

`analyzeWave()` is pure evaluation metadata and awards nothing. It returns Threat, expected clear time, expected base Score, performance allowance and score capacity. Expected time is:

```text
2.5 seconds + sum of Enemy handling weights + sum of relative delays + 0 mechanic time
```

Handling weights: normal 0.40 seconds, fast 0.25 seconds, tank 1.00 second. Player Damage and Build never change this expectation. Eight Normal enemies in the two-group Basic Wave produce `2.5 + (8 x 0.40) + 2.5 = 8.2` seconds; a two-group seven-Fast Rush reference produces `2.5 + (7 x 0.25) + 1.5 = 5.75` seconds. These Calibration A clear-time numbers were measured for the pre-Battlefield empty arena and are retained only as operational analysis references, not final post-geometry calibration evidence. Analysis-only Score references mirror current kills at 1 per Enemy; clear, Boss and performance references remain 0 because no live awards exist for them yet. Wave score capacity is expected base Score plus performance allowance. Boss analysis uses the unchanged provisional 15-second expected time and zero/unassigned Threat and Score references. None of this analysis feeds Settlement Capacity yet.

Intermission lasts 4 seconds of active simulation time. Bullets and input clear on entry, movement remains available, and shooting, regular AI and spawning stop. A compact translucent upper-arena banner displays the cleared Wave, next Wave or Boss Incoming, and the actual countdown without covering the central playfield. Upgrade choices and Abandon confirmation freeze all simulation timers.

## Boss and Stage completion

Boss 1 starts only after the configured final Wave and its Intermission, independently of Level. Production Stage 1 still defines five Waves. It is 100 x 100 with HP 100, chase speed 60 and 1 contact damage with the existing 1-second cooldown. Its deterministic cycle is CHASE -> TELEGRAPH -> CHARGE -> RECOVERY -> CHASE. The initial chase lasts 2.5 seconds; later chase windows last 2 seconds. TELEGRAPH lasts 0.65 seconds, stops chase movement and displays the locked charge direction. CHARGE lasts at most 0.45 seconds at speed 420 without homing, ending early at a World boundary or solid terrain. RECOVERY freezes the Boss for 0.55 seconds. Chase navigation and every phase consume no gameplay RNG.

A dedicated top HP bar appears only in Boss combat. Lethal HP alone does not persist a Boss defeat: the Player must survive collision resolution and formally complete the encounter. Player death takes priority over simultaneous Boss death.

Stage Clear records completion and displays for 1.25 active seconds. `handleStageReward(stageContext)` is an empty boundary: no healing, rewards or Build changes. With no Stage 2 configured, the following phase settles Victory. There is no fake reward screen.

## Settlement and saves

Wave/Boss completion uses the existing ordered clear-Score and performance hooks before taking one secured checkpoint. The hooks currently award no new Score. Stage Clear does not create a second Boss checkpoint. Boss persistence occurs only after successful encounter completion.

Death and Victory settle the current Run state. Abandon settles the last secured encounter checkpoint; without a checkpoint, no settlement is awarded. Results display the returned Settlement Score and Points without recalculation. The existing logarithmic excess-Score curve, positive-exponent fallback and Capacity/performance-capacity placeholders are unchanged.

Only meta progression, unlock IDs, Points and statistics use localStorage. Save schema v2 preserves `highestStage`, defeated Boss IDs, Points, Weapon and Equipment unlocks, and statistics, while reserving empty `deployables` and `summons` unlock arrays. Explicit v1 -> v2 migration is deterministic and idempotent; missing new arrays normalize to empty without erasing valid older fields, and storage-error fallback remains non-fatal. No Deployable or Summon definitions, instances or gameplay are implemented.

The current Build, Battlefield instance, navigation paths and all other Run state are never saved. Refresh, closing the page or a crash loses the active Run without settlement. There is no active-Run persistence or exit handler. New runs reset the Build, resolved Player/Weapon stats, Battlefield/navigation state, encounter state, timers, input, bullets and enemies while retaining meta data. Existing `totalRuns` behavior is preserved: Play increments it; R uses the canonical reset without another increment. `highestStage` remains the highest reached Stage, currently 1; completed Boss IDs persist separately.

The game uses a `100dvh` application shell with a compact top HUD, a height-and-width constrained arena region and a 190-240 px desktop BUILD side panel. A `ResizeObserver` plus resize fallback uniformly scales only the Canvas display; its logical viewport remains 800 x 600 and does not resize the 1600 x 1200 World or mutate Run state. Pointer input maps the actual displayed rectangle to logical screen coordinates and then through the Camera into World coordinates. On narrow screens, the BUILD panel becomes a five-stat strip above the arena instead of a long page section. The document does not scroll during play; detailed Playtest reports use their own fixed, scrollable panel. Level-Up and Abandon remain interactive overlays aligned to the exact displayed Canvas, while the arena message layer ignores pointer input.

## Verification and calibration notes

### Development-only Playtest Mode

Open `http://localhost:8080/?playtest=1` to record encounter composition, Battlefield ID and seed, World dimensions, obstacle count, compact path request/failure/fallback, forced-repath/stuck-recovery, offscreen-engagement, Boss-obstruction, Camera-terrain and Player-obstacle-contact diagnostics, analysis/Build snapshots, active combat and Intermission time, damage/low HP, attacks, projectiles/hits, kills versus contact removals, density bands and opening targets, managed-count peaks, dispatch pulses and Fill/count blocks, Wave Coming captures, eligibility/Introduction decisions, Player/Enemy overlap corrections, per-Weapon outcomes, offered and selected upgrades, Boss charge attempts/contacts, and the exact existing Settlement result. Without that parameter there is no recording, badge, report UI or console API. Telemetry does not affect gameplay or Save; it stays in memory, keeps the latest 20 completed Runs, and disappears on refresh.

Under the Combat Variety prototype, the same memory-only report also records introductions shown; Interceptor attempts/commits/contacts/misses/interrupted telegraphs; Denier casts, hazards created, zone-entry contacts, periodic damage ticks and active hazard time; and Support active time, affected-enemy time, affected special actions and Links created. The existing report adds one compact Special behavior column; gameplay remains viewport-first and the report keeps local scrolling.

At a result, choose **COPY RUN REPORT**, or **COPY SESSION REPORT** after multiple Runs. Both copy pretty-printed JSON; clipboard failure reveals selected text for manual copying. **VIEW REPORT** shows a concise session summary. The optional read-only `CanvaWarPlaytest` console API offers `getCurrentRun()`, `getSessionReport()` and `copySessionReport()`.

Timings follow active simulation updates, excluding upgrade/Abandon pauses. `encounterElapsedTime` and `activeCombatTime` measure observed combat for every Encounter; `actualClearTime` and `clearTimeRatio` are numeric only after a successful clear and remain `null` for Death, Abandon or other unfinished outcomes. `attackEvents` counts accepted trigger events, while `shotsFired` remains the number of projectiles emitted, so Scatter and Split Shot can increase projectiles without inflating attacks. Per-Weapon metrics distinguish attacks, projectiles, hits, damage, kills, kills per active combat second, Pierce events, explosion targets, Arc Blade targets and Burst shots. Encounter and Upgrade snapshots include Slot A/B, active Weapon, exact Build stacks, resolved Weapon fields and resolved Player Speed/Max HP. `upgradeChoiceHistory` separately records Player level, offered IDs and the selected ID without changing the existing `upgradeHistory`. Boss encounters count actual Charge entries and damaging Charge contacts. Telemetry configuration includes all immutable Weapon definitions, Continuous Encounter calibration, Upgrade definitions and Fire Rate cap. Pressure and low-HP durations use pre-update state; averages integrate value × deltaTime. Pressure waiting counts only the part of a frame after the pending group's minimum delay, with separate blocked-interval counts. Spawn release times/peaks are sampled after scheduling. `waveIndex` is zero-based; `waveReached` is one-based. Per-type enemy-seconds measure presence, not causal difficulty. Export values are observations for later unassisted playtesting, not balance conclusions.

Run `node --test` for the complete dependency-free suite, `node --check` for each JavaScript source and `git diff --check` before review. Automated coverage includes seeded Battlefield reproduction, local density validation and deterministic fallback, 1,000 generated Battlefield seeds, the permanent `785540978` fixture, Camera clamping/conversion/pause behavior, World-aware projectiles and off-screen pursuit/spawns, horizontal and vertical wall pursuit for every base Enemy footprint, moving-target route replacement, footprint-aware routes and static walkability caches, swept Player/projectile/charge collision, wall sliding, deterministic alternate-route recovery, terrain-safe overlap recovery, Boss charge-lane selection, data-driven Wave counts, special behavior integration, Save v2 migration, Weapon/Build systems, telemetry, responsive sizing and scaled pointer input. Existing coverage remains for Templates, injected Wave RNG, malformed content, baseline and prototype 1,000 generated Waves, Analyzer purity, atomic release/ownership, pauses, complete Stage flow, committed-charge straightness, Boss death priority/persistence, checkpoint ordering, Abandon, reset and protected Settlement math.

Manual browser validation should exercise held firing across normal and long frames, upgrade card mouse/keyboard selection, all pause and Encounter transitions, the BUILD panel at desktop and narrow widths, Split Shot telemetry, the complete Stage/Boss flow and browser console output. This README does not record a completed unassisted balance playthrough.

Weapon numbers, Continuous Fill, credit, turnover, profile, cap and Enemy-behavior values still need unassisted calibration. XP, Score, Points, Settlement, Save v2 and Boss balance remain protected. No Quick Clear award, Stage 2, permanent Weapon acquisition, ammunition, Deployable/Summon mechanics, Equipment/Item systems, Boss adds, reward content or Run persistence is implemented.
