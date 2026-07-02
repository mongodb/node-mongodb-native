/**
 * @internal
 *
 * Type declarations for the hand-written CommonJS shim in `runtime_import.js`. That file lives
 * outside `src/` so the TypeScript build never compiles it, which would downlevel its dynamic
 * `import()` to `require()`.
 *
 * @returns A promise that resolves to the `os` module namespace.
 */
export declare function importOs(): Promise<typeof import('os')>;
