'use strict';

const crypto = require('crypto');
const { runEngine } = require('./engine');

/** @type {Map<string, object>} */
const jobs = new Map();
const MAX_JOBS = 200;

function createJobId() {
  return 'job_' + crypto.randomBytes(8).toString('hex');
}

function prune() {
  if (jobs.size <= MAX_JOBS) return;
  const arr = [...jobs.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  const drop = arr.slice(0, jobs.size - MAX_JOBS);
  drop.forEach(([id]) => jobs.delete(id));
}

/**
 * @param {{ buffer: Buffer, mime: string, filename?: string, scaleMmPerPx?: number, areaM2?: number }} payload
 */
function enqueue(payload) {
  prune();
  const id = createJobId();
  const job = {
    id,
    status: 'queued',
    progress: 0,
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(id, job);

  setImmediate(() => runJob(id, payload));
  return id;
}

async function runJob(id, payload) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'running';
  job.progress = 10;
  job.updatedAt = Date.now();

  const tick = setInterval(() => {
    const j = jobs.get(id);
    if (!j || j.status !== 'running') { clearInterval(tick); return; }
    if (j.progress < 85) {
      j.progress = Math.min(85, j.progress + 8 + Math.floor(Math.random() * 10));
      j.updatedAt = Date.now();
    }
  }, 280);

  try {
    const result = await runEngine({
      buffer: payload.buffer,
      mime: payload.mime,
      scaleMmPerPx: payload.scaleMmPerPx,
      areaM2: payload.areaM2,
    });
    clearInterval(tick);
    job.status = 'succeeded';
    job.progress = 100;
    job.result = result;
    job.error = null;
    job.updatedAt = Date.now();
  } catch (e) {
    clearInterval(tick);
    job.status = 'failed';
    job.progress = 100;
    job.result = null;
    job.error = {
      code: e.code || 'ENGINE_ERROR',
      message: e.message || String(e),
    };
    job.updatedAt = Date.now();
  }
}

function getJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

module.exports = { enqueue, getJob };
