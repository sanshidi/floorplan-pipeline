/**
 * External semantic floorplan response normalizer.
 * Formats: native | xmarva | rasterscan | auto
 */
'use strict';

const {
  DEFAULT_THICK,
  WARNING,
  resolveScaleMmPerPx,
  wallsPxToMm,
  classifyKind,
} = require('./scale');

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function num(v, fallback) {
  const n = +v;
  return Number.isFinite(n) ? n : fallback;
}

function pointPair(obj) {
  if (!obj) return null;
  if (Array.isArray(obj) && obj.length >= 2) return { x: +obj[0], y: +obj[1] };
  if (typeof obj.x === 'number' || typeof obj.X === 'number') {
    return { x: +(obj.x != null ? obj.x : obj.X), y: +(obj.y != null ? obj.y : obj.Y) };
  }
  if (obj.start != null && obj.end != null) return null; // segment, not point
  return null;
}

function segmentFromAny(item) {
  if (!item) return null;
  if (Array.isArray(item) && item.length >= 4) {
    return {
      x0: +item[0], y0: +item[1], x1: +item[2], y1: +item[3],
      kind: typeof item[4] === 'string' ? item[4] : undefined,
      thick: typeof item[5] === 'number' ? item[5] : undefined,
    };
  }
  // native / rasterscan-ish
  if (item.x0 != null && item.y0 != null && item.x1 != null && item.y1 != null) {
    return {
      x0: +item.x0, y0: +item.y0, x1: +item.x1, y1: +item.y1,
      kind: item.kind || item.type, thick: item.thick || item.thickness,
    };
  }
  if (item.start && item.end) {
    const a = pointPair(item.start) || item.start;
    const b = pointPair(item.end) || item.end;
    if (a && b && a.x != null && b.x != null) {
      return {
        x0: +a.x, y0: +a.y, x1: +b.x, y1: +b.y,
        kind: item.kind || item.type || item.wall_type,
        thick: item.thick || item.thickness || item.width,
      };
    }
  }
  // position.start/end (xmarva)
  if (item.position && item.position.start && item.position.end) {
    const a = pointPair(item.position.start) || item.position.start;
    const b = pointPair(item.position.end) || item.position.end;
    if (a && b) {
      return {
        x0: +a.x, y0: +a.y, x1: +b.x, y1: +b.y,
        kind: item.kind || item.type, thick: item.thickness || item.width,
      };
    }
  }
  // p1/p2 or from/to
  const a = pointPair(item.p1 || item.from || item.a);
  const b = pointPair(item.p2 || item.to || item.b);
  if (a && b) {
    return {
      x0: a.x, y0: a.y, x1: b.x, y1: b.y,
      kind: item.kind || item.type, thick: item.thick || item.thickness,
    };
  }
  return null;
}

function detectFormat(data) {
  if (!isPlainObject(data) && !Array.isArray(data)) return 'unknown';
  if (data.detectionResults && (data.detectionResults.walls || data.detectionResults.Rooms)) {
    return 'xmarva';
  }
  if (data.format === 'xmarva' || data.source === 'xmarva') return 'xmarva';
  if (data.format === 'rasterscan' || data.source === 'rasterscan' || data.plan_recognition) {
    return 'rasterscan';
  }
  // RasterScan-ish: top-level walls as objects with start/end OR rooms with polygon
  if (Array.isArray(data.walls) && data.walls.length && isPlainObject(data.walls[0])
      && (data.walls[0].start || data.walls[0].position || data.walls[0].points)) {
    if (data.walls[0].position) return 'xmarva';
    return 'rasterscan';
  }
  if (data.result && (data.result.walls || data.result.rooms)) {
    // could be native wrapped
    if (data.result.detectionResults) return 'xmarva';
    return 'native';
  }
  if (Array.isArray(data.walls) || Array.isArray(data.wallsPx)) return 'native';
  if (data.rooms && data.doors && !data.walls) return 'rasterscan';
  return 'unknown';
}

function extractWallItems(data, format) {
  if (format === 'xmarva') {
    const dr = data.detectionResults || data;
    return dr.walls || dr.Walls || [];
  }
  if (format === 'rasterscan') {
    const root = data.plan_recognition || data.result || data;
    return root.walls || root.Walls || root.wall_list || [];
  }
  // native
  if (Array.isArray(data.walls)) return data.walls;
  if (Array.isArray(data.wallsPx)) return data.wallsPx.map(w => (Array.isArray(w) ? w : w));
  if (data.result && Array.isArray(data.result.walls)) return data.result.walls;
  if (data.result && Array.isArray(data.result.wallsPx)) return data.result.wallsPx;
  return [];
}

