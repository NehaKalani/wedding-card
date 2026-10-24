import { onScrollFrame } from "../lib/scroll.js";
import { t } from "../lib/hindi.js";

const BASE = "/venue";
const CLEAR_AT = 0.14;
const BRUSH = 64;
const REVEAL_STROKES = 5;
let handMoves = {
  krishna: { x: -340, y: 16 },
  radhaSide: { x: 330, y: 20 },
};

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

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

function place(el, box) {
  el.style.left = `${box.x}px`;
  el.style.top = `${box.y}px`;
  el.style.width = `${box.w}px`;
  el.style.height = `${box.h}px`;
}

function frameArt(frame, art, layout) {
  const width = frame.clientWidth;
  const height = frame.clientHeight;
  const krishna = layout.pieces?.krishna;
  const radha = layout.pieces?.radha;
  // The sleeves are inset on the gold plate. Cover with that span, not the
  // plate, so both sleeves meet the screen edges on every aspect ratio.
  const spanLeft = krishna ? krishna.x : 0;
  const spanRight = radha ? radha.x + radha.w : layout.width;
  const span = Math.max(spanRight - spanLeft, 1);
  const scale = Math.max((width + 2) / span, height / layout.height);
  const x = (width - span * scale) / 2 - spanLeft * scale;
  let y = (height - layout.height * scale) / 2;
  if (krishna && radha) {
    const top = Math.min(krishna.y, radha.y);
    const bottom = Math.max(krishna.y + krishna.h, radha.y + radha.h);
    const blockTop = y + top * scale;
    const blockH = (bottom - top) * scale;
    if (blockTop < 0) y -= blockTop;
    else if (blockTop + blockH > height) y -= blockTop + blockH - height;
  }
  art.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  return { scale, x, y };
}

// Parted hands stay on the original art and open just far enough
// for "Scratch to reveal" to sit between them.
function edgeMoves(frame, layout, placed, hintWidth) {
  const { scale, x } = placed;
  const krishna = layout.pieces.krishna;
  const radha = layout.pieces.radha;
  const gap = Math.max(hintWidth, 160) + 56;
  const half = Math.min(gap / 2, frame.clientWidth * 0.34);
  const mid = frame.clientWidth / 2;
  return {
    krishna: { x: (mid - half - x) / scale - (krishna.x + krishna.w), y: 16 },
    radhaSide: { x: (mid + half - x) / scale - radha.x, y: 20 },
  };
}

const CONFETTI_COLORS = ["#f3d59a", "#f4b8c5", "#fff6e4", "#c9a04a", "#e07a8a", "#9c2233", "#ffe7c2", "#d4a0c8", "#f6c56b"];
const CONFETTI_KINDS = ["ribbon", "dot", "petal", "diamond", "star"];

function burstConfetti(section) {
  if (section.querySelector(".venue__confetti")) return;
  const root = document.createElement("div");
  root.className = "venue__confetti";
  for (let i = 0; i < 180; i += 1) {
    const bit = document.createElement("i");
    const fromCenter = i % 5 !== 0;
    bit.className = `is-${CONFETTI_KINDS[i % CONFETTI_KINDS.length]}`;
    bit.style.setProperty("--left", fromCenter ? `${28 + Math.random() * 44}%` : `${2 + Math.random() * 96}%`);
    bit.style.setProperty("--top", fromCenter ? `${38 + Math.random() * 18}%` : `${-8 - Math.random() * 12}%`);
    bit.style.setProperty("--dx", `${(Math.random() - 0.5) * (fromCenter ? 420 : 180)}px`);
    bit.style.setProperty("--dy", `${fromCenter ? 70 + Math.random() * 90 : 110 + Math.random() * 30}vh`);
    bit.style.setProperty("--rot", `${Math.random() * 980 - 490}deg`);
    bit.style.setProperty("--delay", `${Math.random() * 0.45}s`);
    bit.style.setProperty("--dur", `${2.2 + Math.random() * 2.2}s`);
    bit.style.setProperty("--c", CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
    bit.style.setProperty("--w", `${7 + Math.random() * 11}px`);
    bit.style.setProperty("--h", `${9 + Math.random() * 16}px`);
    root.append(bit);
  }
  section.append(root);
  window.setTimeout(() => root.remove(), 5200);
}

function windowProgress(progress, start, end) {
  return clamp01((progress - start) / (end - start));
}

function artPoint(event, art, layout) {
  const rect = art.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * layout.width,
    y: ((event.clientY - rect.top) / rect.height) * layout.height,
  };
}

