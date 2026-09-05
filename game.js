const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const player = {
  x: 380,
  y: 280,
  width: 40,
  height: 40,
  speed: 240
};

const enemies = [];
const maxEnemies = 10;
const spawnInterval = 2;
let spawnTimer = 0;

const keys = {
  w: false,
  a: false,
  s: false,
  d: false
};

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

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

function update(deltaTime) {
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
    speed: 120
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

function hasEnemyCollision(enemy) {
  return isOverlapping(enemy, player) || hasOtherEnemyCollision(enemy);
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

      if (hasEnemyCollision(enemy)) {
        enemy.x -= directionX * enemy.speed * deltaTime;
      }

      enemy.y += directionY * enemy.speed * deltaTime;

      if (hasEnemyCollision(enemy)) {
        enemy.y -= directionY * enemy.speed * deltaTime;
      }
    }
  }
}

function drawPlayer() {
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(player.x, player.y, player.width, player.height);
}

function drawEnemies() {
  ctx.fillStyle = "#dc2626";

  for (const enemy of enemies) {
    ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
  }
}

let lastTime = null;

function gameLoop(timestamp) {
  const deltaTime = lastTime === null ? 0 : (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  update(deltaTime);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawPlayer();
  drawEnemies();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
