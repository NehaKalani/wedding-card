import { applyHindi, isHindi } from "./hindi.js";

const params = new URLSearchParams(window.location.search);

export const language = isHindi ? "hi" : "en";
export const recipientFamily = params.get("f") === "r" ? "r" : "";

const MAURYA_BLESSINGS = [
  "Smt. Shanti Devi",
  "Sri Mata Badal Maurya",
  "Smt. Santosh Kumari Maurya",
];

function applyMauryaHero() {
  const names = document.querySelector(".hero__intro-names");
  const family = document.querySelector(".hero__intro-family");
  if (!names || !family) return;

  names.replaceChildren(
    ...MAURYA_BLESSINGS.map((line) => {
      const span = document.createElement("span");
      span.textContent = line;
      return span;
    }),
  );
  family.textContent = "and the entire Maurya family";
}

function applyRahulWedsNidhi() {
  const title = document.querySelector("#hero-title");
  if (!title) return;

  const nidhi = title.querySelector('[data-row="nidhi"]');
  const rahul = title.querySelector('[data-row="rahul"]');
  const weds = title.querySelector(".weds");
  if (!nidhi || !rahul || !weds) return;

  title.replaceChildren(rahul, weds, nidhi);
  title.setAttribute("aria-label", "Rahul weds Nidhi");
  document.title = "Rahul weds Nidhi";

  for (const el of document.querySelectorAll(
    'meta[property="og:title"], meta[name="twitter:title"]',
  )) {
    el.setAttribute("content", "Rahul weds Nidhi");
  }

  const ogAlt = document.querySelector('meta[property="og:image:alt"]');
  if (ogAlt) {
    ogAlt.setAttribute("content", "Rahul weds Nidhi, lettered in moss and flowers");
  }
}

function showMauryaRegardsFirst() {
  const first = document.querySelector(".regards__sheet--first .regards__stage");
  const more = document.querySelector(".regards__sheet--more .regards__stage");
  if (!first?.parentElement || !more?.parentElement) return;

  const firstSheet = first.parentElement;
  const moreSheet = more.parentElement;
  firstSheet.appendChild(more);
  moreSheet.appendChild(first);
}

export function applyInvite() {
  document.documentElement.dataset.lang = language;
  if (language === "hi") document.documentElement.lang = "hi";
  if (recipientFamily) document.documentElement.dataset.family = recipientFamily;
  if (recipientFamily === "r") {
    applyMauryaHero();
    applyRahulWedsNidhi();
    showMauryaRegardsFirst();
  }
  if (language === "hi") applyHindi(document.body);
}
