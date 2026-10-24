const jobs = new Set();
let listening = false;
let scheduled = false;
let following = false;
let lastY = null;
let stillFrames = 0;

// Keep painting for a few frames after the last scroll event. Phones emit
// those events in bursts during a flick, which otherwise steps the scenes.
const STILL_FRAMES = 8;

function pump() {
  scheduled = false;
  for (const job of jobs) {
    try {
      job();
    } catch (error) {
      console.error(error);
    }
  }

  if (!following) return;
  const y = window.scrollY;
  if (lastY !== null && Math.abs(y - lastY) < 1) stillFrames += 1;
  else stillFrames = 0;
  lastY = y;
  if (stillFrames >= STILL_FRAMES) {
    following = false;
    return;
  }
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(pump);
}

function wake() {
  following = true;
  stillFrames = 0;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(pump);
}

export function onScrollFrame(job) {
  if (!listening) {
    listening = true;
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
  }
  jobs.add(job);
  wake();
  return () => jobs.delete(job);
}
