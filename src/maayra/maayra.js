import { onScrollFrame } from "../lib/scroll.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

const CARD = { w: 408, h: 654 };
// Share of the card image that is the yellow panel, not the clear margin.
const YELLOW_FILL = 0.754;

function sizeCard(section) {
  const vw = section.clientWidth;
  const vh = section.clientHeight || window.innerHeight;
  const aspect = CARD.h / CARD.w;
  const widthLocked = vw * aspect;
  // A short or wide window keeps the card inside the viewport.
  // A narrow, tall window grows it so the yellow stays about 70% of the screen
  // and the bandhani border shrinks instead of filling the extra height.
  let height = Math.min(vh * 0.92, widthLocked);
  if (widthLocked < vh * 0.98) {
    const fraction = (YELLOW_FILL * vw * widthLocked) / (vw * vh);
    const scale = Math.max(1, Math.sqrt(0.7 / Math.max(fraction, 0.05)));
    height = widthLocked * scale;
  }
  section.style.setProperty("--yellow-h", `${Math.round(height)}px`);
}

export function initMaayra(section, sangeet) {
  if (!section) return;

  sizeCard(section);
  window.addEventListener("resize", () => sizeCard(section));

  if (reducedMotion || !sangeet) {
    section.classList.add("is-revealed");
    section.style.setProperty("--roll", "1");
    section.style.setProperty("--title", "1");
    return;
  }

  let settled = false;
  let sangeetTop = 0;
  let rollSpan = 1;
  let sectionTop = 0;

  const measure = () => {
    const stage = sangeet.querySelector(".sangeet__stage") || sangeet;
    sangeetTop = sangeet.offsetTop;
    rollSpan = Math.max(sangeet.offsetHeight - stage.offsetHeight, window.innerHeight * 0.9);
    sectionTop = section.offsetTop;
  };

  let painted = "";
  const apply = () => {
    // The hero and the venue change height after this section is created.
    // Read the live position every frame so the roll matches what is on screen.
    measure();
    const top = sangeetTop - window.scrollY;
    const raw = top >= 0 ? 0 : clamp01(-top / rollSpan);
    const pinned = sectionTop - window.scrollY <= 2;
    const roll = pinned ? 1 : easeInOut(raw);
    const title = pinned || raw >= 0.14 ? 1 : 0;
    const down = roll >= 0.985;
    const covering = (raw > 0.004 || down) && !pinned;

    if (down && !pinned && !settled) {
      settled = true;
      window.scrollTo(0, section.offsetTop);
    }
    if (raw < 0.8) settled = false;

    const rollValue = (covering && !pinned ? roll : pinned ? 1 : roll).toFixed(4);
    const titleValue = title.toFixed(4);
    const rolling = covering && !down;
    const draped = covering && down;
    const revealed = title > 0.04 || pinned || down;
    const signature = `${rollValue}|${titleValue}|${rolling}|${draped}|${revealed}`;
    if (signature === painted) return;
    painted = signature;

    section.style.setProperty("--roll", rollValue);
    section.style.setProperty("--title", titleValue);
    section.classList.toggle("is-rolling", rolling);
    section.classList.toggle("is-draped", draped);
    section.classList.toggle("is-revealed", revealed);
  };

  new ResizeObserver(() => {
    measure();
    apply();
  }).observe(sangeet);
  onScrollFrame(apply);
}
