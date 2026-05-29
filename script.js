/* ============================================================
   game.js  —  Polar Bear Runner  |  Game Engine
   Canvas-based runner game with snowy winter theme
   ============================================================ */

"use strict";

/* ── Canvas & Context ── */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

/* ── Assets ── */
const bgImg = new Image();
bgImg.src = "hello.png";

let bgScroll = 0; // x-offset for scrolling background

/* ── UI Elements ── */
const scoreDisplay = document.getElementById("scoreDisplay");
const highScoreDisplay = document.getElementById("highScoreDisplay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const finalScore = document.getElementById("finalScore");
const finalBest = document.getElementById("finalBest");
const startPrompt = document.getElementById("startPrompt");

/* ── Game State ── */
let state = "idle"; // 'idle' | 'running' | 'dead'
let score = 0;
let highScore = parseInt(localStorage.getItem("pbr_highscore") || "0", 10);
let frameId = null;
let lastTime = 0;
let speed = 0; // pixels/ms

/* ── Constants ── */
const BASE_SPEED = 0.22; // Start slower
const MAX_SPEED = 0.88; // Ends much faster
const SPEED_INC = 0.000008; // Slower linear inc, we'll use exponential as well
const GRAVITY = 0.0018;
const JUMP_FORCE = -0.72;
const GROUND_PCT = 0.78;

/* ── Derived layout (recalculated on resize) ── */
let W, H, GROUND_Y, BEAR_SIZE, OBSTACLE_W, OBSTACLE_H;

/* ── Bear ── */
const bear = {
  x: 0,
  y: 0,
  vy: 0, // vertical velocity (px/ms)
  onGround: true,
  isDucking: false,
  frame: 0, // animation frame index (0 or 1)
  frameTimer: 0,
  frameInterval: 160, // ms per run frame
  rotation: 0, // For procedural animation
};

/* ── Obstacles ── */
let obstacles = [];
let obstacleTimer = 0;
let obstacleInterval = 1800; // ms between obstacle spawns

/* ── Snow particles (game canvas layer) ── */
let snowParticles = [];
const SNOW_COUNT = 60;

/* ── Mountain / scenery layers ── */
let mountains1 = []; // far (slow)
let mountains2 = []; // near (medium)
let clouds = [];

/* ── Scenery / Ground details ── */
let groundDetails = [];
let groundScroll = 0;

/* ── Colours ── */
const PALETTE = {
  skyTop: "#a5d3f8",
  skyBot: "#e0f1fe",
  sun: "#fff9c4",
  groundTop: "#f8fcff",
  groundBot: "#d8ecfa",
  snowLine: "#ffffff",
  mtn1: "#cce2f7",
  mtn2: "#aac9e5",
  bearBody: "#ffffff",
  bearShade: "#e0f4ff",
  bearEye: "#1e3a5f",
  bearNose: "#88aacc",
  bearScarf1: "#ffb3d9",
  bearScarf2: "#f06292",
  scoreColor: "#334155",
};

/* ── SNOW BACKGROUND EFFECT ── */
function createBgSnow() {
  const container = document.getElementById("bgSnow");
  if (!container) return;
  const FLAKES = 35;
  const symbols = ["❄", "❅", "❆", "•", "·"];

  for (let i = 0; i < FLAKES; i++) {
    const el = document.createElement("span");
    el.className = "flake";
    el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    el.style.left = `${Math.random() * 100}%`;
    el.style.fontSize = `${0.8 + Math.random()}rem`;
    el.style.animationDuration = `${6 + Math.random() * 12}s`;
    el.style.animationDelay = `${Math.random() * 10}s`;
    el.style.opacity = (0.3 + Math.random() * 0.5).toString();
    container.appendChild(el);
  }
}

/* ============================================================
   INIT — Starts the game immediately on load
   ============================================================ */
function initGame() {
  resize();
  resetGameState();
  spawnSnowParticles();
  highScoreDisplay.textContent = highScore;
  gameOverOverlay.classList.add("hidden");
  startPrompt.classList.remove("hidden");
  state = "idle";

  // GSAP: Professional Entrance
  gsap.from(".menu-card > *", {
    y: 30,
    opacity: 0,
    duration: 0.8,
    stagger: 0.15,
    ease: "power3.out",
    delay: 0.2,
  });

  gsap.to(".pulse-play", {
    scale: 1.05,
    repeat: -1,
    yoyo: true,
    duration: 0.8,
    ease: "sine.inOut",
  });

  // Bind input
  document.addEventListener("keydown", onKey);
  canvas.addEventListener("pointerdown", onTap);
  window.addEventListener("resize", resize);

  const mJump = document.getElementById("mobileJump");
  if (mJump) {
    mJump.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handleJump();
    });
  }

  // Start render loop
  cancelAnimationFrame(frameId);
  lastTime = performance.now();
  frameId = requestAnimationFrame(loop);
}

