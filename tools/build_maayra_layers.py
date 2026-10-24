"""Crop the Maayra bandhani pack into web layers.

Usage: python tools/build_maayra_layers.py assets-src/maayra public/maayra
"""

import json
import sys
from pathlib import Path

from PIL import Image


POSTER = (1068, 1472)
PAD = 8


def tight_bbox(image, threshold=20):
    alpha = image.split()[-1].point(lambda p: 255 if p > threshold else 0)
    return alpha.getbbox()


def crop_layer(src, dest, pad=PAD):
    image = Image.open(src).convert("RGBA")
    box = tight_bbox(image)
    if not box:
        raise SystemExit(f"No opaque pixels in {src}")
    left, top, right, bottom = box
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(image.width, right + pad)
    bottom = min(image.height, bottom + pad)
    image.crop((left, top, right, bottom)).save(dest, "WEBP", quality=86, method=6)
    return {"x": left, "y": top, "w": right - left, "h": bottom - top}


def main(src, dest):
    src = Path(src)
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)

    background = Image.open(src / "background.png").convert("RGB")
    background.save(dest / "background.webp", "WEBP", quality=82, method=6)

    layout = {
        "poster": {"w": POSTER[0], "h": POSTER[1]},
        "dholkis": crop_layer(src / "dholkis.png", dest / "dholkis.webp"),
        "platter": crop_layer(src / "dry_fruit_platter.png", dest / "platter.webp"),
    }
    (dest / "layout.json").write_text(json.dumps(layout, indent=2) + "\n")
    print(json.dumps(layout, indent=2))


if __name__ == "__main__":
    main(*sys.argv[1:3])
