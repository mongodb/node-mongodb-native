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

  before(
    'replicate the build pipeline for runtime_adapters and bundle it into ESM',
    async function () {
      // NODE-7603: resolveRuntimeAdapters used to call require('os'), which throws in bundled ESM
      // output (no `require` in module scope). This test replicates what ships in lib/ for this
      // file — tsc CJS emit using the repo's REAL tsconfig compiler options, read from disk
      // rather than mirrored by hand, so a future config change that reintroduces import()
      // downleveling (e.g. reverting `module: node16` to `commonjs`) fails here instead of
      // silently regressing the shipped artifact. The compiled file is then bundled to ESM the
      // way a downstream Vite/esbuild user build would, and executed with no `require` in module
      // scope: under `module: commonjs` the transpile emits
      // `Promise.resolve().then(() => require('os'))` and the bundled app fails — which is
      // exactly the regression this test exists to catch.
      const tsconfigPath = path.join(repoRoot, 'tsconfig.json');
      const { config, error } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      expect(error, 'failed to read tsconfig.json').to.equal(undefined);
      const { options: repoCompilerOptions, errors } = ts.convertCompilerOptionsFromJson(
        config.compilerOptions,
        repoRoot,
        tsconfigPath
      );
      expect(errors, 'failed to parse tsconfig.json compilerOptions').to.deep.equal([]);

      const source = fs.readFileSync(path.join(repoRoot, 'src', 'runtime_adapters.ts'), 'utf8');
      const { outputText: compiledCjs } = ts.transpileModule(source, {
        compilerOptions: {
          ...repoCompilerOptions,
          // Emit-to-disk options are irrelevant to this in-memory transpile.
          sourceMap: false,
          declaration: false,
          declarationMap: false
        }
      });

      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mongodb-esm-bundle-'));
      fs.mkdirSync(path.join(tmpDir, 'lib'));
      fs.writeFileSync(path.join(tmpDir, 'lib', 'runtime_adapters.js'), compiledCjs);
      esmBundlePath = path.join(tmpDir, 'app.mjs');

      await esbuild.build({
        stdin: {
          // No user-provided os adapter, so resolveRuntimeAdapters falls back to loading Node's os.
          contents: `
          import { resolveRuntimeAdapters } from './lib/runtime_adapters.js';
          const runtime = await resolveRuntimeAdapters({});
          if (typeof runtime.os.platform !== 'function') {
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
    }
  );

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
