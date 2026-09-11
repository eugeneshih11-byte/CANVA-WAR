# CANVA WAR --- Project Context & Design Notes

## Main Hub and meta-page foundation

CANVA WAR now boots into a non-combat Main Hub instead of treating the combat screen as the whole product. The application has five mutually exclusive, in-memory views:

```text
APP
├─ HUB_VIEW
├─ SHOP_VIEW
├─ ARMORY_VIEW
├─ EQUIPMENT_VIEW
└─ GAME_VIEW
```

PLAY is the only action that creates a fresh active Run. Loading the application can remain in the Hub indefinitely without generating a Wave, advancing combat/encounter timers, incrementing `totalRuns`, or initializing a playtest telemetry session. Existing `playtest` and `prototype` query configuration is retained across Hub → PLAY and remains independent.

Shop, Armory, and Equipment are standalone meta-progression locations, not panels beside combat. Shop currently says Coming Soon and presents existing Points, Armory presents the owned Starter from the immutable Weapon definition, and Equipment reflects the existing empty owned-equipment Save list. No prices, purchases, rerolls, inventory generation, new Weapons, fake Equipment, Equipment stats, or loadout switching exists in this foundation. Save v2 only adds empty future unlock categories for Deployables and Summons. View state is not persistent progression.

Gameplay input is isolated to GAME_VIEW, and held movement/firing clears on every view transition. Back to Hub during an active Run opens the existing Abandon confirmation and reaches the Hub only after the established secured-checkpoint Settlement path completes. Cancelling resumes the same Run. Death and Victory already use their existing Settlement paths and can return to Hub directly; R still restarts inside gameplay. Enemy Introduction and Level Up retain their input/pause protections.

This establishes information architecture for the roguelite product while leaving the broader **Core Direction Realignment** in progress. Detailed Shop, Armory, Equipment, Deployable and Summon mechanics are intentionally not designed here.

## Battlefield, navigation, and data foundation v1

Stage 1 references the immutable `stage-1-field-a` source definition in `battlefields.js` for all five production Waves and Boss 1. The 800 x 600 Canvas is now a viewport over a derived 1600 x 1200 World. The source stores scale, bounds, spawn ratio and generator parameters rather than fixed obstacle coordinates. A private per-Stage seed generates the runtime layout once, with optional `battlefieldSeed` query reproduction. Validation protects bounds, a center spawn-safety margin and connected routes for every production footprint; bounded failures use a deterministic fallback derived from current dimensions.

All actors and objects simulate in World coordinates. A centered Camera follows the Player, clamps to World edges, and transforms only rendering; HUD and modal presentation remain screen-space. Pointer input converts displayed CSS coordinates to logical screen coordinates and then to World coordinates. Off-screen entities continue simulation, while draw culling is visual only. Static geometry is shared by Player, Enemy, Boss, charge, projectile and spawn systems. Player movement resolves axes independently for wall sliding and uses swept substeps. Standard bullets stop on terrain or World bounds, not viewport edges. Normal, Fast, Tank and ordinary Interceptor chase use direct steering when clear, otherwise deterministic approximately 20-pixel footprint-aware A* with safe smoothing, static per-footprint walkability caches, bounded repaths and stuck invalidation. Navigation does not consume gameplay RNG, and dynamic Enemies are not A* walls.

Regular/Boss spawns retain exactly two gameplay random samples and choose off-screen bands near available Camera edges, then reject terrain, World boundary, active-Enemy overlap and unreachable-component candidates before bounded deterministic scanning. Battlefield RNG is separate. Interceptor and Boss committed charges remain straight and non-retargeting, stop at first solid collision or World boundary and continue through existing Recovery. Denier centers predicted inside terrain project deterministically to a playable edge. Support Links remain distance- and line-of-sight-independent.

Persistent Save is schema v2 and unchanged. Battlefield seed, generated structures, Camera state, navigation paths and every other active Run field remain memory-only. Playtest Run/Encounter metadata includes Battlefield ID/seed, World dimensions and obstacle count plus compact navigation diagnostics, without path arrays or per-frame positions. Wave progression and HUD denominators use the Stage definition's `waveCount`; production remains five Waves, and a non-five synthetic fixture protects the data-driven transition.

Calibration A Threat, concurrency, Enemy, Wave, Boss, Weapon, Upgrade, XP, Score, Points and Settlement numbers are unchanged. Its clear-time values were measured in the pre-Battlefield empty arena and remain operational analysis references, not final post-geometry calibration evidence.

## Phase A.1 pursuit reliability and battlefield density correction

