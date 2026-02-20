/* eslint-disable no-restricted-globals, @typescript-eslint/no-require-imports */

import * as fs from 'node:fs';
import { isBuiltin } from 'node:module';
import * as path from 'node:path';
import * as vm from 'node:vm';

/**
 * Creates a require function that blocks access to specified core modules
 */
function createRestrictedRequire() {
  const blockedModules = new Set(['os']);

  return function restrictedRequire(moduleName: string) {
    // Block core modules
    if (isBuiltin(moduleName) && blockedModules.has(moduleName)) {
      const sourceFile = new Error().stack.split('\n')[2]?.replace('at', '').trim();
      const source = sourceFile ? `from ${sourceFile}` : 'from an unknown source';
      throw new Error(
        `Access to core module '${moduleName}' (${source}) is restricted in this context`
      );
    }

    return require(moduleName);
  } as NodeRequire;
}

// Create a sandbox context with necessary globals
const sandbox = vm.createContext({
  __proto__: null,

  // Console and timing
  console: console,
  AbortController: AbortController,
  AbortSignal: AbortSignal,
  Date: global.Date,
  Error: global.Error,
  URL: global.URL,
  URLSearchParams: global.URLSearchParams,
  queueMicrotask: queueMicrotask,
  performance: global.performance,
  setTimeout: global.setTimeout,
  clearTimeout: global.clearTimeout,
  setInterval: global.setInterval,
  clearInterval: global.clearInterval,
  setImmediate: global.setImmediate,
  clearImmediate: global.clearImmediate,

  // Process
  process: process,

  // Global objects needed for runtime
  Buffer: Buffer,
  Headers: global.Headers,
  Promise: Promise,
  Map: Map,
  Set: Set,
  WeakMap: WeakMap,
  WeakSet: WeakSet,
  ArrayBuffer: ArrayBuffer,
  SharedArrayBuffer: SharedArrayBuffer,
  Atomics: Atomics,
  DataView: DataView,
  Int8Array: Int8Array,
  Uint8Array: Uint8Array,
  Uint8ClampedArray: Uint8ClampedArray,
  Int16Array: Int16Array,
  Uint16Array: Uint16Array,
  Int32Array: Int32Array,
  Uint32Array: Uint32Array,
  Float32Array: Float32Array,
  Float64Array: Float64Array,
  BigInt64Array: BigInt64Array,
  BigUint64Array: BigUint64Array,

  // Other necessary globals
  TextEncoder: global.TextEncoder,
  TextDecoder: global.TextDecoder,
  BigInt: global.BigInt,
  Symbol: Symbol,
  Proxy: Proxy,
  Reflect: Reflect,
  Object: Object,
  Array: Array,
  Function: Function,
  String: String,
  Number: Number,
  Boolean: Boolean,
  RegExp: RegExp,
  Math: Math,
  JSON: JSON,
  Intl: global.Intl,
  crypto: global.crypto,

  // Custom require that blocks core modules
  require: createRestrictedRequire(),

  // Needed for some modules
  global: undefined as any,
  globalThis: undefined as any
});

// Make global and globalThis point to the sandbox
sandbox.global = sandbox;
sandbox.globalThis = sandbox;

/**
 * Load the bundled MongoDB driver module in a VM context
 * This allows us to control the globals that the driver has access to
 */
export function loadContextifiedMongoDBModule() {
  const bundlePath = path.join(__dirname, 'bundle/driver-bundle.js');

  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Driver bundle not found at ${bundlePath}. Run 'npm run bundle:driver' first.`);
  }

  const bundleCode = fs.readFileSync(bundlePath, 'utf8');

  const exportsContainer = {};
  const moduleContainer = { exports: exportsContainer };

  // Wrap the bundle in a CommonJS-style wrapper
  const wrapper = `(function(exports, module, require) {${bundleCode}})`;

  const script = new vm.Script(wrapper, { filename: bundlePath });
  const fn = script.runInContext(sandbox);

  // Execute the bundle with the restricted require from the sandbox
  fn(moduleContainer.exports, moduleContainer, sandbox.require);

  return moduleContainer.exports;
}
