import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

import { expect } from 'chai';
import * as ts from 'typescript';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function transpile(srcPath: string, overrides: ts.CompilerOptions): string {
  const tsconfigPath = path.join(repoRoot, 'tsconfig.json');
  const { config } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const { options } = ts.convertCompilerOptionsFromJson(
    config.compilerOptions,
    repoRoot,
    tsconfigPath
  );
  const source = fs.readFileSync(path.join(repoRoot, srcPath), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: { ...options, sourceMap: false, ...overrides }
  }).outputText;
}

describe('esModuleInterop forced on (TypeScript 6)', function () {
  it('emits lib/ code that throws when a consumer requires the driver', function () {
    const js = transpile('src/sdam/srv_polling.ts', { esModuleInterop: true });

    expect(() => vm.runInNewContext(js, { exports: {}, require })).to.throw(
      /__importStar is not defined/
    );
  });

  it('stops the driver from seeing exports a user adds to a built-in module after loading it', function () {
    const loadDeps = (esModuleInterop: boolean, zlib: Record<string, unknown>) => {
      const js = transpile('src/deps.ts', { esModuleInterop, noEmitHelpers: false });
      const fakeRequire = (id: string) => {
        if (id === 'zlib') return zlib;
        if (id === './error') return { MongoMissingDependencyError: Error };
        throw new Error(`Cannot find module '${id}'`);
      };
      const exports: any = {};
      new Function('exports', 'require', js)(exports, fakeRequire);
      return exports;
    };
    const polyfill = (zlib: Record<string, unknown>) => {
      zlib.zstdCompress = (buf: Uint8Array, _options: unknown, callback: any) =>
        callback(null, buf);
      zlib.zstdDecompress = (buf: Uint8Array, callback: any) => callback(null, buf);
    };

    const zlibToday = { constants: {} };
    const depsToday = loadDeps(false, zlibToday);
    polyfill(zlibToday);

    const zlibTs6 = { constants: {} };
    const depsTs6 = loadDeps(true, zlibTs6);
    polyfill(zlibTs6);

    expect(depsToday.getZstdLibrary()).to.have.property('compress').that.is.a('function');
    expect(depsTs6.getZstdLibrary().kModuleError).to.be.instanceOf(Error);
  });
});
