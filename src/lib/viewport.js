let height = window.innerHeight;
let width = window.innerWidth;

function apply(next) {
  height = next;
  document.documentElement.style.setProperty("--app-h", `${Math.round(next)}px`);
}

// The iPhone toolbar changes the visible height while you scroll. Following
// that change resizes every sticky scene mid-gesture, which reads as shake.
// Keep the height still, and only pick up a real resize or a rotation.
function onResize() {
  const nextWidth = window.innerWidth;
  const nextHeight = window.innerHeight;
  const widthChanged = Math.abs(nextWidth - width) > 40;
  const heightJump = Math.abs(nextHeight - height) > 140;
  if (!widthChanged && !heightJump) return;
  width = nextWidth;
  apply(nextHeight);
}

export function appHeight() {
  return height;
}

export function lockViewport() {
  apply(window.innerHeight);
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => {
    window.setTimeout(onResize, 280);
  });
}
