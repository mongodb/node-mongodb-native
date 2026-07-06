#!/usr/bin/env node
/**
 * Migration diff gate (NODE-7603): builds lib/ with the old pipeline (tsc module: commonjs) and
 * the new pipeline (etc/build-lib.mjs), prettier-normalizes both, and diffs them.
 *
 * Run with: npm run check:lib-emit-diff
 * Output: a stat summary on stdout and the full normalized diff in .diff-gate/report.diff, plus
 * an AST-based classification (etc/lib-emit-classify.mjs) that mechanically checks the diff
 * instead of relying on the classes below being sampled correctly by a human. This is temporary
 * migration tooling — it verifies the esbuild-based pipeline against the old tsc-only emit and
 * is slated for removal after the release soak.
 *
 * Expected diff classes (anything else must be explained before merging):
 *   1. esbuild interop preamble (__toESM/__toCommonJS/__export helpers) replacing tsc's helpers
 *   2. getter-based export wiring instead of `exports.X = ...` assignments
 *   3. `import('os')` preserved in runtime_adapters.js instead of downleveled to require
 *   4. `0 && (module.exports = {...})` cjs-module-lexer annotations
 *   5. `undefined` rewritten to `void 0` (semantically identical esbuild output form)
 *   6. comments stripped from emitted js (esbuild keeps only license comments; types/IntelliSense
 *      are unaffected — mongodb.d.ts is tsc-generated)
 *   7. `@__PURE__` tree-shaking annotations added (additive hints for downstream bundlers)
 *   8. require-binding naming: tsc names them `foo_1`, esbuild names them `import_foo` (and wraps
 *      some, e.g. `dns`/`process`/`mongodb-connection-string-url`, in `__toESM(...)` for CJS/ESM
 *      interop), forcing local-variable-shadowing renames (`value` becomes `value2`) elsewhere
 *   9. esbuild syntax respelling with identical semantics: string-escape form (`'\x00'` vs
 *      `'\0'`), object shorthand (`{ payload: payload }` vs `{ payload }`), and `var` vs `const`
 *      on the require-binding statements themselves
 *
 * etc/lib-emit-classify.mjs verifies all of this mechanically per file: export-name-set equality
 * is the hard gate (exit 1 on any mismatch), and classes 1-5 and 8-9 are then normalized away
 * soundly (AST-level alpha-renaming of file-local bindings — never property names, exports,
 * globals, or literal contents — plus by-value literal comparison and counted `__toESM`
 * unwrapping) so the residual printed below contains ONLY differences no known-safe rule
 * explains. Read every residual line. The three shapes expected there today, all verified
 * semantics-preserving by eye (~150 lines total):
 *   - esbuild string-constant folding ('a' + 'b' emitted as 'ab', concatenated template
 *     literals merged), plus the prettier re-wraps the changed line lengths force,
 *   - canonical-numbering cascades where one side hoists a bare `var x;` declaration to a
 *     different position (declaration order, not content — the lines differ only in `$N`s),
 *   - call style for exported siblings: tsc's `(0, exports.fn)(...)` vs esbuild's local call.
 * Anything not matching those shapes is a genuine finding.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as process from 'node:process';
import { fileURLToPath } from 'node:url';

import { classifyEmitDiff } from './lib-emit-classify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const gateDir = path.join(rootDir, '.diff-gate');
const oldDir = path.join(gateDir, 'old');
const newDir = path.join(gateDir, 'new');

const run = (cmd, args) => execFileSync(cmd, args, { cwd: rootDir, stdio: 'inherit' });

// maxRetries/retryDelay: a recursive delete of a directory that recently had ~260 files written
// into it can transiently fail with ENOTEMPTY (e.g. a filesystem indexer briefly touching the
// directory) — retry a few times instead of crashing the whole gate. Observed directly in this
// workspace; see etc/lib-emit-classify.mjs's history for the same pattern.
await fs.rm(gateDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
await fs.mkdir(gateDir, { recursive: true });

// Old pipeline: plain tsc against the base config (module: commonjs), js only.
run(process.execPath, [
  path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc'),
  '-p',
  'tsconfig.json',
  '--outDir',
  oldDir,
  '--declaration',
  'false',
  '--declarationMap',
  'false',
  '--sourceMap',
  'false'
]);

// New pipeline: whatever `npm run build:ts` ships today, copied out of lib/.
run('npm', ['run', 'build:ts']);
await fs.cp(path.join(rootDir, 'lib'), newDir, {
  recursive: true,
  filter: src => !src.endsWith('.map') && !src.endsWith('.d.ts')
});

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

// Mechanically classify the diff above instead of trusting that the "expected diff classes"
// list in this file's header was sampled correctly: prove export-name-set equality per file
// (hard gate) and report whatever's structurally left over after stripping known-safe shapes.
const classification = await classifyEmitDiff(oldDir, newDir);

const byResidualDesc = [...classification.files].sort(
  (a, b) => b.residualLineCount - a.residualLineCount
);
const worthPrinting = byResidualDesc.filter(f => !f.exportCheck.ok || f.residualLineCount > 0);
const cleanFileCount = classification.files.length - worthPrinting.length;

for (const f of worthPrinting) {
  const exportNote = f.exportCheck.ok
    ? ''
    : ` EXPORT MISMATCH missing=[${f.exportCheck.onlyInOld.join(', ')}] extra=[${f.exportCheck.onlyInNew.join(', ')}]`;
  // eslint-disable-next-line no-console
  console.log(`  ${f.file}: ${f.residualLineCount} residual line(s)${exportNote}`);
}
if (cleanFileCount > 0) {
  // eslint-disable-next-line no-console
  console.log(`  (+ ${cleanFileCount} file(s) with zero residual and a clean export-set check)`);
}

const totalFiles = classification.files.length;
const passingFiles = classification.files.filter(f => f.exportCheck.ok).length;
if (classification.allExportChecksPass) {
  // eslint-disable-next-line no-console
  console.log(`Export-set check: ${passingFiles}/${totalFiles} files OK`);
} else {
  const failures = classification.files.filter(f => !f.exportCheck.ok);
  for (const f of failures) {
    // eslint-disable-next-line no-console
    console.log(
      `Export-set check: FAILED — ${f.file}: missing [${f.exportCheck.onlyInOld.join(', ')}], extra [${f.exportCheck.onlyInNew.join(', ')}]`
    );
  }
}
// eslint-disable-next-line no-console
console.log(
  `Explained mechanically before the residual: ${classification.totalRenamedBindings} local-binding renames (alpha-normalized) and ${classification.totalToEsmUnwraps} __toESM interop wraps.`
);
// eslint-disable-next-line no-console
console.log(
  `Residual after stripping known-safe transformations: ${classification.totalResidualLines} lines total (was ${full.split('\n').length} before classification)`
);

// The export-set check is the only thing here with real teeth: an unexplained residual is
// reported for a human to read, but only a dropped/renamed export fails the build.
if (!classification.allExportChecksPass) {
  process.exit(1);
}
