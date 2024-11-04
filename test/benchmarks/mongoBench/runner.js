'use strict';

const CONSTANTS = require('./constants');
const { performance } = require('perf_hooks');
const Suite = require('./suite');
const fs = require('fs');
const child_process = require('child_process');
const stream = require('stream/promises');
const { Writable } = require('stream');

function timeSyncTask(task, ctx) {
  const start = performance.now();
  task.call(ctx);
  const end = performance.now();

  return (end - start) / 1000;
}

async function timeAsyncTask(task, ctx) {
  const start = performance.now();
  await task.call(ctx);
  const end = performance.now();

  return (end - start) / 1000;
}

const awkFindMiddle = [
  // For each line, store the line in the array `a` with the current line number as the index
  '{ a[NR] = $0 }',
  // After processing all lines (END block), calculate the middle index based on the total line count (NR)
  'END {',
  // Calculate `mid` as the integer division of the line count by 2
  '  mid = int(NR / 2);',
  // If the line count is odd, print the middle line (one-based index: mid + 1)
  '  if (NR % 2)',
  '    print a[mid + 1];',
  // If the line count is even, print the two middle lines
  '  else',
  '    print a[mid], a[mid + 1];',
  '}'
].join(' ');

/**
 * Returns the execution time for the benchmarks in mb/second
 *
 * This function internally calculates the 50th percentile execution time and uses
 * that as the median.
 *
 * @param {Benchmark} benchmark
 * @returns number
 */
async function calculateMicroBench(benchmark) {
  const pipeOptions = { stdio: ['pipe', 'pipe', 'inherit'] };
  const sort = child_process.spawn('sort', ['-n'], pipeOptions);
  const awk = child_process.spawn('awk', [awkFindMiddle], pipeOptions);

  let lines = '';
  const collect = new Writable({
    write: (chunk, encoding, callback) => {
      lines += encoding === 'buffer' ? chunk.toString('utf8') : chunk;
      callback();
    }
  });

  await stream.pipeline(fs.createReadStream('raw.dat', 'utf8'), sort.stdin);
  await stream.pipeline(sort.stdout, awk.stdin);
  await stream.pipeline(awk.stdout, collect);

  fs.unlinkSync('raw.dat');

  const [value0, value1] = lines.trim().split(' ');
  const median = value1 ? (Number(value0) + Number(value1)) / 2 : Number(value0);

  return benchmark.taskSize / median;
}

class Runner {
  constructor(options) {
    options = options || {};
    this.minExecutionTime = options.minExecutionTime || CONSTANTS.DEFAULT_MIN_EXECUTION_TIME;
    this.maxExecutionTime = options.maxExecutionTime || CONSTANTS.DEFAULT_MAX_EXECUTION_TIME;
    this.minExecutionCount = options.minExecutionCount || CONSTANTS.DEFAULT_MIN_EXECUTION_COUNT;
    this.reporter =
      options.reporter ||
      function () {
        console.log.apply(console, arguments);
      };
    this.children = {};
  }

  /**
   * Adds a new test suite to the runner
   * @param {string} name - the name of the test suite
   * @param {(suite: Suite) => void} fn a function that registers a set of benchmarks onto the
   *  parameter `suite`
   * @returns {this} this
   */
  suite(name, fn) {
    if (typeof name !== 'string' || !name) {
      throw new TypeError(`Argument "name" (${name}) must be a non-zero length string`);
    }

    if (typeof fn !== 'function') {
      throw new TypeError(`Argument "fn" must be a function`);
    }

    if (name in this.children) {
      throw new Error(`Name "${name}" already taken`);
    }

    const _suite = new Suite();
    const suite = fn(_suite) || _suite;

    if (!(suite instanceof Suite)) {
      throw new TypeError(`returned object is not a suite`);
    }

    this.children[name] = suite;

    return this;
  }

  async run() {
    this.reporter(`Running Benchmarks`);
    const result = {};

    for (const [suiteName, suite] of Object.entries(this.children)) {
      this.reporter(`  Executing suite "${suiteName}"`);
      result[suiteName] = await this._runSuite(suite);
    }

    return result;
  }

  /**
   *
   * @param {Suite} suite
   *
   * @returns {{string: number | undefined}}
   */
  async _runSuite(suite) {
    const benchmarks = Object.entries(suite.getBenchmarks()).map(([name, benchmark]) => [
      name,
      benchmark.toObj()
    ]);

    const result = {};

    for (const [name, benchmark] of benchmarks) {
      this.reporter(`    Executing Benchmark "${name}"`);
      result[name] = await this._runBenchmark(benchmark);
      this.reporter(`    Executed Benchmark  "${name}" =`, result[name]);
    }

    return result;
  }

  /**
   * Runs a single benchmark.
   *
   * @param {Benchmark} benchmark
   * @returns {Promise<number>} A promise containing the mb/s for the benchmark.  This function never rejects,
   * it instead returns Promise<NaN> if there is an error.
   */
  async _runBenchmark(benchmark) {
    const ctx = {};
    try {
      await benchmark.setup.call(ctx);
      await this._loopTask(benchmark, ctx);
      await benchmark.teardown.call(ctx);
      return await calculateMicroBench(benchmark);
    } catch (error) {
      fs.unlinkSync('raw.dat');
      this._errorHandler(error);
    }
  }

  /**
   *
   * @param {Benchmark} benchmark
   * @param {any} ctx
   * @returns {{ rawData: number[], count: number}}
   */
  async _loopTask(benchmark, ctx) {
    const rawDataFile = fs.openSync('raw.dat', 'w');
    try {
      const start = performance.now();
      const minExecutionCount = this.minExecutionCount;
      const minExecutionTime = this.minExecutionTime;
      const maxExecutionTime = this.maxExecutionTime;
      let time = performance.now() - start;
      let count = 1;

      const taskTimer = benchmark._taskType === 'sync' ? timeSyncTask : timeAsyncTask;

      while (time < maxExecutionTime && (time < minExecutionTime || count < minExecutionCount)) {
        await benchmark.beforeTask.call(ctx);
        const executionTime = await taskTimer(benchmark.task, ctx);
        fs.writeSync(rawDataFile, String(executionTime) + '\n');
        count++;
        time = performance.now();
      }
    } finally {
      fs.closeSync(rawDataFile);
    }
  }

  _errorHandler(error) {
    let currentError = error;
    while (currentError) {
      this.reporter(
        `${currentError !== error ? 'Caused by' : 'Error'}: ${currentError.name} - ${currentError.message} - ${currentError.stack}`
      );
      currentError = currentError.cause;
    }
    throw error;
  }
}

module.exports = Runner;
