/**
 * 引擎入口：ENGINE=cv|stub|external（默认 cv）
 * cv 失败 → 自动降级 stub，meta.fallback 说明原因。
 * EXTERNAL_VECTORIZE_URL 设置且 ENGINE=external 时走外部适配器。
 */
'use strict';

const stub = require('./stubHeuristic');
const cv = require('./cvHough');
const external = require('./external');
const { WARNING } = require('./scale');

function preferredEngine() {
  const e = (process.env.ENGINE || 'cv').toLowerCase().trim();
  if (e === 'stub' || e === 'stub-heuristic' || e === 'stub-heuristic-v1') return 'stub';
  if (e === 'external' || e === 'ext') return 'external';
  return 'cv';
}

function activeEngineId() {
  const p = preferredEngine();
  if (p === 'stub') return stub.ENGINE_ID;
  if (p === 'external') return external.ENGINE_ID;
  return cv.ENGINE_ID;
}

/**
 * @param {{ buffer: Buffer, mime?: string, scaleMmPerPx?: number, areaM2?: number }} input
 */
async function runEngine(input) {
  // If EXTERNAL_VECTORIZE_URL set and ENGINE not forced to stub/cv, prefer external when ENGINE=external
  // Also: if ENGINE unset/cv but EXTERNAL set and CV unavailable — still try cv first unless ENGINE=external
  const pref = preferredEngine();

  if (pref === 'stub') {
    return stub.run(input);
  }

  if (pref === 'external') {
    if (!external.enabled()) {
      // no URL → try cv then stub
      return runWithFallback('external', input, 'EXTERNAL_VECTORIZE_URL unset');
    }
    try {
      return await external.run(input);
    } catch (e) {
      return runWithFallback('external', input, e.message || String(e));
    }
  }

  // default: cv
  try {
    return await cv.run(input);
  } catch (e) {
    console.warn('[engine] cv failed, fallback stub:', e.message || e);
    const result = await stub.run(input);
    result.meta = Object.assign({}, result.meta, {
      engine: stub.ENGINE_ID,
      warning: WARNING,
      fallback: {
        from: cv.ENGINE_ID,
        reason: e.message || String(e),
        code: e.code || 'CV_ERROR',
      },
      note: 'Fell back to stub-heuristic after CV failure; draft still needs review',
    });
    return result;
  }
}

async function runWithFallback(from, input, reason) {
  console.warn('[engine]', from, 'unavailable, try cv then stub:', reason);
  try {
    const result = await cv.run(input);
    result.meta = Object.assign({}, result.meta, {
      fallback: { from, reason, via: cv.ENGINE_ID },
    });
    return result;
  } catch (e2) {
    const result = await stub.run(input);
    result.meta = Object.assign({}, result.meta, {
      engine: stub.ENGINE_ID,
      warning: WARNING,
      fallback: { from, reason, then: e2.message || String(e2), via: stub.ENGINE_ID },
      note: 'Fell back to stub-heuristic; draft still needs review',
    });
    return result;
  }
}

module.exports = {
  runEngine,
  ENGINE_ID: activeEngineId(),
  preferredEngine,
  WARNING,
};
