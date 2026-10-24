"""
Cut the Sangeet poster into the pieces the section composes over its own background.

The crops in assets-src/sangeet are 1.5x cut-outs of reference_poster.jpg. They are
placed back onto an upscaled poster, then the title and the dancer/flower cluster are
separated from the poster's teal background with GrabCut.

Writes into public/sangeet/:
  title.png, cluster.png   transparent cut-outs
  layout.json              their boxes in poster space (so CSS can keep the layout)

Usage: python tools/build_sangeet_layers.py assets-src/sangeet public/sangeet
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

SCALE = 1.5
POSTER_FRAME = 22  # cream paper border around the poster, in 1.5x pixels

# Top-left of each crop in the 682x1024 reference poster (found by template matching).
CROP_POSITIONS = {
    "title_mehfil_e_khaas": (0, 0),
    "character_man": (0, 330),
    "character_woman_white": (0, 459),
    "flower_left_large": (0, 763),
    "character_woman_red": (156, 602),
    "flower_bottom_center": (146, 876),
    "flower_bottom_right": (389, 897),
}
CLUSTER = [name for name in CROP_POSITIONS if name != "title_mehfil_e_khaas"]

# Generous poster boxes (x0, y0, x1, y1 in 682x1024 space) around each piece; the
# hand-made crops clip the artwork in places, so the subject is searched for here.
TITLE_BOX = (0, 0, 445, 342)
CLUSTER_BOX = (0, 322, 640, 1024)
BACKDROP_FADE = 40  # px over which the crops' own backdrop fades into the section


def load_svg_png(path):
    data = re.search(r'base64,([^"]+)', path.read_text()).group(1)
    return np.array(Image.open(io.BytesIO(base64.b64decode(data))).convert("RGBA"))


def rebuild_poster(src):
    poster = np.array(Image.open(src / "reference_poster.jpg").convert("RGB"))
    width, height = round(poster.shape[1] * SCALE), round(poster.shape[0] * SCALE)
    canvas = cv2.resize(poster, (width, height), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    coverage = {}
    for name, (x, y) in CROP_POSITIONS.items():
        crop = load_svg_png(src / f"{name}.svg").astype(np.float32)
        x, y = round(x * SCALE), round(y * SCALE)
        h, w = min(crop.shape[0], height - y), min(crop.shape[1], width - x)
        alpha = np.clip((crop[:h, :w, 3:4] / 255 - 0.1) / 0.9, 0, 1)
        canvas[y:y + h, x:x + w] = canvas[y:y + h, x:x + w] * (1 - alpha) + crop[:h, :w, :3] * alpha
        mask = np.zeros((height, width), np.float32)
        mask[y:y + h, x:x + w] = crop[:h, :w, 3] / 255
        coverage[name] = mask
    return np.clip(canvas, 0, 255).astype(np.uint8), coverage


def box_region(shape, box):
    region = np.zeros(shape, bool)
    x0, y0, x1, y1 = (round(v * SCALE) for v in box)
    region[max(y0, POSTER_FRAME):y1, max(x0, POSTER_FRAME):x1] = True
    return region


def crop_backdrop(alphas):
    """The hand-made crops' own backdrop, fading out towards their cut edges.

    Seams where neighbouring crops meet are closed. Edges lying on the poster's left
    and bottom don't fade, since the piece sits flush against those sides.
    """
    solid = cv2.morphologyEx((np.max(alphas, axis=0) > 0.5).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    solid = ndimage.binary_fill_holes(solid).astype(np.uint8)
    pad = BACKDROP_FADE * 2
    padded = cv2.copyMakeBorder(solid, 0, pad, pad, 0, cv2.BORDER_REPLICATE)
    dist = cv2.distanceTransform(padded, cv2.DIST_L2, 5)[: solid.shape[0], pad:]
    t = np.clip(dist / BACKDROP_FADE, 0, 1)
    return t * t * (3 - 2 * t)


def cut_out(image, region, drop_teal=False):
    """GrabCut the piece out of the poster background.

    drop_teal: the piece contains no teal of its own, so any teal GrabCut kept is
    leftover poster background.
    """
    smooth = cv2.medianBlur(image, 5)
    hsv = cv2.cvtColor(smooth, cv2.COLOR_RGB2HSV).astype(int)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    teal = (h >= 76) & (h <= 108) & (s >= 45) & (v >= 40)

    mask = np.full(region.shape, cv2.GC_BGD, np.uint8)
    mask[region] = cv2.GC_PR_FGD
    mask[region & teal] = cv2.GC_PR_BGD
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(image[..., ::-1].copy(), mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)

    fg = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    if drop_teal:
        fg &= ~teal
    fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
    labels, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, labels, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= max(sizes.max() * 0.02, 500)
    fg = ndimage.binary_fill_holes(keep[labels])
    fg = cv2.erode(fg.astype(np.uint8), np.ones((3, 3), np.uint8))
    return np.clip(cv2.GaussianBlur(fg.astype(np.float32), (0, 0), 0.9), 0, 1)


def save_piece(image, alpha, out_path):
    ys, xs = np.nonzero(alpha > 0.02)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([image, (alpha * 255).astype(np.uint8)])[y0:y1, x0:x1]
    Image.fromarray(rgba).save(out_path, optimize=True)
    return {"x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0)}


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    poster, coverage = rebuild_poster(src)
    height, width = poster.shape[:2]

    title_alpha = cut_out(poster, box_region((height, width), TITLE_BOX), drop_teal=True)
    cluster_alpha = np.maximum(
        cut_out(poster, box_region((height, width), CLUSTER_BOX)),
        crop_backdrop([coverage[name] for name in CLUSTER]),
    )
    cluster_alpha[:, :POSTER_FRAME] = 0
    cluster_alpha[-POSTER_FRAME:, :] = 0

    layout = {
        "poster": {"w": width - 2 * POSTER_FRAME, "h": height - 2 * POSTER_FRAME},
        "title": save_piece(poster, title_alpha, out / "title.png"),
        "cluster": save_piece(poster, cluster_alpha, out / "cluster.png"),
    }
    for piece in ("title", "cluster"):
        layout[piece]["x"] -= POSTER_FRAME
        layout[piece]["y"] -= POSTER_FRAME
    (out / "layout.json").write_text(json.dumps(layout, indent=2))
    print(json.dumps(layout))


if __name__ == "__main__":
    main()