function extractRooms(data, format) {
  let raw = [];
  if (format === 'xmarva') {
    const dr = data.detectionResults || data;
    raw = dr.rooms || dr.Rooms || [];
  } else if (format === 'rasterscan') {
    const root = data.plan_recognition || data.result || data;
    raw = root.rooms || root.Rooms || root.room_list || [];
  } else {
    raw = data.rooms || (data.result && data.result.rooms) || [];
  }
  return (raw || []).map((r, i) => normalizeRoom(r, i)).filter(Boolean);
}

function normalizeRoom(r, i) {
  if (!r) return null;
  let poly = r.poly || r.polygon || r.points || r.contour || null;
  if (!poly && Array.isArray(r.corners)) {
    poly = r.corners.map(c => (Array.isArray(c) ? c : [c.x, c.y]));
  }
  if (!poly || !poly.length) return null;
  poly = poly.map(p => (Array.isArray(p) ? [+p[0], +p[1]] : [+p.x, +p.y]));
  const name = r.name || r.label || r.type || ('房间 ' + (i + 1));
  return {
    id: r.id || ('room' + i),
    name,
    poly,
    areaM2: r.areaM2 != null ? +r.areaM2 : (r.area != null ? +r.area : undefined),
    at: r.at || null,
    mat: r.mat || 'wood',
    counted: r.counted !== false,
  };
}

function extractOpenings(data, format) {
  let doors = [];
  let wins = [];
  if (format === 'xmarva') {
    const dr = data.detectionResults || data;
    doors = dr.doors || dr.Doors || [];
    wins = dr.windows || dr.Windows || dr.wins || [];
  } else if (format === 'rasterscan') {
    const root = data.plan_recognition || data.result || data;
    doors = root.doors || root.Doors || [];
    wins = root.windows || root.Windows || root.wins || [];
  } else {
    const o = data.openings || (data.result && data.result.openings) || {};
    doors = o.doors || data.doors || [];
    wins = o.wins || o.windows || data.windows || data.wins || [];
  }
  return {
    doors: (doors || []).map(normalizeDoor).filter(Boolean),
    wins: (wins || []).map(normalizeWin).filter(Boolean),
  };
}

function normalizeDoor(d) {
  if (!d) return null;
  if (d.rect && d.h && d.o && d.c) return d; // already native-ish
  const seg = segmentFromAny(d) || segmentFromAny(d.position) || segmentFromAny({
    start: d.start || d.p1, end: d.end || d.p2,
  });
  if (!seg) {
    if (d.x != null && d.y != null) {
      const half = (d.width || d.len || 900) / 2;
      return {
        name: d.name || (d.entry ? '入户门' : '门'),
        entry: !!d.entry,
        rect: [d.x - half, d.y - 100, d.x + half, d.y + 100],
        h: [d.x - half, d.y],
        len: half * 2,
        o: [1, 0],
        c: [0, 1],
      };
    }
    return null;
  }
  const len = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) || 900;
  const dx = (seg.x1 - seg.x0) / len, dy = (seg.y1 - seg.y0) / len;
  return {
    name: d.name || (d.entry || d.is_entrance ? '入户门' : '门'),
    entry: !!(d.entry || d.is_entrance),
    rect: [
      Math.min(seg.x0, seg.x1), Math.min(seg.y0, seg.y1) - 80,
      Math.max(seg.x0, seg.x1), Math.max(seg.y0, seg.y1) + 80,
    ],
    h: [seg.x0, seg.y0],
    len,
    o: [dx, dy],
    c: [-dy, dx],
  };
}

function normalizeWin(w) {
  if (!w) return null;
  if (Array.isArray(w) && w.length >= 4) return [+w[0], +w[1], +w[2], +w[3]];
  const seg = segmentFromAny(w) || segmentFromAny(w.position);
  if (!seg) return null;
  const pad = 60;
  return [
    Math.min(seg.x0, seg.x1) - (Math.abs(seg.y1 - seg.y0) > Math.abs(seg.x1 - seg.x0) ? pad : 0),
    Math.min(seg.y0, seg.y1) - (Math.abs(seg.x1 - seg.x0) >= Math.abs(seg.y1 - seg.y0) ? pad : 0),
    Math.max(seg.x0, seg.x1) + (Math.abs(seg.y1 - seg.y0) > Math.abs(seg.x1 - seg.x0) ? pad : 0),
    Math.max(seg.y0, seg.y1) + (Math.abs(seg.x1 - seg.x0) >= Math.abs(seg.y1 - seg.y0) ? pad : 0),
  ];
}

