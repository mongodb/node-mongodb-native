// This file is hand-written CommonJS. It lives OUTSIDE `src/` on purpose: the TypeScript build
// only compiles `src/**/*` (see tsconfig.json "include"), so tsc never touches this file. If it
// did, it would downlevel `import('os')` into `Promise.resolve().then(() => require('os'))`
// under `module: commonjs`.
//
// Keeping the dynamic import in a file the compiler never sees preserves it as a genuine runtime
// `import()`, which:
//   - survives TypeScript downleveling (the file is not compiled), and
//   - survives downstream bundlers as a real dynamic import, unlike a
//     `new Function('return import(...)')` trick.
//
// The specifier is deliberately a literal, not a parameter: a literal `import('os')` remains
// statically analyzable, so bundlers can see, resolve, and alias the target (NODE-3199), whereas
// `import(someVariable)` is opaque to static analysis.
//
// It ships as-is via the package.json "files" array and is required by the compiled
// `lib/runtime_adapters.js` as `../shims/runtime_import`.
//
// NODE-7133 (ESM-only packages) will eventually let us use `import(...)` directly from TypeScript
// source and delete this shim.

Object.defineProperty(exports, '__esModule', { value: true });

exports.importOs = function importOs() {
  return import('os');
};
