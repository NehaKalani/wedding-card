import { createFullscreenProgram, drawFullscreen } from "../lib/gl.js";
import { SKY_FRAGMENT } from "./shaders.js";

const BASE = "/haldi";
// Painting columns kept on a phone; taller screens open up more sky instead of cropping.
const FRAME = { x0: 72, x1: 952 };
const HORIZON_Y = 610;
// Share of the extra sky the lettering takes; kept small so a gap stays under the title.
const LETTERING_DROP = 0.12;
const LETTERING_LIFT = 36;
const SKY_SCALE = 0.5;

// amp in degrees, period in seconds (longer strands swing slower), lag in seconds of wind travel.
const SWAY = {
  "strand-pillar": { amp: 2.8, period: 4.2, lag: 0.1 },
  "strand-pair": { amp: 3.6, period: 3.4, lag: 0.35 },
  "strand-sky": { amp: 5.4, period: 2.8, lag: 0.5 },
  "vine-left": { amp: 4.8, period: 2.5, lag: 0.75 },
  "vine-right": { amp: 5.2, period: 2.3, lag: 1.4 },
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function place(el, { x, y, w, h }, dropsWithGap = false) {
  el.style.left = `${x}px`;
  el.style.top = dropsWithGap ? `calc(${y}px + var(--gap))` : `${y}px`;
  el.style.width = `${w}px`;
  if (h !== undefined) el.style.height = `${h}px`;
  return el;
}

function image(src, box, dropsWithGap) {
  const img = new Image();
  img.src = `${BASE}/${src}`;
  img.alt = "";
  img.decoding = "async";
  return place(img, box, dropsWithGap);
}

/** Gentle, never-repeating gusts in [-1, 1]. */
function gust(t) {
  return 0.55 * Math.sin(t * 0.37) + 0.3 * Math.sin(t * 0.93 + 1.7) + 0.15 * Math.sin(t * 2.1 + 0.4);
}

function buildArt(art, layout) {
  const { band } = layout;
  const tileH = band.y1 - band.y0;
  const title = art.querySelector(".haldi__title");

  const bandImg = image("band.webp", { x: 0, y: band.y0, w: band.w });
  bandImg.style.height = `calc(${tileH}px + var(--gap))`;
  art.prepend(image("top.webp", layout.top), bandImg, image("bottom.webp", layout.bottom, true));

  const swaying = [];
  for (const piece of layout.sway) {
    let el;
    if (piece.split) {
      el = place(document.createElement("div"), piece);
      el.style.height = `calc(${piece.h}px + var(--gap))`;
      const topH = band.y0 - piece.y;
      const tile = place(document.createElement("div"), { x: 0, y: topH, w: piece.w });
      tile.style.height = "var(--gap)";
      tile.style.backgroundImage = `url(${BASE}/sway-${piece.name}-tile.webp)`;
      tile.style.backgroundSize = `${piece.w}px ${tileH}px`;
      el.append(
        image(`sway-${piece.name}-top.webp`, { x: 0, y: 0, w: piece.w, h: topH }),
        tile,
        image(`sway-${piece.name}-bottom.webp`, { x: 0, y: topH, w: piece.w, h: piece.h - topH }, true),
      );
    } else {
      el = image(`sway-${piece.name}.webp`, piece);
    }
    el.classList.add("haldi__sway");
    el.style.transformOrigin = `${piece.origin[0] - piece.x}px ${piece.origin[1] - piece.y}px`;
    title.before(el);
    swaying.push({ el, ...SWAY[piece.name], phase: swaying.length * 1.9 });
  }

  return swaying;
}

// Wider windows scale the painting up until the lettering meets the garlands.
// Pull the title, date, and venue back in, and lift them into the open sky.
function typeFit(width) {
  const widen = Math.min(Math.max((width - 480) / 720, 0), 1);
  return {
    shrink: 0.92 - widen * 0.18,
    lift: LETTERING_LIFT + 18 + widen * 44,
    detail: 0.9 - widen * 0.16,
  };
}

function placeTitle(title, lettering, width, section) {
  const { x, y, w } = lettering;
  const fit = typeFit(width);
  let lift = fit.lift;
  if (section) {
    const styles = getComputedStyle(section);
    const scale = parseFloat(styles.getPropertyValue("--scale")) || 1;
    const gap = parseFloat(styles.getPropertyValue("--gap")) || 0;
    const paintingH = 1536;
    const screenTop = (nextLift) => {
      const titleTop = y - nextLift + gap * LETTERING_DROP;
      return section.clientHeight - (paintingH + gap - titleTop) * scale;
    };
    while (screenTop(lift) < 32 && lift > LETTERING_LIFT) lift -= 4;
  }
  const nextW = w * fit.shrink;
  title.style.left = `${x + (w - nextW) / 2}px`;
  title.style.top = `calc(${y - lift}px + var(--gap) * ${LETTERING_DROP})`;
  title.style.width = `${nextW}px`;
}

function createSky(canvas) {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
  if (!gl) return null;
  try {
    const { uniform } = createFullscreenProgram(gl, SKY_FRAGMENT);
    return { gl, uniform };
  } catch (error) {
    console.error(error);
    return null;
  }
}

function createPetals(canvas, sprites) {
  const ctx = canvas.getContext("2d");
  const petals = [];
  let width = 1;
  let height = 1;
  let unit = 1;

  const spawn = (petal, anywhere) => {
    const depth = 0.6 + Math.random() * 0.9;
    Object.assign(petal, {
      sprite: sprites[Math.floor(Math.random() * sprites.length)],
      depth,
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -30 - Math.random() * 60,
      fall: (28 + Math.random() * 22) * depth,
      swayAmp: 14 + Math.random() * 26,
      swayFreq: 0.5 + Math.random() * 0.7,
      spin: (Math.random() - 0.5) * 2.4,
      tumble: 1.2 + Math.random() * 2.2,
      angle: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
    });
    return petal;
  };

  return {
    resize(w, h, scale, dpr) {
      width = w;
      height = h;
      unit = scale;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(Math.max((w * h) / 9000, 22), 56));
      while (petals.length < count) petals.push(spawn({}, true));
      petals.length = count;
    },
    draw(t, dt, wind) {
      ctx.clearRect(0, 0, width, height);
      for (const p of petals) {
        p.y += p.fall * dt;
        p.x += (wind * 28 * p.depth + Math.cos(t * p.swayFreq + p.phase) * p.swayAmp * p.swayFreq) * dt;
        p.angle += p.spin * dt;
        if (p.y > height + 40) spawn(p, false);
        if (p.x > width + 40) p.x -= width + 80;
        if (p.x < -40) p.x += width + 80;

        const { image, w, h } = p.sprite;
        const size = unit * p.depth * 1.7;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.scale(1, Math.cos(t * p.tumble + p.phase));
        ctx.globalAlpha = 0.65 + 0.35 * Math.min(p.depth, 1);
        ctx.drawImage(image, (-w * size) / 2, (-h * size) / 2, w * size, h * size);
        ctx.restore();
      }
    },
  };
}

