/* 可校准临摹工作台 — 墙体几何 / 比例尺 / 房间环（纯前端，无构建）
 * 坐标系与 editor 一致：毫米 (mm)。墙体沿用 AABB：[x0,y0,x1,y1,kind]
 * kind: b=承重 e=外墙 n=非承重 low=矮墙
 */
(function (global) {
  'use strict';

  const DEFAULT_THICK = 240;
  const GRID = 50; // 画墙吸附

  function cloneWalls(ws) { return ws.map(w => w.slice()); }
  function cloneRooms(rs) {
    return rs.map(r => Object.assign({}, r, { poly: r.poly.map(p => p.slice()), at: r.at ? r.at.slice() : null }));
  }

  function snap(v, g) { return Math.round(v / g) * g; }

  /** 两点 + 真实长度 → 比例因子（真实 mm / 当前世界距离） */
  function calibFactor(a, b, realMm) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(d > 1) || !(realMm > 0)) return null;
    return { factor: realMm / d, worldMm: d, realMm: +realMm, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
  }

  /** 绕锚点缩放点 */
  function scalePoint(p, origin, f) {
    return [origin.x + (p[0] - origin.x) * f, origin.y + (p[1] - origin.y) * f];
  }

  function scaleWalls(walls, origin, f) {
    return walls.map(w => {
      const p0 = scalePoint([w[0], w[1]], origin, f);
      const p1 = scalePoint([w[2], w[3]], origin, f);
      return [p0[0], p0[1], p1[0], p1[1], w[4] || 'n'];
    });
  }

  function scaleRooms(rooms, origin, f) {
    return rooms.map(r => {
      const poly = r.poly.map(p => scalePoint(p, origin, f));
      const at = r.at ? scalePoint(r.at, origin, f) : centroid(poly);
      return Object.assign({}, r, { poly, at });
    });
  }

  function scaleFurniture(list, origin, f) {
    return (list || []).map(item => {
      const o = Object.assign({}, item);
      o.cx = origin.x + (o.cx - origin.x) * f;
      o.cy = origin.y + (o.cy - origin.y) * f;
      o.w = Math.max(50, o.w * f);
      o.d = Math.max(50, o.d * f);
      return o;
    });
  }

  /** 正交墙：从中心线两点生成 AABB 墙体矩形 */
  function wallFromSegment(x0, y0, x1, y1, thick, kind) {
    thick = thick || DEFAULT_THICK;
    kind = kind || 'n';
    const dx = x1 - x0, dy = y1 - y0;
    if (Math.hypot(dx, dy) < thick * 0.5) return null;
    // 正交：主方向
    if (Math.abs(dx) >= Math.abs(dy)) {
      const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
      const y = (y0 + y1) / 2;
      return [xa, y - thick / 2, xb, y + thick / 2, kind];
    }
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const x = (x0 + x1) / 2;
    return [x - thick / 2, ya, x + thick / 2, yb, kind];
  }

  function orthoSnap(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: b.x, y: a.y };
    return { x: a.x, y: b.y };
  }

  function centroid(poly) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const c = p[0] * q[1] - q[0] * p[1];
      a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c;
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-6) {
      const sx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
      const sy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
      return [sx, sy];
    }
    return [cx / (6 * a), cy / (6 * a)];
  }

  function polyAreaM2(poly) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2 / 1e6;
  }

  function bboxOfWalls(walls) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    walls.forEach(w => {
      x0 = Math.min(x0, w[0], w[2]); y0 = Math.min(y0, w[1], w[3]);
      x1 = Math.max(x1, w[0], w[2]); y1 = Math.max(y1, w[1], w[3]);
    });
    if (!isFinite(x0)) return { x: -1850, y: -1750, w: 15600, h: 14100 };
    const pad = 800;
    return { x: x0 - pad, y: y0 - pad, w: (x1 - x0) + pad * 2, h: (y1 - y0) + pad * 2 };
  }

  /**
   * 轴对齐墙 → 简易房间检测（栅格洪水填充）
   * 返回 ROOMS 风格数组；失败时退回单一外轮廓房间。
   */
  function findRoomsFromWalls(walls, opts) {
    opts = opts || {};
    const cell = opts.cell || 200;
    const minArea = opts.minAreaM2 != null ? opts.minAreaM2 : 1.5;
    const mat = opts.defaultMat || 'wood';
    if (!walls || !walls.length) return [];

    const bb = bboxOfWalls(walls);
    const cols = Math.max(4, Math.ceil(bb.w / cell));
    const rows = Math.max(4, Math.ceil(bb.h / cell));
    // 0=空 1=墙 2+=房间标记
    const G = new Uint8Array(cols * rows);
    const ix = (x) => Math.max(0, Math.min(cols - 1, Math.floor((x - bb.x) / cell)));
    const iy = (y) => Math.max(0, Math.min(rows - 1, Math.floor((y - bb.y) / cell)));
    const at = (c, r) => r * cols + c;

    walls.forEach(w => {
      const c0 = ix(Math.min(w[0], w[2])), c1 = ix(Math.max(w[0], w[2]));
      const r0 = iy(Math.min(w[1], w[3])), r1 = iy(Math.max(w[1], w[3]));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) G[at(c, r)] = 1;
    });

    // 把边界一圈视为「室外」种子，先 flood 室外
    const outside = 255;
    const stack = [];
    function pushOut(c, r) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const i = at(c, r);
      if (G[i] !== 0) return;
      G[i] = outside;
      stack.push(c, r);
    }
    for (let c = 0; c < cols; c++) { pushOut(c, 0); pushOut(c, rows - 1); }
    for (let r = 0; r < rows; r++) { pushOut(0, r); pushOut(cols - 1, r); }
    while (stack.length) {
      const r = stack.pop(), c = stack.pop();
      pushOut(c + 1, r); pushOut(c - 1, r); pushOut(c, r + 1); pushOut(c, r - 1);
    }

    const rooms = [];
    let mark = 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (G[at(c, r)] !== 0) continue;
        // 新室内连通域
        const cells = [];
        const st = [c, r];
        G[at(c, r)] = mark;
        while (st.length) {
          const yy = st.pop(), xx = st.pop();
          cells.push([xx, yy]);
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
            const nc = xx + dx, nr = yy + dy;
            if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) return;
            const i = at(nc, nr);
            if (G[i] === 0) { G[i] = mark; st.push(nc, nr); }
          });
        }
        mark++;
        if (cells.length < 4) continue;
        // bbox 多边形（足够支撑面积与 3D 挤出；精细轮廓可后续增强）
        let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
        cells.forEach(([cc, rr]) => {
          minC = Math.min(minC, cc); maxC = Math.max(maxC, cc);
          minR = Math.min(minR, rr); maxR = Math.max(maxR, rr);
        });
        const x0 = bb.x + minC * cell;
        const y0 = bb.y + minR * cell;
        const x1 = bb.x + (maxC + 1) * cell;
        const y1 = bb.y + (maxR + 1) * cell;
        const poly = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        const a = polyAreaM2(poly);
        if (a < minArea) continue;
        const id = 'room' + rooms.length;
        const name = '房间 ' + (rooms.length + 1);
        rooms.push({ id, name, poly, mat, at: centroid(poly), counted: true });
      }
    }

    if (!rooms.length) {
      // 退回：墙体外接矩形作单室
      const inner = {
        x: bb.x + 400, y: bb.y + 400,
        w: Math.max(1000, bb.w - 800), h: Math.max(1000, bb.h - 800)
      };
      const poly = [[inner.x, inner.y], [inner.x + inner.w, inner.y],
        [inner.x + inner.w, inner.y + inner.h], [inner.x, inner.y + inner.h]];
      rooms.push({ id: 'custom1', name: '自定义空间', poly, mat, at: centroid(poly), counted: true });
    }
    return rooms;
  }

  function scaleRect4(r, origin, f) {
    const p0 = scalePoint([r[0], r[1]], origin, f);
    const p1 = scalePoint([r[2], r[3]], origin, f);
    return [p0[0], p0[1], p1[0], p1[1]];
  }

  function scaleWins(wins, origin, f) {
    return (wins || []).map(w => scaleRect4(w, origin, f));
  }

  function cloneWins(wins) { return (wins || []).map(w => w.slice()); }

  function cloneDoors(doors) {
    return (doors || []).map(d => Object.assign({}, d, {
      rect: d.rect.slice(),
      h: d.h.slice(),
      c: d.c.slice(),
      o: d.o.slice()
    }));
  }

  function scaleDoors(doors, origin, f) {
    return cloneDoors(doors).map(d => {
      d.rect = scaleRect4(d.rect, origin, f);
      d.h = scalePoint(d.h, origin, f);
      d.len = Math.max(1, d.len * f);
      return d;
    });
  }

  function cloneSlides(slides) {
    return (slides || []).map(s => Object.assign({}, s, { rect: s.rect.slice() }));
  }

  function scaleSlides(slides, origin, f) {
    return cloneSlides(slides).map(s => {
      s.rect = scaleRect4(s.rect, origin, f);
      return s;
    });
  }

  /** 参照底图 placement {x,y,w,h} 绕锚点等比缩放，与墙体锁定 */
  function scalePlacement(pl, origin, f) {
    return {
      x: origin.x + (pl.x - origin.x) * f,
      y: origin.y + (pl.y - origin.y) * f,
      w: pl.w * f,
      h: pl.h * f
    };
  }

  /** 参照底图：无标定时按 bounds 等比铺满；有 placement 时直接用 */
  function refPlacement(imgW, imgH, calib, bounds) {
    if (calib && calib.placement) {
      return {
        x: calib.placement.x, y: calib.placement.y,
        w: calib.placement.w, h: calib.placement.h
      };
    }
    // 无标定时铺满 bounds（等比 letterbox）
    if (!imgW || !imgH) {
      return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
    }
    const aspect = imgW / imgH;
    const boxAsp = bounds.w / bounds.h;
    let w, h, x, y;
    if (aspect > boxAsp) {
      w = bounds.w; h = w / aspect;
      x = bounds.x; y = bounds.y + (bounds.h - h) / 2;
    } else {
      h = bounds.h; w = h * aspect;
      y = bounds.y; x = bounds.x + (bounds.w - w) / 2;
    }
    return { x, y, w, h };
  }


  /** 点到 AABB 墙的距离（在墙内为 0） */
  function distToWall(pt, w) {
    const cx = Math.max(w[0], Math.min(pt.x, w[2]));
    const cy = Math.max(w[1], Math.min(pt.y, w[3]));
    return Math.hypot(pt.x - cx, pt.y - cy);
  }

  function findWallIndex(walls, pt, tol) {
    tol = tol == null ? 120 : tol;
    let best = -1, bestD = tol;
    (walls || []).forEach((w, i) => {
      const d = distToWall(pt, w);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function wallIsHorizontal(w) {
    return (w[2] - w[0]) >= (w[3] - w[1]);
  }

  /** 墙段沿长边的外沿长度（mm） */
  function wallSegLen(w) {
    return wallIsHorizontal(w) ? (w[2] - w[0]) : (w[3] - w[1]);
  }

  /**
   * 在墙上放置门：默认净宽 900mm。
   * asEntry=true 时标记入户门。
   */
  function makeDoorOnWall(wall, pt, asEntry) {
    const [x0, y0, x1, y1] = wall;
    const horiz = wallIsHorizontal(wall);
    const len = 900;
    if (horiz) {
      let cx = snap(pt.x, 10);
      const half = len / 2;
      cx = Math.max(x0 + half, Math.min(x1 - half, cx));
      if (x1 - x0 < len + 20) cx = (x0 + x1) / 2;
      const L = Math.min(len, Math.max(600, x1 - x0 - 40));
      const rect = [cx - L / 2, y0, cx + L / 2, y1];
      return {
        name: asEntry ? '入户门' : '门',
        rect: rect,
        h: [cx - L / 2, (y0 + y1) / 2],
        c: [1, 0],
        o: [0, 1],
        len: L,
        entry: !!asEntry
      };
    }
    let cy = snap(pt.y, 10);
    const half = len / 2;
    cy = Math.max(y0 + half, Math.min(y1 - half, cy));
    if (y1 - y0 < len + 20) cy = (y0 + y1) / 2;
    const L = Math.min(len, Math.max(600, y1 - y0 - 40));
    const rect = [x0, cy - L / 2, x1, cy + L / 2];
    return {
      name: asEntry ? '入户门' : '门',
      rect: rect,
      h: [(x0 + x1) / 2, cy + L / 2],
      c: [0, -1],
      o: [1, 0],
      len: L,
      entry: !!asEntry
    };
  }

  /** 在墙上放置窗：默认净宽 1200mm */
  function makeWinOnWall(wall, pt) {
    const [x0, y0, x1, y1] = wall;
    const horiz = wallIsHorizontal(wall);
    const len = 1200;
    if (horiz) {
      let cx = snap(pt.x, 10);
      const L = Math.min(len, Math.max(400, x1 - x0 - 40));
      cx = Math.max(x0 + L / 2, Math.min(x1 - L / 2, cx));
      return [cx - L / 2, y0, cx + L / 2, y1];
    }
    let cy = snap(pt.y, 10);
    const L = Math.min(len, Math.max(400, y1 - y0 - 40));
    cy = Math.max(y0 + L / 2, Math.min(y1 - L / 2, cy));
    return [x0, cy - L / 2, x1, cy + L / 2];
  }

  /** 序列化进 huxing-design-v1 / pipeline */
  function packGeometry(walls, rooms, meta) {
    const out = {
      source: (meta && meta.source) || 'custom',
      wallThick: (meta && meta.wallThick) || DEFAULT_THICK,
      walls: cloneWalls(walls),
      rooms: cloneRooms(rooms),
      calib: meta && meta.calib ? Object.assign({}, meta.calib) : null,
      updatedAt: new Date().toISOString()
    };
    if (meta && meta.openings) {
      out.openings = {
        wins: cloneWins(meta.openings.wins),
        doors: cloneDoors(meta.openings.doors),
        slides: cloneSlides(meta.openings.slides),
        bayLintels: cloneWins(meta.openings.bayLintels || [])
      };
    }
    if (meta && meta.refPlacement) {
      out.refPlacement = {
        x: meta.refPlacement.x, y: meta.refPlacement.y,
        w: meta.refPlacement.w, h: meta.refPlacement.h
      };
    }
    return out;
  }

  function unpackGeometry(g) {
    // 允许空墙（空白临摹）
    if (!g || !Array.isArray(g.walls)) return null;
    return {
      walls: cloneWalls(g.walls),
      rooms: Array.isArray(g.rooms) ? cloneRooms(g.rooms) : [],
      source: g.source || 'custom',
      wallThick: g.wallThick || DEFAULT_THICK,
      calib: g.calib || null,
      openings: g.openings ? {
        wins: cloneWins(g.openings.wins),
        doors: cloneDoors(g.openings.doors),
        slides: cloneSlides(g.openings.slides),
        bayLintels: cloneWins(g.openings.bayLintels || [])
      } : null,
      refPlacement: g.refPlacement ? {
        x: g.refPlacement.x, y: g.refPlacement.y,
        w: g.refPlacement.w, h: g.refPlacement.h
      } : null
    };
  }

  global.WallWorkbench = {
    DEFAULT_THICK, GRID,
    cloneWalls, cloneRooms,
    cloneWins, cloneDoors, cloneSlides,
    snap, calibFactor,
    scaleWalls, scaleRooms, scaleFurniture, scalePoint,
    scaleRect4, scaleWins, scaleDoors, scaleSlides, scalePlacement,
    wallFromSegment, orthoSnap,
    centroid, polyAreaM2, bboxOfWalls,
    findRoomsFromWalls, refPlacement,
    distToWall, findWallIndex, wallIsHorizontal, wallSegLen,
    makeDoorOnWall, makeWinOnWall,
    packGeometry, unpackGeometry
  };
})(typeof window !== 'undefined' ? window : globalThis);
