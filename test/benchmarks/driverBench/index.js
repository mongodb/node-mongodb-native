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
  .suite('singleBench_timeoutMS_0', suite => makeSingleBench(suite, { timeoutMS: 0 }))
  .suite('singleBench_timeoutMS_120000', suite => makeSingleBench(suite, { timeoutMS: 120_000 }))

  .suite('multiBench', suite => makeMultiBench(suite))
  .suite('multiBench_timeoutMS_0', suite => makeMultiBench(suite, { timeoutMS: 0 }))
  .suite('multiBench_timeoutMS_120000', suite => makeMultiBench(suite, { timeoutMS: 120_000 }))

  .suite('parallel', suite => makeParallelBenchmarks(suite))
  .suite('parallel_timeoutMS_0', suite => makeParallelBenchmarks(suite, { timeoutMS: 0 }))
  .suite('parallel_timeoutMS_120000', suite => makeParallelBenchmarks(suite, { timeoutMS: 120_000 }));

function getSpecBenchmarkResults(microBench, suffix) {
  const singleBenchName = typeof suffix === 'string' ? 'singleBench' + suffix : 'singleBench'
  const multiBenchName = typeof suffix === 'string' ? 'multiBench' + suffix : 'multiBench'
  const parallelBenchName = typeof suffix === 'string' ? 'parallelBench' + suffix : 'parallelBench'

  const singleBenchResults = microBench[singleBenchName];
  const singleBench = average([
    singleBenchResults.findOne,
    singleBenchResults.smallDocInsertOne,
    singleBenchResults.largeDocInsertOne
  ]);

  const multiBenchResults = microBench[multiBenchName];
  const multiBench = average(Object.values(multiBenchResults));

  const parallelBenchResults = microBench[parallelBenchName];

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

function convertToPerfSend(benchmarkResults, nameSuffix) {
  return Object.entries(benchmarkResults).map(([benchmarkName, result]) => {
    return {
      info: {
        test_name: typeof nameSuffix === 'string' ? benchmarkName + nameSuffix : benchmarkName,
        tags: [bsonType]
      },
      metrics: [{ name: 'megabytes_per_second', value: result }]
    };
  });
}

benchmarkRunner
  .run()
  .then(microBench => {
    const noCSOTResults = getSpecBenchmarkResults(microBench);
    const csotTimeoutMS0Results = getSpecBenchmarkResults(microBench,'_timeoutMS_0');
    const csotTimeoutMS10000Results = getSpecBenchmarkResults(microBench,'_timeoutMS_40000');

    return {
      ...convertToPerfSend(noCSOTResults),
      ...convertToPerfSend(csotTimeoutMS0Results, '_timeoutMS_0'),
      ...convertToPerfSend(csotTimeoutMS10000Results, '_timeoutMS_40000')
    };
  })
  .then(data => {
    const results = JSON.stringify(data, undefined, 2);
    console.log(inspect(data, { depth: Infinity, colors: true }));
    return writeFile('results.json', results);
  })
  .catch(err => console.error(err));
