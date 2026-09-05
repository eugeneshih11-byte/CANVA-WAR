const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const startScreen = document.getElementById("startScreen");
const gameInterface = document.getElementById("gameInterface");
const playButton = document.getElementById("playButton");
const hpValue = document.getElementById("hpValue");
const scoreValue = document.getElementById("scoreValue");
const levelValue = document.getElementById("levelValue");
const xpValue = document.getElementById("xpValue");

const saveStorageKey = "canva-war-save";
let saveData = loadSave();

function createDefaultSaveData() {
  return {
    version: 1,
    progression: {
      highestStage: 1,
      defeatedBosses: []
    },
    unlocks: {
      weapons: ["starter"],
      equipment: []
    },
    statistics: {
      totalRuns: 0,
      totalKills: 0
    }
  };
}

function isValidSaveData(data) {
  return (
    data &&
    typeof data === "object" &&
    data.version === 1 &&
    data.progression &&
    typeof data.progression.highestStage === "number" &&
    Array.isArray(data.progression.defeatedBosses) &&
    data.unlocks &&
    Array.isArray(data.unlocks.weapons) &&
    Array.isArray(data.unlocks.equipment) &&
    data.statistics &&
    typeof data.statistics.totalRuns === "number" &&
    typeof data.statistics.totalKills === "number"
  );
}

function loadSave() {
  try {
    const savedData = localStorage.getItem(saveStorageKey);

    if (!savedData) {
      return createDefaultSaveData();
    }

    const parsedData = JSON.parse(savedData);
    return isValidSaveData(parsedData) ? parsedData : createDefaultSaveData();
  } catch {
    return createDefaultSaveData();
  }
}

function saveGame() {
  try {
    localStorage.setItem(saveStorageKey, JSON.stringify(saveData));
  } catch {
    // Saving is optional for the active local run; a storage error must not stop gameplay.
  }
}

function recordBossOneDefeat() {
  if (!saveData.progression.defeatedBosses.includes("boss-1")) {
    saveData.progression.defeatedBosses.push("boss-1");
    saveGame();
  }
}

const player = {
  x: 380,
  y: 280,
  width: 40,
  height: 40,
  speed: 240,
  hp: 5,
  maxHp: 5
};

const enemies = [];
const bullets = [];
let boss = null;
let hasBossSpawned = false;
let isBossDefeated = false;
let bossDamageCooldown = 0;
const bossDamageCooldownDuration = 1;
const weapon = {
  damage: 1,
  bulletSpeed: 480,
  bulletSize: 10
};
const maxEnemies = 10;
const spawnInterval = 2;
const enemyStats = {
  normal: { width: 40, height: 40, speed: 120, hp: 3, maxHp: 3 },
  fast: { width: 30, height: 30, speed: 200, hp: 1, maxHp: 1 },
  tank: { width: 60, height: 60, speed: 70, hp: 8, maxHp: 8 }
};
const enemyColors = {
  normal: "#dc2626",
  fast: "#f97316",
  tank: "#7c3aed"
};
let spawnTimer = 0;
let isGameStarted = false;
let isGameOver = false;
let isVictory = false;
let isChoosingUpgrade = false;
let score = 0;
let level = 1;
let xp = 0;
let previousXpRequirement = 3;
let xpToNextLevel = 5;

const keys = {
  w: false,
  a: false,
  s: false,
  d: false
};

const mouse = {
  x: 0,
  y: 0
};

playButton.addEventListener("click", () => {
  resetGame();
  saveData.statistics.totalRuns += 1;
  saveGame();
  isGameStarted = true;
  startScreen.hidden = true;
  gameInterface.hidden = false;
  updateHud();
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();

  mouse.x = event.clientX - rect.left;
  mouse.y = event.clientY - rect.top;
});

canvas.addEventListener("click", () => {
  if (!isGameStarted || isGameOver || isVictory || isChoosingUpgrade) {
    return;
  }

  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  let directionX = mouse.x - playerCenterX;
  let directionY = mouse.y - playerCenterY;
  const directionLength = Math.hypot(directionX, directionY);

  if (directionLength > 0) {
    directionX /= directionLength;
    directionY /= directionLength;
  }

  const bullet = {
    x: playerCenterX - weapon.bulletSize / 2,
    y: playerCenterY - weapon.bulletSize / 2,
    width: weapon.bulletSize,
    height: weapon.bulletSize,
    speed: weapon.bulletSpeed,
    damage: weapon.damage,
    directionX,
    directionY
  };

  bullets.push(bullet);
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === "r" && (isGameOver || isVictory)) {
    resetGame();
    return;
  }

  if (!isGameStarted || isGameOver || isVictory) {
    return;
  }

  if (isChoosingUpgrade) {
    if (!event.repeat) {
      chooseUpgrade(key);
    }
    return;
  }

  if (key in keys) {
    keys[key] = true;
  }
});