Pursuit success is measured by progress along the remaining route instead of raw actor displacement. Legitimate sub-threshold route gains accumulate; wall sliding that does not shorten the route no longer conceals a stall. A bounded 0.75-second no-progress window invalidates the cached path, and repeat recovery deterministically rotates A* tie-break variants to choose another side of cover without consuming gameplay RNG. Walkability keeps a tiny clearance tolerance at exact obstacle corners, regular Enemies initially move along the full validated route vector, and moving targets replace stale routes after a bounded target-cell interval.

Boss 1 now validates its full planned committed-charge segment before Telegraph and again before Charge. Terrain obstruction returns it to ordinary pursuit until a useful charge lane exists. A committed Charge is still straight, locked, non-homing, and retains the existing collision stop and Recovery behavior.

Seeded generation now validates local spatial density across all Camera regions sampled at viewport-quarter intervals. Every sample must contain at least one grid-cell area of structure, while at least 85% of the World remains open, preserving traversal space instead of producing a maze. Generation attempts, deterministic fallback, actor-footprint connectivity and protected balance values are unchanged. Seed `785540978` is the permanent reproduction fixture.

Memory-only Encounter telemetry adds forced repaths, stuck recoveries, maximum no-progress duration, regular-Enemy and Boss offscreen engagement time, Boss obstruction events, and empty-Camera-terrain time. These diagnostics do not affect gameplay, Save v2, RNG, Settlement or progression. Phase A.1 is a correction to Phase A foundations; Phase B has not started.

## Experimental checkpoint: Combat Variety v1.1 correction pass

The query `prototype=combat-variety-v1` selects a separate Stage 1 experiment; normal URLs and `?playtest=1` alone continue to use Calibration A. The prototype is not final Stage 1 content. It preserves all established Threat, concurrency, Wave, Boss, Weapon, Build, XP, Score, Settlement, save and progression calibration.

`behaviors.js` is the extensible regular-Enemy behavior boundary. Immutable definitions live in `encounters.js`; mutable per-spawn behavior state lives on Enemy runtimes. Interceptor takes its first special action near 0.9 seconds and commits to a locked predictive charge lane up to 520 logical pixels. Denier casts near 0.9 seconds and creates a telegraphed fixed zone that remains active for 3 seconds, deals periodic one-second damage ticks, and shares one Player-side damage cooldown across overlapping zones. Support maintains one distance-independent Link to an eligible Interceptor or Denier, multiplying linked cooldown recovery by x1.75 and relinking after target removal. Telegraph, committed consequence, recovery, cleanup and telemetry are explicit. Boss 1 remains on its existing curated state machine.

Prototype exposure is Wave 3 = one Interceptor, Wave 4 = one Denier, and Wave 5 = one Support plus one Interceptor in the same primary spawn group. A prominent noncombat introduction appears once per special per Run before its first Wave. The explicit pending → active → Continue gate fully pauses combat and timing, never auto-dismisses, and starts the Wave only after a click or edge-triggered Enter/Space confirmation. Requirements pass through the existing generator, allocator, Threat/cap/count validation and bounded fallback. Telemetry distinguishes Denier zone entries from periodic damage ticks and records Support Links and introductions. Test locally at `http://localhost:8080/?playtest=1&prototype=combat-variety-v1`.

> 用途：在新的 ChatGPT / Codex 聊天室中快速恢復 CANVA WAR 專案上下文。\
> 專案路徑：`C:\Game01`\
> 技術：Vanilla HTML / CSS / JavaScript + HTML Canvas（800×600）\
> 遊戲方向：Roguelike / Roguelite 單機瀏覽器遊戲\
> 目前階段：核心玩法完成，正在設計 Score / Points / Run / Stage-Wave
> 架構。

------------------------------------------------------------------------

## 1. 核心設計原則

目前最重要的設計原則：

> **永久進度增加選擇，Run 內進度增加力量，Stage/Wave 增加挑戰。**

因此：

-   Meta Progression 不應主要提供永久數值膨脹。
-   暫時不做永久 Player Stats 升級。
-   永久進度主要解鎖：
    -   Weapons
    -   Equipment
    -   Items / Upgrade possibilities
    -   其他玩法內容
-   Run 內的 Level / Upgrade 才負責讓玩家變強。
-   Stage / Wave 主要負責增加敵人組合、敵人角色、機制與適度數值難度。
-   不希望遊戲最後變成單純「敵人 HP 越來越高、玩家永久 Damage
    越來越高」。

### 武器與裝備

武器主要決定：

-   Attack form
-   Damage
-   Bullet speed
-   Fire rate
-   Projectile behavior
-   其他 offensive stats

Player 本身不應擁有主要的武器 Damage。

裝備主要做 Sidegrade / Tradeoff，例如：

