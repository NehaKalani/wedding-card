import { createFullscreenProgram, drawFullscreen } from "../lib/gl.js";
import { BACKDROP_FRAGMENT, LIGHTS_FRAGMENT } from "./shaders.js";

// Poster space (px) of the cut-outs, matching public/sangeet/layout.json.
const POSTER = { w: 979, h: 1492 };
const BALL = { fromRight: 130, y: 204, r: 132, minR: 64 };
const MOBILE = { maxWidth: 640, ballR: 50, ballInset: 12 };
const INTRO_MS = 1800;
const BALL_DROP_MS = 2200;

const SPARKLES = [
  { x: 6, y: 3, s: 2.2, src: 3 }, { x: 47, y: 2.5, s: 1.6, src: 1 }, { x: 4.5, y: 21, s: 1.8, src: 3 },
  { x: 33, y: 17, s: 1.4, src: 2 }, { x: 58, y: 9, s: 1.3, src: 3 }, { x: 70, y: 31, s: 1.2, src: 1 },
  { x: 88, y: 43, s: 3.2, src: 2 }, { x: 64, y: 47, s: 1.5, src: 3 }, { x: 94, y: 70, s: 2.4, src: 1 },
  { x: 81, y: 80, s: 1.3, src: 3 }, { x: 52, y: 62, s: 1.6, src: 2 }, { x: 74, y: 92, s: 1.8, src: 3 },
  { x: 40, y: 38, s: 1.1, src: 1 }, { x: 97, y: 22, s: 1.4, src: 3 },
];

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function easeOutBack(t) {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

function clamp01(v) {
  return Math.min(Math.max(v, 0), 1);
}

function createLayer(canvas, fragment, { opaque }) {
  const gl = canvas.getContext("webgl", { alpha: !opaque, antialias: false, premultipliedAlpha: true });
  if (!gl) return null;
  const { uniform } = createFullscreenProgram(gl, fragment);
  return { gl, uniform, canvas };
}

function addSparkles(container) {
  for (const [i, sparkle] of SPARKLES.entries()) {
    const img = document.createElement("img");
    img.src = `/sangeet/sparkle_${sparkle.src}.svg`;
    img.alt = "";
    img.className = "sangeet__sparkle";
    img.style.left = `${sparkle.x}%`;
    img.style.top = `${sparkle.y}%`;
    img.style.setProperty("--size", `${sparkle.s}`);
    img.style.animationDelay = `${(i * 0.73) % 4}s`;
    img.style.animationDuration = `${3 + (i % 4) * 0.8}s`;
    container.append(img);
  }
}

function placeBall(section, stage) {
  const rect = stage.getBoundingClientRect();
  const u = Math.min(rect.height / POSTER.h, rect.width / POSTER.w);
  let ball;
  if (rect.width <= MOBILE.maxWidth) {
    const r = MOBILE.ballR;
    ball = { x: rect.width - r - MOBILE.ballInset, y: r * 1.25, r };
  } else {
    const posterR = BALL.r * u;
    const r = Math.max(posterR, BALL.minR);
    ball = {
      x: rect.width - BALL.fromRight * u - (r - posterR),
      y: Math.max(BALL.y * u, r * 1.25),
      r,
    };
  }
  section.style.setProperty("--u", `${u}px`);
  // Title and event lines sit just under the hanging disco ball.
  section.style.setProperty("--ball-clear", `${Math.ceil(ball.y + ball.r + 14)}px`);
  return { w: rect.width, h: rect.height, u, ball };
}

export function initSangeet(section) {
  if (!section) return;
  const stage = section.querySelector(".sangeet__stage") || section;
  addSparkles(section.querySelector(".sangeet__sparkles"));

  const backdrop = createLayer(section.querySelector(".sangeet__backdrop"), BACKDROP_FRAGMENT, { opaque: true });
  const lights = backdrop && createLayer(section.querySelector(".sangeet__lights"), LIGHTS_FRAGMENT, { opaque: true });
  if (!backdrop || !lights) {
    section.classList.add("is-static");
    section.classList.add("is-revealed");
    placeBall(section, stage);
    new ResizeObserver(() => placeBall(section, stage)).observe(stage);
    return;
  }

  const layout = { w: 1, h: 1, u: 1, ball: { x: 0, y: 0, r: 0 } };
  const layers = [
    { ...backdrop, scale: () => Math.min(window.devicePixelRatio || 1, 1.5) },
    { ...lights, scale: () => Math.min(window.devicePixelRatio || 1, 1) * 0.75 },
  ];

  const resize = () => {
    Object.assign(layout, placeBall(section, stage));
    for (const layer of layers) {
      const s = layer.scale();
      layer.pxScale = s;
      layer.canvas.width = Math.max(1, Math.round(layout.w * s));
      layer.canvas.height = Math.max(1, Math.round(layout.h * s));
      layer.gl.viewport(0, 0, layer.canvas.width, layer.canvas.height);
    }
    if (!running) draw(lastNow);
  };

  let revealedAt = null;
  let droppedAt = null;
  let running = false;
  let lastNow = performance.now();
  const start = performance.now();

  const draw = (now) => {
    lastNow = now;
    const time = reducedMotion ? 6 : (now - start) / 1000;
    const sinceReveal = revealedAt === null ? 0 : now - revealedAt;
    const intro = reducedMotion ? 1 : clamp01(sinceReveal / INTRO_MS);
    const sinceDrop = droppedAt === null ? 0 : now - droppedAt;
    const drop = reducedMotion ? 1 : easeOutBack(clamp01(sinceDrop / BALL_DROP_MS));
    const ballY = layout.ball.y * drop - layout.ball.r * 1.4 * (1 - drop);

    for (const { gl, uniform, canvas, pxScale } of layers) {
      gl.uniform2f(uniform("uRes"), canvas.width, canvas.height);
      gl.uniform1f(uniform("uTime"), time);
      gl.uniform1f(uniform("uIntro"), intro);
      gl.uniform1f(uniform("uDpr"), pxScale);
      gl.uniform3f(uniform("uBall"), layout.ball.x * pxScale, ballY * pxScale, layout.ball.r * pxScale);
      drawFullscreen(gl);
    }
  };

  const loop = (now) => {
    if (!running) return;
    draw(now);
    requestAnimationFrame(loop);
  };

  new ResizeObserver(resize).observe(stage);
  resize();

  new IntersectionObserver(
    ([entry]) => {
      if (entry.intersectionRatio >= 0.2 && revealedAt === null) {
        revealedAt = performance.now();
        section.classList.add("is-revealed");
      }
      if (entry.intersectionRatio >= 0.2 && droppedAt === null) {
        droppedAt = performance.now();
      } else if (entry.intersectionRatio === 0) {
        droppedAt = null;
      }
      if (reducedMotion) {
        draw(performance.now());
        return;
      }
      const shouldRun = entry.isIntersecting;
      if (shouldRun && !running) {
        running = true;
        requestAnimationFrame(loop);
      } else if (!shouldRun) {
        running = false;
      }
    },
    { threshold: [0, 0.2] },
  ).observe(stage);
}
