"""
Cut the Sunehri Haldi painting into the layers the section animates.

The SVGs in assets-src/haldi are rough crops of ORIGINAL_sunehri_haldi.png (1024x1536),
so everything is cut from the original instead. Its painted sky is dropped: the section
draws a live sky with drifting clouds behind all of this.

To fill tall phone screens the painting is split horizontally. The frame hanging from the
top edge stays put, the garden and couple stay on the bottom edge, and the gap between
them is open sky - except on the left pillar, where a slice of the pillar (BAND) is
stretched and the garland strands crossing it are repeated with a seamless tile.

Writes into public/haldi/:
  top.webp, band.webp, bottom.webp   static frame and scene, sky removed
  lettering.webp                     the Sunehri Haldi title
  sway-*.webp                        garland strands / vine sprays that swing in the wind
  petal-*.webp                       sprites for the falling petals
  layout.json                        boxes in painting space

Usage: python tools/build_haldi_layers.py assets-src/haldi public/haldi
"""

import base64
import io
import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

LEFT_X = 232       # the left pillar and its strands live in x < LEFT_X
TOP_CUT = 300      # elsewhere, rows above this hang from the top edge
BAND = (326, 376)  # rows of the left pillar that stretch on tall screens

LETTERING = {"lettering_sunehri": (273, 123), "lettering_haldi": (412, 293)}

# Pieces that swing. box is (x0, y0, x1, y1); origin is the pivot; ramp fades the piece
# into the static frame near its root so the joint never shows.
SWAY = {
    "strand-pillar": {
        "kind": "marigold", "box": (60, 150, 128, 700), "extra": [(84, 686, 117, 752)],
        "origin": (96, 164), "ramp": ("y", 164, 196),
    },
    "strand-pair": {
        "kind": "marigold", "box": (158, 236, 268, 566), "extra": [(165, 556, 199, 604)],
        "origin": (222, 243), "ramp": ("y", 243, 272),
    },
    "strand-sky": {"kind": "scene", "box": (270, 0, 334, 284), "origin": (302, 0), "ramp": ("y", 0, 18)},
    "vine-left": {"kind": "scene", "box": (426, 0, 600, 104), "origin": (430, 12), "ramp": ("x", 430, 462)},
    "vine-right": {"kind": "scene", "box": (780, 0, 906, 116), "origin": (856, 0), "ramp": ("y", 0, 26)},
}

# Flowers taken out of the painting (the brief asks for a few less than the original).
# Only sky-backed ones, so they disappear cleanly.
REMOVE_FROM_SKY = [
    (352, 128, 394, 172),   # pink bloom hanging from the top-left canopy
    (476, 60, 518, 98),     # bloom on the top branch
    (786, 56, 846, 108),    # pink cluster on the top-right vines
    (854, 70, 880, 102),    # bud on the top-right vines
]
LETTERING_EXTRA = [(690, 186, 800, 302)]  # flower burst on the matra, outside the kit's crops


def load_svg_png(path):
    data = re.search(r'base64,([^"]+)', path.read_text()).group(1)
    return np.array(Image.open(io.BytesIO(base64.b64decode(data))).convert("RGBA"))


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def box_mask(shape, box):
    m = np.zeros(shape, bool)
    x0, y0, x1, y1 = box
    m[y0:y1, x0:x1] = True
    return m