-   Runner Boots：+Speed / -HP
-   Glass Core：+Damage / -HP
-   Heavy Armor：+HP / -Speed

概念：

``` text
Player Base Stats
+ Equipment Modifiers
+ Run Upgrades
+ Temporary Buffs
=
Final Stats
```

後期解鎖 ≠ 一定更強，而應該是「更多玩法」。

------------------------------------------------------------------------

## 2. 預計的完整遊戲循環

長期方向：

``` text
New Run
↓
Stage
↓
Waves
↓
Boss
↓
Boss Reward / Stage Complete
↓
Next Stage
↓
...
↓
Death / Victory
↓
Settlement
↓
Score → Points
↓
Meta Unlocks
↓
New Run
```

目前還沒有正式實作 Stage/Wave。

------------------------------------------------------------------------

## 3. Level / XP

Level 是 **Run 內的 Build 成長系統**。

``` text
Kill
↓
XP
↓
Level Up
↓
Choose One Run Upgrade
```

Level：

-   每個新 Run 重置。
-   不控制 Wave。
-   不控制 Stage。
-   未來不應控制 Boss 出現。

目前 Fibonacci XP Requirement：

``` text
Lv1 → Lv2 : 5
Lv2 → Lv3 : 8
Lv3 → Lv4 : 13
Lv4 → Lv5 : 21
Lv5 → Lv6 : 34
...
```

目前 prototype upgrades：

1.  Damage +1
2.  Bullet Speed +100
3.  Bullet Size +2

這些只是暫時測試。

未來應改成有 Build 意義的選擇，例如：

-   Rapid Fire
-   Heavy Shot
-   Split Shot
-   Vitality
-   Swift Feet
-   其他特殊 Upgrade

------------------------------------------------------------------------

## 4. Score 的新定位

目前程式中的 Score 還只是：

``` text
實際 bullet kill → Score +1
```

這只是 prototype，準備重做。

正式設計：

> **Score = 玩家這一個 Run 的整體表現分數。**

Score：

-   不直接增加戰鬥力。
-   可以讓玩家自由追求非常高的分數。
-   不需要因為怕刷 Points 而過度限制 Score。
-   Score 本身可以成為高分玩法與紀錄。

目前預計主要來源：

``` text
Base Score
├─ Enemy Kill
├─ Wave Clear
├─ Boss Kill
└─ Stage Clear

Performance Score
├─ Flawless Wave
├─ Quick Clear
├─ Last Stand
├─ Priority Target
└─ Flawless Boss
```

------------------------------------------------------------------------

## 5. Score 與 Points 必須分離

已確立的重要原則：

> **Score 負責獎勵玩家的遊戲表現；Points 結算系統負責控制永久經濟。**

流程：

``` text
Gameplay
↓
Score
↓
Run Settlement
↓
Hidden Evaluation
↓
Points
↓
Permanent Unlocks
```

因此 Score 可以很高：

``` text
Normal Run       30,000 Score
Strong Build     80,000 Score
Excellent Run   150,000 Score
```

不需要因為 Score 高就限制遊戲內得分。

真正控制經濟的是：

``` text
Score → Points
```

而且：

> **Score 不與 Points 1:1 換算。**

------------------------------------------------------------------------

## 6. Hidden Score / Points Settlement

Points 是永久貨幣。

Points 主要用於解鎖：

-   Weapons
-   Equipment
-   Items
-   新 Upgrade possibilities
-   其他 Meta Content

Points 不應主要用來永久增加：

-   Damage
-   HP
-   Speed
-   等純數值能力

### 隱分機制

兩個玩家可能都有：

``` text
Score = 100,000
```

但：

``` text
Player A
Stage 4
Boss kills 3
正常向前推進

→ 可能得到較多 Points
```

``` text
Player B
Stage 1
大量重複刷怪

→ 可能得到較少 Points
```

玩家仍然保有完整的 100,000 Score。

Hidden Settlement 可以考慮：

``` text
Final Score
│
├─ Progress
│  ├─ Stage
│  └─ Wave
│
├─ Boss Progress
│
├─ Score Quality
│  └─ 是否過度來自重複行為
│
├─ Performance
│
└─ Diminishing Returns
   └─ 超高 Score 邊際收益下降
        ↓
      Points
```

### 重要原則

隱分：

-   可以防止刷 Points。
-   不應懲罰正常玩家。
-   不應因為玩家技術較差、在 Stage 1 待比較久，就直接判定為 farming。
-   應採用柔性 diminishing returns，而不是突然砍半。

例如不要：

``` text
Run 超過 10 分鐘
→ Points × 0.5
```

而比較適合：

