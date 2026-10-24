const BLOOM_EASE = "cubic-bezier(0.22, 0.8, 0.25, 1)";
const BUD_MIN_AREA = 600;

function pct(value, total) {
  return `${(value / total) * 100}%`;
}

function seeded(index) {
  const x = Math.sin(index * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Lays out flower sprites over a name row. Call `play(bloomDelayMs)` to start,
 * where bloomDelayMs(flower) returns when that flower should open. Flowers
 * then keep a gentle directional breeze; `gust(dir)` is the heavy storm.
 */
export function createFlowers(container, manifest, basePath) {
  const { width, height } = manifest;
  const gusts = [];
  const layer = document.createElement("span");
  layer.className = "flowers";
  container.append(layer);

  const items = manifest.flowers.map((flower, index) => {
    const wrap = document.createElement("span");
    wrap.className = "flower";
    Object.assign(wrap.style, {
      left: pct(flower.x, width),
      top: pct(flower.y, height),
      width: pct(flower.w, width),
      height: pct(flower.h, height),
      transformOrigin: "50% 100%",
    });

    const img = document.createElement("img");
    img.src = `${basePath}/${flower.file}`;
    img.alt = "";
    img.decoding = "async";
    img.style.transformOrigin = `${pct(flower.cx - flower.x, flower.w)} ${pct(flower.cy - flower.y, flower.h)}`;
    wrap.append(img);
    layer.append(wrap);

    let bud = null;
    if (flower.area >= BUD_MIN_AREA && flower.kind !== "white") {
      const size = Math.min(Math.max(Math.sqrt(flower.area) * 0.32, 14), 34);
      bud = document.createElement("span");
      bud.className = `bud bud--${flower.kind}`;
      Object.assign(bud.style, {
        left: pct(flower.cx - size * 0.35, width),
        top: pct(flower.cy - size * 0.5, height),
        width: pct(size * 0.7, width),
        height: pct(size, height),
        rotate: `${(seeded(index) - 0.5) * 50}deg`,
      });
      layer.append(bud);
    }

    return { flower, index, wrap, img, bud };
  });

  const images = items.map(({ img }) =>
    img.complete ? Promise.resolve() : new Promise((resolve) => {
      img.onload = img.onerror = resolve;
    }),
  );

  return {
    ready: Promise.all(images),

    play(bloomDelayMs) {
      for (const { flower, index, wrap, img, bud } of items) {
        const delay = bloomDelayMs(flower);
        const spin = (seeded(index + 7) - 0.5) * 70;
        let bloomStart = delay;

        if (bud) {
          bud.animate(
            [
              { opacity: 0, transform: "scale(0)" },
              { opacity: 1, transform: "scale(1.1)", offset: 0.35 },
              { opacity: 1, transform: "scale(1)", offset: 0.6 },
              { opacity: 1, transform: "scale(1.15, 0.95)", offset: 0.82 },
              { opacity: 0, transform: "scale(1.6)" },
            ],
            { duration: 1500, delay, easing: "ease-out", fill: "forwards" },
          );
          bloomStart = delay + 1050;
        }

        const large = flower.area >= BUD_MIN_AREA;
        const bloomDuration = large ? 1600 : 700;
        img.animate(
          large
            ? [
                { opacity: 0, transform: `scale(0.12) rotate(${spin}deg)`, filter: "blur(3px) saturate(0.6)" },
                { opacity: 1, offset: 0.3 },
                { transform: "scale(1.05) rotate(-3deg)", filter: "blur(0) saturate(1)", offset: 0.75 },
                { opacity: 1, transform: "scale(1) rotate(0deg)", filter: "blur(0) saturate(1)" },
              ]
            : [
                { opacity: 0, transform: "scale(0.3)" },
                { opacity: 1, transform: "scale(1.12)", offset: 0.6 },
                { opacity: 1, transform: "scale(1)" },
              ],
          { duration: bloomDuration, delay: bloomStart, easing: BLOOM_EASE, fill: "forwards" },
        );

        const rest = large ? 6.2 : 10;
        const flutter = large ? 5.4 : 8.6;
        const drift = large ? 5.5 : 9;
        const along = flower.x / width;
        wrap.animate(
          [
            { transform: `rotate(${rest}deg) translateX(${drift}%)` },
            { transform: `rotate(${rest + flutter}deg) translateX(${drift + 3.2}%)` },
            { transform: `rotate(${rest - flutter * 0.55}deg) translateX(${drift - 1.4}%)` },
            { transform: `rotate(${rest}deg) translateX(${drift}%)` },
          ],
          {
            duration: 4200 + seeded(index + 3) * 2400,
            delay: bloomStart + bloomDuration + along * 380,
            iterations: Infinity,
            easing: "ease-in-out",
          },
        );
      }
    },

    gust(direction = 1) {
      const dir = direction < 0 ? -1 : 1;
      for (const anim of gusts) anim.cancel();
      gusts.length = 0;

      for (const { flower, index, wrap } of items) {
        const large = flower.area >= BUD_MIN_AREA;
        const along = dir > 0 ? flower.x / width : 1 - flower.x / width;
        const whip = large ? 0.1 : 0.2;
        const lean = (48 + seeded(index + 11) * 24) * whip;
        const drift = (32 + seeded(index + 19) * 28) * whip;

        gusts.push(
          wrap.animate(
            [
              { transform: "rotate(0deg) translate(0, 0) scale(1, 1)" },
              {
                transform: `rotate(${dir * lean}deg) translate(${dir * drift}%, -12%) scale(1.08, 0.82)`,
                offset: 0.09,
              },
              {
                transform: `rotate(${dir * -lean * 0.55}deg) translate(${dir * -drift * 0.35}%, 4%) scale(0.96, 1.08)`,
                offset: 0.24,
              },
              {
                transform: `rotate(${dir * lean * 0.88}deg) translate(${dir * drift * 0.72}%, -8%) scale(1.06, 0.86)`,
                offset: 0.42,
              },
              {
                transform: `rotate(${dir * -lean * 0.32}deg) translate(${dir * -drift * 0.18}%, 2%) scale(0.98, 1.04)`,
                offset: 0.6,
              },
              {
                transform: `rotate(${dir * lean * 0.38}deg) translate(${dir * drift * 0.26}%, -3%) scale(1.02, 0.94)`,
                offset: 0.76,
              },
              { transform: "rotate(0deg) translate(0, 0) scale(1, 1)" },
            ],
            {
              duration: 1450 + seeded(index + 23) * 450,
              delay: along * 220 + seeded(index + 5) * 70,
              easing: "cubic-bezier(0.16, 0.72, 0.18, 1)",
              composite: "add",
            },
          ),
        );
      }
    },
  };
}