def sky_mask(image):
    """True where the painting shows sky (blue or cloud)."""
    h, w = image.shape[:2]
    hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV).astype(int)
    s, v = hsv[..., 1], hsv[..., 2]
    r, b = image[..., 0].astype(int), image[..., 2].astype(int)
    yy, xx = np.mgrid[0:h, 0:w]

    mask = np.full((h, w), cv2.GC_PR_FGD, np.uint8)
    sky_area = (xx > 230) & (xx < 960) & (yy < 640)
    mask[sky_area] = cv2.GC_PR_BGD
    mask[sky_area & (b - r > 12)] = cv2.GC_BGD
    mask[(s > 127) & (v > 100)] = cv2.GC_FGD
    mask[(xx < 150) | (yy > 720)] = cv2.GC_FGD
    pavilion = np.zeros((h, w), np.uint8)
    cv2.fillPoly(pavilion, [np.array([(1024, 330), (968, 372), (936, 430), (924, 476), (1024, 476)])], 1)
    cv2.fillPoly(pavilion, [np.array([(836, 548), (1024, 548), (1024, 720), (906, 720), (906, 576), (836, 568)])], 1)
    mask[pavilion > 0] = cv2.GC_FGD
    mask[box_mask((h, w), (780, 570, 904, 690)) & (mask != cv2.GC_FGD)] = cv2.GC_PR_BGD  # haze under the roof

    rows = 800
    sub = mask[:rows].copy()
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(image[:rows, :, ::-1].copy(), sub, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    sky = np.zeros((h, w), bool)
    sky[:rows] = (sub == cv2.GC_BGD) | (sub == cv2.GC_PR_BGD)
    sky = cv2.morphologyEx(sky.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
    return sky


def lettering_mask(src, shape, scene):
    region = np.zeros(shape, np.uint8)
    for name, (x, y) in LETTERING.items():
        crop = load_svg_png(src / f"{name}.svg")
        ch, cw = crop.shape[:2]
        region[y:y + ch, x:x + cw] |= (crop[..., 3] > 128).astype(np.uint8)
    for x0, y0, x1, y1 in LETTERING_EXTRA:
        region[y0:y1, x0:x1] = 1
    region = cv2.dilate(region, np.ones((13, 13), np.uint8)) > 0
    region &= ~box_mask(shape, (262, 0, 336, 282))   # the strand hanging beside it
    region &= ~box_mask(shape, (786, 524, 1024, 800))  # the pavilion roof below it
    return region & scene


def sky_debris(scene, shape):
    """Petals and splashes floating in the sky (the section animates its own)."""
    area = box_mask(shape, (230, 0, 960, 640))
    labels, n = ndimage.label(scene & area)
    sizes = ndimage.sum(np.ones(shape), labels, range(1, n + 1))
    border = np.zeros(n + 1, bool)
    edge = np.zeros(shape, bool)
    edge[0, 230:960] = edge[639, 230:960] = True
    edge[:640, 230] = edge[:640, 959] = True
    border[np.unique(labels[edge])] = True
    debris = np.zeros(n + 1, bool)
    debris[1:] = (sizes < 3000) & ~border[1:]
    return debris[labels]


def soft(mask, sigma=0.8):
    return np.clip(cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma), 0, 1)


def marigold_mask(image, box, extra):
    hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV).astype(int)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    mari = (s > 222) & (h >= 9) & (h <= 26) & (v > 140)
    closed = cv2.morphologyEx(mari.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))) > 0
    inside = opened & box_mask(mari.shape, box)
    labels, n = ndimage.label(inside)
    sizes = ndimage.sum(inside, labels, range(1, n + 1))
    strand = labels == (np.argmax(sizes) + 1)
    # Bells and tassels: gold or shaded pixels that stand out from the cream pillar.
    for ebox in extra:
        region = box_mask(mari.shape, ebox)
        strand |= region & ((s > 170) | (v < 195))
    strand = cv2.morphologyEx(strand.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return ndimage.binary_fill_holes(strand)


def ramp(shape, spec):
    axis, a, b = spec
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float32)
    return smoothstep(a, b, yy if axis == "y" else xx)


def seamless_tile(rgba, y0, y1, overlap=12):
    """Rows [y0, y1) made to repeat: the last rows ease into the rows just above y0."""
    tile = rgba[y0:y1].astype(np.float32).copy()
    above = rgba[y0 - overlap:y0].astype(np.float32)
    t = smoothstep(0, 1, np.linspace(0, 1, overlap))[:, None, None]
    tile[-overlap:] = tile[-overlap:] * (1 - t) + above * t
    return tile.clip(0, 255).astype(np.uint8)


def save(rgba, path, box=None):
    """Save rgba (cropped to box or to its visible pixels) and return the box."""
    if box is None:
        ys, xs = np.nonzero(rgba[..., 3] > 3)
        box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    x0, y0, x1, y1 = box
    Image.fromarray(rgba[y0:y1, x0:x1]).save(path, quality=90, method=6)
    return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}


def rgba(image, alpha):
    return np.dstack([image, (np.clip(alpha, 0, 1) * 255).astype(np.uint8)])


