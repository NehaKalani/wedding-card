export function initGanesha(section, music) {
  const root = document.documentElement;
  if (!section) {
    root.classList.remove("is-ganesha-held");
    return;
  }

  const invite = section.querySelector(".ganesha__invite");
  const hero = document.querySelector(".hero");
  let held = true;

  root.classList.add("is-ganesha-held");
  section.classList.add("is-inviting");
  if (invite) {
    invite.inert = false;
    invite.removeAttribute("aria-hidden");
  }

  const keepStill = () => {
    if (held && window.scrollY !== 0) window.scrollTo(0, 0);
  };

  const blockGesture = (event) => {
    if (!held) return;
    event.preventDefault();
  };

  const blockKeys = (event) => {
    if (!held) return;
    if (invite && event.target instanceof Node && invite.contains(event.target)) return;
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
      event.preventDefault();
    }
  };

  keepStill();
  window.addEventListener("scroll", keepStill, { passive: true });
  window.addEventListener("wheel", blockGesture, { passive: false });
  window.addEventListener("touchmove", blockGesture, { passive: false });
  window.addEventListener("keydown", blockKeys);

  const release = () => {
    window.removeEventListener("scroll", keepStill);
    window.removeEventListener("wheel", blockGesture);
    window.removeEventListener("touchmove", blockGesture);
    window.removeEventListener("keydown", blockKeys);
  };

  const open = () => {
    if (!held) return;
    held = false;
    release();
    root.classList.remove("is-ganesha-held");
    section.classList.add("is-opened");
    section.classList.remove("is-inviting");
    if (invite) {
      invite.inert = true;
      invite.setAttribute("aria-hidden", "true");
    }
    music?.invite();
    const top = hero ? hero.offsetTop : section.offsetTop + section.offsetHeight;
    window.scrollTo(0, top);
  };

  invite?.addEventListener("click", open);
}
