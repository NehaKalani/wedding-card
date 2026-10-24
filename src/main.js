import "./style.css";
import "./ganesha/ganesha.css";
import "./venue/venue.css";
import "./haldi/haldi.css";
import "./sangeet/sangeet.css";
import "./maayra/maayra.css";
import "./sunset/sunset.css";
import "./regards/regards.css";
import "./music/music.css";
import "./lib/hindi.css";
import { createVineRenderer } from "./hero/vineRenderer.js";
import { createFlowers } from "./hero/flowers.js";
import { initGanesha } from "./ganesha/ganesha.js";
import { initVenue } from "./venue/venue.js";
import { initHaldi } from "./haldi/haldi.js";
import { initSangeet } from "./sangeet/sangeet.js";
import { initMaayra } from "./maayra/maayra.js";
import { initSunset } from "./sunset/sunset.js";
import { initRegards } from "./regards/regards.js";
import { initMusic } from "./music/music.js";
import { lockViewport } from "./lib/viewport.js";
import { onScrollFrame } from "./lib/scroll.js";
import { preloadWhenNear } from "./lib/preload.js";
import { applyInvite } from "./lib/invite.js";

applyInvite();

const TIMELINE = {
  nidhi: { mossStart: 200, mossDuration: 1700, vineStart: 1300, vineDuration: 3800 },
  rahul: { mossStart: 650, mossDuration: 1700, vineStart: 1750, vineDuration: 3800 },
  wedsStart: 1500,
  bloomLag: 150,
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

async function setupRow(el) {
  const name = el.dataset.row;
  const base = `/hero/${name}`;
  const manifest = await fetch(`${base}/manifest.json`).then((r) => r.json());
  el.style.aspectRatio = `${manifest.width} / ${manifest.height}`;

  const showFinal = () => {
    el.replaceChildren();
    const img = new Image();
    img.src = `${base}/final.png`;
    img.alt = "";
    el.append(img);
  };

  if (reducedMotion) {
    showFinal();
    return null;
  }

  try {
    const [moss, foliage, growth] = await Promise.all(
      ["moss", "foliage", "growth"].map((layer) => loadImage(`${base}/${layer}.png`)),
    );
    const canvas = document.createElement("canvas");
    const renderer = createVineRenderer(canvas, {
      moss,
      foliage,
      growth,
      width: manifest.width,
      height: manifest.height,
    });
    if (!renderer) {
      showFinal();
      return null;
    }
    el.append(canvas);
    renderer.draw(1, 1);

    const flowers = createFlowers(el, manifest, base);
    await flowers.ready;
    return { name, flowers, timing: TIMELINE[name] };
  } catch (error) {
    console.error(error);
    showFinal();
    return null;
  }
}

function bindHeroFrame(hero) {
  const frame = hero?.querySelector(".hero__frame");
  if (!frame) return;

  const ring = (w, h, inset, amp, period) => {
    const sides = [
      [inset, inset, w - inset, inset, 0, -1],
      [w - inset, inset, w - inset, h - inset, 1, 0],
      [w - inset, h - inset, inset, h - inset, 0, 1],
      [inset, h - inset, inset, inset, -1, 0],
    ];
    const pts = [];
    for (const [x0, y0, x1, y1, nx, ny] of sides) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      const cycles = Math.max(2, Math.round(len / period));
      const steps = cycles * 4;
      for (let i = 0; i <= steps; i += 1) {
        const phase = i % 4;
        const mag = phase === 1 ? amp : phase === 3 ? -amp : 0;
        const t = i / steps;
        pts.push([x0 + dx * t + nx * mag, y0 + dy * t + ny * mag]);
      }
    }
    return pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join(" ");
  };

  const draw = () => {
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (w < 80 || h < 80) return;
    frame.setAttribute("viewBox", `0 0 ${w} ${h}`);
    frame.innerHTML = [8, 19]
      .map(
        (inset) =>
          `<path d="${ring(w, h, inset, 3.5, 11)}" fill="none" stroke="#f3b6cc" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>`
      )
      .join("");
  };

  draw();
  new ResizeObserver(draw).observe(frame);
}

async function init() {
  bindHeroFrame(document.querySelector(".hero"));
  const rows = await Promise.all([...document.querySelectorAll(".name-row")].map(setupRow));
  const animated = rows.filter(Boolean);

  if (animated.length === 0) {
    document.documentElement.classList.add("is-static");
    document.querySelector(".hero__intro")?.removeAttribute("aria-hidden");
    return;
  }

  const hero = document.querySelector(".hero");
  hero.classList.add("is-lettered");
  bindHeroWind(hero, (direction) => {
    for (const { flowers } of animated) flowers.gust(direction);
  });

  const play = () => {
    for (const { flowers, timing } of animated) {
      flowers.play((flower) => flower.t * timing.vineDuration + TIMELINE.bloomLag);
    }
  };

  const heroInReach = () => hero.getBoundingClientRect().top < window.innerHeight * 0.9;
  if (heroInReach()) {
    play();
    return;
  }

  const onScroll = () => {
    if (!heroInReach()) return;
    window.removeEventListener("scroll", onScroll);
    play();
  };
  window.addEventListener("scroll", onScroll, { passive: true });
}

