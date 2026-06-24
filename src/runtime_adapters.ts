/* eslint-disable no-restricted-imports*/

// We squash the restricted import errors here because we are using type-only imports, which
// do not impact the driver's actual runtime dependencies.
// We also allow restricted imports in this file, because we expect this file to be the only place actually importing restricted Node APIs.

import type * as os from 'os';

import { type MongoClientOptions } from './mongo_client';

/**
 * @internal
 *
 * This propery can be set on the global object to allow the driver to require otherwise blocked modules.
 * This is used by our test suite to allow tests to access the `os` module without allowing user code to do so.
 */
export const ALLOWED_DRIVER_REQUIRE_PROPERTY_NAME = 'allowedDriverRequire';

/**
 * @public
 * @experimental
 *
 * Represents the set of dependencies that the driver uses from the [Node.js OS module](https://nodejs.org/api/os.html).
 */
export type OsAdapter = Pick<typeof os, 'release' | 'platform' | 'arch' | 'type'>;

/**
 * @public
 * @experimental
 *
 * This type represents the set of dependencies that the driver needs from the Javascript runtime in order to function.
 */
export interface RuntimeAdapters {
  os?: OsAdapter;
}

/**
 * @internal
 *
 * Represents a complete, parsed set of runtime adapters.  After resolution, all adapters
 * are always present (either using the user's provided adapter, or defaulting to the Node.js module).
 */
export interface Runtime {
  os: OsAdapter;
}

/**
 * @internal
 *
 * Given a MongoClientOptions, this function resolves the set of runtime options, providing Nodejs implementations if
 * not provided in `options`, and returns a `Runtime`.
 *
 * Resolution is asynchronous because the default adapters are loaded from Node.js built-ins via a
 * dynamic `import()` (see `loadNodeOsAdapter`). The resulting promise is created during synchronous
 * options parsing and awaited later by consumers, so the public constructor stays synchronous while
 * the `Runtime` itself exposes fully-resolved, concrete adapters.
 */
export async function resolveRuntimeAdapters(options: MongoClientOptions): Promise<Runtime> {
  return {
    os: options.runtimeAdapters?.os ?? (await loadNodeOsAdapter())
  };
}

/**
 * @internal
 */
function loadNodeOsAdapter(): Promise<OsAdapter> {
  return dynamicImport<typeof os>('os');
}

/**
 * @internal
 *
 * Dynamically imports a module at runtime in a way that survives bundling and TypeScript's
 * downleveling. We deliberately avoid both `require(specifier)` and a static `await import(...)`:
 * - a raw `require` throws in bundled ESM output, where there is no `require` in module scope
 *   (NODE-7603), and
 * - a literal `import(...)` is downleveled back to `require(...)` by TypeScript under
 *   `module: commonjs`, which reintroduces the same problem in the published CommonJS build.
 *
 * Constructing the dynamic `import` through `new Function` hides it from both the TypeScript
 * compiler and downstream bundlers, so it survives as a real runtime `import()` in every
 * environment. Call this lazily (never at module load) so strict-CSP runtimes that forbid
 * `new Function` are unaffected unless they actually need the default adapter.
 *
 * NODE-7133 (ESM-only packages) will eventually let us use `import(...)` directly and drop this.
 *
 * @param specifier - The module specifier to import.
 * @returns A promise that resolves to the imported module.
 */
function dynamicImport<T>(specifier: string): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('specifier', 'return import(specifier)')(specifier);
}
