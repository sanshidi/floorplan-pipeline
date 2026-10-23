/**
 * P1「生成墙草稿」客户端 — 调 Node /v1/vectorize，失败降级 P0 手画。
 * 配置优先级：window.FP_API → ?api= → localStorage.FP_API → 默认 127.0.0.1:8787
 */
(function (global) {
  'use strict';

  const DEFAULT_API = 'http://127.0.0.1:8787';
  const POLL_MS = 450;
  const TIMEOUT_MS = 60000;

  function apiBase() {
    if (typeof global.FP_API === 'string' && global.FP_API.trim()) return global.FP_API.trim().replace(/\/$/, '');
    try {
      const q = new URLSearchParams(location.search).get('api');
      if (q) return q.replace(/\/$/, '');
    } catch (_) {}
    try {
      const ls = localStorage.getItem('FP_API');
      if (ls) return ls.replace(/\/$/, '');
    } catch (_) {}
    return DEFAULT_API;
  }

  function apiKey() {
    try { return localStorage.getItem('FP_API_KEY') || ''; } catch (_) { return ''; }
  }

  function headers(extra) {
    const h = Object.assign({}, extra || {});
    const k = apiKey();
    if (k) h['X-API-Key'] = k;
    return h;
  }

  function dataUrlToBlob(dataUrl) {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl || '');
    if (!m) return null;
    const bin = atob(m[2]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] || 'image/png' });
  }

  async function health() {
    const r = await fetch(apiBase() + '/health', { headers: headers(), mode: 'cors' });
    if (!r.ok) throw new Error('health ' + r.status);
    return r.json();
  }

  /**
   * @param {{ file?: Blob|File, dataUrl?: string, filename?: string, scaleMmPerPx?: number, areaM2?: number, onProgress?: (p:number,status:string)=>void }} opts
   */
  async function vectorize(opts) {
    opts = opts || {};
    let file = opts.file;
    if (!file && opts.dataUrl) {
      const blob = dataUrlToBlob(opts.dataUrl);
      if (!blob) throw Object.assign(new Error('无效底图 dataURL'), { code: 'NO_IMAGE' });
      file = new File([blob], opts.filename || 'floorplan.png', { type: blob.type || 'image/png' });
    }
    if (!file) throw Object.assign(new Error('缺少户型图'), { code: 'NO_IMAGE' });

    const fd = new FormData();
    fd.append('file', file, file.name || 'floorplan.png');
    if (opts.scaleMmPerPx > 0) fd.append('scaleMmPerPx', String(opts.scaleMmPerPx));
    if (opts.areaM2 > 0) fd.append('areaM2', String(opts.areaM2));

    const onProgress = opts.onProgress || function () {};
    onProgress(2, 'uploading');

    let post;
    try {
      post = await fetch(apiBase() + '/v1/vectorize', {
        method: 'POST',
        body: fd,
        headers: headers(),
        mode: 'cors',
      });
    } catch (e) {
      throw Object.assign(new Error('无法连接识墙服务（' + apiBase() + '）。可继续手画。'), {
        code: 'NETWORK',
        cause: e,
      });
    }

    if (!post.ok) {
      let msg = 'vectorize ' + post.status;
      try {
        const j = await post.json();
        if (j && j.error && j.error.message) msg = j.error.message;
      } catch (_) {}
      throw Object.assign(new Error(msg), { code: 'HTTP_' + post.status });
    }

    const { jobId } = await post.json();
    if (!jobId) throw Object.assign(new Error('无 jobId'), { code: 'BAD_RESPONSE' });
    onProgress(5, 'queued');

    const t0 = Date.now();
    while (Date.now() - t0 < TIMEOUT_MS) {
      await sleep(POLL_MS);
      let job;
      try {
        const r = await fetch(apiBase() + '/v1/jobs/' + encodeURIComponent(jobId), {
          headers: headers(),
          mode: 'cors',
        });
        if (!r.ok) throw new Error('job ' + r.status);
        job = await r.json();
      } catch (e) {
        throw Object.assign(new Error('轮询失败：' + (e.message || e)), { code: 'POLL' });
      }
      onProgress(job.progress || 0, job.status);
      if (job.status === 'succeeded') return job.result;
      if (job.status === 'failed') {
        const msg = (job.error && job.error.message) || '识墙失败';
        throw Object.assign(new Error(msg), { code: (job.error && job.error.code) || 'FAILED' });
      }
    }
    throw Object.assign(new Error('识墙超时（' + TIMEOUT_MS / 1000 + 's），请改用手画'), { code: 'TIMEOUT' });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  global.FloorplanAiDraft = { apiBase, apiKey, health, vectorize, DEFAULT_API };
})(typeof window !== 'undefined' ? window : globalThis);
