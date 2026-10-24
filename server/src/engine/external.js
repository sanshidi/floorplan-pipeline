/**
 * Optional EXTERNAL_VECTORIZE_URL adapter.
 * Expects POST multipart/binary → JSON with walls (mm centerline) or wallsPx.
 * Disabled when env unset.
 */
'use strict';

const {
  WARNING,
  readDims,
  resolveScaleMmPerPx,
  wallsPxToMm,
} = require('./scale');

const ENGINE_ID = 'external-v1';

function enabled() {
  return !!(process.env.EXTERNAL_VECTORIZE_URL || '').trim();
}

/**
 * @param {{ buffer: Buffer, mime?: string, scaleMmPerPx?: number, areaM2?: number }} input
 */
async function run(input) {
  const url = (process.env.EXTERNAL_VECTORIZE_URL || '').trim();
  if (!url) {
    const err = new Error('EXTERNAL_VECTORIZE_URL not set');
    err.code = 'EXTERNAL_OFF';
    throw err;
  }
  const buf = input.buffer;
  if (!buf || !buf.length) {
    const err = new Error('empty image');
    err.code = 'EMPTY_IMAGE';
    throw err;
  }

  const mime = input.mime || 'image/png';
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime }), 'floorplan.png');
  if (input.scaleMmPerPx > 0) form.append('scaleMmPerPx', String(input.scaleMmPerPx));
  if (input.areaM2 > 0) form.append('areaM2', String(input.areaM2));

  const headers = {};
  if (process.env.EXTERNAL_API_KEY) {
    headers['X-API-Key'] = process.env.EXTERNAL_API_KEY;
  }

  const res = await fetch(url, { method: 'POST', body: form, headers });
  if (!res.ok) {
    const err = new Error('external vectorize HTTP ' + res.status);
    err.code = 'EXTERNAL_HTTP';
    throw err;
  }
  const data = await res.json();
  const dims = (data.imagePx || data.meta && data.meta.imagePx) || readDims(buf);
  const pxW = dims.width;
  const pxH = dims.height;
  const scale = resolveScaleMmPerPx(pxW, pxH, input.scaleMmPerPx, input.areaM2);

  let walls = data.walls;
  if ((!walls || !walls.length) && Array.isArray(data.wallsPx)) {
    walls = wallsPxToMm(data.wallsPx, pxW, pxH, scale);
  }
  if ((!walls || !walls.length) && data.result && Array.isArray(data.result.walls)) {
    walls = data.result.walls;
  }
  if (!walls || !walls.length) {
    const err = new Error('external response has no walls');
    err.code = 'EXTERNAL_EMPTY';
    throw err;
  }

  return {
    walls,
    openings: data.openings || { doors: [], wins: [] },
    rooms: data.rooms || [],
    meta: Object.assign({}, data.meta || {}, {
      engine: ENGINE_ID,
      warning: WARNING,
      imagePx: { width: pxW, height: pxH },
      scaleMmPerPx: scale,
      externalUrl: url.replace(/\/\/([^:/@]+@)/, '//***@'),
      note: 'Mapped from EXTERNAL_VECTORIZE_URL; still draft — review required',
    }),
  };
}

module.exports = { run, ENGINE_ID, enabled };
