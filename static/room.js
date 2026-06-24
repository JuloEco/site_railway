// ============================================================
// Page salon — lobby + moteur de jeu N joueurs (2 a 4)
// ============================================================

const ROOM_CODE = document.querySelector(".scope").dataset.roomCode;

const COLOR_HEX = {
  red: "#d6543c",
  blue: "#4f8fae",
  yellow: "#c9a227",
  purple: "#8a5fb0",
};
const COLOR_LABEL = {
  red: "Rouge",
  blue: "Bleu",
  yellow: "Jaune",
  purple: "Violet",
};

let roomState = null; // derniere version connue du salon (cote serveur)

// ---------- Vues ----------
const lobbyView = document.getElementById("lobby-view");
const gameView = document.getElementById("game-view");

// ---------- Elements lobby ----------
const playerListEl = document.getElementById("player-list");
const playerCountEl = document.getElementById("player-count");
const colorPickerEl = document.getElementById("color-picker");
const formAddPlayer = document.getElementById("form-add-player");
const inputPseudo = document.getElementById("input-pseudo");
const lobbyError = document.getElementById("lobby-error");
const scoreListEl = document.getElementById("score-list");
const btnLaunch = document.getElementById("btn-launch");

let selectedColor = null;

function renderColorPicker(availableColors) {
  colorPickerEl.innerHTML = "";
  Object.keys(COLOR_HEX).forEach((color) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-swatch-btn";
    btn.style.background = COLOR_HEX[color];
    btn.title = COLOR_LABEL[color];
    btn.disabled = !availableColors.includes(color);
    if (color === selectedColor) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      selectedColor = color;
      renderColorPicker(availableColors);
    });
    colorPickerEl.appendChild(btn);
  });
  if (selectedColor && !availableColors.includes(selectedColor)) {
    selectedColor = availableColors[0] || null;
  }
  if (!selectedColor && availableColors.length) {
    selectedColor = availableColors[0];
    renderColorPicker(availableColors);
  }
}

function renderLobby() {
  playerCountEl.textContent = `(${roomState.players.length}/${roomState.max_players})`;

  playerListEl.innerHTML = "";
  if (roomState.players.length === 0) {
    const li = document.createElement("li");
    li.className = "player-list-empty";
    li.textContent = "Personne n'a encore rejoint le salon.";
    playerListEl.appendChild(li);
  } else {
    roomState.players.forEach((p) => {
      const li = document.createElement("li");
      li.className = "player-row";
      li.innerHTML = `
        <span class="player-swatch" style="background:${COLOR_HEX[p.color]}"></span>
        <span class="player-row-name">${escapeHtml(p.pseudo)}</span>
        <button class="player-remove" data-pseudo="${escapeHtml(p.pseudo)}" title="Retirer">✕</button>
      `;
      playerListEl.appendChild(li);
    });
  }

  renderColorPicker(roomState.available_colors);

  const full = roomState.players.length >= roomState.max_players;
  formAddPlayer.querySelector("button").disabled = full;
  inputPseudo.disabled = full;

  renderScores();

  btnLaunch.disabled = roomState.players.length < roomState.min_players;
  document.getElementById("lobby-hint").hidden = roomState.players.length >= roomState.min_players;

  if (roomState.started) {
    showGameView();
  }
}

