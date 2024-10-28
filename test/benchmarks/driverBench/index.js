'use strict';

const MongoBench = require('../mongoBench');
const os = require('node:os');

const Runner = MongoBench.Runner;

let bsonType = 'js-bson';
// TODO(NODE-4606): test against different driver configurations in CI

const { inspect } = require('util');
const { writeFile } = require('fs/promises');
const { makeParallelBenchmarks, makeSingleBench, makeMultiBench } = require('../mongoBench/suites');

const hw = os.cpus();
const ram = os.totalmem() / 1024 ** 3;
const platform = { name: hw[0].model, cores: hw.length, ram: `${ram}GB` };

const systemInfo = () =>
  [
    `\n- cpu: ${platform.name}`,
    `- cores: ${platform.cores}`,
    `- arch: ${os.arch()}`,
    `- os: ${process.platform} (${os.release()})`,
    `- ram: ${platform.ram}\n`
  ].join('\n');
console.log(systemInfo());

function average(arr) {
  return arr.reduce((x, y) => x + y, 0) / arr.length;
}

const benchmarkRunner = new Runner()
  .suite('singleBench', suite => makeSingleBench(suite))
  .suite('multiBench', suite => makeMultiBench(suite))
  .suite('parallel', suite => makeParallelBenchmarks(suite));

function getSpecBenchmarkResults(suffix, microBench) {
  const singleBenchResults = microBench['singleBench' + suffix];
  const singleBench = average([
    singleBenchResults.findOne,
    singleBenchResults.smallDocInsertOne,
    singleBenchResults.largeDocInsertOne
  ]);

  const multiBenchResults = microBench['multiBench' + suffix];
  const multiBench = average(Object.values(multiBenchResults));

  const parallelBenchResults = microBench['parallel' + suffix];

  const parallelBench = average([
    parallelBenchResults.ldjsonMultiFileUpload,
    parallelBenchResults.ldjsonMultiFileExport,
    parallelBenchResults.gridfsMultiFileUpload,
    parallelBenchResults.gridfsMultiFileDownload
  ]);

  const readBench = average([
    singleBenchResults.findOne,
    multiBenchResults.findManyAndEmptyCursor,
    multiBenchResults.gridFsDownload,
    parallelBenchResults.gridfsMultiFileDownload,
    parallelBenchResults.ldjsonMultiFileExport
  ]);
  const writeBench = average([
    singleBenchResults.smallDocInsertOne,
    singleBenchResults.largeDocInsertOne,
    multiBenchResults.smallDocBulkInsert,
    multiBenchResults.largeDocBulkInsert,
    multiBenchResults.gridFsUpload,
    parallelBenchResults.ldjsonMultiFileUpload,
    parallelBenchResults.gridfsMultiFileUpload
  ]);

  const driverBench = average([readBench, writeBench]);

  return {
    singleBench,
    multiBench,
    parallelBench,
    readBench,
    writeBench,
    driverBench,
    ...parallelBenchResults,
    ...singleBenchResults,
    ...multiBenchResults
  };
}

benchmarkRunner
  .run()
  .then(microBench => {
    const noCSOTResults = getSpecBenchmarkResults('', microBench);
    const csotTimeoutMS0Results = getSpecBenchmarkResults('_timeoutMS_0', microBench);
    const csotTimeoutMS10000Results = getSpecBenchmarkResults('_timeoutMS_10000', microBench);

    return Object.entries(benchmarkResults).map(([benchmarkName, result]) => {
      return {
        info: {
          test_name: benchmarkName,
          tags: [bsonType]
        },
        metrics: [{ name: 'megabytes_per_second', value: result }]
      };
    });
  })
  .then(data => {
    const results = JSON.stringify(data, undefined, 2);
    console.log(inspect(data, { depth: Infinity, colors: true }));
    return writeFile('results.json', results);
  })
  .catch(err => console.error(err));
