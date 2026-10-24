/**
 * cv-hough-v1 — Node adapter: spawn Python OpenCV detector, scale px → mm.
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  WARNING,
  readDims,
  resolveScaleMmPerPx,
  wallsPxToMm,
} = require('./scale');

const ENGINE_ID = 'cv-hough-v1';
const SCRIPT = path.join(__dirname, 'cv_lines.py');
const VENV_PY = path.join(__dirname, '..', '..', '.venv', 'bin', 'python');

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  try {
    if (fs.existsSync(VENV_PY)) return VENV_PY;
  } catch (_) {}
  return process.env.PYTHON3 || 'python3';
}

function runPython(imgPath, timeoutMs) {
  const py = resolvePython();
  return new Promise((resolve, reject) => {
    const child = spawn(py, [SCRIPT, imgPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
      reject(Object.assign(new Error('cv_lines.py timeout'), { code: 'CV_TIMEOUT' }));
    }, timeoutMs || 45000);
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', err => {
      clearTimeout(timer);
      reject(Object.assign(err, { code: 'CV_SPAWN' }));
    });
    child.on('close', code => {
      clearTimeout(timer);
      let parsed;
      try {
        parsed = JSON.parse(stdout.trim() || '{}');
      } catch (e) {
        reject(Object.assign(new Error('cv_lines.py bad JSON: ' + (stderr || stdout).slice(0, 200)), {
          code: 'CV_PARSE',
        }));
        return;
      }
      if (!parsed.ok) {
        const msg = (parsed.error && parsed.error.message) || 'cv failed';
        reject(Object.assign(new Error(msg), { code: (parsed.error && parsed.error.code) || 'CV_ERROR' }));
        return;
      }
      if (code !== 0 && !parsed.ok) {
        reject(Object.assign(new Error(stderr || 'cv exit ' + code), { code: 'CV_EXIT' }));
        return;
      }
      resolve(parsed);
    });
  });
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
  if (!fs.existsSync(SCRIPT)) {
    const err = new Error('cv_lines.py missing');
    err.code = 'CV_MISSING';
    throw err;
  }

  const tmp = path.join(os.tmpdir(), 'fp-cv-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.png');
  fs.writeFileSync(tmp, buf);
  let parsed;
  try {
    parsed = await runPython(tmp, +(process.env.CV_TIMEOUT_MS || 45000));
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }

  const dims = parsed.imagePx || readDims(buf);
  const pxW = dims.width;
  const pxH = dims.height;
  const scale = resolveScaleMmPerPx(pxW, pxH, input.scaleMmPerPx, input.areaM2);
  const walls = wallsPxToMm(parsed.wallsPx || [], pxW, pxH, scale);
  if (!walls.length) {
    const err = new Error('cv produced no walls after scale');
    err.code = 'CV_EMPTY';
    throw err;
  }

  return {
    walls,
    openings: { doors: [], wins: [] },
    rooms: [],
    meta: Object.assign({}, parsed.meta || {}, {
      engine: ENGINE_ID,
      warning: WARNING,
      imagePx: { width: pxW, height: pxH },
      scaleMmPerPx: scale,
      worldMm: { w: Math.round(pxW * scale), h: Math.round(pxH * scale) },
      python: resolvePython(),
    }),
  };
}

module.exports = { run, ENGINE_ID, WARNING, resolvePython };
