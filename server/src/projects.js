/**
 * Disk-backed project store: server/data/projects/{id}.json
 * Share GET is public (short random id); mutating routes use API auth.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.PROJECTS_DIR
  || path.join(__dirname, '..', 'data', 'projects');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function newId() {
  return crypto.randomBytes(9).toString('base64url'); // ~12 chars
}

function fileFor(id) {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(id)) {
    const err = new Error('invalid project id');
    err.code = 'BAD_ID';
    throw err;
  }
  return path.join(DATA_DIR, id + '.json');
}

function publicBase() {
  return (process.env.PUBLIC_BASE || 'http://127.0.0.1:8765').replace(/\/$/, '');
}

function shareUrlFor(id) {
  // Prefer hash route on designer; share.html also works
  return publicBase() + '/editor.html#/share/' + id;
}

function readProject(id) {
  ensureDir();
  const fp = fileFor(id);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function writeProject(id, doc) {
  ensureDir();
  const fp = fileFor(id);
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), 'utf8');
  fs.renameSync(tmp, fp);
  return doc;
}

/**
 * Create or overwrite.
 * @param {{ id?: string, title?: string, geometry: object, thumbnailDataUrl?: string, meta?: object }} body
 */
function saveProject(body) {
  if (!body || !body.geometry || typeof body.geometry !== 'object') {
    const err = new Error('geometry object required');
    err.code = 'BAD_BODY';
    throw err;
  }
  const id = body.id || newId();
  // validate id early
  fileFor(id);
  const now = new Date().toISOString();
  const prev = (() => { try { return readProject(id); } catch (_) { return null; } })();
  const doc = {
    id,
    title: body.title || (prev && prev.title) || '未命名方案',
    geometry: body.geometry,
    thumbnailDataUrl: body.thumbnailDataUrl != null
      ? body.thumbnailDataUrl
      : (prev && prev.thumbnailDataUrl) || null,
    meta: Object.assign({}, (prev && prev.meta) || {}, body.meta || {}),
    createdAt: (prev && prev.createdAt) || now,
    updatedAt: now,
    shareUrl: shareUrlFor(id),
  };
  // trim huge thumbnails
  if (doc.thumbnailDataUrl && doc.thumbnailDataUrl.length > 400000) {
    doc.thumbnailDataUrl = null;
    doc.meta.thumbnailDropped = true;
  }
  writeProject(id, doc);
  return { id: doc.id, shareUrl: doc.shareUrl, updatedAt: doc.updatedAt };
}

function getMeta(id) {
  const doc = readProject(id);
  if (!doc) return null;
  return {
    id: doc.id,
    title: doc.title,
    shareUrl: doc.shareUrl,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    meta: doc.meta || {},
    hasThumbnail: !!doc.thumbnailDataUrl,
  };
}

module.exports = {
  DATA_DIR,
  saveProject,
  readProject,
  getMeta,
  shareUrlFor,
  publicBase,
  ensureDir,
};
