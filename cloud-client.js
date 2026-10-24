/**
 * Cloud project save + share helpers (P1.5).
 * Uses same FP_API / FP_API_KEY as ai-draft-client.
 */
(function (global) {
  'use strict';

  function apiBase() {
    if (global.FloorplanAiDraft && typeof global.FloorplanAiDraft.apiBase === 'function') {
      return global.FloorplanAiDraft.apiBase();
    }
    if (typeof global.FP_API === 'string' && global.FP_API.trim()) return global.FP_API.trim().replace(/\/$/, '');
    try {
      const ls = localStorage.getItem('FP_API');
      if (ls) return ls.replace(/\/$/, '');
    } catch (_) {}
    return 'http://127.0.0.1:8787';
  }

  function headers(extra) {
    const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    try {
      const k = localStorage.getItem('FP_API_KEY') || '';
      if (k) h['X-API-Key'] = k;
    } catch (_) {}
    return h;
  }

  /**
   * @param {{ title?: string, geometry: object, thumbnailDataUrl?: string, meta?: object, id?: string }} payload
   * @returns {Promise<{ id: string, shareUrl: string }>}
   */
  async function saveProject(payload) {
    const r = await fetch(apiBase() + '/v1/projects', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload || {}),
      mode: 'cors',
    });
    if (!r.ok) {
      let msg = 'save ' + r.status;
      try {
        const j = await r.json();
        if (j && j.error && j.error.message) msg = j.error.message;
      } catch (_) {}
      throw Object.assign(new Error(msg), { code: 'HTTP_' + r.status });
    }
    return r.json();
  }

  /** Public GET — no API key required. */
  async function loadProject(id) {
    const r = await fetch(apiBase() + '/v1/projects/' + encodeURIComponent(id), { mode: 'cors' });
    if (!r.ok) {
      let msg = 'load ' + r.status;
      try {
        const j = await r.json();
        if (j && j.error && j.error.message) msg = j.error.message;
      } catch (_) {}
      throw Object.assign(new Error(msg), { code: 'HTTP_' + r.status });
    }
    return r.json();
  }

  async function loadMeta(id) {
    const r = await fetch(apiBase() + '/v1/projects/' + encodeURIComponent(id) + '/meta', { mode: 'cors' });
    if (!r.ok) throw Object.assign(new Error('meta ' + r.status), { code: 'HTTP_' + r.status });
    return r.json();
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Parse #/share/{id} or ?share=id */
  function parseShareId() {
    try {
      const hash = location.hash || '';
      const m = hash.match(/#\/?share\/([A-Za-z0-9_-]+)/);
      if (m) return m[1];
      const q = new URLSearchParams(location.search).get('share') || new URLSearchParams(location.search).get('id');
      if (q) return q;
    } catch (_) {}
    return null;
  }

  global.FloorplanCloud = {
    apiBase, saveProject, loadProject, loadMeta, copyText, parseShareId,
  };
})(typeof window !== 'undefined' ? window : globalThis);
