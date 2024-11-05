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
    `- ram: ${platform.ram}`,
    `- node: ${process.version}\n`
  ].join('\n');
console.log(systemInfo());

function average(arr) {
  return arr.reduce((x, y) => x + y, 0) / arr.length;
}

const benchmarkRunner = new Runner()
  .suite('singleBench', suite => makeSingleBench(suite))
  .suite('multiBench', suite => makeMultiBench(suite))
  .suite('parallel', suite => makeParallelBenchmarks(suite));

benchmarkRunner
  .run()
  .then(microBench => {
    const singleBench = average([
      microBench.singleBench.findOne,
      microBench.singleBench.smallDocInsertOne,
      microBench.singleBench.largeDocInsertOne
    ]);
    const multiBench = average(Object.values(microBench.multiBench));

    const parallelBench = average([
      microBench.parallel.ldjsonMultiFileUpload,
      microBench.parallel.ldjsonMultiFileExport,
      microBench.parallel.gridfsMultiFileUpload,
      microBench.parallel.gridfsMultiFileDownload
    ]);

    const readBench = average([
      microBench.singleBench.findOne,
      microBench.multiBench.findManyAndEmptyCursor,
      microBench.multiBench.gridFsDownload,
      microBench.parallel.gridfsMultiFileDownload,
      microBench.parallel.ldjsonMultiFileExport
    ]);
    const writeBench = average([
      microBench.singleBench.smallDocInsertOne,
      microBench.singleBench.largeDocInsertOne,
      microBench.multiBench.smallDocBulkInsert,
      microBench.multiBench.largeDocBulkInsert,
      microBench.multiBench.gridFsUpload,
      microBench.parallel.ldjsonMultiFileUpload,
      microBench.parallel.gridfsMultiFileUpload
    ]);

    const driverBench = average([readBench, writeBench]);

    const benchmarkResults = {
      singleBench,
      multiBench,
      parallelBench,
      readBench,
      writeBench,
      driverBench,
      ...microBench.parallel,
      ...microBench.bsonBench,
      ...microBench.singleBench,
      ...microBench.multiBench
    };

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
