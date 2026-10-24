// Fetch a later section's images once it is within a few screens, so the
// invite does not download the whole wedding and the scene is ready when
// the guest arrives.
export function preloadWhenNear(section, margin = "250% 0px") {
  if (!section) return;
  const urls = [...section.querySelectorAll("img[src]")]
    .map((img) => img.getAttribute("src"))
    .filter(Boolean);
  if (urls.length === 0) return;

  const run = () => {
    for (const url of urls) {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    }
  };

  if (!("IntersectionObserver" in window)) {
    run();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      run();
    },
    { rootMargin: margin },
  );
  observer.observe(section);
}
