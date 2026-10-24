'use strict';

const sizeOf = require('image-size');

const DEFAULT_THICK = 240;
const WARNING = '草稿必人工核对';

function readDims(buffer) {
  try {
    const d = sizeOf(buffer);
    if (d && d.width && d.height) return { width: d.width, height: d.height };
  } catch (_) { /* fall through */ }
  return { width: 800, height: 600 };
}

/**
 * 像素→毫米比例：显式 scale / 面积约束 / 长边≈12m 兜底（与 stub 同类）
 */
function resolveScaleMmPerPx(pxW, pxH, scaleMmPerPx, areaM2) {
  let sx = scaleMmPerPx != null && scaleMmPerPx > 0 ? +scaleMmPerPx : null;
  if (!(sx > 0) && areaM2 > 0) {
    const aspect = pxW / pxH;
    const worldH = Math.sqrt((areaM2 * 1e6) / aspect);
    const worldW = worldH * aspect;
    sx = worldW / pxW;
  }
  if (!(sx > 0)) {
    const longPx = Math.max(pxW, pxH);
    sx = 12000 / longPx;
  }
  return sx;
}

function classifyKind(x0, y0, x1, y1, pxW, pxH) {
  const margin = Math.min(pxW, pxH) * 0.12;
  const mx = Math.min(x0, x1, pxW - x0, pxW - x1);
  const my = Math.min(y0, y1, pxH - y0, pxH - y1);
  if (mx < margin || my < margin) return 'e';
  return 'n';
}

/**
 * wallsPx [[x0,y0,x1,y1],…] → mm centerline walls
 */
function wallsPxToMm(wallsPx, pxW, pxH, scaleMmPerPx) {
  const sx = scaleMmPerPx;
  return (wallsPx || []).map(([x0, y0, x1, y1]) => {
    const kind = classifyKind(x0, y0, x1, y1, pxW, pxH);
    return [
      Math.round(x0 * sx / 10) * 10,
      Math.round(y0 * sx / 10) * 10,
      Math.round(x1 * sx / 10) * 10,
      Math.round(y1 * sx / 10) * 10,
      kind,
      DEFAULT_THICK,
    ];
  }).filter(w => Math.hypot(w[2] - w[0], w[3] - w[1]) >= DEFAULT_THICK * 0.35);
}

module.exports = {
  DEFAULT_THICK,
  WARNING,
  readDims,
  resolveScaleMmPerPx,
  wallsPxToMm,
  classifyKind,
};
