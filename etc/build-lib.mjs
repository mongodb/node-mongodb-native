#!/usr/bin/env node
/**
 * Builds the shipped lib/ tree (NODE-7603).
 *
 * 1. tsc (tsconfig.build.json) compiles src/ to genuine ESM in lib-intermediate/ so dynamic
 *    import() is not downleveled to require(); declarations are emitted straight to lib/.
 * 2. esbuild transforms each intermediate file (no bundling) to the CommonJS files we ship in
 *    lib/, preserving dynamic import() and the file-per-file layout.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const intermediateDir = path.join(rootDir, 'lib-intermediate');
const libDir = path.join(rootDir, 'lib');

await fs.rm(intermediateDir, { recursive: true, force: true });
await fs.rm(libDir, { recursive: true, force: true });

execFileSync(
  process.execPath,
  [path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.build.json'],
  { cwd: rootDir, stdio: 'inherit' }
);

const entryPoints = (await fs.readdir(intermediateDir, { recursive: true }))
  .filter(file => file.endsWith('.js'))
  .map(file => path.join(intermediateDir, file));

await esbuild.build({
  entryPoints,
  outdir: libDir,
  outbase: intermediateDir,
  bundle: false,
  format: 'cjs',
  platform: 'node',
  // Keep in sync with package.json "engines" and test/unit/bundling.test.ts.
  target: 'node20',
  // Compose tsc's sourcemaps (lib-intermediate/*.js.map) so lib/*.js.map points at src/*.ts.
  sourcemap: 'linked',
  // Match today's emit: maps reference the shipped src/ files rather than embedding them.
  sourcesContent: false,
  logLevel: 'error'
});

// eslint-disable-next-line no-console
console.log(`✓ lib/ built from ESM intermediate (${entryPoints.length} files)`);
