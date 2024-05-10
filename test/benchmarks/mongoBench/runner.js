'use strict';

const CONSTANTS = require('./constants');
const { performance } = require('perf_hooks');
const Suite = require('./suite');

const PERCENTILES = [10, 25, 50, 75, 95, 98, 99];
function percentileIndex(percentile, total) {
  return Math.max(Math.floor((total * percentile) / 100 - 1), 0);
}

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

/**
 * Returns the execution time for the benchmarks in mb/second
 *
 * This function internally calculates the 50th percentile execution time and uses
 * that as the median.
 *
 * @param {Benchmark} benchmark
 * @param {{ rawData: number[], count: number}} data
 * @returns number
 */
function calculateMicroBench(benchmark, data) {
  const rawData = data.rawData;
  const count = data.count;

  const sortedData = [].concat(rawData).sort();

  const percentiles = PERCENTILES.reduce((acc, pct) => {
    acc[pct] = sortedData[percentileIndex(pct, count)];
    return acc;
  }, {});

  const medianExecution = percentiles[50];

  return benchmark.taskSize / medianExecution;
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
    this.grep = options.grep?.toLowerCase() ?? null;
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
      if (this.grep != null) {
        if (!name.toLowerCase().includes(this.grep)) {
          result[name] = 0;
          continue;
        }
      }
      this.reporter(`    Executing Benchmark "${name}"`);
      result[name] = await this._runBenchmark(benchmark);
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
      const result = await this._loopTask(benchmark, ctx);
      await benchmark.teardown.call(ctx);
      return calculateMicroBench(benchmark, result);
    } catch (error) {
      return this._errorHandler(error);
    }
  }

  /**
   *
   * @param {Benchmark} benchmark
   * @param {any} ctx
   * @returns {{ rawData: number[], count: number}}
   */
  async _loopTask(benchmark, ctx) {
    const start = performance.now();
    const rawData = [];
    const minExecutionCount = this.minExecutionCount;
    const minExecutionTime = this.minExecutionTime;
    const maxExecutionTime = this.maxExecutionTime;
    let time = performance.now() - start;
    let count = 1;

    const taskTimer = benchmark._taskType === 'sync' ? timeSyncTask : timeAsyncTask;

    while (time < maxExecutionTime && (time < minExecutionTime || count < minExecutionCount)) {
      await benchmark.beforeTask.call(ctx);
      const executionTime = await taskTimer(benchmark.task, ctx);
      rawData.push(executionTime);
      count++;
      time = performance.now();
    }

    return {
      rawData,
      count
    };
  }

  _errorHandler(e) {
    console.error(e);
    return NaN;
  }
}

module.exports = Runner;