document.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();

  if (key in keys) {
    keys[key] = false;
  }
});

function resetGame() {
  player.x = 380;
  player.y = 280;
  player.hp = player.maxHp;
  enemies.length = 0;
  bullets.length = 0;
  boss = null;
  hasBossSpawned = false;
  isBossDefeated = false;
  bossDamageCooldown = 0;
  spawnTimer = 0;
  isGameOver = false;
  isVictory = false;
  isChoosingUpgrade = false;
  score = 0;
  level = 1;
  xp = 0;
  previousXpRequirement = 3;
  xpToNextLevel = 5;
  weapon.damage = 1;
  weapon.bulletSpeed = 480;
  weapon.bulletSize = 10;
  keys.w = false;
  keys.a = false;
  keys.s = false;
  keys.d = false;
}

function update(deltaTime) {
  if (!isGameStarted || isGameOver || isVictory || isChoosingUpgrade) {
    return;
  }

  let directionX = 0;
  let directionY = 0;

  if (keys.w) directionY -= 1;
  if (keys.s) directionY += 1;
  if (keys.a) directionX -= 1;
  if (keys.d) directionX += 1;

  const directionLength = Math.hypot(directionX, directionY);

  if (directionLength > 0) {
    directionX /= directionLength;
    directionY /= directionLength;
    const movementX = directionX * player.speed * deltaTime;
    const movementY = directionY * player.speed * deltaTime;

    player.x += movementX;
    const enemyOnX = getPlayerCollision();

    if (enemyOnX && !pushEnemy(enemyOnX, movementX, 0)) {
      player.x -= movementX;
    }

    player.y += movementY;
    const enemyOnY = getPlayerCollision();

    if (enemyOnY && !pushEnemy(enemyOnY, 0, movementY)) {
      player.y -= movementY;
    }
  }

  player.x = Math.max(0, Math.min(player.x, canvas.width - player.width));
  player.y = Math.max(0, Math.min(player.y, canvas.height - player.height));

  updateEnemySpawning(deltaTime);
  updateEnemies(deltaTime);
  updateBossSpawning();
  updateBoss(deltaTime);
  updateBossDamageCooldown(deltaTime);
  handlePlayerEnemyCollisions();

  if (isGameOver) {
    return;
  }

  handleBossPlayerCollision();

  if (isGameOver) {
    return;
  }

  updateBullets(deltaTime);
  handleBulletEnemyCollisions();

  if (isChoosingUpgrade) {
    return;
  }

  handleBulletBossCollisions();
}

function updateBullets(deltaTime) {
  for (let index = bullets.length - 1; index >= 0; index--) {
    const bullet = bullets[index];

    bullet.x += bullet.directionX * bullet.speed * deltaTime;
    bullet.y += bullet.directionY * bullet.speed * deltaTime;

    const isOutsideCanvas =
      bullet.x + bullet.width < 0 ||
      bullet.x > canvas.width ||
      bullet.y + bullet.height < 0 ||
      bullet.y > canvas.height;

    if (isOutsideCanvas) {
      bullets.splice(index, 1);
    }
  }
}

function updateEnemySpawning(deltaTime) {
  spawnTimer += deltaTime;

  while (spawnTimer >= spawnInterval) {
    spawnTimer -= spawnInterval;

    if (enemies.length < maxEnemies) {
      spawnEnemy();
    }
  }
}

function spawnEnemy() {
  const types = Object.keys(enemyStats);
  const type = types[Math.floor(Math.random() * types.length)];
  const stats = enemyStats[type];
  const enemy = {
    type,
    x: 0,
    y: 0,
    width: stats.width,
    height: stats.height,
    speed: stats.speed,
    hp: stats.hp,
    maxHp: stats.maxHp
  };
  const edge = Math.floor(Math.random() * 4);

  if (edge === 0) {
    enemy.x = Math.random() * (canvas.width - enemy.width);
  } else if (edge === 1) {
    enemy.x = canvas.width - enemy.width;
    enemy.y = Math.random() * (canvas.height - enemy.height);
  } else if (edge === 2) {
    enemy.x = Math.random() * (canvas.width - enemy.width);
    enemy.y = canvas.height - enemy.height;
  } else {
    enemy.y = Math.random() * (canvas.height - enemy.height);
  }

  enemies.push(enemy);
}

function updateBossSpawning() {
  if (level >= 5 && !hasBossSpawned && !isBossDefeated) {
    spawnBoss();
  }
}