``` text
正常重複 → 正常收益
大量重複 → 邊際收益逐漸下降
極端刷取 → 更明顯衰減
```

精確公式目前尚未決定。

------------------------------------------------------------------------

## 7. Performance Score

目前選定五種：

### 7.1 Flawless Wave

整個 Wave：

``` text
Wave Start
↓
沒有受到任何 Damage
↓
Wave Clear
↓
FLAWLESS WAVE
```

### 7.2 Quick Clear

玩家比該 Wave 的「預期基本清除時間」更快完成。

不是所有 Wave 使用固定秒數。

應建立：

``` text
calculateExpectedClearTime(wave)
```

基本概念：

\[ W = `\sum `{=tex}(N_i `\times `{=tex}C_i) \]

其中：

-   `Ni` = 第 i 種 Enemy 數量
-   `Ci` = 該 Enemy 的預期處理成本 / time weight

再計算：

\[ T\_{expected} = T\_{base} + T\_{combat} + T\_{spawn} + T\_{special}
\]

其中：

-   `T_base`：固定操作 / 移動成本
-   `T_combat`：Enemy composition 的處理成本
-   `T_spawn`：分批 Spawn 帶來的最低等待時間
-   `T_special`：特殊 Wave 機制造成的額外時間

成功基本條件：

\[ T\_{actual} \< T\_{expected} \]

另外可以計算：

\[ R = `\frac{T_{actual}}{T_{expected}}`{=tex} \]

因此不是只有成功/失敗，也可以根據「快多少」決定 Bonus 大小。

例如概念上：

``` text
R > 1.00 → no Quick Clear
R ≈ 0.90 → Quick Clear
R ≈ 0.70 → stronger bonus
R ≈ 0.50 → very strong bonus
```

實際數字尚未決定。

### Quick Clear 的重要規則

**不要根據玩家當前 Build / Damage 動態提高標準。**

否則：

``` text
玩家成功建立強 Build
↓
Expected Time 也跟著下降
↓
Quick Clear 反而沒有變容易
```

這會破壞 Build 成長的回饋。

Expected Clear Time 應主要由 **Wave 本身**決定。

好的 Build：

``` text
更快清怪
↓
更容易 Quick Clear
↓
更高 Score
```

未來可以利用實際 Playtest 資料調整 Enemy Cost，而不需要逐 Wave
手動改秒數。

------------------------------------------------------------------------

### 7.3 Last Stand

目前只確立概念，**下一個需要深入設計的項目就是這個。**

初步方向：

> 玩家在低 HP 狀態下仍然進行有效戰鬥，可以取得額外 Score。

不建議：

``` text
低 HP 狀態待得越久
→ Score 越多
```

因為會鼓勵逃跑 / 拖時間。

比較合理的方向：

``` text
Low HP
+
Enemy Kill / meaningful combat action
↓
LAST STAND BONUS
```

尚未決定：

-   Low HP 使用固定 HP 還是 `HP / MaxHP` 比例。
-   觸發門檻。
-   Bonus 按 Kill、Enemy value 或其他方式計算。
-   是否存在更低 HP → 更高倍率。

**新聊天室可以從這裡繼續討論。**

------------------------------------------------------------------------

### 7.4 Priority Target

未來特殊 Enemy 會具有戰鬥角色，例如：

-   Shooter
-   Buffer
-   Summoner
-   Dasher
-   Tank
-   其他

Priority Target 不應只是：

``` text
Kill Tank → Bonus
```

而應該獎勵玩家辨識戰場威脅並快速處理。

例如：

``` text
Buffer 出現
↓
開始強化其他 Enemy
↓
玩家迅速擊殺
↓
PRIORITY TARGET
```

或：

``` text
Summoner 出現
↓
會持續召喚 Enemy
↓
玩家在大量召喚前擊殺
↓
PRIORITY TARGET
```

詳細判定尚未設計。

------------------------------------------------------------------------

### 7.5 Flawless Boss

概念：

``` text
Boss Fight Start
↓
玩家沒有受到 Damage
↓
Boss Defeated
↓
FLAWLESS BOSS
```

詳細 Bonus 數值尚未設計。

------------------------------------------------------------------------

## 8. Stage / Wave 規劃

目前暫定第一版：

``` text
Stage 1
├─ Wave 1
├─ Wave 2
├─ Wave 3
├─ Wave 4
├─ Wave 5
└─ Boss 1
    ↓
Stage Complete
```

第一版主要目標是證明：

``` text
Stage
→ Waves
→ Boss
→ Stage Complete
```

不一定立即製作完整 Stage 2。

### Wave

偏好 enemy-count / clear-based Wave，而不是單純 timed survival。

例如：

