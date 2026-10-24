/**
 * 引擎入口：ENGINE=cv|stub|external（默认 cv）
 * 降级链：external → cv(+semantic-post) → stub
 * SEMANTIC_POST 默认开（设 0/false/off 关闭）；在 cv/stub 结果上补房间名与门洞启发式。
 */
'use strict';

const stub = require('./stubHeuristic');
const cv = require('./cvHough');
const external = require('./external');
const semanticPost = require('./semanticPost');
const { WARNING } = require('./scale');

function preferredEngine() {
  const e = (process.env.ENGINE || 'cv').toLowerCase().trim();
  if (e === 'stub' || e === 'stub-heuristic' || e === 'stub-heuristic-v1') return 'stub';
  if (e === 'external' || e === 'ext') return 'external';
  return 'cv';
}

function maybePost(result) {
  if (!semanticPost.enabled()) return result;
  try {
    return semanticPost.applySemanticPost(result);
  } catch (e) {
    console.warn('[engine] semantic-post failed:', e.message || e);
    if (result && result.meta) {
      result.meta.semanticPostError = e.message || String(e);
    }
    return result;
  }
}

function activeEngineId() {
  const p = preferredEngine();
  if (p === 'stub') return stub.ENGINE_ID;
  if (p === 'external') return external.ENGINE_ID;
  const base = cv.ENGINE_ID;
  return semanticPost.enabled() ? base + '+' + semanticPost.POST_ID : base;
}

/**
 * @param {{ buffer: Buffer, mime?: string, scaleMmPerPx?: number, areaM2?: number }} input
 */
async function runEngine(input) {
  const pref = preferredEngine();

  if (pref === 'stub') {
    return maybePost(await stub.run(input));
  }

  if (pref === 'external') {
    if (!external.enabled()) {
      return runWithFallback('external', input, 'EXTERNAL_VECTORIZE_URL unset');
    }
    try {
      // external already carries rooms/doors when present — skip post unless empty
      const result = await external.run(input);
      const emptyRooms = !result.rooms || !result.rooms.length;
      const emptyDoors = !result.openings || !result.openings.doors || !result.openings.doors.length;
      if (semanticPost.enabled() && (emptyRooms || emptyDoors)) {
        return maybePost(result);
      }
      return result;
    } catch (e) {
      return runWithFallback('external', input, e.message || String(e));
    }
  }

  // default: cv
  try {
    return maybePost(await cv.run(input));
  } catch (e) {
    console.warn('[engine] cv failed, fallback stub:', e.message || e);
    const result = maybePost(await stub.run(input));
    result.meta = Object.assign({}, result.meta, {
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
    const result = maybePost(await cv.run(input));
    result.meta = Object.assign({}, result.meta, {
      fallback: { from, reason, via: result.meta && result.meta.engine },
    });
    return result;
  } catch (e2) {
    const result = maybePost(await stub.run(input));
    result.meta = Object.assign({}, result.meta, {
      warning: WARNING,
      fallback: { from, reason, then: e2.message || String(e2), via: result.meta && result.meta.engine },
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
