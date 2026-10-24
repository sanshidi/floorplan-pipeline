/**
 * Local semantic post-process on CV/stub walls (no external key).
 * - Room rings via wall-workbench findRoomsFromWalls
 * - Temporary Chinese room names by area rank
 * - Heuristic door openings at wall gaps along shared edges
 * meta.engine becomes e.g. cv-hough-v1+semantic-post-v1
 */
'use strict';

const path = require('path');
const { WARNING } = require('./scale');

const POST_ID = 'semantic-post-v1';

const ROOM_NAMES = ['客厅', '卧室', '次卧', '书房', '厨房', '卫生间', '阳台', '储物', '餐厅', '衣帽间'];

function loadWorkbench() {
  // wall-workbench attaches to globalThis
  const wwPath = path.join(__dirname, '..', '..', '..', 'wall-workbench.js');
  require(wwPath);
  const ww = globalThis.WallWorkbench;
  if (!ww || typeof ww.findRoomsFromWalls !== 'function') {
    throw new Error('WallWorkbench.findRoomsFromWalls unavailable');
  }
  return ww;
}

function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(a) / 2;
}

function centroid(poly) {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}

function nameRooms(rooms) {
  const ranked = rooms.slice().sort((a, b) => (b.areaM2 || 0) - (a.areaM2 || 0));
  return ranked.map((r, i) => Object.assign({}, r, {
    id: r.id || ('r' + i),
    name: r.name && !/^房间\s*\d+$/.test(r.name) ? r.name : (ROOM_NAMES[i] || ('房间 ' + (i + 1))),
    at: r.at || centroid(r.poly),
    mat: r.mat || 'wood',
    counted: r.counted !== false,
  }));
}

/**
 * Find gaps along nearly-collinear wall endpoints that look like door openings (~0.7–1.2m).
 */
function guessDoorGaps(walls) {
  const pts = [];
  walls.forEach((w, wi) => {
    pts.push({ x: w[0], y: w[1], wi, end: 0 });
    pts.push({ x: w[2], y: w[3], wi, end: 1 });
  });
  const doors = [];
  const used = new Set();
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (pts[i].wi === pts[j].wi) continue;
      const key = [i, j].sort().join('-');
      if (used.has(key)) continue;
      const dx = pts[j].x - pts[i].x;
      const dy = pts[j].y - pts[i].y;
      const dist = Math.hypot(dx, dy);
      if (dist < 700 || dist > 1300) continue;
      // check walls are roughly collinear / same direction
      const wA = walls[pts[i].wi];
      const wB = walls[pts[j].wi];
      const ax = wA[2] - wA[0], ay = wA[3] - wA[1];
      const bx = wB[2] - wB[0], by = wB[3] - wB[1];
      const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
      const dot = Math.abs((ax * bx + ay * by) / (la * lb));
      if (dot < 0.85) continue;
      // gap direction should align with wall direction
      const gdot = Math.abs((dx * ax + dy * ay) / (dist * la));
      if (gdot < 0.85) continue;
      used.add(key);
      const ox = dx / dist, oy = dy / dist;
      doors.push({
        name: doors.length === 0 ? '入户门' : '门',
        entry: doors.length === 0,
        rect: [
          Math.min(pts[i].x, pts[j].x) - 40,
          Math.min(pts[i].y, pts[j].y) - 40,
          Math.max(pts[i].x, pts[j].x) + 40,
          Math.max(pts[i].y, pts[j].y) + 40,
        ],
        h: [pts[i].x, pts[i].y],
        len: dist,
        o: [ox, oy],
        c: [-oy, ox],
        _heuristic: true,
      });
    }
  }
  return doors.slice(0, 8);
}

function enabled() {
  const v = process.env.SEMANTIC_POST;
  if (v === undefined || v === '') return true; // default ON
  return !/^(0|false|off|no)$/i.test(String(v).trim());
}

/**
 * @param {{ walls, openings?, rooms?, meta? }} result
 */
function applySemanticPost(result) {
  if (!result || !Array.isArray(result.walls) || !result.walls.length) return result;
  const baseEngine = (result.meta && result.meta.engine) || 'unknown';
  let rooms = Array.isArray(result.rooms) ? result.rooms.slice() : [];
  let openings = result.openings || { doors: [], wins: [] };
  const notes = [];

  try {
    const ww = loadWorkbench();
    const found = ww.findRoomsFromWalls(result.walls) || [];
    if (found.length && (!rooms.length || rooms.length < found.length)) {
      rooms = found.map((r, i) => ({
        id: r.id || ('r' + i),
        name: r.name || ('房间 ' + (i + 1)),
        poly: r.poly,
        areaM2: r.areaM2 != null ? r.areaM2 : +(polyArea(r.poly) / 1e6).toFixed(2),
        at: r.at || centroid(r.poly),
        mat: r.mat || 'wood',
        counted: true,
      }));
      notes.push('rooms-from-rings:' + rooms.length);
    }
  } catch (e) {
    notes.push('rooms-skip:' + (e.message || e));
  }

  rooms = nameRooms(rooms);

  const hasDoors = openings.doors && openings.doors.length;
  if (!hasDoors) {
    const guessed = guessDoorGaps(result.walls);
    if (guessed.length) {
      openings = {
        doors: guessed,
        wins: openings.wins || [],
      };
      notes.push('doors-heuristic:' + guessed.length);
    }
  }

  return {
    walls: result.walls,
    openings,
    rooms,
    meta: Object.assign({}, result.meta || {}, {
      engine: baseEngine + '+' + POST_ID,
      warning: WARNING,
      semanticPost: {
        id: POST_ID,
        notes,
        roomCount: rooms.length,
        doorCount: (openings.doors || []).length,
      },
      note: (result.meta && result.meta.note ? result.meta.note + '; ' : '')
        + 'semantic-post heuristic rooms/doors — draft must be reviewed',
    }),
  };
}

module.exports = {
  applySemanticPost,
  enabled,
  POST_ID,
  guessDoorGaps,
  nameRooms,
};
