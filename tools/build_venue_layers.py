"""
Prepare the Rang Mahal section from the two supplied hand SVGs.

The SVGs (Krishna; Radha with lotus and morpankh) are copied as-is.
They are placed into the portrait property frame (941x1672) using their
positions in original_composition.png.

Writes into public/venue/:
  krishna.svg, radha.svg   the supplied layers
  maroon.webp              textured plate behind the hands
  property.webp            Rang Mahal poster
  lotus-glow.webp          glow mask from the lotus on Radha's layer
  layout.json

Usage: python tools/build_venue_layers.py assets-src/venue public/venue
"""

import json
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

SCENE = (941, 1672)
COMP = (1536, 1024)
KRISHNA = {"file": "krishna_hand.svg", "xy": (0, 316), "size": (717, 698)}
RADHA = {"file": "radha_hand_lotus_morpankh.svg", "xy": (833, 1), "size": (703, 1023)}


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def largest(mask):
    labeled, n = ndimage.label(mask)
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, labeled, range(1, n + 1))
    return labeled == (np.argmax(sizes) + 1)


def lotus_glow(radha_png):
    rgba = np.array(Image.open(radha_png).convert("RGBA"))
    h, w = rgba.shape[:2]
    hsv = cv2.cvtColor(cv2.medianBlur(rgba[..., :3], 5), cv2.COLOR_RGB2HSV)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    region = np.zeros((h, w), bool)
    region[: int(h * 0.34), : int(w * 0.62)] = True
    petal = region & (val > 140) & ((hue < 16) | (hue > 165)) & (sat > 18)
    keep = largest(ndimage.binary_fill_holes(ndimage.binary_opening(petal, iterations=1)))
    keep = ndimage.binary_dilation(keep, iterations=2).astype(np.uint8)
    dist_in = cv2.distanceTransform(keep, cv2.DIST_L2, 5)
    dist_out = cv2.distanceTransform(1 - keep, cv2.DIST_L2, 5)
    alpha = np.where(keep > 0, 0.55 + 0.45 * smoothstep(0, 3.2, dist_in), 0.45 * (1 - smoothstep(0, 2.4, dist_out)))
    alpha = np.clip(alpha, 0, 1)
    ys, xs = np.where(alpha > 0.04)
    pad = 6
    x0, x1 = max(int(xs.min()) - pad, 0), min(int(xs.max()) + pad + 1, alpha.shape[1])
    y0, y1 = max(int(ys.min()) - pad, 0), min(int(ys.max()) + pad + 1, alpha.shape[0])
    glow = np.dstack([rgba[y0:y1, x0:x1, :3], np.round(alpha[y0:y1, x0:x1] * 255).astype(np.uint8)])
    return glow, (x0, y0, x1 - x0, y1 - y0)


def make_gold(width, height):
    yy, xx = np.mgrid[0:height, 0:width]
    radius = np.sqrt(((xx - width * 0.5) / width) ** 2 + ((yy - height * 0.4) / height) ** 2)
    wash = np.clip(1 - radius * 1.1, 0, 1)[..., None]
    deep = np.array([118, 78, 22], np.float32)
    mid = np.array([196, 150, 62], np.float32)
    lite = np.array([236, 206, 120], np.float32)
    plate = deep * (1 - wash) + mid * wash
    rng = np.random.default_rng(19)
    grain = rng.normal(0, 8, (height, width, 1)).astype(np.float32)
    clouds = cv2.GaussianBlur(rng.normal(0, 1, (height, width)).astype(np.float32), (0, 0), 36)
    silk = cv2.GaussianBlur(rng.normal(0, 1, (height, width)).astype(np.float32), (0, 0), 4)
    shine = np.clip(1.15 - np.abs(yy / height - 0.38) * 1.8, 0, 1)[..., None]
    plate = plate * (0.82 + 0.18 * shine) + lite * shine * 0.22
    plate = plate + grain + clouds[..., None] * 18 + silk[..., None] * 9
    specks = rng.random((height, width)) > 0.995
    plate[specks] = [245, 224, 150]
    return np.clip(plate, 0, 255).astype(np.uint8)