function resolveUnits(data, wallsRaw, pxW, pxH) {
  const u = (data.units || data.unit || (data.meta && data.meta.units) || '').toString().toLowerCase();
  if (u === 'mm' || u === 'millimeter' || u === 'millimetre') return 'mm';
  if (u === 'px' || u === 'pixel' || u === 'pixels') return 'px';
  if (data.wallsPx && !data.walls) return 'px';
  // heuristic: if coords exceed image size a lot → mm
  let maxC = 0;
  for (const item of wallsRaw.slice(0, 20)) {
    const s = segmentFromAny(item);
    if (!s) continue;
    maxC = Math.max(maxC, Math.abs(s.x0), Math.abs(s.y0), Math.abs(s.x1), Math.abs(s.y1));
  }
  if (maxC > Math.max(pxW, pxH) * 2.5) return 'mm';
  return 'px';
}

/**
 * @param {object} data raw external JSON
 * @param {{ format?: string, pxW: number, pxH: number, scaleMmPerPx?: number, areaM2?: number }} opts
 */
function normalizeExternal(data, opts) {
  opts = opts || {};
  const forced = (opts.format || process.env.EXTERNAL_FORMAT || 'auto').toLowerCase();
  let format = forced === 'auto' ? detectFormat(data) : forced;
  if (format === 'unknown' && forced === 'auto') {
    // last resort: try native extraction
    format = 'native';
  }

  const pxW = opts.pxW || 800;
  const pxH = opts.pxH || 600;
  const wallsRaw = extractWallItems(data, format);
  const units = resolveUnits(data, wallsRaw, pxW, pxH);
  const scale = resolveScaleMmPerPx(pxW, pxH, opts.scaleMmPerPx, opts.areaM2);

  const segs = wallsRaw.map(segmentFromAny).filter(Boolean);
  let walls;
  if (units === 'mm') {
    walls = segs.map(s => {
      const kind = s.kind || classifyKind(s.x0 / scale, s.y0 / scale, s.x1 / scale, s.y1 / scale, pxW, pxH);
      const thick = s.thick > 0 ? s.thick : DEFAULT_THICK;
      return [
        Math.round(s.x0 / 10) * 10,
        Math.round(s.y0 / 10) * 10,
        Math.round(s.x1 / 10) * 10,
        Math.round(s.y1 / 10) * 10,
        typeof kind === 'string' ? kind : 'n',
        thick,
      ];
    });
  } else {
    walls = wallsPxToMm(
      segs.map(s => [s.x0, s.y0, s.x1, s.y1]),
      pxW, pxH, scale
    );
    // preserve kind/thick from source when present
    segs.forEach((s, i) => {
      if (!walls[i]) return;
      if (typeof s.kind === 'string') walls[i][4] = s.kind;
      if (s.thick > 0) walls[i][5] = s.thick;
    });
  }

  walls = walls.filter(w => Math.hypot(w[2] - w[0], w[3] - w[1]) >= 40);
  if (!walls.length) {
    const err = new Error('normalized result has no walls (format=' + format + ')');
    err.code = 'EXTERNAL_EMPTY';
    throw err;
  }

  let rooms = extractRooms(data, format);
  let openings = extractOpenings(data, format);

  // scale rooms/openings if they were in px
  if (units === 'px') {
    rooms = rooms.map(r => ({
      ...r,
      poly: r.poly.map(([x, y]) => [x * scale, y * scale]),
      at: r.at ? [r.at[0] * scale, r.at[1] * scale] : null,
    }));
    openings = {
      doors: openings.doors.map(d => scaleDoor(d, scale)),
      wins: openings.wins.map(w => w.map(v => v * scale)),
    };
  }

  return {
    walls,
    openings,
    rooms,
    meta: {
      engine: 'external-v1',
      warning: WARNING,
      format,
      units,
      scaleMmPerPx: scale,
      imagePx: { width: pxW, height: pxH },
      wallCount: walls.length,
      roomCount: rooms.length,
      note: 'Normalized external semantic draft — must review manually',
    },
  };
}

function scaleDoor(d, s) {
  const out = Object.assign({}, d);
  if (out.rect) out.rect = out.rect.map(v => v * s);
  if (out.h) out.h = [out.h[0] * s, out.h[1] * s];
  if (out.len) out.len = out.len * s;
  return out;
}

module.exports = {
  normalizeExternal,
  detectFormat,
  segmentFromAny,
  extractWallItems,
};