``` text
Wave has finite scheduled enemies
↓
Enemies spawn in batches
↓
All scheduled enemies spawned
+
Field cleared
↓
Wave Complete
```

Wave 主要控制：

-   Enemy quantity
-   Enemy composition
-   Spawn pacing
-   Special wave mechanics

### Stage

Stage 主要控制：

-   Base difficulty
-   Enemy pool
-   新 Enemy roles
-   Boss
-   未來 map/environment

不要主要靠：

``` text
Wave +1 → Enemy HP +20%
```

來增加難度。

### Intermission

Wave 之間可以有約 3--5 秒正式 Intermission State。

未來可用於：

-   Drops
-   Build inspection
-   Equipment
-   Rewards
-   UI information

------------------------------------------------------------------------

## 9. Boss

目前 Boss 已經存在，但仍是 prototype。

目前程式：

-   Boss 在 Level ≥ 5 時 Spawn。
-   Boss 100×100。
-   Speed 50。
-   HP 50。
-   獨立 `boss` object，不屬於普通 `enemies` array。
-   Bullet 可以造成 Damage。
-   Boss contact 每 1 秒造成 1 Damage。
-   Boss death：
    -   `boss = null`
    -   `isBossDefeated = true`
    -   永久紀錄 `boss-1`
    -   不觸發 Victory
    -   Gameplay 繼續

未來：

> **Boss 必須從 Level 系統移除，改由 Stage/Wave Progression 觸發。**

Boss Reward 也需要之後設計。

------------------------------------------------------------------------

## 10. Run Settlement 尚未完成

目前需要之後決定：

### Death

``` text
Death
→ Settlement
→ Score conversion
→ Points
```

這個方向明確。

### 尚未決定

-   Stage 1 Boss clear 是否立即 Settlement？
-   Victory 如何 Settlement？
-   Voluntary Abandon 是否可以領 Points？
-   Browser / Tab close 如何處理？
-   Mid-run exit 是否可以領完整 Points？
-   Victory 是否有額外 Bonus？

需要避免：

``` text
Farm 到安全門檻
↓
Abandon
↓
Cash Out
↓
Restart
↓
Repeat
```

未來應正式建立 Run lifecycle：

``` text
New Run
→ Playing
→ Stage Progression
→ Death / Victory / Abandon
→ Settlement
→ Meta Points
→ Meta Unlock
→ New Run
```

------------------------------------------------------------------------

## 11. Save System

目前使用：

``` text
Browser localStorage
```

Storage key：

``` js
"canva-war-save"
```

目前 schema：

``` js
{
  version: 2,

  progression: {
    highestStage: 1,
    defeatedBosses: [],
    points: 0
  },

  unlocks: {
    weapons: ["starter"],
    equipment: [],
    deployables: [],
    summons: []
  },

  statistics: {
    totalRuns: 0,
    totalKills: 0
  }
}
```

目前：

-   Missing save → defaults
-   Invalid JSON → defaults
-   Invalid shape → defaults
-   Play button → `totalRuns += 1`
-   Bullet-killed normal Enemy → `totalKills += 1`
-   Contact removal 不算 Kill
-   Boss 1 第一次擊敗記錄 `"boss-1"`
-   Boss defeat 不觸發 Victory
-   Active Run 不 Persist
-   Storage error 不應停止 Gameplay

### Run State 不保存

目前故意不保存：

-   Current HP
-   Position
-   Level
-   XP
-   Stage/Wave（未來）
-   Current build
-   Enemies
-   Bullets
-   Hazards
-   Boss HP
-   Spawn timers
-   Battlefield runtime
-   Navigation paths
-   Active Deployables / Summons
-   Temporary buffs
-   Input state

Crash / tab close：

``` text
Current Run lost
Meta Progress retained
```

未來可以另外設計 Run Save / Continue Run，但現在不做。

### Save 注意事項

目前每次 Kill 都 `saveGame()`。

現在規模小可以接受。

未來可能改成：

-   Important meta event → immediate save
-   Statistics → batch / debounce

Save 已有：

``` text
version: 2
```

已有明確、可重複安全執行的 v1 → v2 migration；缺少的新 unlock arrays 會安全正規化為空陣列。

------------------------------------------------------------------------

## 12. 現有 Gameplay

### Player

``` js
const player = {
  x: 380,
  y: 280,
  width: 40,
  height: 40,
  speed: 240,
  hp: 5,
  maxHp: 5
};
```

功能：

-   WASD
-   Key-state movement
-   Delta time
-   Normalized diagonal movement
-   Canvas clamp

### Enemies

目前三種：

``` js
normal
width 40
height 40
speed 120
hp 3

fast
width 30
height 30
speed 200
hp 1

tank
width 60
height 60
speed 70
hp 8
```