// Auto-start game on load
document.addEventListener("DOMContentLoaded", () => {
  createBgSnow();
  initGame();
});

/* ── Called from index.html restart button ── */
function restartGame() {
  gsap.to(".game-over-card", {
    scale: 0.9,
    opacity: 0,
    y: 10,
    duration: 0.3,
    onComplete: () => {
      gameOverOverlay.classList.add("hidden");
      resetGameState();
      startPrompt.classList.remove("hidden");
      gsap.fromTo(
        startPrompt,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.5 },
      );
      state = "idle";
    },
  });
}

/* ============================================================
   UTILITIES
   ============================================================ */
function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.warn(
        `Error attempting to enable full-screen mode: ${err.message}`,
      );
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

/* ============================================================
   RESIZE — Responsive full-screen canvas
   ============================================================ */
function resize() {
  W = window.innerWidth;
  H = window.innerHeight;

  canvas.width = W;
  canvas.height = H;

  // Adapt ground and bear size based on screen height
  GROUND_Y = H * 0.94; // Move ground Down to remove space (94% from top)
  BEAR_SIZE = Math.max(50, Math.min(90, H * 0.12));

  OBSTACLE_W = BEAR_SIZE * 0.75;
  OBSTACLE_H = BEAR_SIZE * 0.85;

  // Reposition bear
  bear.x = W * 0.15;
  if (bear.onGround) {
    bear.y = GROUND_Y - BEAR_SIZE;
  }

  // Generate Ground Details for Real-Time Ice Look
  groundDetails = [];
  const detailCount = Math.floor(W / 60);
  for (let i = 0; i < detailCount; i++) {
    groundDetails.push({
      x: Math.random() * W,
      y: GROUND_Y + Math.random() * (H - GROUND_Y - 20),
      w: 30 + Math.random() * 100,
      opacity: 0.1 + Math.random() * 0.15,
    });
  }
}

/* ============================================================
   RESET GAME STATE
   ============================================================ */
function resetGameState() {
  score = 0;
  speed = BASE_SPEED;
  obstacles = [];
  obstacleTimer = 0;
  obstacleInterval = 1800;
  bear.y = GROUND_Y - BEAR_SIZE;
  bear.vy = 0;
  bear.onGround = true;
  bear.frame = 0;
  bear.frameTimer = 0;
  bear.rotation = 0;
  scoreDisplay.textContent = "0";
}

/* ============================================================
   INPUT HANDLERS
   ============================================================ */
function onKey(e) {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    handleJump();
  }
  if (e.code === "ArrowDown") {
    e.preventDefault();
    handleDuck(true);
  }
}

// Global keyup for ducking
document.addEventListener("keyup", (e) => {
  if (e.code === "ArrowDown") {
    handleDuck(false);
  }
});

function onTap(e) {
  e.preventDefault();
  handleJump();
}

function handleJump() {
  if (state === "dead" || bear.isDucking) return;

  if (state === "idle") {
    startGame();
    return;
  }

  if (bear.onGround) {
    bear.vy = JUMP_FORCE;
    bear.onGround = false;

    // GSAP: Procedural jump animation
    gsap.fromTo(
      bear,
      { rotation: -0.2 },
      { rotation: 0, duration: 0.6, ease: "bounce.out" },
    );
  }
}

function handleDuck(isDucking) {
  if (state !== "running" || !bear.onGround) {
    bear.isDucking = false;
    return;
  }
  bear.isDucking = isDucking;
}

/* ============================================================
   MAIN GAME LOOP
   ============================================================ */
