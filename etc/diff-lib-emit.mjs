#!/usr/bin/env node
/**
 * Migration diff gate (NODE-7603): builds lib/ with the old pipeline (tsc module: commonjs) and
 * the new pipeline (etc/build-lib.mjs), prettier-normalizes both, and diffs them.
 *
 * Expected diff classes (anything else must be explained before merging):
 *   1. esbuild interop preamble (__toESM/__toCommonJS/__export helpers) replacing tsc's helpers
 *   2. getter-based export wiring instead of `exports.X = ...` assignments
 *   3. `import('os')` preserved in runtime_adapters.js instead of downleveled to require
 *   4. `0 && (module.exports = {...})` cjs-module-lexer annotations
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const gateDir = path.join(rootDir, '.diff-gate');
const oldDir = path.join(gateDir, 'old');
const newDir = path.join(gateDir, 'new');

const run = (cmd, args) => execFileSync(cmd, args, { cwd: rootDir, stdio: 'inherit' });

await fs.rm(gateDir, { recursive: true, force: true });
await fs.mkdir(gateDir, { recursive: true });

// Old pipeline: plain tsc against the base config (module: commonjs), js only.
run(process.execPath, [
  path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc'),
  '-p', 'tsconfig.json',
  '--outDir', oldDir,
  '--declaration', 'false',
  '--declarationMap', 'false',
  '--sourceMap', 'false'
]);

// New pipeline: whatever `npm run build:ts` ships today, copied out of lib/.
run('npm', ['run', 'build:ts']);
await fs.cp(path.join(rootDir, 'lib'), newDir, {
  recursive: true,
  filter: src => !src.endsWith('.map') && !src.endsWith('.d.ts')
});

// Normalize formatting so the diff shows structure, not prettier-irrelevant layout.
run('npx', ['prettier', '--log-level', 'warn', '--write', `${gateDir}/**/*.js`]);

// git diff --no-index exits 1 when files differ; capture instead of failing.
let report = '';
try {
  report = execSync(`git diff --no-index --stat "${oldDir}" "${newDir}"`, {
    cwd: rootDir,
    encoding: 'utf8'
  });
} catch (error) {
  report = error.stdout ?? '';
}
let full = '';
try {
  full = execSync(`git diff --no-index "${oldDir}" "${newDir}"`, {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  });
} catch (error) {
  full = error.stdout ?? '';
}
await fs.writeFile(path.join(gateDir, 'report.diff'), full);

// eslint-disable-next-line no-console
console.log(report);
// eslint-disable-next-line no-console
console.log(`Full diff written to .diff-gate/report.diff (${full.split('\n').length} lines)`);
