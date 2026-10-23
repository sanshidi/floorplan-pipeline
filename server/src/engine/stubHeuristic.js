/**
 * stub-heuristic-v1 — 可替换识墙引擎（诚实 stub）
 *
 * 不做真实 CV 模型：根据图片宽高 + 可选比例/面积，生成「外轮廓 + 若干内隔墙」
 * 的中心线墙草稿（mm），尺度贴近常见户型图，便于叠底图后人工修。
 *
 * 换第三方时：新建 adapter，在 index.js 切换即可；勿改 HTTP 契约。
 */
'use strict';

const sizeOf = require('image-size');

const DEFAULT_THICK = 240;
const ENGINE_ID = 'stub-heuristic-v1';
const WARNING = '草稿必人工核对';

function wall(x0, y0, x1, y1, kind, thick) {
  return [x0, y0, x1, y1, kind || 'n', thick == null ? DEFAULT_THICK : thick];
}

function readDims(buffer) {
  try {
    const d = sizeOf(buffer);
    if (d && d.width && d.height) return { width: d.width, height: d.height };
  } catch (_) { /* fall through */ }
  return { width: 800, height: 600 };
}

/**
 * 由像素尺寸与可选标定推世界范围（mm）
 */
function worldBounds(pxW, pxH, scaleMmPerPx, areaM2) {
  let sx = scaleMmPerPx != null && scaleMmPerPx > 0 ? +scaleMmPerPx : null;
  if (!(sx > 0) && areaM2 > 0) {
    // 假设图面≈建筑外轮廓：面积约束 → 线性比例
    const aspect = pxW / pxH;
    const worldH = Math.sqrt((areaM2 * 1e6) / aspect);
    const worldW = worldH * aspect;
    sx = worldW / pxW;
  }
  if (!(sx > 0)) {
    // 默认：长边约 12m（常见小三居外轮廓量级）
    const longPx = Math.max(pxW, pxH);
    sx = 12000 / longPx;
  }
  return {
    w: pxW * sx,
    h: pxH * sx,
    scaleMmPerPx: sx,
  };
}

/**
 * 在矩形外轮廓内按纵横比塞 1–2 道内墙，模拟「客厅+卧室」草稿
 */
function layoutWalls(worldW, worldH) {
  const padX = worldW * 0.08;
  const padY = worldH * 0.08;
  const x0 = padX;
  const y0 = padY;
  const x1 = worldW - padX;
  const y1 = worldH - padY;
  const walls = [];

  // 外墙（e）
  walls.push(wall(x0, y0, x1, y0, 'e'));
  walls.push(wall(x1, y0, x1, y1, 'e'));
  walls.push(wall(x1, y1, x0, y1, 'e'));
  walls.push(wall(x0, y1, x0, y0, 'e'));

  const innerW = x1 - x0;
  const innerH = y1 - y0;

  if (innerW >= innerH) {
    // 横厅：竖隔墙约 0.4 处 + 一侧横隔
    const vx = x0 + innerW * 0.42;
    walls.push(wall(vx, y0, vx, y1, 'n'));
    const hy = y0 + innerH * 0.55;
    walls.push(wall(vx, hy, x1, hy, 'n'));
  } else {
    const hy = y0 + innerH * 0.38;
    walls.push(wall(x0, hy, x1, hy, 'n'));
    const vx = x0 + innerW * 0.55;
    walls.push(wall(vx, hy, vx, y1, 'n'));
  }

  // 轻微对齐网格，减少浮点噪点
  return walls.map(w => [
    Math.round(w[0] / 10) * 10,
    Math.round(w[1] / 10) * 10,
    Math.round(w[2] / 10) * 10,
    Math.round(w[3] / 10) * 10,
    w[4],
    w[5],
  ]);
}

/**
 * @param {{ buffer: Buffer, mime?: string, scaleMmPerPx?: number, areaM2?: number }} input
 */
async function run(input) {
  const buf = input.buffer;
  if (!buf || !buf.length) {
    const err = new Error('empty image');
    err.code = 'EMPTY_IMAGE';
    throw err;
  }

  // 假装推理耗时（异步队列可感知 progress）
  await sleep(400 + Math.random() * 400);

  const { width, height } = readDims(buf);
  const bounds = worldBounds(width, height, input.scaleMmPerPx, input.areaM2);
  const walls = layoutWalls(bounds.w, bounds.h);

  await sleep(200);

  return {
    walls,
    openings: { doors: [], wins: [] },
    rooms: [],
    meta: {
      engine: ENGINE_ID,
      warning: WARNING,
      imagePx: { width, height },
      scaleMmPerPx: bounds.scaleMmPerPx,
      worldMm: { w: Math.round(bounds.w), h: Math.round(bounds.h) },
      note: 'Aspect-based outer+partition stub; replace engine adapter for real CV/API',
    },
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { run, ENGINE_ID, WARNING };
