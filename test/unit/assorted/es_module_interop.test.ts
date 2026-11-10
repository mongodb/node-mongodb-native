import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

import { expect } from 'chai';
import * as ts from 'typescript';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function transpile(srcPath: string, overrides: ts.CompilerOptions = {}): string {
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

describe('`import * as` emit with the repo tsconfig and installed TypeScript', function () {
  it('emits lib/ code that throws when a consumer requires the driver', function () {
    const js = transpile('src/sdam/srv_polling.ts');

    expect(() => vm.runInNewContext(js, { exports: {}, require })).to.throw(
      /__importStar is not defined/
    );
  });

  it('stops the driver from seeing exports a user adds to a built-in module after loading it', function () {
    const js = transpile('src/deps.ts', {});
    const zlib: Record<string, unknown> = { constants: {} };
    const fakeRequire = (id: string) => {
      if (id === 'zlib') return zlib;
      if (id === './error') return { MongoMissingDependencyError: Error };
      throw new Error(`Cannot find module '${id}'`);
    };
    const deps: any = {};
    new Function('exports', 'require', js)(deps, fakeRequire);

    zlib.zstdCompress = (buf: Uint8Array, _options: unknown, callback: any) => callback(null, buf);
    zlib.zstdDecompress = (buf: Uint8Array, callback: any) => callback(null, buf);

    expect(deps.getZstdLibrary().kModuleError).to.be.instanceOf(Error);
  });

  it('hides inherited members of a built-in module from driver code', function () {
    const js = transpile('src/deps.ts', {});
    const zlib = Object.create({
      constants: {},
      zstdCompress: (buf: Uint8Array, _options: unknown, callback: any) => callback(null, buf),
      zstdDecompress: (buf: Uint8Array, callback: any) => callback(null, buf)
    });
    const fakeRequire = (id: string) => {
      if (id === 'zlib') return zlib;
      if (id === './error') return { MongoMissingDependencyError: Error };
      throw new Error(`Cannot find module '${id}'`);
    };
    const deps: any = {};
    new Function('exports', 'require', js)(deps, fakeRequire);

    expect(deps.getZstdLibrary().kModuleError).to.be.instanceOf(Error);
  });
});
