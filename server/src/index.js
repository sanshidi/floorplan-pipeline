'use strict';

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { enqueue, getJob } = require('./jobs');
const { ENGINE_ID } = require('./engine');

const PORT = +(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const API_KEY = process.env.API_KEY || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = /^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.mimetype)
      || /\.(png|jpe?g|webp|gif)$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Only image uploads allowed'), ok);
  },
});

const app = express();
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map(s => s.trim()),
  exposedHeaders: ['X-Job-Id'],
}));
app.use(express.json({ limit: '1mb' }));

function auth(req, res, next) {
  if (!API_KEY) return next();
  const h = req.get('x-api-key') || '';
  const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (h === API_KEY || bearer === API_KEY) return next();
  return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API key' } });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, engine: ENGINE_ID, time: new Date().toISOString() });
});

app.post('/v1/vectorize', auth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: err.message || String(err) } });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: { code: 'NO_FILE', message: 'multipart field "file" required' } });
    }
    const scaleRaw = req.body && req.body.scaleMmPerPx;
    const areaRaw = req.body && req.body.areaM2;
    const scaleMmPerPx = scaleRaw !== undefined && scaleRaw !== '' ? +scaleRaw : undefined;
    const areaM2 = areaRaw !== undefined && areaRaw !== '' ? +areaRaw : undefined;

    const jobId = enqueue({
      buffer: req.file.buffer,
      mime: req.file.mimetype,
      filename: req.file.originalname,
      scaleMmPerPx: Number.isFinite(scaleMmPerPx) && scaleMmPerPx > 0 ? scaleMmPerPx : undefined,
      areaM2: Number.isFinite(areaM2) && areaM2 > 0 ? areaM2 : undefined,
    });

    res.set('X-Job-Id', jobId);
    return res.status(202).json({ jobId });
  });
});

app.get('/v1/jobs/:id', auth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown jobId' } });
  }
  return res.json(job);
});

app.use((err, _req, res, _next) => {
  console.error('[api]', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: err.message || 'internal error' } });
});

app.listen(PORT, HOST, () => {
  console.log(`[floorplan-api] http://${HOST}:${PORT}  engine=${ENGINE_ID}  apiKey=${API_KEY ? 'on' : 'off'}`);
});