目前：

-   Chase player
-   Enemy-enemy collision
-   Player can push enemies
-   Contact damage
-   Random four-edge spawning
-   Spawn every 2 seconds
-   Max 10 enemies

未來需要更多 **behavior roles**，而不是單純 stats variants。

### Shooting

目前：

-   Mouse canvas-relative aiming
-   Click shoots
-   Bullet starts from player center
-   Bullet stores direction at fire time
-   Off-canvas bullets cleaned backwards

Weapon prototype：

``` js
const weapon = {
  damage: 1,
  bulletSpeed: 480,
  bulletSize: 10
};
```

Bullets copy weapon values when fired.

### Collision

-   AABB `isOverlapping`
-   Bullet-enemy nested backwards loops
-   One bullet hits at most one enemy
-   Enemy death by bullet gives Score/XP/Kill
-   Enemy contact removal does not

### Death / Restart

-   HP reaches 0 → Game Over
-   Game updates stop
-   Rendering / rAF continues
-   R restarts
-   Reset clears run/input state

------------------------------------------------------------------------

## 13. Interface

Player-facing game name:

# CANVA WAR

Project folder remains:

``` text
C:\Game01
```

HTML structure：

``` text
Start Screen
├─ CANVA WAR
└─ Play

Game Interface
├─ HUD
│  ├─ HP
│  ├─ Score
│  ├─ Level
│  └─ XP
│
├─ Canvas 800×600
│
└─ Inventory Area
```

Inventory 目前只是 placeholder。

CSS：

-   Dark background
-   Start screen centered
-   Game HUD
-   Canvas + Inventory grid
-   ≤1100px inventory stacks below
-   ≤600px reduced padding
-   Canvas logical coordinate remains 800×600

------------------------------------------------------------------------

## 14. Tests

Dependency-free tests：

``` text
tests/game.test.js
```

Phase 2.3 完成時：

``` text
11 / 11 tests passed
git diff --check passed
```

重要 regression tests 包括：

-   End-state movement input 不會帶進 restart。
-   Enemy kill 觸發 Upgrade 時，同 frame 不繼續 Boss bullet collision。
-   Enemy contact 導致 Game Over 時，同 frame 不繼續 Boss contact。
-   Save fallback。
-   totalRuns。
-   totalKills。
-   Boss persistence。
-   Boss defeat 不觸發 Victory。
-   Start screen / gameplay regression。

------------------------------------------------------------------------

## 15. Git / Development Workflow

Project：

``` powershell
cd C:\Game01
```

Local server：

``` powershell
python -m http.server 8080
```

實際 Browser behavior 優先於 Codex summary。

JS 改動後：

``` text
Refresh
```

CSS cache 問題：

``` text
Ctrl + F5
```

目前已有：

-   `AGENTS.md`
-   `README.md`

Codex 可以管理整個 Game01 project。

### Chat workflow

同一個 coherent feature/task：

> 優先留在同一個 Codex chat。

以下情況可開新 chat：

-   Feature/version 完成
-   Context 太亂
-   開始獨立的新系統

目前使用者不需要 Git 基礎教學。

目前學習策略：

> 先快速完成整體架構，不逐行教所有程式碼。

等主要架構與系統完成後，使用者會提供完整程式，再做一次全面程式教學。

------------------------------------------------------------------------

## 16. 已完成 Roadmap

``` text
v0.1 Movement                  COMPLETE
v0.2 Enemy                     COMPLETE
v0.3 Shooting                  COMPLETE
v0.4 Bullet-enemy collision    COMPLETE
v0.5 HP / Death / Restart      COMPLETE
v0.6 Score prototype           COMPLETE
v0.7 Enemy variants            COMPLETE
v0.8 Level / Upgrade prototype COMPLETE
v0.9 Boss basic                COMPLETE

Phase 1 Core                   COMPLETE
Phase 2.1 State audit/tests    COMPLETE
Phase 2.2 Interface/content    COMPLETE
Phase 2.3 Rename + Save        COMPLETE
Battlefield/Nav/Data v1       COMPLETE
Large World/Camera v1         COMPLETE
Phase A.1 Pursuit/Density     COMPLETE
```

Phase 2.3 已 Commit。

------------------------------------------------------------------------

## 17. 建議的下一階段順序

目前較合理：

``` text
1. Finish Score design
2. Finish Points settlement/economy
3. Define Run lifecycle/settlement
4. Implement Stage/Wave/Boss progression
5. Weapons
6. Equipment
7. Item drops
8. More enemy roles
9. Balance / polish
```

順序仍可以隨設計討論調整。

------------------------------------------------------------------------

