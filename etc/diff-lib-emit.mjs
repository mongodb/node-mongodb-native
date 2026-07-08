#!/usr/bin/env node
/**
 * Migration diff gate (NODE-7603): builds lib/ with the previous compiler settings
 * (`module: commonjs`) and with the current ones (`module: node16`), prettier-normalizes both,
 * and diffs them, so reviewers can see exactly how the shipped emit changes.
 *
 * Run with: npm run check:lib-emit-diff
 * Output: a stat summary on stdout and the full normalized diff in .diff-gate/report.diff.
 * This is temporary migration tooling — it exists to make the emitter-settings change
 * reviewable and is slated for removal after the release soak.
 *
 * Expected diff (anything else must be explained before merging): exactly one hunk — the
 * dynamic `import('os')` in runtime_adapters.js preserved instead of downleveled to
 * `Promise.resolve().then(() => require('os'))`, which is the change this migration exists
 * for. Every other shipped file is byte-identical: `esModuleInterop: false` is pinned in
 * tsconfig.json precisely so node16 changes nothing about the emit besides honoring dynamic
 * import inside CJS.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const gateDir = path.join(rootDir, '.diff-gate');
const oldDir = path.join(gateDir, 'old');
const newDir = path.join(gateDir, 'new');

const run = (cmd, args) => execFileSync(cmd, args, { cwd: rootDir, stdio: 'inherit' });

// maxRetries/retryDelay: a recursive delete of a directory that recently had many files written
// into it can transiently fail with ENOTEMPTY (e.g. a filesystem indexer briefly touching the
// directory) — retry a few times instead of crashing the whole gate.
await fs.rm(gateDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
await fs.mkdir(gateDir, { recursive: true });

// Old emit: the pre-migration compiler settings, overridden on the CLI so the base tsconfig
// (now node16) still produces what we used to ship.
run(process.execPath, [
  path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc'),
  '-p',
  'tsconfig.json',
  '--module',
  'commonjs',
  '--moduleResolution',
  'node',
  '--noEmitHelpers',
  'true',
  '--outDir',
  oldDir,
  '--declaration',
  'false',
  '--declarationMap',
  'false',
  '--sourceMap',
  'false'
]);

// New emit: whatever `npm run build:ts` ships today, copied out of lib/.
run('npm', ['run', 'build:ts']);
await fs.cp(path.join(rootDir, 'lib'), newDir, {
  recursive: true,
  filter: src => !src.endsWith('.map') && !src.endsWith('.d.ts')
});

// The shipped files end with a sourceMappingURL pointer; the old-side build above omits
// sourcemaps entirely, so strip the pointer line to keep the diff about code, not artifacts of
// how the two trees were produced.
async function stripSourceMapPointers(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const filePath = path.join(entry.parentPath ?? entry.path, entry.name);
    const text = await fs.readFile(filePath, 'utf8');
    const stripped = text.replace(/^\/\/# sourceMappingURL=.*\n?/m, '');
    if (stripped !== text) await fs.writeFile(filePath, stripped);
  }
}
await stripSourceMapPointers(newDir);

// Normalize formatting so the diff shows structure, not prettier-irrelevant layout.
// --ignore-path overrides prettier 3's default of [.gitignore, .prettierignore]: .diff-gate/ is
// itself gitignored, so without this every file here is silently skipped and "normalized" is a
// no-op — pass a path with no patterns in it so nothing under gateDir is excluded.
const noIgnorePath = path.join(gateDir, '.prettier-ignore-none');
await fs.writeFile(noIgnorePath, '');
run('npx', [
  'prettier',
  '--log-level',
  'warn',
  '--ignore-path',
  noIgnorePath,
  '--write',
  `${gateDir}/**/*.js`
]);

// git diff --no-index exits 1 when files differ; treat only that as success-with-diff and
// surface every other failure (missing git, OOM, output truncation) instead of masking it —
// a verification gate must not fail silently.
function gitDiff(extraArgs) {
  try {
    return execFileSync('git', ['diff', '--no-index', ...extraArgs, oldDir, newDir], {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024
    });
  } catch (error) {
    if (error.status === 1 && typeof error.stdout === 'string') {
      return error.stdout;
    }
    throw error;
  }
}

const report = gitDiff(['--stat']);
const full = gitDiff([]);
await fs.writeFile(path.join(gateDir, 'report.diff'), full);

// eslint-disable-next-line no-console
console.log(report);
// eslint-disable-next-line no-console
console.log(`Full diff written to .diff-gate/report.diff (${full.split('\n').length} lines)`);
