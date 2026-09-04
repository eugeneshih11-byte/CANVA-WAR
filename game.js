const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const player = {
  x: 380,
  y: 280,
  width: 40,
  height: 40,
  speed: 240
};

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
    player.x += directionX * player.speed * deltaTime;
    player.y += directionY * player.speed * deltaTime;
  }

  player.x = Math.max(0, Math.min(player.x, canvas.width - player.width));
  player.y = Math.max(0, Math.min(player.y, canvas.height - player.height));
}

function drawPlayer() {
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(player.x, player.y, player.width, player.height);
}

let lastTime = null;

function gameLoop(timestamp) {
  const deltaTime = lastTime === null ? 0 : (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  update(deltaTime);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawPlayer();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