function bindHeroWind(hero, onGust) {
  if (!hero) return;

  hero.addEventListener("click", (event) => {
    const mid = hero.getBoundingClientRect().left + hero.clientWidth * 0.5;
    onGust(event.clientX < mid ? 1 : -1);
  });
}

function bindHeroBridge(hero, venue, venueReady, ganesha, music) {
  if (reducedMotion || !hero || !venue) {
    venue?.classList.remove("is-held", "is-bridge");
    return;
  }

  venue.classList.add("is-held");
  // The shorter hero is the scroll the guest actually sees. Applying it while
  // Ganesha still covers the screen keeps later sections from jumping up
  // the moment the invitation opens.
  hero.classList.add("is-short");

  const stage = hero.querySelector(".hero__stage");
  const veil = hero.querySelector(".hero__veil");
  const intro = hero.querySelector(".hero__intro");
  const [topName, bottomName] = hero.querySelectorAll(".name-row");
  const weds = hero.querySelector(".weds");
  if (!topName || !bottomName || !weds) return;
  const scaleGain = 0.52;
  let topExit = 0;
  let bottomExit = 0;
  let locked = false;
  let settled = false;
  let frameId = 0;
  let heroHeld = false;
  let heroHoldStarted = false;

  const blockHeroHold = (event) => {
    if (!heroHeld) return;
    event.preventDefault();
    window.scrollTo(0, hero.offsetTop);
  };

  const blockHeroKeys = (event) => {
    if (!heroHeld) return;
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
      event.preventDefault();
      window.scrollTo(0, hero.offsetTop);
    }
  };

  const startHeroHold = () => {
    if (heroHoldStarted) return;
    heroHoldStarted = true;
    if (reducedMotion) {
      heroHeld = false;
      music?.start();
      return;
    }
    heroHeld = true;
    hero.classList.add("is-holding");
    hero.classList.remove("is-scroll-ready");
    document.documentElement.classList.add("is-hero-held");
    music?.start();
    window.scrollTo(0, hero.offsetTop);
    window.addEventListener("wheel", blockHeroHold, { passive: false });
    window.addEventListener("touchmove", blockHeroHold, { passive: false });
    window.addEventListener("keydown", blockHeroKeys);
    window.setTimeout(() => {
      heroHeld = false;
      hero.classList.remove("is-holding");
      hero.classList.add("is-scroll-ready", "is-introduced");
      hero.querySelector(".hero__intro")?.removeAttribute("aria-hidden");
      document.documentElement.classList.remove("is-hero-held");
      window.removeEventListener("wheel", blockHeroHold);
      window.removeEventListener("touchmove", blockHeroHold);
      window.removeEventListener("keydown", blockHeroKeys);
    }, 2600);
  };

  const restingRect = (el) => {
    const transform = el.style.transform;
    if (transform) el.style.transform = "none";
    const rect = el.getBoundingClientRect();
    if (transform) el.style.transform = transform;
    return rect;
  };

  const measureExits = () => {
    const scale = 1 + scaleGain;
    const margin = 28;
    const stageRect = stage.getBoundingClientRect();
    const top = restingRect(topName);
    const bottom = restingRect(bottomName);
    if (top.height < 8 || bottom.height < 8) return;
    const topCenter = top.top - stageRect.top + top.height / 2;
    const bottomCenter = bottom.top - stageRect.top + bottom.height / 2;
    const view = stage.clientHeight || window.innerHeight;
    topExit = topCenter + (top.height * scale) / 2 + margin;
    bottomExit = view + margin - (bottomCenter - (bottom.height * scale) / 2);
  };

  const apply = (progress) => {
    const revealed = venue.classList.contains("is-revealed");

    if (progress <= 0.001) {
      veil.style.opacity = "";
      venue.style.setProperty("--foil", "0");
      venue.style.setProperty("--scene", revealed ? "0" : "1");
      weds.style.opacity = "";
      weds.style.filter = "";
      topName.style.transform = "";
      bottomName.style.transform = "";
      topName.style.opacity = "";
      bottomName.style.opacity = "";
      hero.classList.remove("is-parting");
      hero.style.removeProperty("--intro");
      return;
    }

    const move = clamp01((progress - 0.05) / 0.95);
    const foil = revealed ? 0 : easeInOut(clamp01((progress - 0.48) / 0.36));
    const scene = revealed ? easeInOut(move) : 1;
    const wedsOpacity = 1 - easeInOut(clamp01((progress - 0.08) / 0.18));
    const introOpacity = intro ? 1 - easeInOut(clamp01(progress / 0.14)) : 1;
    const scale = 1 + move * scaleGain;
    const topApart = move * (topExit || window.innerHeight * 0.72);
    const bottomApart = move * (bottomExit || window.innerHeight * 0.72);

    veil.style.opacity = String(1 - (revealed ? scene : foil));
    venue.style.setProperty("--foil", foil.toFixed(3));
    venue.style.setProperty("--scene", scene.toFixed(3));
    weds.style.opacity = String(wedsOpacity);
    if (intro) {
      hero.classList.add("is-parting");
      hero.style.setProperty("--intro", introOpacity.toFixed(3));
    }
    topName.style.opacity = "";
    bottomName.style.opacity = "";
    topName.style.transform = `translate3d(0, ${-topApart}px, 0) scale(${scale})`;
    bottomName.style.transform = `translate3d(0, ${bottomApart}px, 0) scale(${scale})`;
  };

  const update = () => {
    if (!topExit) measureExits();

    const ganeshaGone = !ganesha || window.scrollY + 1 >= ganesha.offsetTop + ganesha.offsetHeight;
    const venueTop = venue.offsetTop - window.scrollY;
    const atVenue = venueTop < 8;
    if (ganeshaGone) startHeroHold();

    if (heroHeld) {
      hero.classList.toggle("is-short", true);
      hero.classList.toggle("is-pinned", true);
      apply(0);
      venue.classList.toggle("is-held", false);
      venue.classList.toggle("is-bridge", true);
      return;
    }

    hero.classList.add("is-short");
    hero.classList.toggle("is-pinned", ganeshaGone && venueTop > 0);

    const distance = Math.max(hero.offsetHeight - stage.offsetHeight, 1);
    let progress = ganeshaGone ? clamp01((window.scrollY - hero.offsetTop) / distance) : 0;
    apply(progress);

    const revealed = venue.classList.contains("is-revealed");
    const foil = revealed ? 1 : easeInOut(clamp01((progress - 0.48) / 0.36));
    const out = ganeshaGone && progress > 0.92;
    if (out && (revealed || foil > 0.96) && !atVenue && !settled) {
      settled = true;
      window.scrollTo(0, venue.offsetTop);
      venue.style.setProperty("--foil", "1");
      if (revealed) venue.style.setProperty("--scene", "1");
    }
    if (!out) settled = false;

    if (atVenue) {
      venue.style.setProperty("--foil", "1");
      if (revealed) venue.style.setProperty("--scene", "1");
    }

    locked = out || atVenue;
    hero.classList.toggle("is-complete", atVenue);
    hero.classList.toggle("is-open", locked && !revealed);
    if (progress > 0.04) hero.classList.remove("is-scroll-ready");
    venue.classList.toggle("is-held", !ganeshaGone);
    venue.classList.toggle("is-bridge", ganeshaGone && !atVenue);
  };

  const requestUpdate = () => {
    if (frameId) return;
    frameId = requestAnimationFrame(() => {
      frameId = 0;
      update();
    });
  };

  venueReady.then(() => requestUpdate());
  new MutationObserver(requestUpdate).observe(venue, {
    attributes: true,
    attributeFilter: ["class"],
  });

  measureExits();
  new ResizeObserver(() => {
    measureExits();
    requestUpdate();
  }).observe(hero.querySelector(".hero__title"));

  update();
  onScrollFrame(requestUpdate);
}