function loop(ts) {
  const dt = Math.min(ts - lastTime, 50); // clamp to 50ms max
  lastTime = ts;

  if (state === "running") {
    update(dt);
  }

  render(dt);
  frameId = requestAnimationFrame(loop);
}

/* ============================================================
   UPDATE
   ============================================================ */
function update(dt) {
  // Enhanced "High Level Math" Speed Scaling
  // Start slow (BASE_SPEED), linear increase, but also speed up based on score
  const scoreFactor = Math.log10(score / 1000 + 1) * 0.15;
  speed = Math.min(MAX_SPEED, speed + SPEED_INC * dt + scoreFactor * 0.0001);

  // ── Scrolling Logic ──
  // Background layers move significantly slower for Parallax
  bgScroll += speed * dt * 0.12;

  // Update ground details loop
  groundDetails.forEach((d) => {
    d.x -= speed * dt;
    if (d.x + d.w < 0) {
      d.x = W + Math.random() * 100;
      d.y = GROUND_Y + Math.random() * (H - GROUND_Y - 20);
    }
  });

  // ── Score ──
  const prevScore = Math.floor(score);
  score += dt * speed * 0.04;
  const scoreInt = Math.floor(score);
  scoreDisplay.textContent = scoreInt;

  // GSAP: Score Milestone pulse
  if (scoreInt > prevScore && scoreInt % 100 === 0) {
    gsap.fromTo(
      scoreDisplay.parentElement,
      { scale: 1.3, color: "#f48fb1" },
      { scale: 1, color: "inherit", duration: 0.4 },
    );
  }

  // ── Bear physics ──
  bear.vy += GRAVITY * dt;
  bear.y += bear.vy * dt;

  if (bear.y >= GROUND_Y - BEAR_SIZE) {
    bear.y = GROUND_Y - BEAR_SIZE;
    bear.vy = 0;
    bear.onGround = true;
  } else {
    bear.onGround = false;
    // Force end ducking if the bear somehow goes airborne
    if (bear.isDucking) bear.isDucking = false;
  }

  // ── Bear run animation ──
  if (bear.onGround) {
    bear.frameTimer += dt;
    if (bear.frameTimer >= bear.frameInterval) {
      bear.frameTimer = 0;
      bear.frame = 1 - bear.frame; // toggle 0/1
    }
    // Speed up leg animation with game speed
    bear.frameInterval = Math.max(80, 160 - (speed - BASE_SPEED) * 200);
  }

  // ── Obstacles ──
  obstacleTimer += dt;
  const dynamicInterval = Math.max(900, obstacleInterval - score * 0.3);
  if (obstacleTimer >= dynamicInterval) {
    obstacleTimer = 0;
    spawnObstacle();
  }

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const ob = obstacles[i];
    ob.x -= speed * dt;

    if (ob.type === "bird") {
      ob.wing = (ob.wing || 0) + dt * 0.015;
    }

    if (ob.x + ob.w < 0) {
      obstacles.splice(i, 1);
      continue;
    }

    // ── Collision detection (Dynamic for Ducking) ──
    const PAD = BEAR_SIZE * 0.15;
    const bearH = bear.isDucking ? BEAR_SIZE * 0.5 : BEAR_SIZE;
    const bearY = bear.isDucking ? bear.y + BEAR_SIZE * 0.5 : bear.y;

    const bx1 = bear.x + PAD;
    const bx2 = bear.x + BEAR_SIZE - PAD;
    const by1 = bearY + PAD;
    const by2 = bearY + bearH - PAD;

    const ox1 = ob.x + 4;
    const ox2 = ob.x + ob.w - 4;
    const oy1 = ob.y + 4;
    const oy2 = ob.y + ob.h - 4;

    if (bx2 > ox1 && bx1 < ox2 && by2 > oy1 && by1 < oy2) {
      die();
      return;
    }
  }

  // ── Snow particles ──
  snowParticles.forEach((p) => {
    p.x -= (p.speedX + speed * 0.4) * dt;
    p.y += p.speedY * dt;
    if (p.x < -10) p.x = W + 10;
    if (p.y > H) p.y = -10;
  });
}

/* ============================================================
   RENDER
   ============================================================ */
