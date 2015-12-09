var Suite = require('betterbenchmarks').Suite,
  Benchmark = require('betterbenchmarks').Benchmark,
  JSONStream = require('JSONStream'),
  MBSimpleReporter = require('./mb_featherweight_reporter'),
  es = require('event-stream'),
  co = require('co'),
  f = require('util').format,
  fs = require('fs'),
  globalSetup = require('./shared').globalSetup,
  getDb = require('./shared').getDb,
  deflate = require('./shared').deflate;

// Created a BSON instance
var BSON = require('bson').native().BSON;

// Create a suite
var suite = new Suite('feather weight test suite', {
  warmup: 100, cycles: 10, iterations: 1000, async:false
});

// Add the MB reporter
suite.addReporter(new MBSimpleReporter());

// BSON size
var bsonBytes = 0;

// -----------------------------------------------------------------------------
//
// FLAT JSON SERIALIZE/DESERIALIZE
//
// -----------------------------------------------------------------------------

// Add the flat json parsing test
suite.addTest(new Benchmark('flat json serialization')
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, callback) {
    // Create a bson serializer
    var bson = new BSON();
    // Set the bytes to 0
    bsonBytes = 0;
    // Create a file read stream
    var filestream = fs.createReadStream(f('%s/performance-data/performance_testdata/featherweight_data/flat_bson.json', __dirname));
    filestream
      .pipe(JSONStream.parse('*'))
      .pipe(es.mapSync(function(data) {
        // Pause the stream
        filestream.pause();

        // Run a single iteration
        stats.startIteration();
        var bytes = bson.serialize(data);
        stats.endIteration();

        // Add the bytes to the total
        bsonBytes = bsonBytes + bytes.length;

        // Resume the stream
        filestream.resume();
      }))
      .on('end', function() {
        callback();
      });
    })
  .setup(function(context, options, callback) {
    // Get the total size for the file
    var stats = fs.statSync(f('%s/performance-data/performance_testdata/featherweight_data/flat_bson.json', __dirname));
    // Add the total bytes of json we are parsing
    context.size = stats.size;
    // Finish up the setup
    callback();
  }));

suite.addTest(new Benchmark('flat json deserialization')
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, callback) {
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
        var bytes = bson.serialize(data);

        // Run a single iteration
        stats.startIteration();
        bson.deserialize(bytes);
        stats.endIteration();

        // Resume the stream
        filestream.resume();
      }))
      .on('end', function() {
        callback();
      });
  })
  .setup(function(context, options, callback) {
    // Add the total bytes of json we are parsing
    context.size = bsonBytes;
    // Finish up the setup
    callback();
  }));

// -----------------------------------------------------------------------------
//
// COMMON NESTED JSON SERIALIZE/DESERIALIZE
//
// -----------------------------------------------------------------------------

// Add the flat json parsing test
suite.addTest(new Benchmark('common nested json serialization')
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, callback) {
    // Create a bson serializer
    var bson = new BSON();
    // Set the bytes to 0
    bsonBytes = 0;
    // Create a file read stream
    var filestream = fs.createReadStream(f('%s/performance-data/performance_testdata/featherweight_data/deep_bson.json', __dirname));
    filestream
      .pipe(JSONStream.parse('*'))
      .pipe(es.mapSync(function(data) {
        // Pause the stream
        filestream.pause();

        // Run a single iteration
        stats.startIteration();
        var bytes = bson.serialize(data);
        stats.endIteration();

        // Add the bytes to the total
        bsonBytes = bsonBytes + bytes.length;

        // Resume the stream
        filestream.resume();
      }))
      .on('end', function() {
        callback();
      });
    })
  .setup(function(context, options, callback) {
    // Get the total size for the file
    var stats = fs.statSync(f('%s/performance-data/performance_testdata/featherweight_data/deep_bson.json', __dirname));
    // Add the total bytes of json we are parsing
    context.size = stats.size;
    // Finish up the setup
    callback();
  }));

suite.addTest(new Benchmark('common nested json deserialization')
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, callback) {
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
        var bytes = bson.serialize(data);

        // Run a single iteration
        stats.startIteration();
        bson.deserialize(bytes);
        stats.endIteration();

        // Resume the stream
        filestream.resume();
      }))
      .on('end', function() {
        callback();
      });
  })
  .setup(function(context, options, callback) {
    // Add the total bytes of json we are parsing
    context.size = bsonBytes;
    // Finish up the setup
    callback();
  }));

// -----------------------------------------------------------------------------
//
// ALL JSON TYPES SERIALIZE/DESERIALIZE
//
// -----------------------------------------------------------------------------

// Add the flat json parsing test
suite.addTest(new Benchmark('all json types serialization')
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, callback) {
    // Create a bson serializer
    var bson = new BSON();
    // Set the bytes to 0
    bsonBytes = 0;
    // Create a file read stream
    var filestream = fs.createReadStream(f('%s/performance-data/performance_testdata/featherweight_data/full_bson.json', __dirname));
    filestream
      .pipe(JSONStream.parse('*'))
      .pipe(es.mapSync(function(data) {
        // Pause the stream
        filestream.pause();

        // Run a single iteration
        stats.startIteration();
        var bytes = bson.serialize(data);
        stats.endIteration();

        // Add the bytes to the total
        bsonBytes = bsonBytes + bytes.length;

        // Resume the stream
        filestream.resume();
      }))
      .on('end', function() {
        callback();
      });
    })
  .setup(function(context, options, callback) {
    // Get the total size for the file
    var stats = fs.statSync(f('%s/performance-data/performance_testdata/featherweight_data/full_bson.json', __dirname));
    // Add the total bytes of json we are parsing
    context.size = stats.size;
    // Finish up the setup
    callback();
  }));

suite.addTest(new Benchmark('all json types deserialization')
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, callback) {
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
        var bytes = bson.serialize(data);

        // Run a single iteration
        stats.startIteration();
        bson.deserialize(bytes);
        stats.endIteration();

        // Resume the stream
        filestream.resume();
      }))
      .on('end', function() {
        callback();
      });
  })
  .setup(function(context, options, callback) {
    // Add the total bytes of json we are parsing
    context.size = bsonBytes;
    // Finish up the setup
    callback();
  }));

module.exports = suite;
