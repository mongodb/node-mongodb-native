const { makeParallelBenchmarks } = require('./parallelBench');
const { makeSingleBench } = require('./singleBench');
const { makeMultiBench } = require('./multiBench');

module.exports = {
  makeParallelBenchmarks,
  makeSingleBench,
  makeMultiBench
};
