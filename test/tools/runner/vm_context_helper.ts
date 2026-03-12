/* eslint-disable @typescript-eslint/no-require-imports */

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
  'snappy',
  'socks'
]);
const blockedModules = new Set(['os']);

// TODO: NODE-7460 - Remove Error and other unnecessary exports
const exposedGlobals = new Set([
  'AbortController',
  'AbortSignal',
  'BigInt',
  'Buffer',
  'Date',
  'Error',
  'Headers',
  'Map',
  'Math',
  'Promise',
  'TextDecoder',
  'TextEncoder',
  'URL',
  'URLSearchParams',

  'console',
  'crypto',
  'performance',
  'process',

  'clearImmediate',
  'clearInterval',
  'clearTimeout',
  'setImmediate',
  'setInterval',
  'setTimeout',
  'queueMicrotask'
]);

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
  } as NodeJS.Require;
}

const context = {
  __proto__: null,

  // Custom require that blocks core modules
  require: createRestrictedRequire(),

  // Driver require
  __driver_require: require,

  // Needed for some modules
  global: undefined as any,
  globalThis: undefined as any
};

// Expose allowed globals in the context
for (const globalName of exposedGlobals) {
  if (globalName in global) {
    context[globalName] = (global as any)[globalName];
  }
}

// Create a sandbox context with necessary globals
const sandbox = vm.createContext(context);

// Make global and globalThis point to the sandbox
sandbox.globalThis = sandbox;

/**
 * Load the bundled MongoDB driver module in a VM context
 * This allows us to control the globals that the driver has access to
 */
export function loadContextifiedMongoDBModule(): typeof import('../../mongodb_all') {
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

  return moduleContainer.exports as unknown as typeof import('../../mongodb_all');
}
