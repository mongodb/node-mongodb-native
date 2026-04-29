/* eslint-disable @typescript-eslint/no-require-imports */

import * as fs from 'node:fs';
import { isBuiltin } from 'node:module';
import * as path from 'node:path';
import * as vm from 'node:vm';

import { ALLOWED_DRIVER_REQUIRE_PROPERTY_NAME } from '../../mongodb_all';

/**
 * Debug logging for bundled test environment issues
 */
function debug(msg: unknown) {
  if (process.env.MONGODB_BUNDLE_DEBUG) {
    // eslint-disable-next-line no-console
    console.log(`[BUNDLE_DEBUG] ${msg}`);
  }
}

const allowedModules = new Set([
  '@aws-sdk/credential-providers',
  '@mongodb-js/saslprep',
  '@mongodb-js/zstd',
  'gcp-metadata',
  'kerberos',
  'mongodb-client-encryption',
  'mongodb-connection-string-url',
  'path',
  'snappy',
  'socks'
]);
const blockedModules = new Set(['os']);

// TODO: NODE-7460 - Remove Error, Map, Math, Promise, and other unnecessary exports
const exposedGlobals = new Set([
  'AbortController',
  'AbortSignal',
  'BigInt',
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

  'atob',
  'btoa',
  'clearImmediate',
  'clearInterval',
  'clearTimeout',
  'setImmediate',
  'setInterval',
  'setTimeout',
  'queueMicrotask',
]);

/**
 * Creates a require function that blocks access to specified core modules
 */
function createRestrictedRequire() {
  return function restrictedRequire(moduleName: string) {
    const isAllowedBySymbol = !!sandbox[ALLOWED_DRIVER_REQUIRE_PROPERTY_NAME];
    const isModuleBuiltin = isBuiltin(moduleName);
    const isModuleAllowed = allowedModules.has(moduleName);
    const isModuleBlocked = blockedModules.has(moduleName);
    const shouldAllow = isModuleAllowed || isModuleBuiltin;
    const shouldBlock = (isModuleBlocked || !shouldAllow) && !isAllowedBySymbol;

    if (shouldBlock) {
      throw new Error(`Access to core module '${moduleName}' is restricted in this context`);
    }

    const required = require(moduleName);
    debug(`Loaded external module: ${moduleName}`);
    return required;
  } as NodeJS.Require;
}

const context = {
  __proto__: null,

  // Custom require that blocks core modules
  require: createRestrictedRequire(),

  // Needed for some modules
  global: undefined as any,
  globalThis: undefined as any,

  // Block Buffer from being accessible in the context
  Buffer: undefined,
};

// Expose allowed globals in the context
for (const globalName of exposedGlobals) {
  if (globalName in global) {
    context[globalName] = (global as any)[globalName];
  }
}

// Ensure TextEncoder/TextDecoder are always available (needed for webByteUtils)
if (!context.TextEncoder && typeof TextEncoder !== 'undefined') {
  context.TextEncoder = TextEncoder;
}
if (!context.TextDecoder && typeof TextDecoder !== 'undefined') {
  context.TextDecoder = TextDecoder;
}

// Ensure btoa/atob are available (needed for webByteUtils base64 encoding)
if (!context.btoa && typeof btoa !== 'undefined') {
  context.btoa = btoa;
}
if (!context.atob && typeof atob !== 'undefined') {
  context.atob = atob;
}

// Create a sandbox context with necessary globals
const sandbox = vm.createContext(context);

// Make globalThis point to the sandbox
sandbox.globalThis = sandbox;

// Diagnostic: Check if Buffer is accessible in the VM context
if (process.env.MONGODB_BUNDLE_DEBUG) {
  try {
    const testScript = new vm.Script('typeof Buffer');
    const bufferType = testScript.runInContext(sandbox);
    debug(`In VM context, typeof Buffer = ${bufferType}`);
  } catch (e) {
    debug(`Error checking Buffer in context: ${(e as Error).message}`);
  }
}

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
