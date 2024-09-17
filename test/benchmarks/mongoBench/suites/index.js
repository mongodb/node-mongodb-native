const { makeParallelBenchmarks, makeCSOTParallelBenchmarks } = require('./parallelBench');
const { makeSingleBench, makeCSOTSingleBench } = require('./singleBench');
const { makeMultiBench, makeCSOTMultiBench } = require('./multiBench');

module.exports = {
  makeParallelBenchmarks,
  makeCSOTParallelBenchmarks,
  makeSingleBench,
  makeCSOTSingleBench,
  makeMultiBench,
  makeCSOTMultiBench
};
