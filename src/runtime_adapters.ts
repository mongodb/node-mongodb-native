/**
 * @public
 * @experimental
 */
export type OsAdapter = Pick<typeof import('os'), 'platform' | 'release' | 'arch' | 'type'>;

/**
 * @public
 * @experimental
 *
 * This type represents the interface that the driver needs from the runtime in order to function.
 */
export interface RuntimeAdapters {
  os?: OsAdapter;
}

/**
 * @internal
 *
 * Represents a complete, parsed set of runtime adapters.  After options parsing, all adapters
 * are always present (either using the user's provided adapter, or defaulting to Nodejs' module).
 */
export interface Runtime {
  os: OsAdapter;
}
