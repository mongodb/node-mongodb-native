/**
 * @internal
 *
 * Type declarations for the hand-written CommonJS shim in `runtime_import.js`. That file lives
 * outside `src/` so the TypeScript build never compiles it, which would downlevel its dynamic
 * `import()` to `require()`.
 *
 * @param specifier - The module specifier to import.
 * @returns A promise that resolves to the imported module namespace.
 */
export declare function dynamicImport<T>(specifier: string): Promise<T>;
