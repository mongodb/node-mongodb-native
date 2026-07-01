import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect } from 'chai';
import * as esbuild from 'esbuild';
import * as process from 'process';
import * as ts from 'typescript';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('bundling the runtime adapters into ESM output', function () {
  // Transpiling + bundling with esbuild and spawning a fresh node process can exceed the default timeout.
  this.timeout(120_000);

  let tmpDir: string;
  let esmBundlePath: string;

  before('compile and bundle resolveRuntimeAdapters into ESM', async function () {
    // NODE-7603: resolveRuntimeAdapters used to call require('os'), which throws in bundled ESM
    // output (no `require` in module scope). This reproduces the published artifact and a downstream
    // ESM bundler: transpile the source the way the build does (module: commonjs) so any literal
    // `import()` would be downleveled back to require(), then bundle that to ESM. The fix must
    // therefore survive both steps and resolve `os` via a real runtime import().
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'runtime_adapters.ts'), 'utf8');
    const { outputText: compiledCjs } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 }
    });

    // Mirror the published package layout: the compiled module lives in lib/ and requires the
    // hand-written shim as `../shims/runtime_import`, so reproduce those sibling directories.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mongodb-esm-bundle-'));
    fs.mkdirSync(path.join(tmpDir, 'lib'));
    fs.mkdirSync(path.join(tmpDir, 'shims'));
    fs.writeFileSync(path.join(tmpDir, 'lib', 'runtime_adapters.js'), compiledCjs);
    // runtime_import.js is the hand-written CommonJS shim that resolveRuntimeAdapters imports for
    // its dynamic import() fallback. It is deliberately NOT compiled (that is the whole point of
    // NODE-7603), so copy it verbatim into the sibling shims/ dir, exactly as it ships.
    fs.copyFileSync(
      path.join(repoRoot, 'shims', 'runtime_import.js'),
      path.join(tmpDir, 'shims', 'runtime_import.js')
    );
    esmBundlePath = path.join(tmpDir, 'app.mjs');

    await esbuild.build({
      stdin: {
        // No user-provided os adapter, so resolveRuntimeAdapters falls back to loading Node's os.
        contents: `
          import { resolveRuntimeAdapters } from './lib/runtime_adapters.js';
          const runtime = await resolveRuntimeAdapters({});
          const osAdapter = await runtime.os;
          if (typeof osAdapter.platform !== 'function') {
            throw new Error('resolved os adapter is missing platform()');
          }
          console.log('resolved os adapter');
        `,
        resolveDir: tmpDir,
        loader: 'js'
      },
      bundle: true,
      outfile: esmBundlePath,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      logLevel: 'silent'
    });
  });

  after(function () {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves the default os adapter without a global require', function () {
    const { status, stdout, stderr } = spawnSync(process.execPath, [esmBundlePath], {
      encoding: 'utf8'
    });

    // Surface the child's stderr in the failure message so a regression is easy to diagnose.
    expect(stderr, stderr).to.not.match(/require/i);
    expect(stdout).to.include('resolved os adapter');
    expect(status).to.equal(0);
  });
});