export async function initHaldi(section) {
  if (!section) return;
  const art = section.querySelector(".haldi__art");
  const layout = await fetch(`${BASE}/layout.json`).then((r) => r.json());
  const painting = layout.painting;
  const tileH = layout.band.y1 - layout.band.y0;
  const swaying = buildArt(art, layout);

  const skyCanvas = section.querySelector(".haldi__sky");
  const sky = createSky(skyCanvas);
  if (!sky) skyCanvas.remove();

  const sprites = await Promise.all(
    layout.petals.map(
      (p) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ image: img, w: p.w, h: p.h });
          img.onerror = () => resolve(null);
          img.src = `${BASE}/${p.src}`;
        }),
    ),
  );
  const petals = reducedMotion ? null : createPetals(section.querySelector(".haldi__petals"), sprites.filter(Boolean));

  const view = { w: 1, h: 1, scale: 1, horizon: 0 };

  const resize = () => {
    const w = section.clientWidth;
    const h = section.clientHeight;
    const frameW = FRAME.x1 - FRAME.x0;
    // Sky under the lettering has to stay large enough for the date and theme.
    const textBand = Math.min(Math.max(h * 0.3, 156), 230);
    const titleTop = 145 - LETTERING_LIFT;
    const titleBottom = titleTop + 405;
    const openSky = HORIZON_Y - titleBottom;
    const gapFactor = 1 - LETTERING_DROP;
    const skyScale = (h * 0.58) / (painting.h - HORIZON_Y);
    let scale = Math.min(w / frameW, skyScale);
    const gapFor = (s) => {
      const need = textBand / s - openSky;
      return need > 0 ? Math.ceil(need / gapFactor / tileH) * tileH : 0;
    };
    let gap = gapFor(scale);
    const fitted = h / (painting.h + gap);
    if (scale > fitted) {
      scale = fitted;
      gap = gapFor(scale);
      scale = Math.min(scale, h / (painting.h + gap));
    }
    // The fit above can leave the painting narrower than the screen.
    // Grow toward a width cover, and stop once the date would land on the couple.
    const cover = (w + 2) / painting.w;
    if (scale < cover) {
      const textFits = (s, nextGap) => {
        const titleY = titleTop + nextGap * LETTERING_DROP;
        const titleScreen = h - (painting.h + nextGap - titleY) * s;
        if (titleScreen < 12) return false;
        // 250px is the date block in painting space; 896px is the couple, measured up from the bottom.
        const detailsBottom = titleScreen + (405 + 250) * s + 36;
        return detailsBottom <= h - 896 * s + 4;
      };
      let next = cover;
      for (let i = 0; i < 24 && next > scale; i += 1) {
        const room = (h - 36) / next - (painting.h - titleTop);
        const cap = room > 0 ? Math.floor(room / gapFactor / tileH) * tileH : 0;
        const nextGap = Math.min(gapFor(next), cap);
        if (textFits(next, nextGap)) {
          scale = next;
          gap = nextGap;
          break;
        }
        next *= 0.97;
      }
    }
    const offsetX = w / 2 - ((FRAME.x0 + FRAME.x1) / 2) * scale;
    section.style.setProperty("--gap", `${gap}px`);
    section.style.setProperty("--scale", `${scale}`);
    section.style.setProperty("--offset-x", `${offsetX}px`);
    section.classList.toggle("is-wide", offsetX > 2);
    Object.assign(view, { w, h, scale, horizon: h - (painting.h - HORIZON_Y) * scale });

    if (sky) {
      skyCanvas.width = Math.max(1, Math.round(w * SKY_SCALE));
      skyCanvas.height = Math.max(1, Math.round(h * SKY_SCALE));
      sky.gl.viewport(0, 0, skyCanvas.width, skyCanvas.height);
    }
    petals?.resize(w, h, scale, Math.min(window.devicePixelRatio || 1, 2));
    placeTitle(title, layout.lettering, w, section);
    placeDetails();
    if (!running) draw(last);
  };

  const title = art.querySelector(".haldi__title");
  const details = section.querySelector(".haldi__details");
  const placeDetails = () => {
    if (!title || !details) return;
    const sectionBox = section.getBoundingClientRect();
    const titleBox = title.getBoundingClientRect();
    const { detail } = typeFit(section.clientWidth);
    const width = titleBox.width * detail;
    const left = titleBox.left - sectionBox.left + (titleBox.width - width) / 2;
    details.style.top = `${Math.round(titleBox.bottom - sectionBox.top + 16)}px`;
    details.style.left = `${Math.round(left)}px`;
    details.style.width = `${Math.round(width)}px`;
    details.style.right = "auto";
    details.style.transform = "none";
  };

  const start = performance.now();
  let last = start;
  let running = false;

  const draw = (now) => {
    const t = reducedMotion ? 8 : (now - start) / 1000;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const wind = gust(t);

    if (sky) {
      const { gl, uniform } = sky;
      gl.uniform2f(uniform("uRes"), skyCanvas.width, skyCanvas.height);
      gl.uniform1f(uniform("uTime"), t);
      gl.uniform1f(uniform("uScale"), view.scale * SKY_SCALE);
      gl.uniform1f(uniform("uHorizon"), view.horizon * SKY_SCALE);
      drawFullscreen(gl);
    }
    if (reducedMotion) return;

    for (const s of swaying) {
      const own = Math.sin((t / s.period) * Math.PI * 2 + s.phase);
      const breeze = 0.55 * own + 0.45 * gust(t - s.lag);
      const angle = s.amp * breeze;
      const drift = s.amp * 0.35 * breeze;
      s.el.style.transform = `rotate(${angle.toFixed(3)}deg) translateX(${drift.toFixed(2)}px)`;
    }
    petals?.draw(t, dt, 0.5 + 0.5 * wind);
  };

  const loop = (now) => {
    if (!running) return;
    draw(now);
    requestAnimationFrame(loop);
  };

  new ResizeObserver(resize).observe(section);
  resize();

  new IntersectionObserver(([entry]) => {
    if (reducedMotion) return;
    if (entry.isIntersecting && !running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(loop);
    } else if (!entry.isIntersecting) {
      running = false;
    }
  }).observe(section);
}
