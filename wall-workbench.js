/* 可校准临摹工作台 — 墙体几何 / 比例尺 / 房间环（纯前端，无构建）
 * 坐标系与 editor 一致：毫米 (mm)。
 *
 * 墙体 schema（兼容扩展）：
 * - 旧版正交 AABB 体矩形：[x0,y0,x1,y1,kind]
 *   x0<x1, y0<y1；短边≈厚度，长边为走向。样板与已存档仍用此格式。
 * - 中心线 + 厚度（支持斜墙）：[x0,y0,x1,y1,kind,thick]
 *   (x0,y0)-(x1,y1) 为中心线端点；thick 为墙厚 mm。第 6 元为数字即中心线格式。
 * kind: b=承重 e=外墙 n=非承重 low=矮墙
 *
 * 新画的墙一律写中心线格式；读入时旧 AABB 原样保留，通过 wallCenterline / wallPolygon 统一消费。
 */
(function (global) {
  'use strict';

  const DEFAULT_THICK = 240;
  const GRID = 50;
  const ANGLE_SNAP_DEG = 15;
  const CORNER_JOIN_TOL = 80; // 共享角点判定（mm）

  function cloneWalls(ws) { return (ws || []).map(w => w.slice()); }
  function cloneRooms(rs) {
    return (rs || []).map(r => Object.assign({}, r, { poly: r.poly.map(p => p.slice()), at: r.at ? r.at.slice() : null }));
  }

  function snap(v, g) { return Math.round(v / g) * g; }

  function isCenterlineWall(w) {
    return Array.isArray(w) && w.length >= 6 && typeof w[5] === 'number' && w[5] > 0;
  }

  function wallKind(w) { return (w && w[4]) || 'n'; }

  function wallThickOf(w, fallback) {
    if (isCenterlineWall(w)) return w[5];
    if (!w) return fallback || DEFAULT_THICK;
    const bw = Math.abs(w[2] - w[0]), bh = Math.abs(w[3] - w[1]);
    const t = Math.min(bw, bh);
    return t > 0 ? t : (fallback || DEFAULT_THICK);
  }

  /** 统一取中心线两端（旧 AABB → 沿长边中线） */
  function wallCenterline(w) {
    if (isCenterlineWall(w)) {
      return { a: { x: w[0], y: w[1] }, b: { x: w[2], y: w[3] } };
    }
    const x0 = Math.min(w[0], w[2]), x1 = Math.max(w[0], w[2]);
    const y0 = Math.min(w[1], w[3]), y1 = Math.max(w[1], w[3]);
    const bw = x1 - x0, bh = y1 - y0;
    if (bw >= bh) {
      const y = (y0 + y1) / 2;
      return { a: { x: x0, y: y }, b: { x: x1, y: y } };
    }
    const x = (x0 + x1) / 2;
    return { a: { x: x, y: y0 }, b: { x: x, y: y1 } };
  }

  function wallSegLen(w) {
    const cl = wallCenterline(w);
    return Math.hypot(cl.b.x - cl.a.x, cl.b.y - cl.a.y);
  }

  function wallIsHorizontal(w) {
    const cl = wallCenterline(w);
    return Math.abs(cl.b.x - cl.a.x) >= Math.abs(cl.b.y - cl.a.y);
  }

  /** 厚度挤出的四边形（用于 2D 绘制 / 栅格涂墙） */
  function wallPolygon(w) {
    const cl = wallCenterline(w);
    const thick = wallThickOf(w);
    const dx = cl.b.x - cl.a.x, dy = cl.b.y - cl.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (thick / 2), ny = (dx / len) * (thick / 2);
    return [
      [cl.a.x + nx, cl.a.y + ny],
      [cl.b.x + nx, cl.b.y + ny],
      [cl.b.x - nx, cl.b.y - ny],
      [cl.a.x - nx, cl.a.y - ny]
    ];
  }

  function wallAABB(w) {
    if (!isCenterlineWall(w)) {
      return [
        Math.min(w[0], w[2]), Math.min(w[1], w[3]),
        Math.max(w[0], w[2]), Math.max(w[1], w[3])
      ];
    }
    const poly = wallPolygon(w);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    poly.forEach(p => {
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    });
    return [x0, y0, x1, y1];
  }

  /** 两点 + 真实长度 → 比例因子（真实 mm / 当前世界距离） */
  function calibFactor(a, b, realMm) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(d > 1) || !(realMm > 0)) return null;
    return { factor: realMm / d, worldMm: d, realMm: +realMm, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
  }

  /**
   * 建筑面积反推比例：已知当前墙网/底图世界面积（mm²）与目标建筑面积（㎡）
   * 返回缩放因子；原点由调用方定（通常取标定两点中点或外接矩形中心）。
   */
  function calibFactorFromArea(worldAreaMm2, areaM2) {
    if (!(worldAreaMm2 > 1) || !(areaM2 > 0)) return null;
    const targetMm2 = areaM2 * 1e6;
    const f = Math.sqrt(targetMm2 / worldAreaMm2);
    if (!(f > 0) || !isFinite(f)) return null;
    return { factor: f, worldAreaMm2: worldAreaMm2, areaM2: +areaM2, mode: 'area' };
  }

  /** 多边形世界面积 mm²（有向绝对值） */
  function polyAreaMm2(poly) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  }

  /** 绕锚点缩放点 */
  function scalePoint(p, origin, f) {
    return [origin.x + (p[0] - origin.x) * f, origin.y + (p[1] - origin.y) * f];
  }

  function scaleWalls(walls, origin, f) {
    return walls.map(w => {
      if (isCenterlineWall(w)) {
        const p0 = scalePoint([w[0], w[1]], origin, f);
        const p1 = scalePoint([w[2], w[3]], origin, f);
        return [p0[0], p0[1], p1[0], p1[1], w[4] || 'n', Math.max(40, (w[5] || DEFAULT_THICK) * f)];
      }
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

  /**
   * 由中心线两点生成墙段。始终写中心线格式（含 thick），支持斜墙。
   * 正交 AABB 不再作为写入格式。
   */
  function wallFromSegment(x0, y0, x1, y1, thick, kind) {
    thick = thick || DEFAULT_THICK;
    kind = kind || 'n';
    const dx = x1 - x0, dy = y1 - y0;
    if (Math.hypot(dx, dy) < thick * 0.35) return null;
    return [x0, y0, x1, y1, kind, thick];
  }

  /** @deprecated 保留别名：历史调用 orthoSnap；现由 angleSnapPoint 替代 */
  function orthoSnap(a, b) {
    return angleSnapPoint(a, b, 90, true);
  }

  /**
   * 角度磁吸：将 b 投影到以 a 为原点、stepDeg 步进的射线，保持长度。
   * enabled=false 时原样返回 b（可再被网格吸附）。
   */
  function angleSnapPoint(a, b, stepDeg, enabled) {
    if (!enabled) return { x: b.x, y: b.y };
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return { x: b.x, y: b.y };
    const step = ((stepDeg == null ? ANGLE_SNAP_DEG : stepDeg) * Math.PI) / 180;
    if (!(step > 0)) return { x: b.x, y: b.y };
    const ang = Math.atan2(dy, dx);
    const snapped = Math.round(ang / step) * step;
    return { x: a.x + Math.cos(snapped) * len, y: a.y + Math.sin(snapped) * len };
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
    return polyAreaMm2(poly) / 1e6;
  }

  function bboxOfWalls(walls) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    (walls || []).forEach(w => {
      const bb = wallAABB(w);
      x0 = Math.min(x0, bb[0]); y0 = Math.min(y0, bb[1]);
      x1 = Math.max(x1, bb[2]); y1 = Math.max(y1, bb[3]);
    });
    if (!isFinite(x0)) return { x: -1850, y: -1750, w: 15600, h: 14100 };
    const pad = 800;
    return { x: x0 - pad, y: y0 - pad, w: (x1 - x0) + pad * 2, h: (y1 - y0) + pad * 2 };
  }

  /** 点到线段距离 */
  function distPointSeg(pt, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    if (L2 < 1e-9) return Math.hypot(pt.x - a.x, pt.y - a.y);
    let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
  }

  /** 点到墙表面距离（墙内为 0）；兼容 AABB 与中心线 */
  function distToWall(pt, w) {
    const cl = wallCenterline(w);
    const half = wallThickOf(w) / 2;
    return Math.max(0, distPointSeg(pt, cl.a, cl.b) - half);
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

  /**
   * 找墙角：返回 { wallIndex, end:0|1, pt } 或 null
   */
  function findWallCorner(walls, pt, tol) {
    tol = tol == null ? 140 : tol;
    let best = null, bestD = tol;
    (walls || []).forEach((w, i) => {
      const cl = wallCenterline(w);
      [[0, cl.a], [1, cl.b]].forEach(([end, p]) => {
        const d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d < bestD) { bestD = d; best = { wallIndex: i, end: end, pt: { x: p.x, y: p.y } }; }
      });
    });
    return best;
  }

  /**
   * 移动墙角；同坐标（容差内）的相邻墙角一并移动。
   * walls 就地修改，返回受影响的索引列表。
   */
  function moveSharedCorner(walls, wallIndex, end, newPt, joinTol) {
    joinTol = joinTol == null ? CORNER_JOIN_TOL : joinTol;
    if (!walls || !walls[wallIndex]) return [];
    const cl0 = wallCenterline(walls[wallIndex]);
    const old = end === 0 ? cl0.a : cl0.b;
    const nx = newPt.x, ny = newPt.y;
    const touched = [];
    walls.forEach((w, i) => {
      const cl = wallCenterline(w);
      let changed = false;
      let ax = cl.a.x, ay = cl.a.y, bx = cl.b.x, by = cl.b.y;
      if (Math.hypot(ax - old.x, ay - old.y) <= joinTol) { ax = nx; ay = ny; changed = true; }
      if (Math.hypot(bx - old.x, by - old.y) <= joinTol) { bx = nx; by = ny; changed = true; }
      if (!changed) return;
      touched.push(i);
      const kind = wallKind(w);
      const thick = wallThickOf(w);
      if (isCenterlineWall(w)) {
        walls[i] = [ax, ay, bx, by, kind, thick];
      } else {
        // 旧 AABB：仅当仍接近正交时写回 AABB；否则升级为中心线，避免 silently 掰回正交
        const nearlyOrtho = Math.min(Math.abs(ax - bx), Math.abs(ay - by)) < 1e-3
          || Math.abs(Math.abs(ax - bx) < 1 ? Math.PI / 2 : Math.atan2(by - ay, bx - ax)) % (Math.PI / 2) < 0.02
          || Math.abs((Math.atan2(by - ay, bx - ax) % (Math.PI / 2))) < 0.02;
        const ang = Math.atan2(by - ay, bx - ax);
        const mod = Math.abs(ang % (Math.PI / 2));
        const ortho = Math.min(mod, Math.PI / 2 - mod) < 0.05;
        if (ortho) {
          // 保持 AABB 体矩形
          if (Math.abs(bx - ax) >= Math.abs(by - ay)) {
            const y = (ay + by) / 2;
            walls[i] = [Math.min(ax, bx), y - thick / 2, Math.max(ax, bx), y + thick / 2, kind];
          } else {
            const x = (ax + bx) / 2;
            walls[i] = [x - thick / 2, Math.min(ay, by), x + thick / 2, Math.max(ay, by), kind];
          }
        } else {
          walls[i] = [ax, ay, bx, by, kind, thick];
        }
      }
    });
    return touched;
  }

  /**
   * 轴对齐 / 斜墙 → 简易房间检测（栅格洪水填充）
   * 斜墙按厚度多边形涂进栅格，不再 silently 正交化。
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
    const G = new Uint8Array(cols * rows);
    const ix = (x) => Math.max(0, Math.min(cols - 1, Math.floor((x - bb.x) / cell)));
    const iy = (y) => Math.max(0, Math.min(rows - 1, Math.floor((y - bb.y) / cell)));
    const at = (c, r) => r * cols + c;

    function paintSeg(a, b, halfCells) {
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell * 0.4)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const c0 = ix(x), r0 = iy(y);
        for (let dr = -halfCells; dr <= halfCells; dr++) {
          for (let dc = -halfCells; dc <= halfCells; dc++) {
            const c = c0 + dc, r = r0 + dr;
            if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
            G[at(c, r)] = 1;
          }
        }
      }
    }

    walls.forEach(w => {
      const cl = wallCenterline(w);
      const half = Math.max(0, Math.ceil((wallThickOf(w) / 2) / cell));
      paintSeg(cl.a, cl.b, half);
      // 也把四边形顶点连边涂一遍，减少斜墙缝隙
      const poly = wallPolygon(w);
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        paintSeg({ x: p[0], y: p[1] }, { x: q[0], y: q[1] }, 0);
      }
    });

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
        const area = polyAreaM2(poly);
        if (area < minArea) continue;
        const id = 'room' + rooms.length;
        const name = '房间 ' + (rooms.length + 1);
        rooms.push({ id, name, poly, mat, at: centroid(poly), counted: true });
      }
    }

    if (!rooms.length) {
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

  function scalePlacement(pl, origin, f) {
    return {
      x: origin.x + (pl.x - origin.x) * f,
      y: origin.y + (pl.y - origin.y) * f,
      w: pl.w * f,
      h: pl.h * f
    };
  }

  function refPlacement(imgW, imgH, calib, bounds) {
    if (calib && calib.placement) {
      return {
        x: calib.placement.x, y: calib.placement.y,
        w: calib.placement.w, h: calib.placement.h
      };
    }
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

  /**
   * 在墙上放置门：默认净宽 900mm。斜墙时沿中心线方向开洞。
   */
  function makeDoorOnWall(wall, pt, asEntry) {
    const cl = wallCenterline(wall);
    const dx = cl.b.x - cl.a.x, dy = cl.b.y - cl.a.y;
    const Lseg = Math.hypot(dx, dy) || 1;
    const tx = dx / Lseg, ty = dy / Lseg;
    const nx = -ty, ny = tx;
    const thick = wallThickOf(wall);
    let len = 900;
    // 投影到中心线
    let t = ((pt.x - cl.a.x) * tx + (pt.y - cl.a.y) * ty);
    t = Math.max(len / 2, Math.min(Lseg - len / 2, t));
    if (Lseg < len + 40) { len = Math.max(600, Lseg - 40); t = Lseg / 2; }
    const cx = cl.a.x + tx * t, cy = cl.a.y + ty * t;
    const hx = cx - tx * (len / 2), hy = cy - ty * (len / 2);
    const halfT = thick / 2;
    const rect = [
      Math.min(hx - nx * halfT, hx + tx * len - nx * halfT, hx + nx * halfT, hx + tx * len + nx * halfT),
      Math.min(hy - ny * halfT, hy + ty * len - ny * halfT, hy + ny * halfT, hy + ty * len + ny * halfT),
      Math.max(hx - nx * halfT, hx + tx * len - nx * halfT, hx + nx * halfT, hx + tx * len + nx * halfT),
      Math.max(hy - ny * halfT, hy + ty * len - ny * halfT, hy + ny * halfT, hy + ty * len + ny * halfT)
    ];
    // 正交墙保持旧 rect 精度（与历史样板一致）
    if (!isCenterlineWall(wall) && (Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6)) {
      const [x0, y0, x1, y1] = [Math.min(wall[0], wall[2]), Math.min(wall[1], wall[3]), Math.max(wall[0], wall[2]), Math.max(wall[1], wall[3])];
      if (Math.abs(dy) < 1e-6) {
        return {
          name: asEntry ? '入户门' : '门',
          rect: [cx - len / 2, y0, cx + len / 2, y1],
          h: [cx - len / 2, (y0 + y1) / 2],
          c: [1, 0], o: [0, 1], len: len, entry: !!asEntry
        };
      }
      return {
        name: asEntry ? '入户门' : '门',
        rect: [x0, cy - len / 2, x1, cy + len / 2],
        h: [(x0 + x1) / 2, cy + len / 2],
        c: [0, -1], o: [1, 0], len: len, entry: !!asEntry
      };
    }
    return {
      name: asEntry ? '入户门' : '门',
      rect: rect,
      h: [hx, hy],
      c: [tx, ty],
      o: [nx, ny],
      len: len,
      entry: !!asEntry
    };
  }

  function makeWinOnWall(wall, pt) {
    const cl = wallCenterline(wall);
    const dx = cl.b.x - cl.a.x, dy = cl.b.y - cl.a.y;
    const Lseg = Math.hypot(dx, dy) || 1;
    const tx = dx / Lseg, ty = dy / Lseg;
    const thick = wallThickOf(wall);
    let len = 1200;
    let t = ((pt.x - cl.a.x) * tx + (pt.y - cl.a.y) * ty);
    t = Math.max(len / 2, Math.min(Lseg - len / 2, t));
    if (Lseg < len + 40) { len = Math.max(400, Lseg - 40); t = Lseg / 2; }
    const cx = cl.a.x + tx * t, cy = cl.a.y + ty * t;
    if (!isCenterlineWall(wall) && (Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6)) {
      const [x0, y0, x1, y1] = [Math.min(wall[0], wall[2]), Math.min(wall[1], wall[3]), Math.max(wall[0], wall[2]), Math.max(wall[1], wall[3])];
      if (Math.abs(dy) < 1e-6) return [cx - len / 2, y0, cx + len / 2, y1];
      return [x0, cy - len / 2, x1, cy + len / 2];
    }
    const nx = -ty * (thick / 2), ny = tx * (thick / 2);
    const hx0 = cx - tx * (len / 2), hy0 = cy - ty * (len / 2);
    const hx1 = cx + tx * (len / 2), hy1 = cy + ty * (len / 2);
    return [
      Math.min(hx0 + nx, hx0 - nx, hx1 + nx, hx1 - nx),
      Math.min(hy0 + ny, hy0 - ny, hy1 + ny, hy1 - ny),
      Math.max(hx0 + nx, hx0 - nx, hx1 + nx, hx1 - nx),
      Math.max(hy0 + ny, hy0 - ny, hy1 + ny, hy1 - ny)
    ];
  }

  function packGeometry(walls, rooms, meta) {
    const out = {
      source: (meta && meta.source) || 'custom',
      wallThick: (meta && meta.wallThick) || DEFAULT_THICK,
      walls: cloneWalls(walls),
      rooms: cloneRooms(rooms),
      calib: meta && meta.calib ? Object.assign({}, meta.calib) : null,
      updatedAt: new Date().toISOString(),
      wallSchema: 'centerline-v1' // 文档标记；旧档无此字段仍可读
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
      } : null,
      wallSchema: g.wallSchema || null
    };
  }


  /**
   * 正交对齐：近水平/近竖直墙吸到 0°/90°，端点再吸网格；共享角点会自然重合。
   * @param {number[][]} walls
   * @param {number[]|null} indices  null/空 = 全部
   * @param {{ angTolDeg?: number, grid?: number }} opts
   * @returns {{ walls: number[][], changed: number }}
   */
  function alignWallsOrtho(walls, indices, opts) {
    opts = opts || {};
    const angTol = (opts.angTolDeg != null ? opts.angTolDeg : 12) * Math.PI / 180;
    const g = opts.grid != null ? opts.grid : GRID;
    const out = cloneWalls(walls);
    const set = indices && indices.length
      ? new Set(indices)
      : null;
    let changed = 0;
    out.forEach((w, i) => {
      if (set && !set.has(i)) return;
      const cl = wallCenterline(w);
      const dx = cl.b.x - cl.a.x, dy = cl.b.y - cl.a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) return;
      const ang = Math.atan2(dy, dx);
      const mod = ((ang % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
      const distOrtho = Math.min(mod, Math.PI / 2 - mod);
      if (distOrtho > angTol) return; // 斜墙保留
      const horiz = Math.abs(Math.cos(ang)) >= Math.abs(Math.sin(ang));
      let ax, ay, bx, by;
      if (horiz) {
        const y = snap((cl.a.y + cl.b.y) / 2, g);
        ax = snap(Math.min(cl.a.x, cl.b.x), g);
        bx = snap(Math.max(cl.a.x, cl.b.x), g);
        ay = by = y;
      } else {
        const x = snap((cl.a.x + cl.b.x) / 2, g);
        ay = snap(Math.min(cl.a.y, cl.b.y), g);
        by = snap(Math.max(cl.a.y, cl.b.y), g);
        ax = bx = x;
      }
      const kind = wallKind(w);
      const thick = wallThickOf(w);
      const next = [ax, ay, bx, by, kind, thick];
      const prev = out[i];
      if (prev[0] !== next[0] || prev[1] !== next[1] || prev[2] !== next[2] || prev[3] !== next[3] || !isCenterlineWall(prev)) {
        out[i] = next;
        changed++;
      }
    });
    // 第二遍：共享角点吸附（把接近的端点拉到同一网格点）
    const pts = [];
    out.forEach((w, i) => {
      if (set && !set.has(i)) return;
      const cl = wallCenterline(w);
      pts.push({ i, end: 0, x: cl.a.x, y: cl.a.y });
      pts.push({ i, end: 1, x: cl.b.x, y: cl.b.y });
    });
    const join = CORNER_JOIN_TOL;
    for (let a = 0; a < pts.length; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        const pa = pts[a], pb = pts[b];
        if (pa.i === pb.i) continue;
        if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= join) {
          const mx = snap((pa.x + pb.x) / 2, g);
          const my = snap((pa.y + pb.y) / 2, g);
          pa.x = pb.x = mx; pa.y = pb.y = my;
        }
      }
    }
    pts.forEach(p => {
      const w = out[p.i];
      const cl = wallCenterline(w);
      let ax = cl.a.x, ay = cl.a.y, bx = cl.b.x, by = cl.b.y;
      if (p.end === 0) { ax = p.x; ay = p.y; } else { bx = p.x; by = p.y; }
      out[p.i] = [ax, ay, bx, by, wallKind(w), wallThickOf(w)];
    });
    return { walls: out, changed };
  }

  /** 点选门/窗：返回 { type:'door'|'win'|'slide', index } 或 null */
  function findOpeningAt(openings, pt, tol) {
    tol = tol == null ? 140 : tol;
    let best = null, bestD = tol;
    const doors = (openings && openings.doors) || [];
    doors.forEach((d, i) => {
      const r = d.rect || d;
      if (!r || r.length < 4) return;
      const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
      const d0 = Math.hypot(pt.x - cx, pt.y - cy);
      if (d0 < bestD) { bestD = d0; best = { type: 'door', index: i }; }
    });
    const wins = (openings && openings.wins) || [];
    wins.forEach((w, i) => {
      const cx = (w[0] + w[2]) / 2, cy = (w[1] + w[3]) / 2;
      const d0 = Math.hypot(pt.x - cx, pt.y - cy);
      if (d0 < bestD) { bestD = d0; best = { type: 'win', index: i }; }
    });
    const slides = (openings && openings.slides) || [];
    slides.forEach((s, i) => {
      const r = s.rect || s;
      if (!r || r.length < 4) return;
      const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
      const d0 = Math.hypot(pt.x - cx, pt.y - cy);
      if (d0 < bestD) { bestD = d0; best = { type: 'slide', index: i }; }
    });
    return best;
  }

  global.WallWorkbench = {
    DEFAULT_THICK, GRID, ANGLE_SNAP_DEG, CORNER_JOIN_TOL,
    cloneWalls, cloneRooms,
    cloneWins, cloneDoors, cloneSlides,
    snap, calibFactor, calibFactorFromArea, polyAreaMm2,
    scaleWalls, scaleRooms, scaleFurniture, scalePoint,
    scaleRect4, scaleWins, scaleDoors, scaleSlides, scalePlacement,
    wallFromSegment, orthoSnap, angleSnapPoint,
    isCenterlineWall, wallThickOf, wallCenterline, wallPolygon, wallAABB, wallKind,
    centroid, polyAreaM2, bboxOfWalls,
    findRoomsFromWalls, refPlacement,
    distToWall, findWallIndex, findWallCorner, moveSharedCorner,
    alignWallsOrtho, findOpeningAt,
    wallIsHorizontal, wallSegLen,
    makeDoorOnWall, makeWinOnWall,
    packGeometry, unpackGeometry
  };
})(typeof window !== 'undefined' ? window : globalThis);
