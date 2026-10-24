import { onScrollFrame } from "../lib/scroll.js";
import { appHeight } from "../lib/viewport.js";

const ART = { w: 941, h: 1672 };
// First slice unrolls the scroll. The rest is a long dusk.
const SUNSET_SPAN = 0.2;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function span(t, start, end) {
  return smoothstep((t - start) / (end - start));
}

export function initSunset(section) {
  if (!section) return;
  const stage = section.querySelector(".sunset__stage");
  const art = section.querySelector(".sunset__art");
  const dayRite = section.querySelector(".sunset__rite--day");
  const nightRite = section.querySelector(".sunset__rite--night");

  const layout = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const cover = Math.max(w / ART.w, h / ART.h);
    const contain = Math.min(w / ART.w, h / ART.h);
    // Phones fill the screen. A short wide window keeps the whole courtyard in view.
    const scale = h / w < 1.15 ? contain : cover;
    const x = (w - ART.w * scale) / 2;
    const y = (h - ART.h * scale) / 2;
    art.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    // Ropes meet the viewport top. Pots meet the left edge of the courtyard.
    art.style.setProperty("--hang", `${(-y / scale).toFixed(2)}px`);
    art.style.setProperty("--edge", `${Math.max(0, -x / scale).toFixed(2)}px`);
  };

  layout();
  new ResizeObserver(layout).observe(stage);

  if (reducedMotion) {
    section.style.setProperty("--golden", "1");
    section.style.setProperty("--unroll", "1");
    section.style.setProperty("--sky", "0");
    section.style.setProperty("--lights", "0");
    section.style.setProperty("--ground", "0");
    section.style.setProperty("--veil", "0");
    section.style.setProperty("--rite", "0");
    nightRite?.removeAttribute("aria-hidden");
    return;
  }

  let anchor = 0;
  let extra = 1;
  const measure = () => {
    anchor = section.offsetTop;
    extra = Math.max(section.offsetHeight - stage.offsetHeight, 1);
  };

  let painted = "";
  const apply = () => {
    // Sections above this one shrink after load. A saved offset leaves the
    // courtyard on its first frame for the whole sticky scroll.
    measure();
    const top = anchor - window.scrollY;
    const golden = clamp01(1 - top / appHeight());
    const travel = clamp01(-top / extra);
    // Unroll only while the courtyard is still sunset. Night keeps it open.
    const unroll = easeOutCubic(clamp01(travel / SUNSET_SPAN));
    const dusk = clamp01((travel - SUNSET_SPAN) / (1 - SUNSET_SPAN));
    // Sky cools first. Lamps and windows catch in the blue hour.
    // The people settle into night light only at the end, so they don't
    // sit as a long double image while the sky is still changing.
    const sky = span(dusk, 0, 0.82);
    const lights = span(dusk, 0.34, 0.86);
    const ground = span(dusk, 0.7, 0.94);
    const veil = dusk < 0.62 ? smoothstep(dusk / 0.62) : 1 - smoothstep((dusk - 0.62) / 0.38);
    // Sundowner stays through golden hour. It leaves, then the wedding
    // rites arrive, as the sunset sky gives way to night.
    const rite = span(dusk, 0.52, 0.68);

    const next = [golden, unroll, sky, lights, ground, veil, rite].map((value) => value.toFixed(4)).join("|");
    if (next === painted) return;
    painted = next;

    section.style.setProperty("--golden", golden.toFixed(4));
    section.style.setProperty("--unroll", unroll.toFixed(4));
    section.style.setProperty("--sky", sky.toFixed(4));
    section.style.setProperty("--lights", lights.toFixed(4));
    section.style.setProperty("--ground", ground.toFixed(4));
    section.style.setProperty("--veil", veil.toFixed(4));
    section.style.setProperty("--rite", rite.toFixed(4));

    const nightOn = rite >= 0.5;
    dayRite?.setAttribute("aria-hidden", nightOn ? "true" : "false");
    nightRite?.setAttribute("aria-hidden", nightOn ? "false" : "true");
  };

  new ResizeObserver(apply).observe(section);
  onScrollFrame(apply);
}