function spawnBoss() {
  boss = {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    speed: 50,
    hp: 50,
    maxHp: 50
  };
  const edge = Math.floor(Math.random() * 4);

  if (edge === 0) {
    boss.x = Math.random() * (canvas.width - boss.width);
  } else if (edge === 1) {
    boss.x = canvas.width - boss.width;
    boss.y = Math.random() * (canvas.height - boss.height);
  } else if (edge === 2) {
    boss.x = Math.random() * (canvas.width - boss.width);
    boss.y = canvas.height - boss.height;
  } else {
    boss.y = Math.random() * (canvas.height - boss.height);
  }

  hasBossSpawned = true;
}

function isOverlapping(rectangleA, rectangleB) {
  return (
    rectangleA.x < rectangleB.x + rectangleB.width &&
    rectangleA.x + rectangleA.width > rectangleB.x &&
    rectangleA.y < rectangleB.y + rectangleB.height &&
    rectangleA.y + rectangleA.height > rectangleB.y
  );
}

function handleBulletEnemyCollisions() {
  for (let bulletIndex = bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
    const bullet = bullets[bulletIndex];

    for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
      const enemy = enemies[enemyIndex];

      if (isOverlapping(bullet, enemy)) {
        enemy.hp -= bullet.damage;
        bullets.splice(bulletIndex, 1);

        if (enemy.hp <= 0) {
          enemies.splice(enemyIndex, 1);
          score += 1;
          xp += 1;
          saveData.statistics.totalKills += 1;
          saveGame();
          updateLevel();

          if (isChoosingUpgrade) {
            return;
          }
        }

        break;
      }
    }
  }
}

function handleBulletBossCollisions() {
  if (!boss) {
    return;
  }

  for (let bulletIndex = bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
    const bullet = bullets[bulletIndex];

    if (isOverlapping(bullet, boss)) {
      boss.hp -= bullet.damage;
      bullets.splice(bulletIndex, 1);

      if (boss.hp <= 0) {
        boss = null;
        isBossDefeated = true;
        recordBossOneDefeat();
        return;
      }
    }
  }
}

function updateLevel() {
  if (isChoosingUpgrade || xp < xpToNextLevel) {
    return;
  }

  xp -= xpToNextLevel;
  level += 1;
  updateBossSpawning();

  const nextXpRequirement = previousXpRequirement + xpToNextLevel;
  previousXpRequirement = xpToNextLevel;
  xpToNextLevel = nextXpRequirement;
  isChoosingUpgrade = true;
}

function chooseUpgrade(key) {
  if (key === "1") {
    weapon.damage += 1;
  } else if (key === "2") {
    weapon.bulletSpeed += 100;
  } else if (key === "3") {
    weapon.bulletSize += 2;
  } else {
    return;
  }

  isChoosingUpgrade = false;
  updateLevel();
}

function handlePlayerEnemyCollisions() {
  for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
    const enemy = enemies[enemyIndex];

    if (isOverlapping(player, enemy)) {
      player.hp -= 1;
      enemies.splice(enemyIndex, 1);

      if (player.hp <= 0) {
        player.hp = 0;
        isGameOver = true;
        return;
      }
    }
  }
}

function handleBossPlayerCollision() {
  if (!boss || !isOverlapping(player, boss)) {
    return;
  }

  if (bossDamageCooldown > 0) {
    return;
  }

  player.hp -= 1;
  bossDamageCooldown = bossDamageCooldownDuration;

  if (player.hp <= 0) {
    player.hp = 0;
    isGameOver = true;
  }
}

function updateBossDamageCooldown(deltaTime) {
  bossDamageCooldown = Math.max(0, bossDamageCooldown - deltaTime);
}

function getPlayerCollision() {
  for (const enemy of enemies) {
    if (isOverlapping(player, enemy)) {
      return enemy;
    }
  }

  return null;
}

function isInsideCanvas(rectangle) {
  return (
    rectangle.x >= 0 &&
    rectangle.x + rectangle.width <= canvas.width &&
    rectangle.y >= 0 &&
    rectangle.y + rectangle.height <= canvas.height
  );
}

function pushEnemy(enemy, movementX, movementY) {
  enemy.x += movementX;
  enemy.y += movementY;

  if (!isInsideCanvas(enemy) || hasOtherEnemyCollision(enemy)) {
    enemy.x -= movementX;
    enemy.y -= movementY;
    return false;
  }

  return true;
}

function hasOtherEnemyCollision(enemy) {
  for (const otherEnemy of enemies) {
    if (otherEnemy !== enemy && isOverlapping(enemy, otherEnemy)) {
      return true;
    }
  }

  return false;
}

