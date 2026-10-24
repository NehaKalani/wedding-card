"""
Split the floral reference artwork into animatable layers for the hero.

For each row ("nidhi" = top, "rahul" = bottom) this writes into public/hero/<row>/:
  final.png     untouched crop (used for reduced motion / no-WebGL fallback)
  moss.png      the mossy letters only, with flower + foliage areas inpainted
  foliage.png   leaves, vines and moss highlights (RGBA)
  growth.png    when each foliage pixel appears, 16-bit packed (R = high, G = low)
  flowers/*.png one sprite per flower cluster
and a manifest.json describing sizes, flower positions and bloom timing.

Usage: python tools/build_hero_layers.py assets-src/full_reference.png public/hero
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

ROW_SPLIT_Y = 460
PAD = 24


def classify(rgb, alpha):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(int)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    solid = alpha > 40
    inner = cv2.erode(solid.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0

    pink = solid & ((h >= 135) | (h <= 8)) & (s > 50) & (v > 90)
    yellow = solid & (h >= 12) & (h <= 34) & (s > 90) & (v > 140)
    white = inner & (s < 70) & (v > 165)

    flower = pink | yellow | white
    flower = cv2.morphologyEx(flower.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0
    flower = ndimage.binary_fill_holes(flower)
    flower = remove_small(flower, 30)

    foliage = solid & ~flower & (v > 90) & (h >= 25) & (h <= 80)
    foliage = remove_small(foliage, 25)
    foliage = cv2.dilate(foliage.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    foliage &= solid & ~flower

    kind = np.zeros(rgb.shape[:2], np.uint8)
    kind[white] = 3
    kind[yellow] = 2
    kind[pink] = 1
    return flower, foliage, kind


def remove_small(mask, min_px):
    labels, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return mask
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= min_px
    return keep[labels]


def soften(mask, sigma=0.8):
    return np.clip(cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma), 0, 1)


def geodesic_growth(foliage, width):
    """Per-pixel appearance time in [0, 1], growing each vine from its lowest point."""
    reach = cv2.dilate(foliage.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    labels, n = ndimage.label(reach, structure=np.ones((3, 3)))
    ys, xs = np.nonzero(reach)
    index = -np.ones(reach.shape, np.int64)
    index[ys, xs] = np.arange(len(ys))

    rows, cols, weights = [], [], []
    for dy, dx, w in ((0, 1, 1.0), (1, 0, 1.0), (1, 1, 1.4142), (1, -1, 1.4142)):
        ny, nx = ys + dy, xs + dx
        ok = (ny < reach.shape[0]) & (nx >= 0) & (nx < reach.shape[1])
        a = index[ys[ok], xs[ok]]
        b = index[ny[ok], nx[ok]]
        valid = b >= 0
        rows.append(a[valid]); cols.append(b[valid]); weights.append(np.full(valid.sum(), w))
    rows, cols, weights = map(np.concatenate, (rows, cols, weights))
    graph = coo_matrix((weights, (rows, cols)), shape=(len(ys),) * 2).tocsr()

    comp = labels[ys, xs]
    seeds = []
    for c in range(1, n + 1):
        members = np.nonzero(comp == c)[0]
        seeds.append(members[np.argmax(ys[members])])
    dist = dijkstra(graph, directed=False, indices=seeds, min_only=True)

    t = np.zeros(len(ys))
    for c in range(1, n + 1):
        members = comp == c
        d = dist[members]
        dmax = max(d.max(), 1.0)
        cx = xs[members].mean() / width
        size = min(dmax / 260.0, 1.0)
        delay = 0.30 * cx
        duration = 0.35 + 0.35 * size
        t[members] = delay + duration * (d / dmax)

    growth = np.ones(reach.shape)
    growth[ys, xs] = np.clip(t, 0, 1)
    return growth


def pack16(t):
    q = np.round(np.clip(t, 0, 1) * 65535).astype(np.uint32)
    out = np.zeros(t.shape + (4,), np.uint8)
    out[..., 0] = q >> 8
    out[..., 1] = q & 255
    out[..., 3] = 255
    return out


def build_row(name, crop, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "flowers").mkdir(exist_ok=True)
    for old in (out_dir / "flowers").glob("*.png"):
        old.unlink()

    rgb = np.ascontiguousarray(crop[..., :3])
    alpha = crop[..., 3]
    hgt, wid = alpha.shape
    flower, foliage, kind = classify(rgb, alpha)

    Image.fromarray(crop).save(out_dir / "final.png", optimize=True)

    holes = cv2.dilate((flower | foliage).astype(np.uint8), np.ones((5, 5), np.uint8))
    moss_rgb = cv2.inpaint(rgb, holes, 9, cv2.INPAINT_TELEA)
    moss_a = cv2.inpaint(alpha, holes, 9, cv2.INPAINT_TELEA).astype(np.float32)
    filled = np.clip((moss_a - 70) / 110, 0, 1) * 255
    moss_a = np.where(holes > 0, filled, moss_a).astype(np.uint8)
    Image.fromarray(np.dstack([moss_rgb, moss_a])).save(out_dir / "moss.png", optimize=True)

    flower_soft = soften(flower)
    foliage_soft = soften(foliage) * (1 - flower_soft)
    foliage_a = (alpha * foliage_soft).astype(np.uint8)
    Image.fromarray(np.dstack([rgb, foliage_a])).save(out_dir / "foliage.png", optimize=True)

    growth = geodesic_growth(foliage, wid)
    Image.fromarray(pack16(growth)).save(out_dir / "growth.png", optimize=True)

    groups, n = ndimage.label(cv2.dilate(flower.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0)
    flowers = []
    for i, sl in enumerate(ndimage.find_objects(groups), start=1):
        y0, y1 = max(sl[0].start - 3, 0), min(sl[0].stop + 3, hgt)
        x0, x1 = max(sl[1].start - 3, 0), min(sl[1].stop + 3, wid)
        region = groups[y0:y1, x0:x1] == i
        a = (alpha[y0:y1, x0:x1] * flower_soft[y0:y1, x0:x1] * region).astype(np.uint8)
        area = int((a > 128).sum())
        if area < 40:
            continue
        sprite = np.dstack([rgb[y0:y1, x0:x1], a])
        file = f"flowers/f{len(flowers):02d}.png"
        Image.fromarray(sprite).save(out_dir / file, optimize=True)

        fy, fx = np.nonzero(a > 128)
        kinds = kind[y0:y1, x0:x1][a > 128]
        counts = np.bincount(kinds, minlength=4)[1:]
        flower_kind = ["pink", "yellow", "white"][int(np.argmax(counts))]

        ny0, ny1 = max(y0 - 18, 0), min(y1 + 18, hgt)
        nx0, nx1 = max(x0 - 18, 0), min(x1 + 18, wid)
        near = growth[ny0:ny1, nx0:nx1][foliage[ny0:ny1, nx0:nx1]]
        bloom_at = float(np.percentile(near, 60)) if near.size else 0.3 * (x0 + fx.mean()) / wid + 0.4

        flowers.append({
            "file": file,
            "x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0,
            "cx": round(float(x0 + fx.mean()), 1),
            "cy": round(float(y0 + fy.mean()), 1),
            "area": area,
            "kind": flower_kind,
            "t": round(bloom_at, 4),
        })

    manifest = {"width": wid, "height": hgt, "flowers": flowers}
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"{name}: {wid}x{hgt}, {len(flowers)} flowers, foliage px {int(foliage.sum())}")


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    img = np.array(Image.open(src).convert("RGBA"))
    # The cut-out carries a faint white haze (alpha < ~24) left by background removal.
    img[..., 3] = np.where(img[..., 3] < 24, 0, img[..., 3])
    solid = img[..., 3] > 60
    xs = np.nonzero(solid.any(0))[0]
    x0, x1 = max(xs[0] - PAD, 0), min(xs[-1] + PAD, img.shape[1])

    for name, (top, bottom) in {"nidhi": (0, ROW_SPLIT_Y), "rahul": (ROW_SPLIT_Y, img.shape[0])}.items():
        band = solid[top:bottom, x0:x1].any(1)
        ys = np.nonzero(band)[0]
        y0, y1 = top + max(ys[0] - PAD, 0), top + min(ys[-1] + PAD, bottom - top)
        build_row(name, img[y0:y1, x0:x1].copy(), out / name)


if __name__ == "__main__":
    main()
