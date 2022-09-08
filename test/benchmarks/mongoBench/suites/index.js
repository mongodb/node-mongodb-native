const { makeParallelBenchmarks } = require('./parallelBench');
const { makeBsonBench } = require('./bsonBench');
const { makeSingleBench } = require('./singleBench');
const { makeMultiBench } = require('./multiBench');

module.exports = {
  makeParallelBenchmarks,
  makeBsonBench,
  makeSingleBench,
  makeMultiBench
};