def build_petals(image, debris, out):
    """Sprites from the pink petals painted floating in the sky, plus marigold-gold twins."""
    hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV).astype(int)
    pink = ((hsv[..., 0] < 10) | (hsv[..., 0] > 160)) & (hsv[..., 1] > 60)
    labels, n = ndimage.label(debris)
    sprites = []
    for i, found in enumerate(ndimage.find_objects(labels)):
        petal = (labels[found] == i + 1)
        if petal.sum() < 120 or (pink[found] & petal).mean() / petal.mean() < 0.6:
            continue
        pad = (slice(found[0].start - 2, found[0].stop + 2), slice(found[1].start - 2, found[1].stop + 2))
        alpha = soft(np.pad(petal, 2), 0.7)
        crop = image[pad]
        k = len(sprites) // 2 + 1
        sprites.append({"src": f"petal-{k}.webp", **save(rgba(crop, alpha), out / f"petal-{k}.webp")})

        gold = hsv[pad].copy()
        gold[..., 0] = np.clip(15 + (gold[..., 2] - 200) // 14, 11, 22)
        gold[..., 1] = np.clip(gold[..., 1] * 1.15 + 50, 0, 255)
        rgb = cv2.cvtColor(np.ascontiguousarray(gold.clip(0, 255).astype(np.uint8)), cv2.COLOR_HSV2RGB)
        sprites.append({"src": f"petal-gold-{k}.webp", **save(rgba(rgb, alpha), out / f"petal-gold-{k}.webp")})
    for sprite in sprites:
        del sprite["x"], sprite["y"]
    return sprites


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.webp"):
        old.unlink()

    image = np.array(Image.open(src / "ORIGINAL_sunehri_haldi.png").convert("RGB"))
    shape = image.shape[:2]
    h, w = shape

    scene = ~sky_mask(image)
    lettering = lettering_mask(src, shape, scene)
    scene &= ~lettering
    for box in REMOVE_FROM_SKY:
        scene &= ~box_mask(shape, box)
    debris = sky_debris(scene, shape)
    scene &= ~debris

    sway_layout = []
    hole = np.zeros(shape, bool)        # static pixels to inpaint (strand on a painted backdrop)
    cleared = np.zeros(shape, bool)     # static pixels to clear (strand on the sky)
    sway_pieces = {}
    for name, spec in SWAY.items():
        if spec["kind"] == "marigold":
            mask = marigold_mask(image, spec["box"], spec.get("extra", []))
        else:
            mask = scene & box_mask(shape, spec["box"])
        mask = cv2.dilate(mask.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        fade = ramp(shape, spec["ramp"])
        alpha = soft(mask, 1.0) * fade
        full = (fade > 0.999) & (cv2.dilate(mask.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0)
        if spec["kind"] == "marigold":
            hole |= full
        else:
            cleared |= full & mask
        sway_pieces[name] = (alpha, spec)

    static = cv2.inpaint(image, hole.astype(np.uint8), 7, cv2.INPAINT_TELEA)
    for name, (alpha, spec) in sway_pieces.items():
        piece = rgba(image, alpha)
        ys, xs = np.nonzero(alpha > 0.01)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        entry = {"name": name, "x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0, "origin": list(spec["origin"])}
        if y0 < BAND[0] and y1 > BAND[1] and x0 < LEFT_X:
            # Crosses the stretching band: top part, a repeating tile, then the rest.
            save(piece, out / f"sway-{name}-top.webp", (x0, y0, x1, BAND[0]))
            Image.fromarray(seamless_tile(piece, *BAND)[:, x0:x1]).save(out / f"sway-{name}-tile.webp", quality=90, method=6)
            save(piece, out / f"sway-{name}-bottom.webp", (x0, BAND[0], x1, y1))
            entry["split"] = True
        else:
            save(piece, out / f"sway-{name}.webp", (x0, y0, x1, y1))
        sway_layout.append(entry)

    scene_alpha = soft(scene & ~cleared)
    yy, xx = np.mgrid[0:h, 0:w]
    left = xx < LEFT_X
    is_top = np.where(left, yy < BAND[0], yy < TOP_CUT)
    is_bottom = np.where(left, yy >= BAND[1], yy >= TOP_CUT)
    full = rgba(static, scene_alpha)

    top = full.copy()
    top[~is_top, 3] = 0
    bottom = full.copy()
    bottom[~is_bottom, 3] = 0

    # The band leaves its first row for a per-column median of the slice and returns to
    # its last row, so stretched it reads as a longer pillar rather than smeared detail.
    rows = full[BAND[0]:BAND[1], :LEFT_X].astype(np.float32)
    middle = np.median(rows, axis=0)
    t = np.linspace(0, 1, BAND[1] - BAND[0])[:, None, None]
    w0, w1 = smoothstep(0.2, 0, t), smoothstep(0.8, 1, t)
    band = (rows[0] * w0 + rows[-1] * w1 + middle * (1 - w0 - w1)).astype(np.uint8)
    Image.fromarray(band).save(out / "band.webp", quality=90, method=6)

    letter_rgba = rgba(image, soft(lettering))

    layout = {
        "painting": {"w": w, "h": h},
        "leftX": LEFT_X,
        "topCut": TOP_CUT,
        "band": {"y0": BAND[0], "y1": BAND[1], "w": LEFT_X},
        "top": save(top, out / "top.webp", (0, 0, w, BAND[0])),
        "bottom": save(bottom, out / "bottom.webp", (0, TOP_CUT, w, h)),
        "lettering": save(letter_rgba, out / "lettering.webp"),
        "sway": sway_layout,
        "petals": build_petals(image, debris, out),
    }
    (out / "layout.json").write_text(json.dumps(layout, indent=2))
    print(json.dumps(layout, indent=1))


if __name__ == "__main__":
    main()
