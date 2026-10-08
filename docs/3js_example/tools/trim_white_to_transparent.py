#!/usr/bin/env python3
"""Trim whitespace around images and replace near-white background with transparency.

Only background-connected near-white pixels are cleared (edge flood-fill),
so white areas inside the subject are preserved.
"""

from __future__ import annotations

import argparse
import sys
from collections import deque
from pathlib import Path

from PIL import Image

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}


def is_near_white(r: int, g: int, b: int, tolerance: int) -> bool:
    return r >= 255 - tolerance and g >= 255 - tolerance and b >= 255 - tolerance


def flood_clear_background(img: Image.Image, tolerance: int) -> Image.Image:
    """Make near-white pixels connected to the image edge fully transparent."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    pixels = rgba.load()
    visited = [[False] * w for _ in range(h)]
    queue: deque[tuple[int, int]] = deque()

    def maybe_enqueue(x: int, y: int) -> None:
        if visited[y][x]:
            return
        r, g, b, a = pixels[x, y]
        if a == 0 or not is_near_white(r, g, b, tolerance):
            return
        visited[y][x] = True
        queue.append((x, y))

    for x in range(w):
        maybe_enqueue(x, 0)
        maybe_enqueue(x, h - 1)
    for y in range(h):
        maybe_enqueue(0, y)
        maybe_enqueue(w - 1, y)

    while queue:
        x, y = queue.popleft()
        pixels[x, y] = (0, 0, 0, 0)
        if x > 0:
            maybe_enqueue(x - 1, y)
        if x + 1 < w:
            maybe_enqueue(x + 1, y)
        if y > 0:
            maybe_enqueue(x, y - 1)
        if y + 1 < h:
            maybe_enqueue(x, y + 1)

    return rgba


def process_image(
    src: Path,
    dst: Path,
    tolerance: int,
    padding: int,
) -> tuple[tuple[int, int], tuple[int, int]]:
    with Image.open(src) as im:
        cleared = flood_clear_background(im, tolerance)
        bbox = cleared.getbbox()
        if bbox is None:
            raise ValueError(f"No non-transparent content found in {src}")

        left, top, right, bottom = bbox
        left = max(0, left - padding)
        top = max(0, top - padding)
        right = min(cleared.width, right + padding)
        bottom = min(cleared.height, bottom + padding)
        trimmed = cleared.crop((left, top, right, bottom))

        dst.parent.mkdir(parents=True, exist_ok=True)
        trimmed.save(dst, format="PNG")
        return (im.size, trimmed.size)


def iter_images(directory: Path) -> list[Path]:
    return sorted(
        p
        for p in directory.iterdir()
        if p.is_file()
        and p.suffix.lower() in IMAGE_EXTS
        and not p.name.endswith("_transparent.png")
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Trim whitespace and convert white backgrounds to transparent PNGs."
    )
    parser.add_argument(
        "input",
        type=Path,
        help="Image file or directory of images",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=None,
        help="Output directory (default: same as each source, with _transparent.png suffix)",
    )
    parser.add_argument(
        "-t",
        "--tolerance",
        type=int,
        default=40,
        help="Near-white tolerance 0-255 (default: 40; higher also clears soft shadows)",
    )
    parser.add_argument(
        "-p",
        "--padding",
        type=int,
        default=2,
        help="Extra pixels kept around the trimmed bbox (default: 2)",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite source PNGs instead of writing *_transparent.png copies",
    )
    args = parser.parse_args()

    root = args.input.expanduser().resolve()
    if not root.exists():
        print(f"Path not found: {root}", file=sys.stderr)
        return 1

    sources = [root] if root.is_file() else iter_images(root)
    if not sources:
        print(f"No images found in {root}", file=sys.stderr)
        return 1

    for src in sources:
        if args.in_place:
            dst = src.with_suffix(".png")
        elif args.output_dir:
            dst = args.output_dir.expanduser().resolve() / f"{src.stem}_transparent.png"
        else:
            dst = src.with_name(f"{src.stem}_transparent.png")

        before, after = process_image(src, dst, args.tolerance, args.padding)
        print(f"{src.name}: {before[0]}x{before[1]} -> {after[0]}x{after[1]}  ({dst.name})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
