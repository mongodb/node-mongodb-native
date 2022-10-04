const { EJSON } = require('bson');
const { loadSpecString } = require('../../driverBench/common');

/**
 *
 * @param {{ suite: Suite, BSON: BSON }} options
 * @returns {Benchmark}
 */
function makeBsonBench({ suite, BSON }) {
  function encodeBSON() {
    for (let i = 0; i < 10000; i += 1) {
      BSON.serialize(this.dataString);
    }
  }

  function decodeBSON() {
    for (let i = 0; i < 10000; i += 1) {
      BSON.deserialize(this.data);
    }
  }

  function makeBSONLoader(fileName) {
    return function () {
      this.dataString = EJSON.parse(loadSpecString(['extended_bson', `${fileName}.json`]));
      this.data = BSON.serialize(this.dataString);
    };
  }
  return suite
    .benchmark('flatBsonEncoding', benchmark =>
      benchmark.taskSize(75.31).taskType('sync').setup(makeBSONLoader('flat_bson')).task(encodeBSON)
    )
    .benchmark('flatBsonDecoding', benchmark =>
      benchmark.taskSize(75.31).taskType('sync').setup(makeBSONLoader('flat_bson')).task(decodeBSON)
    )
    .benchmark('deepBsonEncoding', benchmark =>
      benchmark.taskSize(19.64).taskType('sync').setup(makeBSONLoader('deep_bson')).task(encodeBSON)
    )
    .benchmark('deepBsonDecoding', benchmark =>
      benchmark.taskSize(19.64).taskType('sync').setup(makeBSONLoader('deep_bson')).task(decodeBSON)
    )
    .benchmark('fullBsonEncoding', benchmark =>
      benchmark.taskSize(57.34).taskType('sync').setup(makeBSONLoader('full_bson')).task(encodeBSON)
    )
    .benchmark('fullBsonDecoding', benchmark =>
      benchmark.taskSize(57.34).taskType('sync').setup(makeBSONLoader('full_bson')).task(decodeBSON)
    );
}

module.exports = { makeBsonBench };