def cut_building(path):
    rgba = np.array(Image.open(path).convert("RGBA"))
    rgb = rgba[..., :3].astype(np.int16)
    white = (rgb.min(axis=2) > 242) & (np.abs(rgb[..., 0] - rgb[..., 1]) < 10) & (np.abs(rgb[..., 1] - rgb[..., 2]) < 10)
    # Keep only the white that touches the edges so cream walls stay.
    edge = np.zeros(white.shape, bool)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    drop = ndimage.binary_propagation(edge & white, mask=white)
    drop = ndimage.binary_dilation(drop, iterations=1)
    alpha = np.where(drop, 0, 255).astype(np.uint8)
    dist = cv2.distanceTransform((alpha > 0).astype(np.uint8), cv2.DIST_L2, 5)
    fade = np.clip(dist / 2.2, 0, 1)
    rgba[..., 3] = np.round(fade * 255).astype(np.uint8)
    return rgba


def make_maroon(width, height):
    yy, xx = np.mgrid[0:height, 0:width]
    radius = np.sqrt(((xx - width * 0.5) / width) ** 2 + ((yy - height * 0.42) / height) ** 2)
    wash = np.clip(1 - radius * 1.05, 0, 1)[..., None]
    deep = np.array([36, 6, 14], np.float32)
    rose = np.array([98, 24, 38], np.float32)
    plate = deep * (1 - wash) + rose * wash
    rng = np.random.default_rng(11)
    grain = rng.normal(0, 7.5, (height, width, 1)).astype(np.float32)
    clouds = cv2.GaussianBlur(rng.normal(0, 1, (height, width)).astype(np.float32), (0, 0), 48)
    silk = cv2.GaussianBlur(rng.normal(0, 1, (height, width)).astype(np.float32), (0, 0), 6)
    plate = plate + grain + clouds[..., None] * 16 + silk[..., None] * 7
    specks = rng.random((height, width)) > 0.9965
    plate[specks] = [168, 122, 78]
    return np.clip(plate, 0, 255).astype(np.uint8)


def place_from_comp(xy, size, scale, y0):
    x, y = xy
    w, h = size
    return {
        "x": round(x * scale),
        "y": round(y * scale + y0),
        "w": round(w * scale),
        "h": round(h * scale),
    }


def main(src, dest):
    dest.mkdir(parents=True, exist_ok=True)
    scale = SCENE[0] / COMP[0]
    y0 = (SCENE[1] - COMP[1] * scale) / 2
    krishna = place_from_comp(KRISHNA["xy"], KRISHNA["size"], scale, y0)
    radha = place_from_comp(RADHA["xy"], RADHA["size"], scale, y0)
    krishna["x"] += 82
    radha["x"] -= 88

    shutil.copy2(src / KRISHNA["file"], dest / "krishna.svg")
    shutil.copy2(src / RADHA["file"], dest / "radha.svg")

    glow, (gx, gy, gw, gh) = lotus_glow(src / "radha_hand_lotus_morpankh.png")
    Image.fromarray(glow).save(dest / "lotus-glow.webp", "WEBP", quality=92, method=6)
    glow_box = {
        "x": radha["x"] + round(gx * scale),
        "y": radha["y"] + round(gy * scale),
        "w": round(gw * scale),
        "h": round(gh * scale),
    }

    Image.fromarray(make_maroon(*SCENE)).save(dest / "maroon.webp", "WEBP", quality=86, method=6)
    Image.fromarray(make_gold(*SCENE)).save(dest / "gold.webp", "WEBP", quality=86, method=6)
    Image.fromarray(cut_building(src / "rang_mahal_building.png")).save(
        dest / "building.webp", "WEBP", quality=92, method=6
    )

    layout = {"width": SCENE[0], "height": SCENE[1], "pieces": {"krishna": krishna, "radha": radha}, "glow": glow_box}
    (dest / "layout.json").write_text(json.dumps(layout, indent=2))
    print("wrote", dest)
    print("  krishna", krishna)
    print("  radha  ", radha)
    print("  glow   ", glow_box)


if __name__ == "__main__":
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "assets-src/venue")
    dest = Path(sys.argv[2] if len(sys.argv) > 2 else "public/venue")
    main(src, dest)