function render(dt) {
  ctx.clearRect(0, 0, W, H);

  // ── High-Level Parallax Background (hello.png) ──
  if (bgImg.complete) {
    const imgW = bgImg.width;
    const imgH = bgImg.height;

    // --- Helper for Tiled Rendering ---
    const drawTiledLayer = (scrollVal, scale, yOff, opacity) => {
      ctx.globalAlpha = opacity;
      const drawH = GROUND_Y * scale;
      const drawW = (imgW / imgH) * drawH;
      const offset = scrollVal % (drawW * 2);

      const drawSeg = (xPos, isMirrored) => {
        ctx.save();
        // Math.floor helps eliminate sub-pixel rendering gaps
        const ix = Math.floor(xPos);
        const iy = Math.floor(GROUND_Y - drawH + yOff);
        const iw = Math.ceil(drawW) + 4; // Extra wide to ensure overlap
        const ih = Math.ceil(drawH) + 2;

        if (isMirrored) {
          ctx.scale(-1, 1);
          ctx.drawImage(bgImg, -(ix + Math.ceil(drawW)), iy - 1, iw, ih);
        } else {
          ctx.drawImage(bgImg, ix - 2, iy - 1, iw, ih);
        }
        ctx.restore();
      };

      const segmentsNeeded = Math.ceil(W / drawW) + 2;
      for (let i = 0; i < segmentsNeeded; i++) {
        drawSeg(i * drawW - offset, i % 2 === 1);
      }
      ctx.globalAlpha = 1.0;
    };

    // 1. Far Deep Layer (Slower, Smaller, Faded)
    drawTiledLayer(bgScroll * 0.4, 0.6, -100, 0.4);

    // 2. Mid Layer (Main Scene)
    drawTiledLayer(bgScroll, 1.0, 0, 1.0);

    // ── Fog / Horizon Blending ──
    const fog = ctx.createLinearGradient(0, GROUND_Y * 0.5, 0, GROUND_Y);
    fog.addColorStop(0, "transparent");
    fog.addColorStop(1, PALETTE.skyBot); // Blends mountains into the floor
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, W, GROUND_Y);
  } else {
    drawSky();
  }

  drawGround();
  drawSnow();
  obstacles.forEach(drawObstacle);
  drawBear();
}

/* ── Sky gradient ── */
function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.7, PALETTE.skyBot);
  g.addColorStop(1, PALETTE.groundTop);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, GROUND_Y);
}

