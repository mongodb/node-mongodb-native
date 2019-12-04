'use strict';

const CONSTANTS = require('./constants');

function hrtimeToSeconds(hrtime) {
  return hrtime[0] + hrtime[1] / CONSTANTS.SECOND_TO_NS;
}

const PERCENTILES = [10, 25, 50, 75, 95, 98, 99];
function percentileIndex(percentile, total) {
  return Math.max(Math.floor(total * percentile / 100 - 1), 0);
}

function timeDoneTask(task, ctx) {
  return new Promise((resolve, reject) => {
    let called = false;
    const start = process.hrtime();
    task.call(ctx, err => {
      const time = process.hrtime(start);
      if (called) return;
      if (err) return reject(err);
      return resolve(hrtimeToSeconds(time));
    });
  });
}

function timeTask(task, ctx) {
  if (task.length) {
    return timeDoneTask(task, ctx);
  }

  return new Promise((resolve, reject) => {
    try {
      const start = process.hrtime();
      const ret = task.call(ctx);
      let time = process.hrtime(start);
      if (ret && ret.then) {
        ret.then(() => {
          let time = process.hrtime(start);
          resolve(hrtimeToSeconds(time));
        }, reject);
      } else {
        resolve(hrtimeToSeconds(time));
      }
    } catch (e) {
      reject(e);
    }
  });
}

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

const Suite = require('./suite');

class Runner {
  constructor(options) {
    options = options || {};
    this.minExecutionTime = options.minExecutionTime || CONSTANTS.DEFAULT_MIN_EXECUTION_TIME;
    this.maxExecutionTime = options.maxExecutionTime || CONSTANTS.DEFAULT_MAX_EXECUTION_TIME;
    this.minExecutionCount = options.minExecutionCount || CONSTANTS.DEFAULT_MIN_EXECUTION_COUNT;
    this.reporter =
      options.reporter ||
      function() {
        console.log.apply(console, arguments);
      };
    this.children = {};
  }

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

  run() {
    this.reporter(`Running Benchmarks`);
    return Object.keys(this.children)
      .map(name => ({ name, suite: this.children[name] }))
      .reduce(
        (p, data) =>
          p.then(results => {
            this.reporter(`  Executing suite "${data.name}"`);
            return this._runSuite(data.suite).then(microBench => {
              results[data.name] = microBench;
              return results;
            });
          }),
        Promise.resolve({})
      );
  }

  _runSuite(suite) {
    const benchmarks = suite.getBenchmarks();
    return Object.keys(benchmarks)
      .map(name => ({ name, benchmark: benchmarks[name].toObj() }))
      .reduce((p, data) => {
        return p.then(results => {
          this.reporter(`    Executing Benchmark "${data.name}"`);
          return this._runBenchmark(data.benchmark).then(score => {
            results[data.name] = score;
            return results;
          });
        });
      }, Promise.resolve({}));
  }

  _runBenchmark(benchmark) {
    const ctx = {};

    return Promise.resolve()
      .then(() => benchmark.setup.call(ctx))
      .then(() => this._loopTask(benchmark, ctx))
      .then(rawData =>
        Promise.resolve()
          .then(() => benchmark.teardown.call(ctx))
          .then(() => calculateMicroBench(benchmark, rawData))
      )
      .catch(err => this._errorHandler(err));
  }

  _loopTask(benchmark, ctx) {
    const start = Date.now();
    const rawData = [];
    const minExecutionCount = this.minExecutionCount;
    const minExecutionTime = this.minExecutionTime;
    const maxExecutionTime = this.maxExecutionTime;

    function iterate(count) {
      const time = Date.now() - start;

      if (time >= maxExecutionTime || (time >= minExecutionTime && count >= minExecutionCount)) {
        return Promise.resolve({ rawData, count });
      }

      return Promise.resolve()
        .then(() => benchmark.beforeTask.call(ctx))
        .then(() => timeTask(benchmark.task, ctx))
        .then(singleExecution => rawData.push(singleExecution))
        .then(() => benchmark.afterTask.call(ctx))
        .then(() => iterate(count + 1));
    }

    return iterate(0);
  }

  _errorHandler(e) {
    console.error(e);
    return NaN;
  }
}

module.exports = Runner;
