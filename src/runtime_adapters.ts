/* eslint-disable no-restricted-imports */
// We squash the restricted import errors here because we are using type-only imports, which
// do not impact the driver's actual runtime dependencies.

import type * as os from 'os';

import { type MongoClientOptions } from './mongo_client';

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
 * Given a MongoClientOptions, this function resolves the set of runtime options, providing Nodejs implementations if
 * not provided by in `options`, and returns a `Runtime`.
 */
export function resolveRuntimeAdapters(options: MongoClientOptions): Runtime {
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    os: options.runtimeAdapters?.os ?? require('os')
  };
}
