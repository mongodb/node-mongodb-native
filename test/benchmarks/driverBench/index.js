'use strict';

const MongoBench = require('../mongoBench');

const Runner = MongoBench.Runner;

let bsonType = 'js-bson';
// TODO(NODE-4606): test against different driver configurations in CI

const BSON = require('bson');

const { inspect } = require('util');
const { writeFile } = require('fs/promises');
const {
  makeParallelBenchmarks,
  makeBsonBench,
  makeSingleBench,
  makeMultiBench
} = require('../mongoBench/suites');

function average(arr) {
  return arr.reduce((x, y) => x + y, 0) / arr.length;
}

const benchmarkRunner = new Runner()
  .suite('bsonBench', suite => makeBsonBench({ suite, BSON }))
  .suite('singleBench', suite => makeSingleBench(suite))
  .suite('multiBench', suite => makeMultiBench(suite))
  .suite('parallel', suite => makeParallelBenchmarks(suite));

benchmarkRunner
  .run()
  .then(microBench => {
    const bsonBench = average(Object.values(microBench.bsonBench));
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
      bsonBench,
      singleBench,
      multiBench,
      parallelBench,
      readBench,
      writeBench,
      driverBench,
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
