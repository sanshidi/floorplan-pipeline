/* 户型生成工作台 — 向导逻辑（纯前端） */
(() => {
  const STORE = 'floorplan-pipeline-v1';
  const STEPS = [
    { id: 'upload', n: '1', t: '上传图纸' },
    { id: 'rooms', n: '2', t: '起步方式' },
    { id: 'materials', n: '3', t: '选材质' },
    { id: 'design', n: '4', t: '临摹设计' },
    { id: 'export', n: '5', t: '造价导出' },
  ];

  // floorplan-3d 样板房间（与 editor 内 ROOMS 对齐）
  const ROOM_OPTIONS = [
    { id: 'master', name: '主卧室' },
    { id: 'mbath', name: '主卫浴' },
    { id: 'kid', name: '小孩房' },
    { id: 'gbath', name: '客卫浴' },
    { id: 'laundry', name: '洗衣阳台' },
    { id: 'child', name: '子女房' },
    { id: 'kitchen', name: '厨房' },
    { id: 'dining', name: '餐厅' },
    { id: 'hall', name: '过道' },
    { id: 'living', name: '客厅' },
    { id: 'balcony', name: '休闲阳台' },
  ];

  // OpenPlan3D + floorplan-3d 地面（id 与 editor MATS 一致）
  const FLOOR_MATS = [
    { id: 'wood', name: '橡木地板', sw: '#d8b88a', price: 320, src: 'floorplan-3d' },
    { id: 'walnut', name: '胡桃木地板', sw: '#9b7250', price: 380, src: 'floorplan-3d' },
    { id: 'bamboo', name: '竹地板', sw: '#e6d3a7', price: 280, src: 'OpenPlan3D' },
    { id: 'laminate', name: '强化复合地板', sw: '#b8a082', price: 180, src: 'OpenPlan3D' },
    { id: 'tile800', name: '800 地砖', sw: '#ebe6dc', price: 220, src: 'floorplan-3d' },
    { id: 'tile600', name: '600 地砖', sw: '#dfe3e1', price: 160, src: 'floorplan-3d' },
    { id: 'whiteTile', name: '白瓷砖', sw: '#f8f8f8', price: 150, src: 'OpenPlan3D' },
    { id: 'grayTile', name: '灰瓷砖', sw: '#d4cfc9', price: 150, src: 'OpenPlan3D' },
    { id: 'porcelain', name: '抛光瓷砖', sw: '#f5f5f5', price: 260, src: 'OpenPlan3D' },
    { id: 'marble', name: '大理石', sw: '#f1eee8', price: 650, src: 'floorplan-3d' },
    { id: 'whiteMarble', name: '白大理石', sw: '#f8f6f0', price: 720, src: 'OpenPlan3D' },
    { id: 'darkMarble', name: '深色大理石', sw: '#4a4a4a', price: 780, src: 'OpenPlan3D' },
    { id: 'terrazzo', name: '水磨石', sw: '#e6dfd3', price: 280, src: 'floorplan-3d' },
    { id: 'antislip', name: '300 防滑砖', sw: '#d3d8d4', price: 140, src: 'floorplan-3d' },
    { id: 'carpet', name: '满铺地毯', sw: '#c9c3d3', price: 200, src: 'floorplan-3d' },
    { id: 'beigeCarpet', name: '米色地毯', sw: '#d2b48c', price: 190, src: 'OpenPlan3D' },
    { id: 'grayCarpet', name: '灰色地毯', sw: '#a8a29e', price: 190, src: 'OpenPlan3D' },
    { id: 'concrete', name: '混凝土', sw: '#9ca3af', price: 120, src: 'OpenPlan3D' },
    { id: 'slate', name: '石板', sw: '#708090', price: 340, src: 'OpenPlan3D' },
    { id: 'vinyl', name: '乙烯基地板', sw: '#c4a882', price: 110, src: 'OpenPlan3D' },
    { id: 'solid', name: '纯色地面', sw: '#e8e4dc', price: 80, src: 'OpenPlan3D' },
  ];

  const WALL_FINISHES = [
    { id: 'white', name: '白色墙漆', color: '#ffffff' },
    { id: 'cream', name: '奶油色', color: '#fffdd0' },
    { id: 'warm-white', name: '暖白', color: '#faf7f2' },
    { id: 'light-gray', name: '浅灰', color: '#d1d5db' },
    { id: 'medium-gray', name: '中灰', color: '#9ca3af' },
    { id: 'charcoal', name: '炭灰', color: '#374151' },
    { id: 'navy-blue', name: '藏青', color: '#1e3a8a' },
    { id: 'light-blue', name: '浅蓝', color: '#dbeafe' },
    { id: 'sage-green', name: '鼠尾草绿', color: '#d4e2d4' },
    { id: 'olive', name: '橄榄绿', color: '#a3a058' },
    { id: 'terracotta', name: '陶土色', color: '#d2691e' },
    { id: 'blush-pink', name: '腮红粉', color: '#f4c2c2' },
    { id: 'lavender', name: '薰衣草紫', color: '#e6e6fa' },
    { id: 'butter-yellow', name: '黄油黄', color: '#fff8dc' },
    { id: 'taupe', name: '灰褐', color: '#b8a082' },
    { id: 'red-brick', name: '红砖', color: '#8B4513' },
    { id: 'exposed-brick', name: '裸砖', color: '#A0522D' },
    { id: 'stone', name: '石材墙', color: '#808080' },
    { id: 'wood-panel', name: '木饰面', color: '#8B6914' },
    { id: 'concrete-block', name: '混凝土砌块', color: '#999999' },
    { id: 'subway-tile', name: '地铁砖', color: '#F0F0F0' },
  ];

  const defaultState = () => ({
    version: 1,
    step: 'upload',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    imageDataUrl: null,
    imageName: null,
    imageSize: null,
    refOpacity: 35,
    refVisible: true,
    template: 'sample-3br',
    selectedRooms: ROOM_OPTIONS.map(r => r.id),
    floorMat: 'wood',
    wallFinish: 'warm-white',
    clearFurniture: false,
    applyOnOpen: false,
    startMode: 'trace', // trace | template — 有图时默认临摹
  });

  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) {
      return defaultState();
    }
  }

  function save(patch) {
    const next = Object.assign(load(), patch || {}, { updatedAt: new Date().toISOString() });
    localStorage.setItem(STORE, JSON.stringify(next));
    return next;
  }

  let state = load();

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  function renderNav() {
    const nav = $('#stepNav');
    nav.innerHTML = STEPS.map(s => `
      <button type="button" class="step-tab ${state.step === s.id ? 'active' : ''}" data-goto="${s.id}">
        <span class="n">${s.n}</span><span class="t">${s.t}</span>
      </button>`).join('');
  }

  function showStep(id) {
    if (!STEPS.some(s => s.id === id)) id = 'upload';
    state = save({ step: id });
    $$('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== id));
    renderNav();
    if (id === 'export') renderExport();
    if (id === 'design') {
      // auto-load editor once when entering
      const frame = $('#editorFrame');
      if (frame && (!frame.src || frame.src === 'about:blank' || frame.dataset.loaded !== '1')) {
        openEditor(false);
      }
    }
    history.replaceState(null, '', '#' + id);
  }

  function renderTemplates() {
    const mode = state.startMode || (state.imageDataUrl ? 'trace' : 'template');
    $('#templateCards').innerHTML = `
      <label class="card ${mode === 'trace' ? 'on' : ''}">
        <input type="radio" name="startMode" value="trace" ${mode === 'trace' ? 'checked' : ''}>
        <div class="title">按我的图临摹</div>
        <div class="desc">进入设计器后清空样板墙，对着你的底图标定、画墙、放门窗。上传图纸时推荐此项。</div>
        <span class="tag">推荐 · 有图纸</span>
      </label>
      <label class="card ${mode === 'template' ? 'on' : ''}">
        <input type="radio" name="startMode" value="template" ${mode === 'template' ? 'checked' : ''}>
        <div class="title">从样板开始</div>
        <div class="desc">加载内置三居室墙体 / 门窗，可试用布置与 3D；也可再改成与图纸一致。</div>
        <span class="tag">可拆非承重墙</span>
      </label>`;
  }

  function renderRooms() {
    const set = new Set(state.selectedRooms || []);
    $('#roomChips').innerHTML = ROOM_OPTIONS.map(r => `
      <button type="button" class="chip ${set.has(r.id) ? 'on' : ''}" data-room="${r.id}">${r.name}</button>
    `).join('');
  }

  function renderMats() {
    $('#floorChips').innerHTML = FLOOR_MATS.map(m => `
      <button type="button" class="chip ${state.floorMat === m.id ? 'on' : ''}" data-floor="${m.id}" title="约 ¥${m.price}/m²（含损耗另计）">
        <span class="swatch" style="background:${m.sw}"></span>${m.name}
        <span class="meta">¥${m.price}</span>
      </button>`).join('');
    $('#wallChips').innerHTML = WALL_FINISHES.map(w => `
      <button type="button" class="chip ${state.wallFinish === w.id ? 'on' : ''}" data-wall="${w.id}">
        <span class="swatch" style="background:${w.color}"></span>${w.name}
      </button>`).join('');
    $('#clearFurniture').checked = !!state.clearFurniture;
  }

  function renderUpload() {
    const box = $('#previewBox');
    const skip = $('#skipUploadRow');
    if (state.imageDataUrl) {
      box.classList.remove('hidden');
      skip.classList.add('hidden');
      $('#previewImg').src = state.imageDataUrl;
      const kb = state.imageSize ? (state.imageSize / 1024).toFixed(1) + ' KB' : '';
      $('#previewMeta').innerHTML = `<div><strong>${state.imageName || '已上传'}</strong></div><div>${kb}</div><div class="meta">已保存在本机浏览器</div>`;
    } else {
      box.classList.add('hidden');
      skip.classList.remove('hidden');
    }
  }

  function renderExport() {
    state = load();
    let design = null;
    try { design = JSON.parse(localStorage.getItem('huxing-design-v1')); } catch (e) {}
    const floor = FLOOR_MATS.find(m => m.id === state.floorMat);
    const wall = WALL_FINISHES.find(w => w.id === state.wallFinish);
    const furnCount = design?.furniture?.length ?? '—';
    const geom = design?.geometry;
    const geomSrc = geom?.source === 'custom' ? '自建临摹' : (geom ? '内置样板' : (state.geomSource === 'custom' ? '自建临摹' : '样板 / 未保存'));
    const roomN = Array.isArray(geom?.rooms) ? geom.rooms.length : (state.selectedRooms || []).length;
    const cal = geom?.calib?.realMm ? ('已标定') : (state.scaleCalib?.realMm ? '已标定' : '未标定');
    const title = design?.title || '—';
    $('#jobStats').innerHTML = `
      <div class="stat"><div class="k">方案名称</div><div class="v">${esc(title)}</div></div>
      <div class="stat"><div class="k">户型图</div><div class="v">${esc(state.imageName || '未上传（仅样板）')}</div></div>
      <div class="stat"><div class="k">墙体</div><div class="v">${geomSrc}</div></div>
      <div class="stat"><div class="k">比例</div><div class="v">${cal}</div></div>
      <div class="stat"><div class="k">房间数</div><div class="v">${roomN}</div></div>
      <div class="stat"><div class="k">默认地面</div><div class="v">${floor ? floor.name : '—'}</div></div>
      <div class="stat"><div class="k">墙面</div><div class="v">${wall ? wall.name : '—'}</div></div>
      <div class="stat"><div class="k">家具件数</div><div class="v">${furnCount}</div></div>
      <div class="stat"><div class="k">地面估价合计</div><div class="v">${state.flooringEstimate != null ? '¥' + Number(state.flooringEstimate).toLocaleString() : '请在设计器点「完成并导出」'}</div></div>
      <div class="stat"><div class="k">最近更新</div><div class="v">${fmtTime(state.updatedAt)}</div></div>
    `;
    // 明细：优先用设计器写出的 breakdown；否则按房间材质汇总
    let rows = Array.isArray(state.flooringBreakdown) ? state.flooringBreakdown.slice() : [];
    if (!rows.length && geom?.rooms && design?.rooms) {
      const map = {};
      geom.rooms.forEach(r => {
        if (r.counted === false) return;
        const mid = (design.rooms[r.id] && design.rooms[r.id].mat) || r.mat || state.floorMat || 'wood';
        const mat = FLOOR_MATS.find(m => m.id === mid) || { id: mid, name: mid, price: 0 };
        const poly = r.poly || [];
        let a = 0;
        for (let i = 0; i < poly.length; i++) {
          const p = poly[i], q = poly[(i + 1) % poly.length];
          a += p[0] * q[1] - q[0] * p[1];
        }
        a = Math.abs(a) / 2 / 1e6;
        if (!map[mid]) map[mid] = { id: mid, name: mat.name, price: mat.price, area: 0, cost: 0 };
        map[mid].area += a;
        map[mid].cost += a * mat.price * 1.05;
      });
      rows = Object.values(map).map(x => ({
        id: x.id, name: x.name, price: x.price,
        area: Math.round(x.area * 100) / 100,
        cost: Math.round(x.cost)
      }));
    }
    const box = $('#floorBreakdown');
    if (box) {
      if (!rows.length) {
        box.innerHTML = '<p class="meta">暂无明细。请在设计器完成识别房间后点「完成并导出」。</p>';
      } else {
        box.innerHTML = `<table class="cap"><thead><tr><th>地面材质</th><th>面积 m²</th><th>单价</th><th>小计（含 5% 损耗）</th></tr></thead><tbody>` +
          rows.map(r => `<tr><td>${esc(r.name)}</td><td>${r.area}</td><td>¥${r.price}/m²</td><td>¥${Number(r.cost).toLocaleString()}</td></tr>`).join('') +
          `</tbody></table>`;
      }
    }
    // 备份摘要用中文键；完整原始数据放在「技术存档」里，不挡主界面
    const pipePublic = Object.assign({}, state);
    delete pipePublic.imageDataUrl; // 预览图体积大，仍只留在本机浏览器
    const friendly = {
      '方案名称': title,
      '户型图文件': state.imageName || '未上传',
      '墙体来源': geomSrc,
      '比例标定': cal,
      '房间数': roomN,
      '默认地面': floor ? floor.name : '—',
      '墙面': wall ? wall.name : '—',
      '家具件数': design?.furniture?.length || 0,
      '地面估价合计': state.flooringEstimate != null ? state.flooringEstimate : null,
      '地面明细': rows.map(r => ({
        '材质': r.name,
        '面积（㎡）': r.area,
        '单价': r.price,
        '小计': r.cost,
      })),
      '最近更新': state.updatedAt || null,
    };
    const tech = {
      pipeline: pipePublic,
      designSummary: design ? {
        title: design.title,
        furnitureCount: design.furniture?.length || 0,
        wallFinish: design.wallFinish,
        geometry: geom ? {
          source: geom.source,
          wallCount: geom.walls?.length || 0,
          roomCount: geom.rooms?.length || 0,
          calibrated: !!(geom.calib && geom.calib.realMm),
        } : null,
      } : null,
    };
    $('#jobJson').value = JSON.stringify({ '作业摘要': friendly, '技术存档': tech }, null, 2);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) + ' CST';
    } catch (e) { return iso; }
  }

  function readFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      state = save({
        imageDataUrl: reader.result,
        imageName: file.name,
        imageSize: file.size,
        refVisible: true,
        startMode: 'trace',
      });
      renderUpload();
    };
    reader.readAsDataURL(file);
  }

  function openEditor(newTab) {
    const startMode = state.startMode || (state.imageDataUrl ? 'trace' : 'template');
    state = save({
      applyOnOpen: true,
      startMode,
      preferTrace: startMode === 'trace' && !!state.imageDataUrl,
      clearFurniture: $('#clearFurniture')?.checked || state.clearFurniture,
      step: 'design',
    });
    const url = './editor.html';
    if (newTab) {
      window.open(url, '_blank');
      return;
    }
    const frame = $('#editorFrame');
    frame.src = url + '?t=' + Date.now();
    frame.dataset.loaded = '1';
  }

  // events
  $('#stepNav').addEventListener('click', e => {
    const b = e.target.closest('[data-goto]');
    if (b) showStep(b.dataset.goto);
  });
  document.body.addEventListener('click', e => {
    const b = e.target.closest('[data-goto]');
    if (b && !b.closest('#stepNav')) showStep(b.dataset.goto);
  });

  const drop = $('#dropZone');
  const input = $('#fileInput');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('dragover');
    readFile(e.dataTransfer.files?.[0]);
  });
  input.addEventListener('change', () => readFile(input.files?.[0]));
  $('#clearImage').onclick = () => {
    state = save({ imageDataUrl: null, imageName: null, imageSize: null });
    renderUpload();
  };

  $('#templateCards').addEventListener('change', e => {
    const inp = e.target.closest('input[name=startMode]');
    if (!inp) return;
    state = save({ startMode: inp.value, template: inp.value === 'template' ? 'sample-3br' : 'trace-mine' });
    renderTemplates();
  });
  $('#roomChips').addEventListener('click', e => {
    const b = e.target.closest('[data-room]');
    if (!b) return;
    const id = b.dataset.room;
    const set = new Set(state.selectedRooms || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    state = save({ selectedRooms: [...set] });
    renderRooms();
  });
  $('#selectAllRooms').onclick = () => {
    state = save({ selectedRooms: ROOM_OPTIONS.map(r => r.id) });
    renderRooms();
  };
  $('#clearRooms').onclick = () => {
    state = save({ selectedRooms: [] });
    renderRooms();
  };

  $('#floorChips').addEventListener('click', e => {
    const b = e.target.closest('[data-floor]');
    if (!b) return;
    state = save({ floorMat: b.dataset.floor });
    renderMats();
  });
  $('#wallChips').addEventListener('click', e => {
    const b = e.target.closest('[data-wall]');
    if (!b) return;
    state = save({ wallFinish: b.dataset.wall });
    renderMats();
  });
  $('#clearFurniture').onchange = e => {
    state = save({ clearFurniture: e.target.checked });
  };

  $('#openEditor').onclick = () => openEditor(false);
  $('#openEditorTab').onclick = () => openEditor(true);

  $('#downloadJob').onclick = () => {
    renderExport();
    const blob = new Blob([$('#jobJson').value], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '户型作业备份.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#copyJob').onclick = async () => {
    renderExport();
    try {
      await navigator.clipboard.writeText($('#jobJson').value);
      alert('已复制到剪贴板');
    } catch (e) {
      $('#jobJson').select();
      document.execCommand('copy');
    }
  };
  $('#resetAll').onclick = () => {
    if (!confirm('确定清空本机作业与设计方案？此操作不可撤销。')) return;
    localStorage.removeItem(STORE);
    localStorage.removeItem('huxing-design-v1');
    state = defaultState();
    save(state);
    const frame = $('#editorFrame');
    if (frame) { frame.src = 'about:blank'; frame.dataset.loaded = '0'; }
    renderAll();
    showStep('upload');
  };

  function renderAll() {
    renderNav();
    renderUpload();
    renderTemplates();
    renderRooms();
    renderMats();
  }

  renderAll();
  const hash = (location.hash || '').replace('#', '');
  showStep(hash || state.step || 'upload');
})();