function renderScores() {
  const entries = Object.entries(roomState.scores || {});
  if (entries.length === 0 || entries.every(([, v]) => v === 0)) {
    scoreListEl.innerHTML = `<li class="score-empty">Aucune manche jouée pour l'instant.</li>`;
    return;
  }
  entries.sort((a, b) => b[1] - a[1]);
  scoreListEl.innerHTML = entries
    .map(([pseudo, wins]) => `<li class="score-row"><span>${escapeHtml(pseudo)}</span><b>${wins}</b></li>`)
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Appels API ----------
async function fetchRoom() {
  const res = await fetch(`/api/rooms/${ROOM_CODE}`);
  if (!res.ok) throw new Error("Salon introuvable");
  roomState = await res.json();
  return roomState;
}

async function addPlayer(pseudo, color) {
  const res = await fetch(`/api/rooms/${ROOM_CODE}/players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pseudo, color }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Impossible d'ajouter ce joueur.");
  return data;
}

async function removePlayer(pseudo) {
  const res = await fetch(`/api/rooms/${ROOM_CODE}/players/${encodeURIComponent(pseudo)}`, {
    method: "DELETE",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Impossible de retirer ce joueur.");
  return data;
}

async function launchRoom() {
  const res = await fetch(`/api/rooms/${ROOM_CODE}/start`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Impossible de lancer la partie.");
  return data;
}

async function recordResult(winnerPseudo) {
  const res = await fetch(`/api/rooms/${ROOM_CODE}/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ winner: winnerPseudo }),
  });
  const data = await res.json();
  if (res.ok) {
    roomState = data;
    renderScores();
  }
  return data;
}

// ---------- Evenements lobby ----------
formAddPlayer.addEventListener("submit", async (e) => {
  e.preventDefault();
  lobbyError.hidden = true;
  const pseudo = inputPseudo.value.trim();

  if (!pseudo) {
    lobbyError.textContent = "Entre un pseudo.";
    lobbyError.hidden = false;
    return;
  }
  if (!selectedColor) {
    lobbyError.textContent = "Plus de couleur disponible.";
    lobbyError.hidden = false;
    return;
  }

  try {
    roomState = await addPlayer(pseudo, selectedColor);
    inputPseudo.value = "";
    selectedColor = null;
    renderLobby();
  } catch (err) {
    lobbyError.textContent = err.message;
    lobbyError.hidden = false;
  }
});

playerListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".player-remove");
  if (!btn) return;
  try {
    roomState = await removePlayer(btn.dataset.pseudo);
    renderLobby();
  } catch (err) {
    lobbyError.textContent = err.message;
    lobbyError.hidden = false;
  }
});

btnLaunch.addEventListener("click", async () => {
  try {
    roomState = await launchRoom();
    showGameView();
  } catch (err) {
    lobbyError.textContent = err.message;
    lobbyError.hidden = false;
  }
});

// ============================================================
// Moteur de jeu — 2 a 4 tanks, controles partages (tour par tour)
// ============================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const GRAVITY = 0.22;
const MAX_POWER = 16;
const CHARGE_RATE = 0.018;
const MOVE_SPEED = 2.2;
const EXPLOSION_RADIUS = 34;
const TANK_WIDTH = 28;
const TANK_HEIGHT = 14;

const SKY = { top: "#1c2317", bottom: "#11140f" };
const TERRAIN = { light: "#4a5a35", dark: "#2e3a1f" };

let terrain = [];
let tanks = [];          // {pseudo, color, colorHex, x, hp, angle, power, charging, alive}
let projectile = null;
let explosions = [];
let wind = 0;
let currentIndex = 0;    // index dans tanks[] du joueur actif
let gameState = "idle";  // idle | aiming | flying | exploding | gameover
let keys = {};
let matchPlayers = [];   // copie des joueurs du salon pour la manche en cours

const overlayControls = document.getElementById("overlay-controls");
const overlayResult = document.getElementById("overlay");
const playerCardsEl = document.getElementById("player-cards");

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// ---------- Terrain ----------
function generateTerrain() {
  const points = [];
  const segments = 9;
  const segW = W / segments;
  for (let i = 0; i <= segments; i++) {
    const baseHeight = H * 0.62;
    const variance = H * 0.22;
    points.push(baseHeight + (Math.random() - 0.5) * variance);
  }
  points[0] = H * 0.6;
  points[1] = H * 0.6 + (Math.random() - 0.5) * 20;
  points[segments - 1] = H * 0.6 + (Math.random() - 0.5) * 20;
  points[segments] = H * 0.6;

  const heights = new Array(W + 1);
  for (let x = 0; x <= W; x++) {
    const seg = Math.min(Math.floor(x / segW), segments - 1);
    const t = (x - seg * segW) / segW;
    const smooth = t * t * (3 - 2 * t);
    heights[x] = points[seg] * (1 - smooth) + points[seg + 1] * smooth;
  }
  return heights;
}

