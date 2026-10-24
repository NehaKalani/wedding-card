import { onScrollFrame } from "../lib/scroll.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FADE_MS = 1100;

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

export function initRegards(section) {
  if (!section || reducedMotion) return;
  const pin = section.querySelector(".regards__pin");
  const sheets = [
    section.querySelector(".regards__sheet--first"),
    section.querySelector(".regards__sheet--more"),
    section.querySelector(".regards__sheet--close"),
  ];
  if (!pin || sheets.some((sheet) => !sheet)) return;

  let step = 0;
  let timer = 0;
  let lastY = null;
  let up = 0;
  let down = 0;
  let releaseAt = 0;
  let floorY = 0;

  const go = (nextStep, travel, top, extra, backward) => {
    step = nextStep;
    up = 0;
    down = 0;
    section.dataset.step = String(step);
    window.clearTimeout(timer);
    sheets.forEach((sheet, index) => {
      if (index !== step) sheet.setAttribute("aria-hidden", "true");
    });
    timer = window.setTimeout(() => sheets[step].removeAttribute("aria-hidden"), 520);
    releaseAt = performance.now() + FADE_MS;
    const hold = step === 0 ? 0.22 : 0.5;
    floorY = backward ? top + extra * Math.min(Math.max(travel, 0.02), hold) : 0;
  };

  const apply = () => {
    const extra = Math.max(section.offsetHeight - pin.offsetHeight, 1);
    const top = section.offsetTop;
    const y = window.scrollY;
    const travel = clamp01(-(top - y) / extra);
    const delta = lastY === null ? 0 : y - lastY;
    const holding = performance.now() < releaseAt;

    if (holding && floorY > 0 && y < floorY) {
      window.scrollTo(0, floorY);
    } else if (holding || Math.abs(delta) < 0.5) {
      up = 0;
      down = 0;
    } else if (delta > 0) {
      down += delta;
      up = 0;
      if (step < 2 && down > 28 && travel > 0.08) go(step + 1, travel, top, extra, false);
    } else if (step > 0) {
      up += -delta;
      down = 0;
      if (up > 28) {
        go(step - 1, travel, top, extra, true);
        if (window.scrollY < floorY) window.scrollTo(0, floorY);
      }
    }

    lastY = window.scrollY;
  };

  new ResizeObserver(apply).observe(section);
  onScrollFrame(apply);
}
