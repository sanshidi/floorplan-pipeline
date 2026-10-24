#!/usr/bin/env python3
"""
cv-hough-v1 — OpenCV line detection for floor-plan wall drafts.

Usage:
  python cv_lines.py path/to/image.png
  python cv_lines.py --stdin < image.png

Stdout JSON:
  { "ok": true, "wallsPx": [[x0,y0,x1,y1], ...],
    "imagePx": {"width":W,"height":H},
    "meta": { "engine": "cv-hough-v1", "warning": "草稿必人工核对", ... } }

Honest limits: classical Hough / morphology — NOT commercial semantic room parsing.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import List, Sequence, Tuple

import cv2
import numpy as np

ENGINE_ID = "cv-hough-v1"
WARNING = "草稿必人工核对"
Seg = Tuple[float, float, float, float]


def load_image(path: str | None, use_stdin: bool) -> np.ndarray:
    if use_stdin:
        data = sys.stdin.buffer.read()
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("failed to decode image from stdin")
        return img
    if not path:
        raise ValueError("image path required")
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"failed to read image: {path}")
    return img


def seg_len(s: Sequence[float]) -> float:
    return math.hypot(s[2] - s[0], s[3] - s[1])


def normalize_angle(a: float) -> float:
    while a < -math.pi / 2:
        a += math.pi
    while a >= math.pi / 2:
        a -= math.pi
    return a


def seg_angle(s: Sequence[float]) -> float:
    return math.atan2(s[3] - s[1], s[2] - s[0])


def point_line_dist(px: float, py: float, s: Sequence[float]) -> float:
    x0, y0, x1, y1 = s
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy
    if L2 < 1e-6:
        return math.hypot(px - x0, py - y0)
    t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / L2))
    return math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))


def hough_segments(mask: np.ndarray) -> List[Seg]:
    h, w = mask.shape[:2]
    min_len = max(28, int(min(h, w) * 0.04))
    max_gap = max(8, int(min(h, w) * 0.015))
    edges = cv2.Canny(mask, 50, 150, apertureSize=3)
    edges = cv2.bitwise_and(edges, mask)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180.0,
        threshold=max(40, min_len // 2),
        minLineLength=min_len,
        maxLineGap=max_gap,
    )
    segs: List[Seg] = []
    if lines is None:
        return segs
    # OpenCV 4: (N,1,4); OpenCV 5: (N,4)
    arr = np.asarray(lines).reshape(-1, 4)
    for x0, y0, x1, y1 in arr:
        segs.append((float(x0), float(y0), float(x1), float(y1)))
    return segs


def merge_collinear(
    segs: List[Seg],
    ang_tol_deg: float = 8.0,
    dist_tol: float = 12.0,
    gap_tol: float = 28.0,
) -> List[Seg]:
    if not segs:
        return []
    ang_tol = math.radians(ang_tol_deg)
    remaining = sorted(segs, key=seg_len, reverse=True)
    merged: List[Seg] = []

    while remaining:
        base = remaining.pop(0)
        group = [base]
        ba = normalize_angle(seg_angle(base))
        changed = True
        while changed:
            changed = False
            keep: List[Seg] = []
            for s in remaining:
                sa = normalize_angle(seg_angle(s))
                dang = abs(ba - sa)
                dang = min(dang, math.pi - dang)
                if dang > ang_tol:
                    keep.append(s)
                    continue
                if max(point_line_dist(s[0], s[1], base), point_line_dist(s[2], s[3], base)) > dist_tol:
                    keep.append(s)
                    continue
                dx, dy = math.cos(ba), math.sin(ba)

                def proj(x: float, y: float) -> float:
                    return (x - base[0]) * dx + (y - base[1]) * dy

                pts = [
                    proj(base[0], base[1]),
                    proj(base[2], base[3]),
                    proj(s[0], s[1]),
                    proj(s[2], s[3]),
                ]
                lo, hi = min(pts), max(pts)
                cover = abs(proj(base[2], base[3]) - proj(base[0], base[1])) + abs(
                    proj(s[2], s[3]) - proj(s[0], s[1])
                )
                if (hi - lo) - cover > gap_tol:
                    keep.append(s)
                    continue
                group.append(s)
                changed = True
            remaining = keep
            if changed:
                base = max(group, key=seg_len)
                ba = normalize_angle(seg_angle(base))

        angles = [normalize_angle(seg_angle(s)) for s in group]
        mean_a = (
            math.atan2(
                sum(math.sin(2 * a) for a in angles) / len(angles),
                sum(math.cos(2 * a) for a in angles) / len(angles),
            )
            / 2.0
        )
        dx, dy = math.cos(mean_a), math.sin(mean_a)
        eps = []
        for s in group:
            eps.append((s[0], s[1]))
            eps.append((s[2], s[3]))
        cx = sum(p[0] for p in eps) / len(eps)
        cy = sum(p[1] for p in eps) / len(eps)
        ts = [((x - cx) * dx + (y - cy) * dy) for x, y in eps]
        t0, t1 = min(ts), max(ts)
        x0, y0 = cx + t0 * dx, cy + t0 * dy
        x1, y1 = cx + t1 * dx, cy + t1 * dy
        if math.hypot(x1 - x0, y1 - y0) >= 20:
            merged.append((x0, y0, x1, y1))

    return merged


def snap_ortho(segs: List[Seg], tol_deg: float = 12.0) -> List[Seg]:
    out: List[Seg] = []
    for x0, y0, x1, y1 in segs:
        ang = abs(math.degrees(math.atan2(y1 - y0, x1 - x0))) % 180
        if ang <= tol_deg or ang >= 180 - tol_deg:
            y = (y0 + y1) / 2
            out.append((min(x0, x1), y, max(x0, x1), y))
        elif abs(ang - 90) <= tol_deg:
            x = (x0 + x1) / 2
            out.append((x, min(y0, y1), x, max(y0, y1)))
        else:
            out.append((x0, y0, x1, y1))
    return out


def dedup_walls(walls: List[List[float]], tol: float = 10.0) -> List[List[float]]:
    out: List[List[float]] = []
    for w in walls:
        dup = False
        for o in out:
            same = (
                abs(w[0] - o[0]) < tol
                and abs(w[1] - o[1]) < tol
                and abs(w[2] - o[2]) < tol
                and abs(w[3] - o[3]) < tol
            )
            rev = (
                abs(w[0] - o[2]) < tol
                and abs(w[1] - o[3]) < tol
                and abs(w[2] - o[0]) < tol
                and abs(w[3] - o[1]) < tol
            )
            if same or rev:
                dup = True
                break
        if not dup:
            out.append(w)
    return out


def detect(bgr_orig: np.ndarray) -> dict:
    h0, w0 = bgr_orig.shape[:2]
    max_side = 1600
    scale = 1.0
    bgr = bgr_orig
    if max(h0, w0) > max_side:
        scale = max_side / float(max(h0, w0))
        bgr = cv2.resize(
            bgr_orig, (int(w0 * scale), int(h0 * scale)), interpolation=cv2.INTER_AREA
        )

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    inv = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 35, 8
    )
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    if np.count_nonzero(inv) < 0.002 * inv.size:
        inv = otsu
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    mask = cv2.morphologyEx(inv, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)

    segs = hough_segments(mask)
    raw_n = len(segs)
    segs = merge_collinear(segs)
    segs = snap_ortho(segs)

    inv_s = 1.0 / scale if scale > 0 else 1.0
    walls_px: List[List[float]] = []
    for s in segs:
        x0, y0, x1, y1 = [v * inv_s for v in s]
        if math.hypot(x1 - x0, y1 - y0) < 24:
            continue
        walls_px.append([round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)])

    walls_px = dedup_walls(walls_px)

    if len(walls_px) < 2:
        raise ValueError(
            f"too few line segments after merge ({len(walls_px)}; raw={raw_n})"
        )

    return {
        "ok": True,
        "wallsPx": walls_px,
        "imagePx": {"width": w0, "height": h0},
        "meta": {
            "engine": ENGINE_ID,
            "warning": WARNING,
            "lineCountRaw": raw_n,
            "lineCount": len(walls_px),
            "note": "OpenCV HoughLinesP + collinear merge; not commercial semantic floor-plan AI",
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="cv-hough-v1 floorplan line detector")
    ap.add_argument("image", nargs="?", help="image path")
    ap.add_argument("--stdin", action="store_true", help="read image bytes from stdin")
    args = ap.parse_args()
    try:
        img = load_image(args.image, args.stdin)
        result = detect(img)
        json.dump(result, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    except Exception as e:
        json.dump(
            {
                "ok": False,
                "error": {"code": "CV_ERROR", "message": str(e)},
                "meta": {"engine": ENGINE_ID, "warning": WARNING},
            },
            sys.stdout,
            ensure_ascii=False,
        )
        sys.stdout.write("\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
