#!/usr/bin/env node
/**
 * Tiny mock external vectorize server for local testing (no Docker / no RapidAPI).
 * POST /plan_recognition or /vectorize → returns RasterScan-ish or native fixture.
 *
 *   node scripts/mock-external.js          # :8799, FORMAT=rasterscan
 *   MOCK_FORMAT=xmarva node scripts/mock-external.js
 *
 * Then:
 *   EXTERNAL_VECTORIZE_URL=http://127.0.0.1:8799/plan_recognition \
 *   EXTERNAL_FORMAT=auto ENGINE=external npm start
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = +(process.env.MOCK_PORT || 8799);
const FORMAT = (process.env.MOCK_FORMAT || 'rasterscan').toLowerCase();
const FIX = path.join(__dirname, '..', 'src', 'engine', 'fixtures');

const map = {
  rasterscan: 'rasterscan.json',
  xmarva: 'xmarva.json',
  native: 'native-px.json',
  'native-mm': 'native-mm.json',
};

function handler(req, res) {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, format: FORMAT }));
    return;
  }
  if (req.method === 'POST') {
    // drain body
    req.on('data', () => {});
    req.on('end', () => {
      const file = map[FORMAT] || map.rasterscan;
      const body = fs.readFileSync(path.join(FIX, file), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    });
    return;
  }
  res.writeHead(404);
  res.end('not found');
}

http.createServer(handler).listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-external] http://127.0.0.1:${PORT}  format=${FORMAT}`);
  console.log(`  EXTERNAL_VECTORIZE_URL=http://127.0.0.1:${PORT}/plan_recognition`);
});
