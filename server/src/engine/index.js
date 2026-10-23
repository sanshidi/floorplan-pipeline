/**
 * 引擎入口：默认 stub-heuristic；日后换第三方只改此处 require。
 */
'use strict';

const stub = require('./stubHeuristic');

/** @type {(input: object) => Promise<object>} */
async function runEngine(input) {
  return stub.run(input);
}

module.exports = { runEngine, ENGINE_ID: stub.ENGINE_ID };
