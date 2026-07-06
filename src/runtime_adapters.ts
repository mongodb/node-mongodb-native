/* eslint-disable no-restricted-imports*/

// We squash the restricted import errors here: the module-scope imports are type-only, and the
// one runtime dependency this file takes — the dynamic `import('os')` fallback in
// resolveRuntimeAdapters — is deliberate: this file is expected to be the only place that loads
// restricted Node APIs at runtime.

import type * as os from 'os';

import { type MongoClientOptions } from './mongo_client';

/**
 * @internal
 *
 * Legacy escape hatch for the test sandbox's restricted `require`: the driver no longer sets this
 * property (the os adapter loads via dynamic `import()`), but the vm test harness
 * still checks it. Kept until the sandbox contract is revisited in a follow-up.
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
 * Represents a complete, parsed set of runtime adapters.  After options parsing, all adapters
 * are always present (either using the user's provided adapter, or defaulting to the Node.js module).
 */
export interface Runtime {
  os: OsAdapter;
}

/**
 * @internal
 *
 * Given a MongoClientOptions, this function resolves the set of runtime options, providing Nodejs
 * implementations if not provided in `options`, and returns a `Runtime`.
 *
 * Resolution is asynchronous because the default `os` adapter is loaded via a dynamic `import()`.
 * Unlike `require`, dynamic import exists in every module system the driver ships into or is
 * bundled into (CJS, ESM, and bundled ESM output), and the literal specifier keeps it
 * statically analyzable for bundlers. The promise is created during synchronous
 * options parsing and awaited later by consumers, so the public constructor stays synchronous.
 */
export async function resolveRuntimeAdapters(options: MongoClientOptions): Promise<Runtime> {
  return {
    os: options.runtimeAdapters?.os ?? (await import('os'))
  };
}