lockViewport();

if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.scrollTo(0, 0);

const ganeshaEl = document.querySelector(".ganesha");
const venueEl = document.querySelector(".venue");
const music = initMusic(
  ganeshaEl,
  document.querySelector(".music"),
  document.querySelector(".music__track--ganesha"),
  document.querySelector(".music__track--hero"),
);
initGanesha(ganeshaEl, music);
const venueReady = initVenue(venueEl);
bindHeroBridge(document.querySelector(".hero"), venueEl, venueReady, ganeshaEl, music);

let heroStarted = false;
const startHero = () => {
  if (heroStarted) return;
  heroStarted = true;
  init();
};

let laterStarted = false;
const startLaterScenes = () => {
  if (laterStarted) return;
  laterStarted = true;
  initHaldi(document.querySelector(".haldi"));
  initSangeet(document.querySelector(".sangeet"));
  initMaayra(document.querySelector(".maayra"), document.querySelector(".sangeet"));
  initSunset(document.querySelector(".sunset"));
  initRegards(document.querySelector(".regards"));
};

document.querySelector(".ganesha__invite")?.addEventListener("click", startHero, { once: true });
window.addEventListener("scroll", startLaterScenes, { passive: true, once: true });
if ("requestIdleCallback" in window) requestIdleCallback(startHero, { timeout: 1400 });
else window.setTimeout(startHero, 400);
window.setTimeout(startLaterScenes, 2800);

for (const id of ["haldi", "sangeet", "maayra", "sunset"]) {
  preloadWhenNear(document.getElementById(id));
}
