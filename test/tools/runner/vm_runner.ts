/* eslint-disable no-restricted-globals, @typescript-eslint/no-require-imports */

import * as fs from 'node:fs';
import { isBuiltin } from 'node:module';
import * as path from 'node:path';
import * as vm from 'node:vm';

import * as Mocha from 'mocha';
import * as ts from 'typescript';

import * as mochaConfiguration from '../../mocha_mongodb';

const mocha = new Mocha(mochaConfiguration);
mocha.suite.emit('pre-require', global, 'host-context', mocha);

// mocha hooks and custom "require" modules needs to be loaded and injected separately
require('./throw_rejections.cjs');
require('./chai_addons.ts');
require('./ee_checker.ts');
for (const path of ['./hooks/leak_checker.ts', './hooks/configuration.ts']) {
  const mod = require(path);
  const hooks = mod.mochaHooks;
  const register = (hookName, globalFn) => {
    if (hooks[hookName]) {
      const list = Array.isArray(hooks[hookName]) ? hooks[hookName] : [hooks[hookName]];
      list.forEach(fn => globalFn(fn));
    }
  };

  register('beforeAll', global.before);
  register('afterAll', global.after);
  register('beforeEach', global.beforeEach);
  register('afterEach', global.afterEach);
}

let compilerOptions: ts.CompilerOptions = { module: ts.ModuleKind.CommonJS };
const tsConfigPath = path.join(__dirname, '../../tsconfig.json');
const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
if (!configFile.error) {
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsConfigPath)
  );
  compilerOptions = {
    ...parsedConfig.options,
    module: ts.ModuleKind.CommonJS,
    sourceMap: false,
    // inline source map for stack traces
    inlineSourceMap: true
  };
} else {
  throw new Error('tsconfig is missing');
}

const moduleCache = new Map();

const sandbox = vm.createContext({
  __proto__: null,

  console: console,
  AbortController: AbortController,
  AbortSignal: AbortSignal,
  Date: global.Date,
  Error: global.Error,
  URL: global.URL,
  URLSearchParams: global.URLSearchParams,
  queueMicrotask: queueMicrotask,
  performance: global.performance,

  process: process,

  context: global.context,
  describe: global.describe,
  xdescribe: global.xdescribe,
  it: global.it,
  xit: global.xit,
  before: global.before,
  after: global.after,
  beforeEach: global.beforeEach,
  afterEach: global.afterEach
});

function createProxiedRequire(parentPath: string) {
  const parentDir = path.dirname(parentPath);

  return function sandboxRequire(moduleIdentifier: string) {
    // allow all code modules be imported by the host environment
    if (isBuiltin(moduleIdentifier)) {
      return require(moduleIdentifier);
    }

    // list of dependencies we want to import from within the sandbox
    const sandboxedDependencies = ['bson'];
    const isSandboxedDep = sandboxedDependencies.some(
      dep => moduleIdentifier === dep || moduleIdentifier.startsWith(`${dep}/`)
    );
    if (!moduleIdentifier.startsWith('.') && !isSandboxedDep) {
      return require(moduleIdentifier);
    }

    // require.resolve throws if module can't be loaded, let it bubble up
    const fullPath = require.resolve(moduleIdentifier, { paths: [parentDir] });
    return loadInSandbox(fullPath);
  };
}

function loadInSandbox(filepath: string) {
  const realPath = fs.realpathSync(filepath);

  if (moduleCache.has(realPath)) {
    return moduleCache.get(realPath);
  }

  // clientmetadata requires package.json to fetch driver's version
  if (realPath.endsWith('package.json')) {
    const jsonContent = JSON.parse(fs.readFileSync(realPath, 'utf8'));
    moduleCache.set(realPath, jsonContent);
    return jsonContent;
  }

  // js-bson is allowed to use Buffer, only ./src/ is not
  const isSourceFile = realPath.includes('/src/') && !realPath.includes('node_modules');
  const isTestFile = realPath.includes('.test.ts') || realPath.includes('.test.js');

  let localBuffer = Buffer;
  if (isSourceFile && !isTestFile) {
    localBuffer = new Proxy(Buffer, {
      get(target, prop, receiver) {
        if (
          typeof prop === 'symbol' ||
          ['prototype', 'constructor', 'name', 'inspect'].includes(prop as string)
        ) {
          return Reflect.get(target, prop, receiver);
        }

        throw new Error(
          `Forbidden: 'Buffer' usage is not allowed in source files. Use Uint8Array instead. File: ${realPath}`
        );
      },
      construct() {
        throw new Error(
          `Forbidden: 'Buffer' usage is not allowed in source files. Use Uint8Array instead. File: ${realPath}`
        );
      }
    }) as any;
  }

  const content = fs.readFileSync(realPath, 'utf8');
  let executableCode: string;
  if (realPath.endsWith('.ts')) {
    executableCode = ts.transpileModule(content, {
      compilerOptions: compilerOptions,
      fileName: realPath
    }).outputText;
  } else {
    // .js or .cjs should work just fine
    executableCode = content;
  }

  const exportsContainer = {};
  const localModule = { exports: exportsContainer };
  const localRequire = createProxiedRequire(realPath);
  const filename = realPath;
  const dirname = path.dirname(realPath);

  // prevent recursion
  moduleCache.set(realPath, localModule.exports);

  try {
    const wrapper = `(function(exports, require, module, __filename, __dirname, Buffer) {
      ${executableCode}
    })`;
    const script = new vm.Script(wrapper, { filename: realPath });
    const fn = script.runInContext(sandbox);

    fn(localModule.exports, localRequire, localModule, filename, dirname, localBuffer);

    const result = localModule.exports;

    const isBSON = realPath.includes('node_modules/bson');
    const isError = realPath.includes('src/error.ts');

    if (isBSON || isError) {
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'function' && value.name) {
          // force instanceof to work across contexts by defining custom `instanceof` function
          Object.defineProperty(value, Symbol.hasInstance, {
            value: (i: any) => {
              if (!i) return false;
              // use isPrototypeOf to avoid triggering the 'instanceof' trap recursively
              return (
                i.constructor.name === value.name ||
                Object.prototype.isPrototypeOf.call(value.prototype, i)
              );
            },
            configurable: true
          });

          // also inject into global for easier access in tests
          (sandbox as any)[key] = value;
        }
      }
    }

    moduleCache.set(realPath, result);

    return result;
  } catch (err: any) {
    moduleCache.delete(realPath);
    console.error(`Error running ${realPath} in sandbox:`, err);
    throw err;
  }
}

// use it similar to regular mocha:
//   mocha --config test/mocha_mongodb.js test/integration
//   ts-node test/runner/vm_context.ts test/integration
const userArgs = process.argv.slice(2);
const searchTargets = userArgs.length > 0 ? userArgs : ['test'];
const testFiles = searchTargets.flatMap(target => {
  try {
    const stats = fs.statSync(target);
    if (stats.isDirectory()) {
      const pattern = path.join(target, '**/*.test.{ts,js}').replace(/\\/g, '/');
      return fs.globSync(pattern);
    }
    if (stats.isFile()) {
      return [target];
    }
  } catch {
    console.error(`Error: Could not find path "${target}"`);
  }
  return [];
});

if (testFiles.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

testFiles.forEach(file => {
  loadInSandbox(path.resolve(file));
});

console.log('Running Tests...');
mocha.run(failures => {
  process.exitCode = failures ? 1 : 0;
});
