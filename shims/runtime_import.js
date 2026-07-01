// This file is hand-written CommonJS. It lives OUTSIDE `src/` on purpose: the TypeScript build
// only compiles `src/**/*` (see tsconfig.json "include"), so tsc never touches this file. If it
// did, it would downlevel `import(specifier)` into `Promise.resolve().then(() => require(specifier))`
// under `module: commonjs`.
//
// Keeping the dynamic import in a file the compiler never sees preserves it as a genuine runtime
// `import()`, which:
//   - survives TypeScript downleveling (the file is not compiled), and
//   - survives downstream bundlers as a real dynamic import (they can see and alias the
//     specifier), unlike a `new Function('return import(...)')` trick.
//
// It ships as-is via the package.json "files" array and is required by the compiled
// `lib/runtime_adapters.js` as `../shims/runtime_import`.
//
// NODE-7133 (ESM-only packages) will eventually let us use `import(...)` directly from TypeScript
// source and delete this shim.

Object.defineProperty(exports, '__esModule', { value: true });

exports.dynamicImport = function dynamicImport(specifier) {
  return import(specifier);
};
