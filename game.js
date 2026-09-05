const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

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
const maxEnemies = 10;
const spawnInterval = 2;
let spawnTimer = 0;
let isGameOver = false;

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

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();

  mouse.x = event.clientX - rect.left;
  mouse.y = event.clientY - rect.top;
});

canvas.addEventListener("click", () => {
  if (isGameOver) {
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
    x: playerCenterX - 5,
    y: playerCenterY - 5,
    width: 10,
    height: 10,
    speed: 480,
    damage: 1,
    directionX,
    directionY
  };

  bullets.push(bullet);
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === "r" && isGameOver) {
    resetGame();
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
  spawnTimer = 0;
  isGameOver = false;
}

function update(deltaTime) {
  if (isGameOver) {
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
  handlePlayerEnemyCollisions();

  if (isGameOver) {
    return;
  }

  updateBullets(deltaTime);
  handleBulletEnemyCollisions();
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
  const enemy = {
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    speed: 120,
    hp: 3,
    maxHp: 3
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
        }

        break;
      }
    }
  }
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
  ctx.fillStyle = "#dc2626";

  for (const enemy of enemies) {
    ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
    drawHealthBar(enemy);
  }
}

function drawBullets() {
  ctx.fillStyle = "#facc15";

  for (const bullet of bullets) {
    ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
  }
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

let lastTime = null;

function gameLoop(timestamp) {
  const deltaTime = lastTime === null ? 0 : (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  update(deltaTime);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawPlayer();
  drawEnemies();
  drawBullets();
  drawGameOver();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
