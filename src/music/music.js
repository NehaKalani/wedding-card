import { t } from "../lib/hindi.js";

const VOLUME = 0.8;

export function initMusic(ganesha, button, ganeshaAudio, heroAudio) {
  if (!button || !ganeshaAudio || !heroAudio) return { start() {}, invite() {} };

  let userMuted = false;
  let opened = false;
  let onHero = false;
  let active = ganeshaAudio;

  for (const el of [ganeshaAudio, heroAudio]) {
    el.loop = true;
    el.preload = "none";
    el.muted = false;
    el.defaultMuted = false;
    el.volume = VOLUME;
    el.playsInline = true;
  }

  const rewind = (el) => {
    try {
      el.currentTime = 0;
    } catch {
      /* ignore */
    }
  };

  const reveal = () => {
    button.classList.add("is-live");
    button.removeAttribute("aria-hidden");
  };

  const sync = () => {
    button.classList.toggle("is-muted", userMuted);
    button.classList.toggle("is-waiting", opened && active.paused);
    button.setAttribute("aria-pressed", userMuted ? "true" : "false");
    button.setAttribute("aria-label", t(userMuted ? "Unmute music" : "Mute music"));
  };

  const invite = () => {
    opened = true;
    onHero = true;
    userMuted = false;
    active = heroAudio;
    reveal();
    ganeshaAudio.pause();
    rewind(heroAudio);
    heroAudio.muted = false;
    heroAudio.volume = VOLUME;
    heroAudio.play().then(sync).catch(sync);
    sync();
  };

  const startHero = () => {
    if (!opened || userMuted || onHero) return;
    invite();
  };

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!opened) return;
    if (active.paused || userMuted) {
      userMuted = false;
      active.muted = false;
      active.volume = VOLUME;
      active.play().then(sync).catch(sync);
      sync();
      return;
    }
    userMuted = true;
    active.muted = true;
    active.volume = 0;
    sync();
  });

  window.addEventListener("pageshow", () => {
    userMuted = false;
    sync();
  });

  sync();
  return { start: startHero, invite };
}