function terrainHeightAt(x) {
  const xi = Math.max(0, Math.min(W, Math.round(x)));
  return terrain[xi];
}

function carveCrater(cx, radius) {
  const left = Math.max(0, Math.floor(cx - radius));
  const right = Math.min(W, Math.ceil(cx + radius));
  for (let x = left; x <= right; x++) {
    const dx = x - cx;
    const depth = Math.sqrt(Math.max(0, radius * radius - dx * dx));
    terrain[x] = Math.min(H - 4, terrain[x] + depth * 0.9);
  }
}

// ---------- Mise en place d'une manche ----------
function startMatchSetup(players) {
  matchPlayers = players;
  overlayResult.hidden = true;
  overlayControls.hidden = false;
  setupRound();
  render();
}

document.getElementById("btn-start-match").addEventListener("click", () => {
  overlayControls.hidden = true;
  loopStart();
});

document.getElementById("btn-next-round").addEventListener("click", () => {
  overlayResult.hidden = true;
  setupRound();
});

document.getElementById("btn-back-lobby").addEventListener("click", () => {
  gameView.hidden = true;
  lobbyView.hidden = false;
  gameState = "idle";
});

function setupRound() {
  const n = matchPlayers.length;
  terrain = generateTerrain();
  tanks = matchPlayers.map((p, i) => {
    const x = n === 1 ? W * 0.5 : W * (0.1 + (0.8 * i) / (n - 1));
    const defaultAngle = 90 + ((W / 2 - x) / (W / 2)) * 35; // viser vaguement vers le centre
    return {
      pseudo: p.pseudo,
      color: p.color,
      colorHex: COLOR_HEX[p.color],
      x,
      hp: 100,
      angle: Math.max(15, Math.min(165, defaultAngle)),
      power: 0,
      charging: false,
      alive: true,
    };
  });
  projectile = null;
  explosions = [];
  wind = (Math.random() - 0.5) * 2;
  currentIndex = 0;
  gameState = "aiming";
  renderPlayerCards();
  updateHUD();
}

// ---------- Boucle de mise a jour ----------
function update() {
  if (gameState === "aiming") handleAiming();
  else if (gameState === "flying") updateProjectile();
  else if (gameState === "exploding") updateExplosions();
}

function handleAiming() {
  const tank = tanks[currentIndex];

  if (keys["ArrowLeft"]) tank.x = Math.max(20, tank.x - MOVE_SPEED);
  if (keys["ArrowRight"]) tank.x = Math.min(W - 20, tank.x + MOVE_SPEED);

  // Angle absolu : 0 = droite, 90 = vertical, 180 = gauche
  if (keys["ArrowUp"]) tank.angle = Math.min(180, tank.angle + 1.3);
  if (keys["ArrowDown"]) tank.angle = Math.max(0, tank.angle - 1.3);

  if (keys["Space"]) {
    tank.charging = true;
    tank.power = Math.min(1, tank.power + CHARGE_RATE);
  } else if (tank.charging) {
    fireProjectile(tank);
    tank.charging = false;
  }

  updateHUD();
}

function fireProjectile(tank) {
  const rad = (tank.angle * Math.PI) / 180;
  const speed = 4 + tank.power * MAX_POWER;
  projectile = {
    x: tank.x,
    y: terrainHeightAt(tank.x) - TANK_HEIGHT - 4,
    vx: Math.cos(rad) * speed,
    vy: -Math.sin(rad) * speed,
    ownerIndex: currentIndex,
    trail: [],
  };
  tank.power = 0;
  gameState = "flying";
}