function updateEnemies(deltaTime) {
  for (const enemy of enemies) {
    let directionX = player.x - enemy.x;
    let directionY = player.y - enemy.y;
    const directionLength = Math.hypot(directionX, directionY);

    if (directionLength > 0) {
      directionX /= directionLength;
      directionY /= directionLength;
      enemy.x += directionX * enemy.speed * deltaTime;

      if (hasOtherEnemyCollision(enemy)) {
        enemy.x -= directionX * enemy.speed * deltaTime;
      }

      enemy.y += directionY * enemy.speed * deltaTime;

      if (hasOtherEnemyCollision(enemy)) {
        enemy.y -= directionY * enemy.speed * deltaTime;
      }
    }
  }
}

function updateBoss(deltaTime) {
  if (!boss) {
    return;
  }

  let directionX = player.x - boss.x;
  let directionY = player.y - boss.y;
  const directionLength = Math.hypot(directionX, directionY);

  if (directionLength > 0) {
    directionX /= directionLength;
    directionY /= directionLength;
    boss.x += directionX * boss.speed * deltaTime;
    boss.y += directionY * boss.speed * deltaTime;
  }

  boss.x = Math.max(0, Math.min(boss.x, canvas.width - boss.width));
  boss.y = Math.max(0, Math.min(boss.y, canvas.height - boss.height));
}

function drawPlayer() {
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(player.x, player.y, player.width, player.height);
  drawHealthBar(player);
}

function drawHealthBar(entity) {
  const healthRatio = entity.hp / entity.maxHp;
  const barHeight = 5;
  const barY = entity.y - barHeight - 3;

  ctx.save();
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(entity.x, barY, entity.width, barHeight);

  ctx.fillStyle = "#22c55e";
  ctx.fillRect(entity.x, barY, entity.width * healthRatio, barHeight);
  ctx.restore();
}

function drawEnemies() {
  for (const enemy of enemies) {
    ctx.fillStyle = enemyColors[enemy.type];
    ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
    drawHealthBar(enemy);
  }
}

function drawBoss() {
  if (!boss) {
    return;
  }

  ctx.fillStyle = "#7e22ce";
  ctx.fillRect(boss.x, boss.y, boss.width, boss.height);
  drawHealthBar(boss);
}

function drawBullets() {
  ctx.fillStyle = "#facc15";

  for (const bullet of bullets) {
    ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
  }
}

function drawWeaponDamage() {
  ctx.save();
  ctx.fillStyle = "#111827";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`Damage: ${weapon.damage}`, canvas.width - 15, 30);
  ctx.restore();
}

function updateHud() {
  hpValue.textContent = `${player.hp} / ${player.maxHp}`;
  scoreValue.textContent = score;
  levelValue.textContent = level;
  xpValue.textContent = `${xp} / ${xpToNextLevel}`;
}

function drawUpgradeChoices() {
  if (!isChoosingUpgrade || isVictory) {
    return;
  }

  ctx.save();
  ctx.fillStyle = "rgba(17, 24, 39, 0.8)";
  ctx.fillRect(100, 160, 600, 280);
  ctx.fillStyle = "#ffffff";
  ctx.font = "32px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Choose an Upgrade", canvas.width / 2, 220);
  ctx.font = "24px sans-serif";
  ctx.fillText("1: Damage +1", canvas.width / 2, 280);
  ctx.fillText("2: Bullet Speed +100", canvas.width / 2, 330);
  ctx.fillText("3: Bullet Size +2", canvas.width / 2, 380);
  ctx.restore();
}

function drawGameOver() {
  if (!isGameOver) {
    return;
  }

  ctx.save();
  ctx.fillStyle = "#111827";
  ctx.font = "48px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2);
  ctx.font = "20px sans-serif";
  ctx.fillText("Press R to Restart", canvas.width / 2, canvas.height / 2 + 40);
  ctx.restore();
}

function drawVictory() {
  if (!isVictory) {
    return;
  }

  ctx.save();
  ctx.fillStyle = "#111827";
  ctx.font = "48px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("YOU WIN", canvas.width / 2, canvas.height / 2);
  ctx.font = "20px sans-serif";
  ctx.fillText("Press R to Restart", canvas.width / 2, canvas.height / 2 + 40);
  ctx.restore();
}

let lastTime = null;

function gameLoop(timestamp) {
  const deltaTime = lastTime === null ? 0 : (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  update(deltaTime);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawPlayer();
  drawEnemies();
  drawBoss();
  drawBullets();
  drawWeaponDamage();
  drawUpgradeChoices();
  drawGameOver();
  drawVictory();
  updateHud();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
