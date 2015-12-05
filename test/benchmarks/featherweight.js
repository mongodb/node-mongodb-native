var Suite = require('betterbenchmarks').Suite,
  Benchmark = require('betterbenchmarks').Benchmark,
  JSONStream = require('JSONStream'),
  MBSimpleReporter = require('./mb_reporter'),
  es = require('event-stream'),
  co = require('co'),
  f = require('util').format,
  fs = require('fs'),
  globalSetup = require('./shared').globalSetup,
  getDb = require('./shared').getDb,
  deflate = require('./shared').deflate;

// Created a BSON instance
var BSON = require('bson').native().BSON;

var j = 0;

// Create a suite
var suite = new Suite('feather weight test suite', {
  warmup: 100, cycles: 10, iterations: 1000, async:false
});

// Add the MB reporter
suite.addReporter(new MBSimpleReporter());

// Add the flat json parsing test
suite.addTest(new Benchmark('flat json parsing')
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, callback) {
    console.log("---------------------------- cycle :: " + (++j))
    // Create a bson serializer
    var bson = new BSON();
    // Create a file read stream
    var filestream = fs.createReadStream(f('%s/performance-data/performance_testdata/featherweight_data/flat_bson.json', __dirname));
    filestream
      .pipe(JSONStream.parse('*'))
      .pipe(es.mapSync(function(data) {
        // Pause the stream
        filestream.pause();

        // Run a single iteration
        stats.startIteration();
        bson.serialize(data);
        stats.endIteration();

        // Resume the stream
        filestream.resume();
      }))
      .on('end', callback);
  }));

// Add the maximum size of
suite.setup(function(context, options, callback) {
  // console.log("================== setup the context")
  // Get the total size for the file
  var stats = fs.statSync(f('%s/performance-data/performance_testdata/featherweight_data/flat_bson.json', __dirname));
  // Add the total bytes of json we are parsing
  context.size = stats.size;
  // Finish up the setup
  callback();
})

module.exports = suite;