# 18. 下一個聊天室從這裡繼續

目前我們正在設計：

# PERFORMANCE SCORE

已選定：

``` text
✓ Flawless Wave
✓ Quick Clear
→ Last Stand
→ Priority Target
→ Flawless Boss
```

### Quick Clear 已完成概念設計

核心：

``` text
Wave configuration
↓
calculateExpectedClearTime(wave)
↓
Expected Clear Time
vs
Actual Clear Time
↓
Quick Clear Bonus
```

Expected Time 主要由 Wave 決定，不根據玩家當前 Build 動態提高標準。

### 下一題

接著深入設計：

# LAST STAND

需要決定：

1.  Low HP 是固定 HP 還是 Max HP 百分比？
2.  低於多少比例開始觸發？
3.  Bonus 是按 Kill 還是其他有效戰鬥行為？
4.  不同 Enemy 是否依 Enemy Score/value 給不同 Last Stand Bonus？
5.  HP 越低是否 Bonus 越高？
6.  如何避免玩家故意殘血刷 Bonus？

完成 Last Stand 後：

``` text
Priority Target
↓
Flawless Boss
↓
完整 Base Score / Performance Score 架構
↓
Points Settlement
↓
Run Lifecycle
↓
Stage / Wave implementation
```

------------------------------------------------------------------------

## 19. 給新 ChatGPT 聊天室的工作方式

請延續以上設計，不要重新從頭規劃整個遊戲。

目前優先：

1.  深入討論遊戲設計。
2.  重大系統先討論清楚，再給 Codex implementation prompt。
3.  暫時不要逐行教 code。
4.  不要急著做 balance numbers。
5.  如果發現設計會降低 replayability / gameplay quality，要直接指出。
6.  Roguelike / Roguelite 的可玩性優先於永久數值成長。
7.  永久進度主要增加選擇；Run 內進度增加力量；Stage/Wave 增加挑戰。
8.  目前從 **Last Stand Score Bonus** 繼續。

------------------------------------------------------------------------

## 20. Score → Points Settlement：目前已定案設計（2026-09-06）

目前 Score 與 Points 已明確分工：

> **Score 獎勵 Run 內表現；Points 控制永久經濟。**

Score 可以自由變得很高；Points 不與 Score 1:1 換算，且會經過 Settlement 評估。

### 20.1 Settlement 整體流程

``` text
Final Score
↓
Final Progress
↓
Efficient Score Capacity
↓
Soft Anti-Farming Diminishing Curve
↓
Effective Score
↓
Points Economy Curve
↓
Final Points
```

目前只確立架構，**尚未定案實際 balance constants / curve parameters**。

### 20.2 Efficient Score Capacity

Capacity 用來表示：

> 玩家目前的 Run Progress 合理支持多少 Score 仍維持高效率轉換。

概念：

``` text
Capacity
=
Starting Allowance
+ Completed Wave Expected Score
+ Performance Allowance
+ Boss / Stage related allowance
+ Current Encounter Allowance
+ Safety Buffer
```

重要規則：

- Capacity 主要由 Progress 決定，不由單純 Run Time 決定。
- 不使用「待越久 Capacity 越高」的設計，避免鼓勵拖時間。
- Performance Score 需要預留合理 allowance，但不能直接把實際 Performance Score 1:1 加回 Capacity，避免 exploit 自我放大。
- Current Encounter 也要有 allowance，避免玩家死在 Wave 中途時，合法 Score 被誤判成 farming。
- 防 farming 系統寧願晚介入，也不要誤傷正常玩法。

### 20.3 Anti-Farming Diminishing Returns

當：

``` text
Final Score <= Capacity
```

則正常高效率轉換。

當：

``` text
Final Score > Capacity
```

只對超出 Capacity 的 **marginal Score** 逐漸降低轉換效率，不回頭砍整個 Run。

必須保證：

``` text
More Score never results in fewer Points.
```

正式方向採用 **平滑曲線**，而不是硬分段門檻。

概念上可使用：

``` text
R = FinalScore / Capacity
```

再依 R 平滑降低超額 Score 的邊際效率。

注意：實際曲線參數尚未定案。

### 20.4 Settlement-time Evaluation

Anti-farming 不在 Score 取得當下鎖定效率，而是在 Run 結束時依：

``` text
Final Score
+
Final Progress
```

重新計算。

因此玩家若繼續向前推進並提高 Capacity，先前偏高的 Score 可以重新獲得較高轉換效率。

這會鼓勵：

``` text
High Score
↓
Continue progressing
↓
Increase Capacity
↓
Improve settlement efficiency
```

### 20.5 Effective Score → Points Economy Curve

