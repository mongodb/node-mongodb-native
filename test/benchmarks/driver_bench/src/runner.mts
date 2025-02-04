/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { metrics, snakeToCamel } from './driver.mjs';

const [, , benchmarkFile] = process.argv;

type BenchmarkModule = {
  taskSize: number;
  before?: () => Promise<void>;
  beforeEach?: () => Promise<void>;
  run: () => Promise<void>;
  afterEach?: () => Promise<void>;
  after?: () => Promise<void>;
};

const benchmarkName = snakeToCamel(path.basename(benchmarkFile, '.mjs'));
const benchmark: BenchmarkModule = await import(`./${benchmarkFile}`);

if (typeof benchmark.taskSize !== 'number') throw new Error('missing taskSize');
if (typeof benchmark.run !== 'function') throw new Error('missing run');

/** CRITICAL SECTION: time task took in seconds */
async function timeTask() {
  const start = performance.now();
  await benchmark.run();
  const end = performance.now();
  return (end - start) / 1000;
}

/** 1 min in seconds */
const ONE_MIN = 1 * 60;
/** 5 min in seconds */
const FIVE_MIN = 5 * 60;
/** Don't run more than 100 iterations */
const MAX_COUNT = 100;

await benchmark.before?.();

// for 1/10th the max iterations
const warmupIterations = (MAX_COUNT / 10) | 0;

// Warm Up.
for (let i = 0; i < warmupIterations; i++) {
  await benchmark.beforeEach?.();
  await timeTask();
  await benchmark.afterEach?.();
}

// Allocate an obscene amount of space
const data = new Float64Array(10_000_000);

// Test.
let totalDuration = 0;
let count = 0;
do {
  await benchmark.beforeEach?.();

  data[count] = await timeTask();

  await benchmark.afterEach?.();

  totalDuration += data[count]; // time moves up by benchmark exec time not wall clock
  count += 1;

  // must run for at least one minute
  if (totalDuration < ONE_MIN) continue;

  // 100 runs OR five minutes
  if (count > 100 || totalDuration > FIVE_MIN) break;

  // count exceeds data space, we never intend to have more than a million data points let alone 10M
  if (count === data.length) break;

  // else: more than one min, less than 100 iterations, less than 5min

  // eslint-disable-next-line no-constant-condition
} while (true);

await benchmark.after?.();

const durations = data.subarray(0, count).toSorted((a, b) => a - b);

function percentileIndex(percentile: number, count: number) {
  return Math.max(Math.floor((count * percentile) / 100 - 1), 0);
}

const medianExecution = durations[percentileIndex(50, count)];

console.log(
  '   ',
  benchmarkName,
  'finished in',
  totalDuration,
  'sec and ran',
  count,
  'iterations.',
  'median exec time',
  medianExecution,
  'sec',
  benchmark.taskSize / medianExecution,
  'mb/sec'
);

await fs.writeFile(
  `results_${path.basename(benchmarkFile, '.mjs')}.json`,
  JSON.stringify(metrics(benchmarkName, medianExecution, count), undefined, 2) + '\n',
  'utf8'
);
