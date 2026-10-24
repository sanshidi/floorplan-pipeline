/**
 * EXTERNAL_VECTORIZE_URL semantic adapter.
 * - EXTERNAL_FORMAT=auto|native|xmarva|rasterscan (default auto)
 * - EXTERNAL_API_KEY → X-API-Key and/or Authorization: Bearer
 * - EXTERNAL_TIMEOUT_MS (default 25000)
 * Normalizes native / xmarva / RasterScan-ish JSON via normalize.js
 */
'use strict';

const {
  WARNING,
  readDims,
} = require('./scale');
const { normalizeExternal } = require('./normalize');

const ENGINE_ID = 'external-v1';

function enabled() {
  return !!(process.env.EXTERNAL_VECTORIZE_URL || '').trim();
}

function timeoutMs() {
  const n = +(process.env.EXTERNAL_TIMEOUT_MS || 25000);
  return Number.isFinite(n) && n > 0 ? n : 25000;
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
  const key = (process.env.EXTERNAL_API_KEY || '').trim();
  if (key) {
    headers['X-API-Key'] = key;
    headers['Authorization'] = 'Bearer ' + key;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs());
  let res;
  try {
    res = await fetch(url, { method: 'POST', body: form, headers, signal: ac.signal });
  } catch (e) {
    clearTimeout(timer);
    const err = new Error(
      e.name === 'AbortError' ? 'external vectorize timeout' : ('external fetch: ' + (e.message || e))
    );
    err.code = e.name === 'AbortError' ? 'EXTERNAL_TIMEOUT' : 'EXTERNAL_FETCH';
    throw err;
  }
  clearTimeout(timer);

  if (!res.ok) {
    const err = new Error('external vectorize HTTP ' + res.status);
    err.code = 'EXTERNAL_HTTP';
    throw err;
  }
  const data = await res.json();
  const dims = (data.imagePx || (data.meta && data.meta.imagePx)) || readDims(buf);
  const pxW = dims.width || dims.w || 800;
  const pxH = dims.height || dims.h || 600;

  const format = (process.env.EXTERNAL_FORMAT || 'auto').toLowerCase();
  const normalized = normalizeExternal(data, {
    format,
    pxW,
    pxH,
    scaleMmPerPx: input.scaleMmPerPx,
    areaM2: input.areaM2,
  });

  normalized.meta = Object.assign({}, normalized.meta, {
    engine: ENGINE_ID,
    warning: WARNING,
    externalUrl: url.replace(/\/\/([^:/@]+@)/, '//***@'),
    externalFormat: normalized.meta.format,
    note: 'Mapped from EXTERNAL_VECTORIZE_URL (' + normalized.meta.format + '); still draft — review required',
  });
  return normalized;
}

module.exports = { run, ENGINE_ID, enabled };
