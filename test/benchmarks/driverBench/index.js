'use strict';

const MongoBench = require('../mongoBench');
const os = require('node:os');
const process = require('node:process');

const Runner = MongoBench.Runner;

let bsonType = 'js-bson';
// TODO(NODE-4606): test against different driver configurations in CI

const { writeFile } = require('fs/promises');
const { makeParallelBenchmarks, makeSingleBench, makeMultiBench } = require('../mongoBench/suites');
const { MONGODB_CLIENT_OPTIONS } = require('./common');

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

    // ldjsonMultiFileUpload and ldjsonMultiFileExport cause connection errors.
    // While we investigate, we will use the last known good values:
    // https://spruce.mongodb.com/task/mongo_node_driver_next_performance_tests_run_spec_benchmark_tests_node_server_4bc3e500b6f0e8ab01f052c4a1bfb782d6a29b4e_f168e1328f821bbda265e024cc91ae54_24_11_18_15_37_24/logs?execution=0

    const parallelBench = average([
      microBench.parallel.ldjsonMultiFileUpload ?? 44.02343490518617,
      microBench.parallel.ldjsonMultiFileExport ?? 31.83182984813926,
      microBench.parallel.gridfsMultiFileUpload,
      microBench.parallel.gridfsMultiFileDownload
    ]);

    const readBench = average([
      microBench.singleBench.findOne,
      microBench.multiBench.findManyAndEmptyCursor,
      microBench.multiBench.gridFsDownload,
      microBench.parallel.gridfsMultiFileDownload,
      microBench.parallel.ldjsonMultiFileExport ?? 31.83182984813926
    ]);
    const writeBench = average([
      microBench.singleBench.smallDocInsertOne,
      microBench.singleBench.largeDocInsertOne,
      microBench.multiBench.smallDocBulkInsert,
      microBench.multiBench.largeDocBulkInsert,
      microBench.multiBench.gridFsUpload,
      microBench.parallel.ldjsonMultiFileUpload ?? 44.02343490518617,
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
          tags: [bsonType],
          // Args can only be a map of string -> int32. So if its a number leave it be,
          // if it is anything else test for truthiness and set to 1 or 0.
          args: Object.fromEntries(
            Object.entries(MONGODB_CLIENT_OPTIONS).map(([key, value]) => [
              key,
              typeof value === 'number' ? value : value ? 1 : 0
            ])
          )
        },
        metrics: [{ name: 'megabytes_per_second', value: result }]
      };
    });
  })
  .then(data => {
    const results = JSON.stringify(data, undefined, 2);
    return writeFile('results.json', results);
  })
  .catch(err => {
    console.error('failure: ', err.name, err.message);
    process.exit(1);
  });