/* ── Ground ── */
function drawGround() {
  // Main ground gradient with a "Glossy Ice" look
  const g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  g.addColorStop(0, "#ffffff"); // Bright snow edge
  g.addColorStop(0.1, PALETTE.groundTop);
  g.addColorStop(1, PALETTE.groundBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // Moving Ground Details (Sharp Ice Cracks ONLY)
  groundDetails.forEach((d) => {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(170, 201, 229, ${d.opacity})`;
    ctx.lineWidth = 1.5;
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + d.w, d.y + 1);
    ctx.stroke();
  });

  // Ice Reflection Sheen (Horizontal Sparkle)
  const sheen = ctx.createLinearGradient(0, GROUND_Y, W, GROUND_Y);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.25)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, GROUND_Y, W, 30);

  // Bottom Deep Ice (Sub-surface layer)
  const deepIce = ctx.createLinearGradient(0, GROUND_Y + 40, 0, H);
  deepIce.addColorStop(0, "rgba(200, 230, 255, 0)");
  deepIce.addColorStop(1, "rgba(100, 180, 240, 0.2)");
  ctx.fillStyle = deepIce;
  ctx.fillRect(0, GROUND_Y + 40, W, H - GROUND_Y);

  // Snow top edge line
  ctx.shadowBlur = 10;
  ctx.shadowColor = "white";
  ctx.fillRect(0, GROUND_Y, W, 3);
}

/* ── Canvas snow particles ── */
function drawSnow() {
  snowParticles.forEach((p) => {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

/* ── Polar Bear ── */
function drawBear() {
  const x = bear.x;
  const y = bear.y;
  const s = BEAR_SIZE;
  const inAir = !bear.onGround;

  // ── Realistic Dynamic Shadow ──
  ctx.save();
  const shadowOpacity = inAir ? 0.05 : 0.12;
  const shadowScale = inAir ? 0.7 : 1;
  ctx.globalAlpha = shadowOpacity;
  ctx.fillStyle = "#1e3a8a";
  ctx.beginPath();
  ctx.ellipse(
    x + s / 2,
    GROUND_Y + 4,
    s * 0.45 * shadowScale,
    s * 0.1 * shadowScale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  if (bear.isDucking) ctx.scale(1.15, 0.65);
  ctx.rotate(bear.rotation + (inAir ? -0.05 : 0.02));
  ctx.translate(-s / 2, -s / 2);

  // ── 3D Layered Body (More Realistic Fur Look) ──
  // Outer Soft Glow (Ambient Light)
  ctx.shadowBlur = 15;
  ctx.shadowColor = "rgba(255,255,255,0.4)";

  // Main Body
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.58, s * 0.38, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0; // Reset for details

  // Advanced Shading (Subsurface Scattering effect)
  const bodyGrad = ctx.createRadialGradient(
    s * 0.4,
    s * 0.5,
    s * 0.1,
    s * 0.5,
    s * 0.6,
    s * 0.4,
  );
  bodyGrad.addColorStop(0, "#ffffff");
  bodyGrad.addColorStop(1, "#e0f2fe");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.58, s * 0.38, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main Head Shape
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(s * 0.54, s * 0.3, s * 0.27, s * 0.25, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // Muzzle (Halka sa protruding look)
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.ellipse(s * 0.58, s * 0.36, s * 0.14, s * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Ears ──
  [s * 0.32, s * 0.74].forEach((ex) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ex, s * 0.12, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fee2e2"; // Soft pink inner ear
    ctx.beginPath();
    ctx.arc(ex, s * 0.12, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── Realistic Eyes (Wet Look) ──
  ctx.fillStyle = "#0f172a";
  [s * 0.44, s * 0.63].forEach((ex, i) => {
    ctx.beginPath();
    ctx.arc(ex, s * (0.25 + i * 0.01), s * 0.038, 0, Math.PI * 2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ex + s * 0.01, s * (0.24 + i * 0.01), s * 0.014, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
  });

  // ── 3D Nose ──
  const noseGrad = ctx.createLinearGradient(
    s * 0.5,
    s * 0.32,
    s * 0.5,
    s * 0.37,
  );
  noseGrad.addColorStop(0, "#475569");
  noseGrad.addColorStop(1, "#0f172a");
  ctx.fillStyle = noseGrad;
  ctx.beginPath();
  ctx.ellipse(s * 0.55, s * 0.35, s * 0.07, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Dynamic Scarf (Flowing) ──
  const scarfWave = Math.sin(Date.now() * 0.01) * 3;
  ctx.fillStyle = "#ef4444"; // Vivid red
  ctx.beginPath();
  ctx.roundRect(s * 0.28, s * 0.42, s * 0.5, s * 0.08, 4);
  ctx.fill();
  // Flowing tail
  ctx.beginPath();
  ctx.moveTo(s * 0.75, s * 0.46);
  ctx.quadraticCurveTo(
    s * 0.9 + scarfWave,
    s * 0.46 + scarfWave,
    s * 0.85,
    s * 0.6,
  );
  ctx.lineWidth = s * 0.06;
  ctx.strokeStyle = "#ef4444";
  ctx.stroke();

  // ── Arms & Legs (Realistic Fur & Movement) ──
  const legOffset = Math.sin(Date.now() * 0.012) * s * 0.02;
  ctx.fillStyle = "#ffffff";

  // Back Legs (Slightly darker for depth)
  ctx.fillStyle = "#f1f5f9";
  drawBearLegs(s, true);

  // Front Legs
  ctx.fillStyle = "#ffffff";
  drawBearLegs(s, false);

  ctx.restore();
}

function drawBearLegs(s, isBack) {
  const f = bear.frame;
  const off = isBack ? 0.2 : 0;

  if (!bear.onGround) {
    ctx.beginPath();
    ctx.ellipse(
      s * (0.38 + off),
      s * 0.86,
      s * 0.12,
      s * 0.09,
      -0.4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(
      s * (0.64 + off),
      s * 0.86,
      s * 0.12,
      s * 0.09,
      0.4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    return;
  }

  // Running legs with smoother 3D rotation
  const anim = Math.sin(Date.now() * 0.012) * 0.4;
  const leg1Angle = isBack ? -anim : anim;
  const leg2Angle = isBack ? anim : -anim;

  ctx.save();
  ctx.translate(s * 0.4, s * 0.75);
  ctx.rotate(leg1Angle);
  ctx.beginPath();
  ctx.roundRect(-s * 0.08, 0, s * 0.16, s * 0.18, 5);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(s * 0.65, s * 0.75);
  ctx.rotate(leg2Angle);
  ctx.beginPath();
  ctx.roundRect(-s * 0.08, 0, s * 0.16, s * 0.18, 5);
  ctx.fill();
  ctx.restore();
}

/* ── Obstacles ── */
function drawObstacle(ob) {
  // Ground Shadow for obstacles (but not for birds)
  if (ob.type !== "bird") {
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#1e3a8a";
    ctx.beginPath();
    ctx.ellipse(
      ob.x + ob.w / 2,
      GROUND_Y + 2,
      ob.w * 0.45,
      ob.w * 0.1,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(ob.x + ob.w / 2, ob.y + ob.h / 2);

  if (ob.type === "rock") {
    drawIceRock(ob.w, ob.h);
  } else if (ob.type === "penguin") {
    drawPenguin(ob.w, ob.h);
  } else if (ob.type === "bird") {
    drawBird(ob.w, ob.h, ob.wing);
  } else {
    drawSnowball(ob.w, ob.h);
  }

  ctx.restore();
}

function drawBird(w, h, wing) {
  const flap = Math.sin(wing);

  // Bird Shadow on Ground (Small and faint)
  ctx.save();
  ctx.translate(0, (GROUND_Y - (bear.y + h)) * 0.5); // Dynamic height shadow
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = "#1e3a8a";
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.3, h * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── Realistic Wing Animation ──
  ctx.fillStyle = "#1e293b"; // Slate black

  // Far Wing
  ctx.save();
  ctx.rotate(flap * 0.5);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-w * 0.4, -h * 0.8 * flap, -w * 0.8, -h * 0.2 * flap);
  ctx.lineTo(-w * 0.2, h * 0.1);
  ctx.fill();
  ctx.restore();

  // ── Body (Aerodynamic shape) ──
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.45, h * 0.25, 0.1 * flap, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(w * 0.4, -h * 0.05, w * 0.18, 0, Math.PI * 2);
  ctx.fill();

  // Beak (Sharp)
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.moveTo(w * 0.55, -h * 0.05);
  ctx.lineTo(w * 0.8, 0);
  ctx.lineTo(w * 0.55, h * 0.05);
  ctx.fill();

  // Near Wing (Layered on top)
  ctx.save();
  ctx.fillStyle = "#334155";
  ctx.rotate(-flap * 0.4);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-w * 0.3, -h * 1.2 * flap, -w * 0.7, -h * 0.4 * flap);
  ctx.lineTo(-w * 0.1, h * 0.2);
  ctx.fill();
  ctx.restore();
}

function drawIceRock(w, h) {
  // Main rock
  ctx.fillStyle = "#90caf9";
  ctx.beginPath();
  ctx.moveTo(-w * 0.45, h * 0.5);
  ctx.lineTo(-w * 0.48, h * 0.05);
  ctx.lineTo(-w * 0.15, -h * 0.5);
  ctx.lineTo(w * 0.22, -h * 0.48);
  ctx.lineTo(w * 0.5, h * 0.1);
  ctx.lineTo(w * 0.42, h * 0.5);
  ctx.closePath();
  ctx.fill();

  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.moveTo(-w * 0.1, -h * 0.35);
  ctx.lineTo(w * 0.15, -h * 0.42);
  ctx.lineTo(w * 0.3, -h * 0.1);
  ctx.lineTo(0, -h * 0.08);
  ctx.closePath();
  ctx.fill();

  // Snow on top
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(-w * 0.05, -h * 0.38, w * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.18, -h * 0.32, w * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawPenguin(w, h) {
  // Body
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.ellipse(0, h * 0.1, w * 0.38, h * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.ellipse(0, h * 0.16, w * 0.22, h * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.32, w * 0.26, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(-w * 0.1, -h * 0.36, w * 0.065, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.1, -h * 0.36, w * 0.065, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1e3a8a";
  ctx.beginPath();
  ctx.arc(-w * 0.1, -h * 0.35, w * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.1, -h * 0.35, w * 0.035, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = "#fb923c";
  ctx.beginPath();
  ctx.moveTo(-w * 0.07, -h * 0.26);
  ctx.lineTo(0, -h * 0.2);
  ctx.lineTo(w * 0.07, -h * 0.26);
  ctx.closePath();
  ctx.fill();

  // Flippers
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.ellipse(-w * 0.46, h * 0.06, w * 0.12, h * 0.2, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.46, h * 0.06, w * 0.12, h * 0.2, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Feet
  ctx.fillStyle = "#fb923c";
  ctx.beginPath();
  ctx.ellipse(-w * 0.14, h * 0.5, w * 0.12, h * 0.06, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.14, h * 0.5, w * 0.12, h * 0.06, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnowball(w, h) {
  const r = w * 0.46;

  // Shadow
  ctx.fillStyle = "rgba(100,150,200,0.15)";
  ctx.beginPath();
  ctx.ellipse(0, h * 0.52, r * 0.9, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball
  const g = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.6, "#dbeafe");
  g.addColorStop(1, "#93c5fd");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Sparkles
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  [
    [-r * 0.3, -r * 0.3],
    [r * 0.15, -r * 0.4],
    [r * 0.35, r * 0.1],
  ].forEach(([sx, sy]) => {
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* ============================================================
   SPAWN HELPERS
   ============================================================ */
function spawnObstacle() {
  const types = ["rock", "penguin", "snowball", "bird"];
  // Bird only appears after moderate score
  let availableTypes = score > 150 ? types : ["rock", "penguin", "snowball"];
  const type =
    availableTypes[Math.floor(Math.random() * availableTypes.length)];
  let w, h;
  let yPos;

  if (type === "penguin") {
    w = OBSTACLE_W * 0.85;
    h = OBSTACLE_H * 1.15;
    yPos = GROUND_Y - h;
  } else if (type === "snowball") {
    w = OBSTACLE_W * 0.9;
    h = OBSTACLE_W * 0.9;
    yPos = GROUND_Y - h;
  } else if (type === "bird") {
    w = OBSTACLE_W * 1.1;
    h = OBSTACLE_H * 0.7;
    // High bird: user MUST duck OR jump if bird is low enough (let's make it fixed high)
    yPos = GROUND_Y - BEAR_SIZE * 1.25;
  } else {
    w = OBSTACLE_W * (0.9 + Math.random() * 0.4);
    h = OBSTACLE_H * (0.7 + Math.random() * 0.5);
    yPos = GROUND_Y - h;
  }

  obstacles.push({
    type,
    x: W + 100,
    y: yPos,
    w,
    h,
    wing: 0,
  });
}

function spawnSnowParticles() {
  snowParticles = [];
  for (let i = 0; i < SNOW_COUNT; i++) {
    snowParticles.push(makeSnowParticle(true));
  }
}

function makeSnowParticle(random = false) {
  return {
    x: random ? Math.random() * W : W + 5,
    y: random ? Math.random() * H * 0.85 : Math.random() * H * 0.5,
    r: 0.8 + Math.random() * 2.5,
    speedX: 0.04 + Math.random() * 0.08,
    speedY: 0.02 + Math.random() * 0.04,
    alpha: 0.3 + Math.random() * 0.6,
  };
}

function startGame() {
  state = "running";
  // GSAP: Professional menu transition
  gsap.to(startPrompt, {
    opacity: 0,
    y: -20,
    duration: 0.5,
    ease: "power2.in",
    onComplete: () => startPrompt.classList.add("hidden"),
  });
}

/* ============================================================
   GAME OVER
   ============================================================ */
function die() {
  state = "dead";

  const s = Math.floor(score);
  if (s > highScore) {
    highScore = s;
    localStorage.setItem("pbr_highscore", highScore);
  }

  finalScore.textContent = s;
  finalBest.textContent = highScore;
  highScoreDisplay.textContent = highScore;

  gameOverOverlay.classList.remove("hidden");
  // GSAP: Smooth impact animation
  gsap.fromTo(
    ".game-over-card",
    { scale: 0.8, y: 30, opacity: 0 },
    { scale: 1, y: 0, opacity: 1, duration: 0.6, ease: "back.out(1.7)" },
  );
}