function updateProjectile() {
  if (!projectile) return;

  projectile.trail.push({ x: projectile.x, y: projectile.y });
  if (projectile.trail.length > 18) projectile.trail.shift();

  projectile.vx += wind * 0.012;
  projectile.vy += GRAVITY;
  projectile.x += projectile.vx;
  projectile.y += projectile.vy;

  if (projectile.x < 0 || projectile.x > W || projectile.y > H + 50) {
    projectile = null;
    advanceTurn();
    return;
  }

  if (projectile.y >= terrainHeightAt(projectile.x)) {
    resolveImpact(projectile.x, projectile.y);
    return;
  }

  for (let i = 0; i < tanks.length; i++) {
    const t = tanks[i];
    if (!t.alive) continue;
    const top = terrainHeightAt(t.x) - TANK_HEIGHT;
    if (
      projectile.x > t.x - TANK_WIDTH / 2 &&
      projectile.x < t.x + TANK_WIDTH / 2 &&
      projectile.y > top &&
      projectile.y < top + TANK_HEIGHT
    ) {
      resolveImpact(projectile.x, projectile.y);
      return;
    }
  }
}

function resolveImpact(x, y) {
  carveCrater(x, EXPLOSION_RADIUS);

  tanks.forEach((t) => {
    if (!t.alive) return;
    const dist = Math.hypot(t.x - x, terrainHeightAt(t.x) - TANK_HEIGHT / 2 - y);
    if (dist < EXPLOSION_RADIUS) {
      const dmg = Math.round((1 - dist / EXPLOSION_RADIUS) * 55 + 15);
      t.hp = Math.max(0, t.hp - dmg);
    }
  });

  explosions.push({ x, y, r: 4, maxR: EXPLOSION_RADIUS * 1.4, life: 1 });
  projectile = null;
  gameState = "exploding";
}

function updateExplosions() {
  explosions.forEach((ex) => {
    ex.r += (ex.maxR - ex.r) * 0.18;
    ex.life -= 0.06;
  });
  explosions = explosions.filter((ex) => ex.life > 0);

  if (explosions.length === 0) {
    settleEliminations();
  }
}

function settleEliminations() {
  tanks.forEach((t) => {
    if (t.hp <= 0) t.alive = false;
  });
  const survivors = tanks.filter((t) => t.alive);

  if (survivors.length <= 1) {
    gameState = "gameover";
    const winner = survivors[0] || null;
    showGameOver(winner);
    if (winner) recordResult(winner.pseudo);
  } else {
    advanceTurn();
  }
  renderPlayerCards();
  updateHUD();
}

function advanceTurn() {
  if (gameState === "gameover") return;
  let next = currentIndex;
  for (let i = 0; i < tanks.length; i++) {
    next = (next + 1) % tanks.length;
    if (tanks[next].alive) break;
  }
  currentIndex = next;
  wind = (Math.random() - 0.5) * 2;
  gameState = "aiming";
  updateHUD();
}

// ---------- Rendu ----------
function render() {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0, SKY.top);
  skyGrad.addColorStop(1, SKY.bottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  drawStars();
  drawTerrain();
  tanks.forEach(drawTank);
  if (projectile) drawProjectile();
  explosions.forEach(drawExplosion);
}

function drawStars() {
  ctx.fillStyle = "rgba(143,179,63,0.25)";
  for (let i = 0; i < 28; i++) {
    const sx = (i * 197) % W;
    const sy = (i * 83) % (H * 0.4);
    ctx.fillRect(sx, sy, 1, 1);
  }
}

function drawTerrain() {
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 2) ctx.lineTo(x, terrain[x]);
  ctx.lineTo(W, H);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, H * 0.5, 0, H);
  grad.addColorStop(0, TERRAIN.light);
  grad.addColorStop(1, TERRAIN.dark);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = "rgba(143,179,63,0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, terrain[0]);
  for (let x = 0; x <= W; x += 2) ctx.lineTo(x, terrain[x]);
  ctx.stroke();
}

