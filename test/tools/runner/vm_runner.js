/* eslint-disable no-restricted-globals */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const Mocha = require('mocha');

require('ts-node/register');
require('source-map-support/register');

const mocha = new Mocha({
  extension: ['js', 'ts'],
  ui: 'test/tools/runner/metadata_ui.js',
  recursive: true,
  timeout: 60000,
  failZero: true,
  reporter: 'test/tools/reporter/mongodb_reporter.js',
  sort: true,
  color: true,
  ignore: [
    'test/integration/node-specific/examples/handler.js',
    'test/integration/node-specific/examples/handler.test.js',
    'test/integration/node-specific/examples/aws_handler.js',
    'test/integration/node-specific/examples/aws_handler.test.js',
    'test/integration/node-specific/examples/setup.js',
    'test/integration/node-specific/examples/transactions.test.js',
    'test/integration/node-specific/examples/versioned_api.js'
  ]
});
mocha.suite.emit('pre-require', global, 'host-context', mocha);

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

let compilerOptions = { module: ts.ModuleKind.CommonJS };
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
    inlineSourceMap: false
  };
}

const moduleCache = new Map();

function createSandboxContext(filename) {
  const exportsContainer = {};
  return {
    console: console,
    AbortController: AbortController,
    AbortSignal: AbortSignal,

    context: global.context,
    describe: global.describe,
    xdescribe: global.xdescribe,
    it: global.it,
    xit: global.xit,
    before: global.before,
    after: global.after,
    beforeEach: global.beforeEach,
    afterEach: global.afterEach,

    exports: exportsContainer,
    module: { exports: exportsContainer },
    __filename: filename,
    __dirname: path.dirname(filename),

    // Buffer: Buffer,
    queueMicrotask: queueMicrotask
  };
}

function createProxiedRequire(parentPath) {
  const parentDir = path.dirname(parentPath);

  return function sandboxRequire(moduleIdentifier) {
    if (!moduleIdentifier.startsWith('.')) {
      return require(moduleIdentifier);
    }

    const absolutePath = path.resolve(parentDir, moduleIdentifier);

    let fullPath;
    try {
      fullPath = require.resolve(absolutePath);
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        const alternatives = [absolutePath + '.ts', path.join(absolutePath, 'index.ts')];

        for (const alt of alternatives) {
          try {
            fullPath = require.resolve(alt);
            break;
          } catch {}
        }

        if (!fullPath) {
          return require(moduleIdentifier);
        }
      } else {
        throw e;
      }
    }

    if (fullPath.includes('node_modules')) {
      return require(fullPath);
    }

    if (fullPath.endsWith('.ts') || fullPath.endsWith('.js')) {
      return loadInSandbox(fullPath);
    }

    return require(fullPath);
  };
}

function loadInSandbox(filepath) {
  const realPath = fs.realpathSync(filepath);

  if (moduleCache.has(realPath)) {
    return moduleCache.get(realPath);
  }

  const content = fs.readFileSync(realPath, 'utf8');

  const transpiled = ts.transpileModule(content, {
    compilerOptions: compilerOptions,
    filename: realPath
  });

  const sandbox = createSandboxContext(realPath);
  sandbox.require = createProxiedRequire(realPath);

  moduleCache.set(realPath, sandbox.module.exports);

  try {
    const script = new vm.Script(transpiled.outputText, { filename: realPath });
    script.runInNewContext(sandbox);
  } catch (err) {
    console.error(`Error running ${realPath} in sandbox:`, err.message);
    throw err;
  }

  moduleCache.set(realPath, sandbox.module.exports);
  return sandbox.module.exports;
}

// use it similar to regular mocha:
//   mocha --config test/mocha_mongodb.js test/integration
//   node test/runner/vm_context.js test/integration
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
