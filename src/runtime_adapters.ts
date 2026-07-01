/* eslint-disable no-restricted-imports*/

// We squash the restricted import errors here because we are using type-only imports, which
// do not impact the driver's actual runtime dependencies.
// We also allow restricted imports in this file, because we expect this file to be the only place actually importing restricted Node APIs.

import type * as os from 'os';

import { dynamicImport } from '../shims/runtime_import';
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
  if (typeof require === 'function') {
    // Some environments (plain Node, CJS bundling, native ESM), have a `require` function available, we try that first.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const osModule = require('os') as typeof os;
      return Promise.resolve(osModule);
    } catch {
      // If require fails, we fall back to dynamic import below.
      // This can happen in ESM bundles where `require` may be available, but will always throw.
    }
  }

  // Fall back to a genuine dynamic `import()`. This lives in the hand-written CommonJS shim
  // `../shims/runtime_import`, which is kept out of the TypeScript build so the `import()` is not
  // downleveled to `require()`.
  return dynamicImport<typeof os>('os');
}
