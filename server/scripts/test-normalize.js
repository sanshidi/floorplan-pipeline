#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { normalizeExternal, detectFormat } = require('../src/engine/normalize');

const FIX = path.join(__dirname, '..', 'src', 'engine', 'fixtures');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));
}

function run() {
  let n = 0;

  // native mm
  {
    const data = load('native-mm.json');
    assert.strictEqual(detectFormat(data), 'native');
    const r = normalizeExternal(data, { format: 'auto', pxW: 800, pxH: 600, scaleMmPerPx: 15 });
    assert.ok(r.walls.length >= 5, 'native-mm walls');
    assert.ok(r.rooms.length === 2, 'native-mm rooms');
    assert.ok(r.openings.doors.length >= 1, 'native-mm doors');
    assert.strictEqual(r.meta.units, 'mm');
    assert.strictEqual(r.meta.format, 'native');
    // mm coords preserved roughly
    assert.ok(Math.abs(r.walls[0][2] - 8000) < 50, 'mm x1');
    n++;
    console.log('✓ native-mm');
  }

  // native px
  {
    const data = load('native-px.json');
    const r = normalizeExternal(data, { format: 'native', pxW: 400, pxH: 300, scaleMmPerPx: 20 });
    assert.ok(r.walls.length >= 4, 'native-px walls');
    assert.strictEqual(r.meta.units, 'px');
    // 390*20 = 7800
    assert.ok(r.walls[0][2] > 1000, 'px scaled to mm');
    n++;
    console.log('✓ native-px');
  }

  // xmarva
  {
    const data = load('xmarva.json');
    assert.strictEqual(detectFormat(data), 'xmarva');
    const r = normalizeExternal(data, { format: 'auto', pxW: 400, pxH: 300, scaleMmPerPx: 25 });
    assert.ok(r.walls.length >= 5, 'xmarva walls');
    assert.ok(r.openings.doors.length >= 1, 'xmarva doors');
    assert.ok(r.rooms.length >= 1, 'xmarva rooms');
    assert.strictEqual(r.meta.format, 'xmarva');
    n++;
    console.log('✓ xmarva');
  }

  // rasterscan
  {
    const data = load('rasterscan.json');
    assert.strictEqual(detectFormat(data), 'rasterscan');
    const r = normalizeExternal(data, { format: 'auto', pxW: 400, pxH: 300, scaleMmPerPx: 25 });
    assert.ok(r.walls.length >= 5, 'rasterscan walls');
    assert.ok(r.rooms.length >= 1, 'rasterscan rooms');
    assert.ok(r.openings.doors.length >= 1, 'rasterscan doors');
    assert.strictEqual(r.meta.format, 'rasterscan');
    n++;
    console.log('✓ rasterscan');
  }

  // forced format
  {
    const data = load('xmarva.json');
    const r = normalizeExternal(data, { format: 'xmarva', pxW: 400, pxH: 300 });
    assert.strictEqual(r.meta.format, 'xmarva');
    n++;
    console.log('✓ forced xmarva');
  }

  // semantic-post smoke
  {
    const semanticPost = require('../src/engine/semanticPost');
    const walls = [
      [0, 0, 8000, 0, 'e', 240],
      [8000, 0, 8000, 6000, 'e', 240],
      [8000, 6000, 0, 6000, 'e', 240],
      [0, 6000, 0, 0, 'e', 240],
      [4000, 0, 4000, 2500, 'n', 200],
      [4000, 3500, 4000, 6000, 'n', 200], // gap ~1000mm → door
    ];
    const doors = semanticPost.guessDoorGaps(walls);
    assert.ok(doors.length >= 1, 'heuristic doors');
    const out = semanticPost.applySemanticPost({
      walls,
      openings: { doors: [], wins: [] },
      rooms: [],
      meta: { engine: 'cv-hough-v1' },
    });
    assert.ok(out.meta.engine.includes('semantic-post'), 'engine tag');
    assert.ok(out.rooms.length >= 1, 'rooms from rings');
    n++;
    console.log('✓ semantic-post');
  }

  console.log('\nAll', n, 'normalize/semantic tests passed.');
}

run();