function drawTank(t) {
  const y = terrainHeightAt(t.x);
  ctx.save();
  ctx.translate(t.x, y);

  ctx.fillStyle = t.alive ? t.colorHex : "#444";
  ctx.fillRect(-TANK_WIDTH / 2, -TANK_HEIGHT, TANK_WIDTH, TANK_HEIGHT);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(-TANK_WIDTH / 2 - 2, -4, TANK_WIDTH + 4, 5);

  if (t.alive) {
    const rad = (t.angle * Math.PI) / 180;
    ctx.strokeStyle = t.colorHex;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -TANK_HEIGHT);
    ctx.lineTo(Math.cos(rad) * 20, -TANK_HEIGHT - Math.sin(rad) * 20);
    ctx.stroke();
  }
  ctx.restore();

  if (t.alive && t.charging) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(t.x - 16, y - TANK_HEIGHT - 30, 32, 5);
    ctx.fillStyle = "#8fb33f";
    ctx.fillRect(t.x - 16, y - TANK_HEIGHT - 30, 32 * t.power, 5);
  }
}

function drawProjectile() {
  projectile.trail.forEach((p, i) => {
    ctx.globalAlpha = (i / projectile.trail.length) * 0.5;
    ctx.fillStyle = "#e8d77a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#f2e9b0";
  ctx.beginPath();
  ctx.arc(projectile.x, projectile.y, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawExplosion(ex) {
  if (ex.life <= 0) return;
  const grad = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, ex.r);
  grad.addColorStop(0, `rgba(255,220,130,${ex.life})`);
  grad.addColorStop(0.5, `rgba(255,120,60,${ex.life * 0.7})`);
  grad.addColorStop(1, "rgba(255,80,40,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- HUD ----------
function renderPlayerCards() {
  playerCardsEl.innerHTML = tanks
    .map(
      (t, i) => `
      <div class="player-card ${i === currentIndex && t.alive ? "active" : ""} ${!t.alive ? "eliminated" : ""}"
           style="color:${t.colorHex}">
        <div class="player-card-head">
          <span class="player-swatch" style="background:${t.colorHex}"></span>
          <span class="player-card-name">${escapeHtml(t.pseudo)}</span>
        </div>
        <div class="bar-track"><div class="bar-fill hp" style="width:${t.hp}%;background:${t.colorHex}"></div></div>
      </div>`
    )
    .join("");
}

function updateHUD() {
  const tank = tanks[currentIndex];
  if (!tank) return;

  renderPlayerCards();

  const turnNameEl = document.getElementById("turn-name");
  turnNameEl.textContent = tank.pseudo;
  turnNameEl.style.color = tank.colorHex;

  document.getElementById("turn-detail").textContent =
    `Angle ${Math.round(tank.angle)}°  ·  Puissance ${Math.round(tank.power * 100)}%`;

  const windArrow = document.getElementById("wind-arrow");
  const windValue = document.getElementById("wind-value");
  windArrow.textContent = wind > 0.05 ? "→" : wind < -0.05 ? "←" : "·";
  windValue.textContent = Math.abs(Math.round(wind * 10));
}

function showGameOver(winner) {
  const title = document.getElementById("overlay-title");
  const sub = document.getElementById("overlay-sub");
  if (winner) {
    title.textContent = `${winner.pseudo.toUpperCase()} GAGNE`;
    title.style.color = winner.colorHex;
    sub.textContent = "Manche terminée";
  } else {
    title.textContent = "ÉGALITÉ";
    title.style.color = "#d8d6c8";
    sub.textContent = "Tout le monde a explosé en même temps !";
  }
  overlayResult.hidden = false;
}

// ---------- Boucle principale ----------
let loopStarted = false;
function loopStart() {
  if (loopStarted) return;
  loopStarted = true;
  requestAnimationFrame(tick);
}
function tick() {
  if (gameState !== "gameover" && gameState !== "idle") {
    update();
  }
  render();
  requestAnimationFrame(tick);
}

function showGameView() {
  lobbyView.hidden = true;
  gameView.hidden = false;
  startMatchSetup(roomState.players);
}

// ---------- Initialisation ----------
(async function init() {
  try {
    await fetchRoom();
    renderLobby();
  } catch (err) {
    document.querySelector(".scope").innerHTML = `<p class="home-error">${err.message}</p>`;
  }
})();