Points 本身也採用 sub-linear / diminishing curve，以控制永久經濟。

目前偏好的形式：

``` text
P = P0 * (EffectiveScore / S0)^b
```

其中：

- `S0` = Standard Run 的典型 Effective Score
- `P0` = Standard Run 的 Points 基準
- `b` = 0 到 1 之間的曲線指數

目前經濟 target 暫定：

``` text
Standard Run ≈ 100 Points
Early Death ≈ 25–50 Points
Strong Run ≈ 130–160 Points
Exceptional Run ≈ 170–220 Points
```

Unlock pacing 暫定：

``` text
Small / Early Content ≈ 1–2 Standard Runs
Normal Content        ≈ 2–4 Standard Runs
Major Build Content   ≈ 3–6 Standard Runs
Special / Late        ≈ 6–10+ Standard Runs
```

以上仍屬 calibration target，不是最終 balance 數字。

### 20.6 Run End Reason 與 Settlement

不使用通用 Early-Run Maturity Multiplier 懲罰早死玩家。

目前規則：

| End reason | Settlement state | Points |
|---|---|---|
| Death | Current run state | 正常 Settlement |
| Victory | Current run state | 正常 Settlement |
| Abandon | Last secured checkpoint | 正常曲線計算 |
| Refresh / Tab close / Crash | none | 0 |

核心原則：

> **失敗可以獲得收益；主動安全退出不能利用未完成進度。**

### 20.7 Secured Settlement Checkpoint

Checkpoint 已定案設在：

> **Wave Clear**

每次正式 Wave Clear 後，更新一次 secured settlement snapshot。

Snapshot 至少應包含能重建 Settlement 的資料，例如：

``` text
Secured Score
Secured Progress
Secured Capacity inputs / progress state
Score Breakdown
Performance Records
```

若玩家：

``` text
Wave 3 Clear
Score = 24,000
→ checkpoint = 24,000

Wave 4 進行中
Score = 31,500

Abandon
```

則 Abandon Settlement 使用 Wave 3 Clear 時的 checkpoint state。

若同樣情況玩家在 Wave 4 **Death**：

``` text
Death
→ Settlement 使用完整 current state
→ Score = 31,500
```

### 20.8 Wave Clear 當下的正確事件順序

必須是：

``` text
All scheduled enemies defeated
↓
Wave Complete detected
↓
Award Wave Clear Score
↓
Award Performance Score
   ├─ Flawless Wave
   ├─ Quick Clear
   ├─ Last Stand related result
   ├─ Priority Target related result
   └─ 其他該 Wave 結算項目
↓
Update Final Score / Score Breakdown
↓
Create / replace secured settlement checkpoint
↓
Enter Intermission
```

不能在 Wave Clear / Performance Bonus 加分以前建立 checkpoint。

### 20.9 Boss / Encounter Checkpoint

Boss 可視為特殊 Encounter / Boss Wave。

當 Boss encounter 正式完成時，也應像 Wave Clear 一樣更新 checkpoint。

避免在：

``` text
Boss Kill
↓
Stage Clear
```

連續建立兩份相同 settlement snapshot；以正式 Encounter Clear 作為 checkpoint event 即可。

### 20.10 目前實作邊界

現在可以先實作：

- Run settlement data model / state skeleton
- Score breakdown tracking 所需結構
- secured checkpoint snapshot / restore-for-abandon 邏輯
- Wave Clear 後正確 checkpoint 順序
- Death / Victory / Abandon / external exit 的 settlement-state selection
- Anti-farming / Points conversion 的純函式介面與 placeholder/configurable constants
- regression tests

目前**不要自行定案**：

- 最終 Capacity balance constants
- 最終 anti-farming curve coefficient
- `S0`
- `b`
- unlock prices
- 最終 Score 數值

這些待 Stage/Wave 真正可玩、取得 playtest data 後校準。

------------------------------------------------------------------------

## 21. 下一步

目前優先順序更新為：

``` text
1. Implement Score → Points Settlement skeleton + checkpoints
2. Define / implement Run lifecycle states
3. Implement Stage / Wave / Boss progression
4. Collect playtest Score / clear-time data
5. Calibrate Capacity + Points curves
6. Weapons
7. Equipment
8. Item drops
9. More enemy roles
10. Balance / polish
```

Codex 實作時應保持目前設計原則：

- 不要讓 Score 與 Points 1:1 綁死。
- 不要懲罰正常早死玩家。
- Abandon 只能使用最後 secured Wave Clear checkpoint。
- Death 使用完整 current run settlement state。
- More Score 永遠不能導致 fewer Points。
- 未定案數值應集中成 config / placeholder，避免散落 magic numbers。