function stamp(ctx, x, y, last) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  ctx.lineWidth = BRUSH * 1.8;
  ctx.globalAlpha = 0.95;
  if (last) {
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, BRUSH, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function clearedShare(ctx, w, h) {
  const sample = document.createElement("canvas");
  const sw = 80;
  const sh = Math.round((h / w) * sw);
  sample.width = sw;
  sample.height = sh;
  const sctx = sample.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(ctx.canvas, 0, 0, sw, sh);
  const { data } = sctx.getImageData(0, 0, sw, sh);
  let gone = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 80) gone += 1;
  }
  return gone / (sw * sh);
}

export async function initVenue(section) {
  if (!section) return { arrive() {}, leave() {}, setProgress() {} };

  const stage = section.querySelector(".venue__stage") || section;
  const art = section.querySelector(".venue__art");
  const scratch = section.querySelector(".venue__scratch");
  const glowCanvas = section.querySelector(".venue__glow");
  const hint = section.querySelector(".venue__hint");
  const scrollCue = section.querySelector(".venue__scroll-cue");
  const movers = {
    krishna: section.querySelector(".venue__krishna"),
    radhaSide: section.querySelector(".venue__radha-side"),
  };

  if (!reducedMotion) {
    frameArt(stage, art, { width: 941, height: 1672 });
  }

  const WEDDING = new Date("2027-01-30T00:00:00+05:30");

  function countdownParts(from, to) {
    if (to <= from) return { months: 0, days: 0, hours: 0, secs: 0 };
    let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    const afterMonths = new Date(from);
    afterMonths.setMonth(afterMonths.getMonth() + months);
    if (afterMonths > to) {
      months -= 1;
      afterMonths.setTime(from.getTime());
      afterMonths.setMonth(afterMonths.getMonth() + months);
    }
    const rem = Math.max(0, to.getTime() - afterMonths.getTime());
    return {
      months: Math.max(0, months),
      days: Math.floor(rem / 86400000),
      hours: Math.floor((rem % 86400000) / 3600000),
      secs: Math.floor((rem % 60000) / 1000),
    };
  }

  function tickCountdown() {
    const parts = countdownParts(new Date(), WEDDING);
    const labels = {
      months: t(parts.months === 1 ? "month" : "months"),
      days: t(parts.days === 1 ? "day" : "days"),
      hours: t(parts.hours === 1 ? "hr" : "hrs"),
      secs: t("sec"),
    };
    for (const [unit, value] of Object.entries(parts)) {
      const el = section.querySelector(`[data-unit="${unit}"]`);
      if (el) el.textContent = unit === "months" || unit === "days" ? String(value) : String(value).padStart(2, "0");
      const label = section.querySelector(`[data-label="${unit}"]`);
      if (label) label.textContent = labels[unit];
    }
  }

  const [layout, gold] = await Promise.all([
    fetch(`${BASE}/layout.json`).then((r) => r.json()),
    loadImage(`${BASE}/gold.webp`),
  ]);

  const boxes = layout.pieces;
  place(movers.krishna, boxes.krishna);
  place(section.querySelector(".venue__radha"), boxes.radha);
  place(glowCanvas, layout.glow);

  const applyHands = (placed) => {
    const hintWidth = hint ? hint.getBoundingClientRect().width : 0;
    handMoves = edgeMoves(stage, layout, placed, hintWidth);
  };

  applyHands(frameArt(stage, art, layout));

  const ctx = scratch.getContext("2d", { alpha: true, willReadFrequently: true });
  scratch.width = layout.width;
  scratch.height = layout.height;
  glowCanvas.width = layout.glow.w;
  glowCanvas.height = layout.glow.h;
  ctx.drawImage(gold, 0, 0, layout.width, layout.height);
  section.classList.add("is-ready");
  tickCountdown();
  window.setInterval(tickCountdown, 1000);

  let onFrame = () => {};
  const frame = () => {
    applyHands(frameArt(stage, art, layout));
    onFrame();
  };
  new ResizeObserver(frame).observe(stage);
  frame();
  document.fonts?.ready.then(frame);

  let revealed = false;
  let scratchReady = false;
  let mayLeave = false;
  let pinY = 0;
  let settleTimer = 0;
  let shaking = false;
  let lastTouchY = 0;

  const waitForRest = () => {
    if (mayLeave) return;
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      mayLeave = true;
      syncPin();
    }, 450);
  };

  const shakeScratch = () => {
    if (revealed || reducedMotion) return;
    if (shaking) return;
    shaking = true;
    section.classList.remove("is-shaking");
    void section.offsetWidth;
    section.classList.add("is-shaking");
    window.setTimeout(() => {
      section.classList.remove("is-shaking");
      shaking = false;
    }, 500);
  };

  const blockUntilScratch = () => scratchReady && !revealed;

  const finishReveal = () => {
    if (revealed) return;
    revealed = true;
    scratch.style.pointerEvents = "none";
    hint?.classList.remove("is-on");
    scrollCue?.classList.remove("is-on");
    ctx.clearRect(0, 0, layout.width, layout.height);
    pinY = section.offsetTop;
    section.classList.add("is-revealed");
    pinY = section.offsetTop;
    window.scrollTo(0, pinY);
    syncPin();
    lastProgress = -1;
    setProgress(1);
    mayLeave = false;
    waitForRest();
    burstConfetti(section);
    for (const el of Object.values(movers)) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: "ease", fill: "forwards" });
    }
  };

  const enableScratch = () => {
    section.classList.add("is-scratchable");
    hint?.classList.add("is-on");
    scratch.style.pointerEvents = "auto";
    let drawing = false;
    let last = null;
    let checks = 0;
    let strokes = 0;
    let strokeMoved = false;

    const point = (event) => artPoint(event, art, layout);
    const maybeFinish = () => {
      if (strokes >= REVEAL_STROKES || clearedShare(ctx, layout.width, layout.height) >= CLEAR_AT) {
        finishReveal();
      }
    };

    const down = (event) => {
      if (event.button != null && event.button !== 0) return;
      drawing = true;
      strokeMoved = false;
      scratch.setPointerCapture?.(event.pointerId);
      hint?.classList.remove("is-on");
      last = point(event);
      stamp(ctx, last.x, last.y, null);
      event.preventDefault();
    };

    const move = (event) => {
      if (!drawing) return;
      const next = point(event);
      if (last && (Math.abs(next.x - last.x) > 6 || Math.abs(next.y - last.y) > 6)) strokeMoved = true;
      stamp(ctx, next.x, next.y, last);
      last = next;
      checks += 1;
      if (checks % 6 === 0) maybeFinish();
      event.preventDefault();
    };

    const up = (event) => {
      if (drawing && strokeMoved) strokes += 1;
      drawing = false;
      last = null;
      maybeFinish();
      event.preventDefault();
    };

    scratch.addEventListener("pointerdown", down);
    scratch.addEventListener("pointermove", move);
    scratch.addEventListener("pointerup", up);
    scratch.addEventListener("pointercancel", up);
  };

  if (reducedMotion) {
    section.classList.add("is-static", "is-revealed");
    ctx.clearRect(0, 0, layout.width, layout.height);
    return { arrive() {}, leave() {}, setProgress() {} };
  }

  let lastProgress = -1;
  let ritualFrame = 0;
  let sectionTop = 0;
  let range = 1;

  const measureRitual = () => {
    sectionTop = section.offsetTop;
    range = Math.max(section.offsetHeight - window.innerHeight, 1);
  };
  measureRitual();

  const ritualProgress = () => {
    if (revealed) return 1;
    return clamp01((window.scrollY - sectionTop) / range);
  };

  const setProgress = (progress) => {
    // A flick can still carry the page after the pin lands. Pull it back so
    // the words cannot scroll off the card.
    if (scratchReady && !revealed && window.scrollY > pinY + 1) {
      window.scrollTo(0, pinY);
      progress = ritualProgress();
    }
    const p = clamp01(progress);
    if (Math.abs(p - lastProgress) < 0.001) return;
    lastProgress = p;

    // The glow used to fill the first part of this scroll. The hands open
    // with the scroll that arrives on the venue.
    const part = easeOutCubic(windowProgress(p, 0.04, 0.62));

    for (const [name, el] of Object.entries(movers)) {
      if (!el) continue;
      const to = handMoves[name];
      el.style.opacity = "1";
      el.style.transform = to ? `translate(${to.x * part}px, ${to.y * part}px)` : "";
    }
    const parted = part >= 0.82;
    if (parted && !scratchReady) {
      scratchReady = true;
      pinY = window.scrollY;
      enableScratch();
      syncPin();
    }
    hint?.classList.toggle("is-on", parted && !revealed);
    scrollCue?.classList.toggle("is-on", !parted && !revealed && !section.classList.contains("is-held"));
  };

  const requestRitual = () => {
    if (ritualFrame) return;
    ritualFrame = requestAnimationFrame(() => {
      ritualFrame = 0;
      // The hero shortens once Ganesha leaves, which moves this section up.
      // Measuring only at load left the ritual a screen behind the finger.
      measureRitual();
      setProgress(ritualProgress());
    });
  };

  onFrame = () => {
    lastProgress = -1;
    requestRitual();
  };

  setProgress(ritualProgress());
  onScrollFrame(requestRitual);

  const isScrollPast = (event) => {
    if (event.type === "wheel") return event.deltaY > 0;
    if (event.type === "touchmove") {
      const y = event.touches?.[0]?.clientY ?? lastTouchY;
      const past = lastTouchY && y < lastTouchY - 2;
      lastTouchY = y;
      return past;
    }
    return ["ArrowDown", "PageDown", "End", " "].includes(event.key);
  };

  const blockVenueScroll = (event) => {
    if (blockUntilScratch()) {
      if (!isScrollPast(event)) return;
      event.preventDefault();
      shakeScratch();
      return;
    }
    if (!revealed || mayLeave) return;
    event.preventDefault();
  };

  const blockVenueKeys = (event) => {
    if (!["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) return;
    if (blockUntilScratch()) {
      if (!isScrollPast(event)) return;
      event.preventDefault();
      shakeScratch();
      return;
    }
    if (!revealed || mayLeave) return;
    event.preventDefault();
  };

  let pinOn = false;
  const syncPin = () => {
    const need = (scratchReady && !revealed) || (revealed && !mayLeave);
    section.classList.toggle("is-scroll-locked", need);
    if (need === pinOn) return;
    pinOn = need;
    if (need) {
      window.addEventListener("wheel", blockVenueScroll, { passive: false });
      window.addEventListener("touchmove", blockVenueScroll, { passive: false });
      window.addEventListener("keydown", blockVenueKeys);
      return;
    }
    window.removeEventListener("wheel", blockVenueScroll);
    window.removeEventListener("touchmove", blockVenueScroll);
    window.removeEventListener("keydown", blockVenueKeys);
  };

  window.addEventListener("touchstart", (event) => {
    lastTouchY = event.touches?.[0]?.clientY ?? 0;
  }, { passive: true });

  // iPhone leaves a touch on the fixed gold card (and, once the card is
  // scratchable, on a surface with touch-action: none) so the page never
  // moves. Own that gesture and scroll by the finger, the way a wheel does.
  const iosTouch = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iosTouch) {
    section.style.touchAction = "none";
    stage.style.touchAction = "none";
    art.style.touchAction = "none";
  }

  let gesture = null;
  let flingFrame = 0;
  const cancelFling = () => {
    if (!flingFrame) return;
    cancelAnimationFrame(flingFrame);
    flingFrame = 0;
  };

  const onTouchStart = (event) => {
    cancelFling();
    if (event.touches.length !== 1) {
      gesture = null;
      return;
    }
    const touch = event.touches[0];
    lastTouchY = touch.clientY;
    if (!(event.target instanceof Node) || !section.contains(event.target)) {
      gesture = null;
      return;
    }
    gesture = {
      id: touch.identifier,
      startY: touch.clientY,
      y: touch.clientY,
      scroll: window.scrollY,
      owned: iosTouch,
      seen: false,
      t: performance.now(),
      v: 0,
    };
  };

  const onTouchMove = (event) => {
    if (!gesture) return;
    const touch = [...event.touches].find((entry) => entry.identifier === gesture.id);
    if (!touch) return;

    const now = performance.now();
    const step = gesture.y - touch.clientY;
    const dt = Math.max(now - gesture.t, 1);
    gesture.y = touch.clientY;
    gesture.t = now;
    if (dt < 100) gesture.v = gesture.v * 0.5 + (step / dt) * 0.5;
    const dy = gesture.startY - touch.clientY;
    const scratching = scratchReady && !revealed && event.target === scratch;

    if (scratching) return;

    if (revealed && !mayLeave) {
      if (event.cancelable) event.preventDefault();
      return;
    }

    if (scratchReady && !revealed) {
      if (event.cancelable) event.preventDefault();
      if (step > 1) shakeScratch();
      else if (step < -1) window.scrollBy(0, step);
      return;
    }

    if (!gesture.owned) {
      if (!gesture.seen) {
        gesture.seen = true;
        return;
      }
      if (Math.abs(window.scrollY - gesture.scroll) > 6) {
        gesture = null;
        return;
      }
      if (Math.abs(dy) < 24) return;
      gesture.owned = true;
    }

    if (event.cancelable) event.preventDefault();
    // The hero snaps onto the venue as you arrive. Keep that jump, then
    // continue from it instead of pulling the page back to the finger's start.
    if (dy > 0 && window.scrollY > gesture.scroll + dy + 2) {
      gesture.scroll = window.scrollY - dy;
    }
    window.scrollTo(0, gesture.scroll + dy);
  };

  const onTouchEnd = (event) => {
    if (!gesture) return;
    const ended = [...event.changedTouches].some((entry) => entry.identifier === gesture.id);
    if (!ended) return;
    const speed = gesture.v;
    const owned = gesture.owned;
    gesture = null;
    if (!owned || event.type === "touchcancel") return;
    if (Math.abs(speed) < 0.05) return;
    if ((scratchReady && !revealed) || (revealed && !mayLeave)) return;

    let velocity = Math.max(-64, Math.min(64, speed * 16));
    const step = () => {
      velocity *= 0.94;
      if (Math.abs(velocity) < 0.45) {
        flingFrame = 0;
        return;
      }
      if ((scratchReady && !revealed && velocity > 0) || (revealed && !mayLeave)) {
        flingFrame = 0;
        return;
      }
      window.scrollBy(0, velocity);
      flingFrame = requestAnimationFrame(step);
    };
    flingFrame = requestAnimationFrame(step);
  };

  const listenOn = iosTouch ? window : section;
  const capture = iosTouch;
  listenOn.addEventListener("touchstart", onTouchStart, { passive: true, capture });
  listenOn.addEventListener("touchmove", onTouchMove, { passive: false, capture });
  listenOn.addEventListener("touchend", onTouchEnd, { passive: true, capture });
  listenOn.addEventListener("touchcancel", onTouchEnd, { passive: true, capture });

  return {
    setProgress,
    arrive() {
      setProgress(1);
    },
    leave() {
      setProgress(0);
    },
  };
}
