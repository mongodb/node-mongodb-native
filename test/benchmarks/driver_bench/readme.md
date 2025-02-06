# Node.js Driver Benchmarks

Set up the driver for development (`npm ci` in the top level of this repo).

Then:

```sh
npm start
```

will build the benchmarks and run them.

## Running individual benchmarks

`main.mjs` loops and launches the bench runner for you.

You can launch `runner.mjs` directly and tell it which benchmark to run.

```sh
node lib/runner.mjs suites/multi_bench/grid_fs_upload.mjs
```

## Writing your own benchmark

In the suites directory you can add a new suite folder or add a new `.mts` file to an existing one.

A benchmark must export the following:

```ts
type BenchmarkModule = {
  taskSize: number;
  before?: () => Promise<void>;
  beforeEach?: () => Promise<void>;
  run: () => Promise<void>;
  afterEach?: () => Promise<void>;
  after?: () => Promise<void>;
};
```

Just like mocha we have once before and once after as well as before each and after each hooks.

The `driver.mts` module is intended to hold various helpers for setup and teardown and help abstract some of the driver API.

## Wishlist

- Make it so runner can handle: `./lib/suites/multi_bench/grid_fs_upload.mjs` as an argument so shell path autocomplete makes it easier to pick a benchmark
- Make `main.mjs` accept a filter of some kind to run some of the benchmarks
- TBD
