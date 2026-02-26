/* eslint-disable no-restricted-globals, @typescript-eslint/no-require-imports */

import * as fs from 'node:fs';
import { isBuiltin } from 'node:module';
import * as path from 'node:path';
import * as vm from 'node:vm';

const allowedModules = new Set([
  '@aws-sdk/credential-providers',
  '@mongodb-js/saslprep',
  '@mongodb-js/zstd',
  'bson',
  'gcp-metadata',
  'kerberos',
  'mongodb-client-encryption',
  'mongodb-connection-string-url',
  'path',
  'snappy'
]);
const blockedModules = new Set(['os']);

/**
 * Creates a require function that blocks access to specified core modules
 */
function createRestrictedRequire() {
  return function restrictedRequire(moduleName: string) {
    const isModuleBuiltin = isBuiltin(moduleName);
    const isModuleAllowed = allowedModules.has(moduleName);
    const isModuleBlocked = blockedModules.has(moduleName);
    const shouldAllow = isModuleAllowed || isModuleBuiltin;
    const shouldBlock = isModuleBlocked || !shouldAllow;

    if (shouldBlock) {
      throw new Error(`Access to core module '${moduleName}' is restricted in this context`);
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

  // TODO: NODE-7460 - Remove Error and other unnecessary exports

  // Global objects needed for runtime
  Buffer: Buffer,
  Headers: global.Headers,
  Map: Map,
  Promise: Promise,
  Math: Math,
  TextEncoder: global.TextEncoder,
  TextDecoder: global.TextDecoder,
  BigInt: global.BigInt,
  crypto: global.crypto,

  // Custom require that blocks core modules
  require: createRestrictedRequire(),

  // Driver require
  __driver_require: require,

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

  const exportsContainer = { __proto__: null };
  const moduleContainer = { __proto__: null, exports: exportsContainer };

  // Wrap the bundle in a CommonJS-style wrapper
  const wrapper = `(function(exports, module, require) {${bundleCode}})`;

  const script = new vm.Script(wrapper, { filename: bundlePath });
  const fn = script.runInContext(sandbox);

  // Execute the bundle with the restricted require from the sandbox
  fn(moduleContainer.exports, moduleContainer, sandbox.require);

  return moduleContainer.exports;
}
