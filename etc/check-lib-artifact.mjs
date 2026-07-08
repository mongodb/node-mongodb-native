#!/usr/bin/env node
/**
 * Shipped-artifact smoke test: loads the built lib/ through both module systems in a
 * real Node process and forces runtime-adapter resolution. This guards the emitted shipped
 * bytes (interop, export wiring, the preserved dynamic import); the bundled-ESM bug itself is
 * covered by test/unit/bundling.test.ts.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const cjs = require('../lib/index.js');
assert.equal(typeof cjs.MongoClient, 'function', 'require(lib/index.js) exposes MongoClient');

const esm = await import('../lib/index.js');
assert.equal(
  typeof esm.MongoClient,
  'function',
  'import(lib/index.js) exposes MongoClient as a named export (cjs-module-lexer)'
);
assert.equal(esm.MongoClient, cjs.MongoClient, 'both loaders resolve the same class');

// Constructing a client parses options, which kicks off runtime-adapter resolution; awaiting it
// exercises the dynamic import('os') in the shipped artifact.
const client = new cjs.MongoClient('mongodb://localhost:27017');
const runtime = await client.options.runtime;
assert.equal(
  typeof runtime.os.platform,
  'function',
  'default os adapter resolves via dynamic import()'
);

// Drift-proof guard for the emit contract: the shipped bytes must retain the dynamic
// import('os') and must not contain a downleveled require('os') — i.e. tsconfig's
// `module: node16` must not regress to `commonjs`-style downleveling. The runtime checks above
// cannot catch that regression, because real Node always has `require`, so a broken emit still
// passes them; only the artifact text itself proves the emit contract held.
const runtimeAdaptersEmit = await readFile(
  new URL('../lib/runtime_adapters.js', import.meta.url),
  'utf8'
);
assert.match(
  runtimeAdaptersEmit,
  /import\(["']os["']\)/,
  'lib/runtime_adapters.js must preserve the dynamic import("os")'
);
assert.doesNotMatch(
  runtimeAdaptersEmit,
  /require\(["']os["']\)/,
  'lib/runtime_adapters.js must not contain a downleveled require("os")'
);

// eslint-disable-next-line no-console
console.log('✓ lib artifact smoke test passed');
