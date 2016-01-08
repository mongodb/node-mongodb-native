var Suite = require('betterbenchmarks').Suite,
  Benchmark = require('betterbenchmarks').Benchmark,
  JSONStream = require('JSONStream'),
  // MBSimpleReporter = require('./mb_featherweight_reporter'),
  es = require('event-stream'),
  co = require('co'),
  f = require('util').format,
  fs = require('fs'),
  deflate = require('./shared').deflate;

// Created a BSON instance
var BSONJS = require('bson').native().BSON;
// var BSONC = require('bson-ext');
// console.dir(BSONJS)
// console.dir(require('bson-ext').BSON)
// process.exit(0)

// var BSON = BSONC;
var BSON = BSONJS;

// Create a suite
var suite = new Suite('feather weight test suite', {
  warmup: 100, cycles: 2, iterations: 1000, async:false
});

// Add the MB reporter
// suite.addReporter(new MBSimpleReporter());

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
    var bson = new BSON([BSONJS.Long, BSONJS.ObjectID, BSONJS.Binary, BSONJS.Code, BSONJS.DBRef, BSONJS.Symbol, BSONJS.Double, BSONJS.Timestamp, BSONJS.MaxKey, BSONJS.MinKey]);
    // Array of times
    var measurements = [];

    // Iterate over all the values
    for(var i = 0; i < 10000; i++) {
      var data = context.json;
      // Deserialize the document
      var s = process.hrtime();
      bson.serialize(data);
      measurements.push(process.hrtime(s));
    }

    var total = measurements.reduce(function(prev, curr) {
      var value = [prev[0], prev[1]];
      value[0] += curr[0];
      value[1] += curr[1];
      return value;
    }, [0, 0]);

    stats.timings.push(total);
    callback();
  })
  .setup(function(context, options, callback) {
    // Create a bson serializer
    var bson = new BSON([BSONJS.Long, BSONJS.ObjectID, BSONJS.Binary, BSONJS.Code, BSONJS.DBRef, BSONJS.Symbol, BSONJS.Double, BSONJS.Timestamp, BSONJS.MaxKey, BSONJS.MinKey]);
    // Get the json document
    var json = fs.readFileSync(f('%s/performance-data/EXTENDED_JSON/flat_bson.json', __dirname), 'utf8');
    json = JSON.parse(json);
    json = deflate(json);
    // Add to the context
    context.json = json;
    // Serialized
    context.bson = bson.serialize(json);
    // Add the total bytes of json we are parsing
    context.size = bsonBytes;
    // Finish up the setup
    callback();
  }));

suite.addTest(new Benchmark('flat json deserialization')
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, callback) {
    // Create a bson serializer
    var bson = new BSON([BSONJS.Long, BSONJS.ObjectID, BSONJS.Binary, BSONJS.Code, BSONJS.DBRef, BSONJS.Symbol, BSONJS.Double, BSONJS.Timestamp, BSONJS.MaxKey, BSONJS.MinKey]);
    // Array of times
    var measurements = [];
    var options = {promoteLongs:false};

    // Iterate over all the values
    for(var i = 0; i < 10000; i++) {
      var data = context.bson;
      // Deserialize the document
      var s = process.hrtime();
      var obj = bson.deserialize(data, options);
      measurements.push(process.hrtime(s));
    }

    var total = measurements.reduce(function(prev, curr) {
      var value = [prev[0], prev[1]];
      value[0] += curr[0];
      value[1] += curr[1];
      return value;
    }, [0, 0]);

    stats.timings.push(total);
    callback();
  })
  .setup(function(context, options, callback) {
    // Create a bson serializer
    var bson = new BSON([BSONJS.Long, BSONJS.ObjectID, BSONJS.Binary, BSONJS.Code, BSONJS.DBRef, BSONJS.Symbol, BSONJS.Double, BSONJS.Timestamp, BSONJS.MaxKey, BSONJS.MinKey]);
    // Get the json document
    var json = fs.readFileSync(f('%s/performance-data/EXTENDED_JSON/flat_bson.json', __dirname), 'utf8');
    json = JSON.parse(json);
    // console.log(JSON.stringify(json, null, 2))
    json = deflate(json);
    // console.dir(json)
    // process.exit(0)
    // Add to the context
    context.json = json;
    // Serialized
    context.bson = bson.serialize(json);
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
    var bson = new BSON([BSONJS.Long, BSONJS.ObjectID, BSONJS.Binary, BSONJS.Code, BSONJS.DBRef, BSONJS.Symbol, BSONJS.Double, BSONJS.Timestamp, BSONJS.MaxKey, BSONJS.MinKey]);
    // Array of times
    var measurements = [];

    // Iterate over all the values
    for(var i = 0; i < 10000; i++) {
      var data = context.json;
      // Deserialize the document
      var s = process.hrtime();
      bson.serialize(data);
      measurements.push(process.hrtime(s));
    }

    var total = measurements.reduce(function(prev, curr) {
      var value = [prev[0], prev[1]];
      value[0] += curr[0];
      value[1] += curr[1];
      return value;
    }, [0, 0]);

    stats.timings.push(total);
    callback();
  })
  .setup(function(context, options, callback) {
    // Create a bson serializer
    var bson = new BSON([BSONJS.Long, BSONJS.ObjectID, BSONJS.Binary, BSONJS.Code, BSONJS.DBRef, BSONJS.Symbol, BSONJS.Double, BSONJS.Timestamp, BSONJS.MaxKey, BSONJS.MinKey]);
    // Get the json document
    var json = fs.readFileSync(f('%s/performance-data/EXTENDED_JSON/deep_bson.json', __dirname), 'utf8');
    json = JSON.parse(json);
    json = deflate(json);
    // Add to the context
    context.json = json;
    // Serialized
    context.bson = bson.serialize(json);
    // Add the total bytes of json we are parsing
    context.size = bsonBytes;
    // Finish up the setup
    callback();
  }));

suite.addTest(new Benchmark('common nested json deserialization')
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, callback) {
    // Create a bson serializer
    var bson = new BSON([BSONJS.Long, BSONJS.ObjectID, BSONJS.Binary, BSONJS.Code, BSONJS.DBRef, BSONJS.Symbol, BSONJS.Double, BSONJS.Timestamp, BSONJS.MaxKey, BSONJS.MinKey]);
    // Array of times
    var measurements = [];
    var options = {};

    // Iterate over all the values
    for(var i = 0; i < 10000; i++) {
      var data = context.bson;
      // Deserialize the document
      var s = process.hrtime();
      bson.deserialize(data, options);
      measurements.push(process.hrtime(s));
    }

    var total = measurements.reduce(function(prev, curr) {
      var value = [prev[0], prev[1]];
      value[0] += curr[0];
      value[1] += curr[1];
      return value;
    }, [0, 0]);

    stats.timings.push(total);
    callback();
  })
  .setup(function(context, options, callback) {
    // Create a bson serializer
    var bson = new BSON([BSONJS.Long, BSONJS.ObjectID, BSONJS.Binary, BSONJS.Code, BSONJS.DBRef, BSONJS.Symbol, BSONJS.Double, BSONJS.Timestamp, BSONJS.MaxKey, BSONJS.MinKey]);
    // Get the json document
    var json = fs.readFileSync(f('%s/performance-data/EXTENDED_JSON/deep_bson.json', __dirname), 'utf8');
    json = JSON.parse(json);
    json = deflate(json);
    // Add to the context
    context.json = json;
    // Serialized
    context.bson = bson.serialize(json);
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
    var bson = new BSON([BSONJS.Long, BSONJS.ObjectID, BSONJS.Binary, BSONJS.Code, BSONJS.DBRef, BSONJS.Symbol, BSONJS.Double, BSONJS.Timestamp, BSONJS.MaxKey, BSONJS.MinKey]);
    // Array of times
    var measurements = [];

    // Iterate over all the values
    for(var i = 0; i < 10000; i++) {
      var data = context.json;
      // Deserialize the document
      var s = process.hrtime();
      bson.serialize(data);
      measurements.push(process.hrtime(s));
    }

    var total = measurements.reduce(function(prev, curr) {
      var value = [prev[0], prev[1]];
      value[0] += curr[0];
      value[1] += curr[1];
      return value;
    }, [0, 0]);

    stats.timings.push(total);
    callback();
  })
  .setup(function(context, options, callback) {
    // Create a bson serializer
    var bson = new BSON([BSONJS.Long, BSONJS.ObjectID, BSONJS.Binary, BSONJS.Code, BSONJS.DBRef, BSONJS.Symbol, BSONJS.Double, BSONJS.Timestamp, BSONJS.MaxKey, BSONJS.MinKey]);
    // Get the json document
    var json = fs.readFileSync(f('%s/performance-data/EXTENDED_JSON/full_bson.json', __dirname), 'utf8');
    json = JSON.parse(json);
    json = deflate(json);
    // Add to the context
    context.json = json;
    // Serialized
    context.bson = bson.serialize(json);
    // Add the total bytes of json we are parsing
    context.size = bsonBytes;
    // Finish up the setup
    callback();
  }));

suite.addTest(new Benchmark('all json types deserialization')
  // Add custom method (we are responsible for marking the demarkation)
  .custom(function(context, stats, callback) {
    // Create a bson serializer
    var bson = new BSON([BSONJS.Long, BSONJS.ObjectID, BSONJS.Binary, BSONJS.Code, BSONJS.DBRef, BSONJS.Symbol, BSONJS.Double, BSONJS.Timestamp, BSONJS.MaxKey, BSONJS.MinKey]);
    // Array of times
    var measurements = [];
    var options = {};

    // Iterate over all the values
    for(var i = 0; i < 10000; i++) {
      var data = context.bson;
      // Deserialize the document
      var s = process.hrtime();
      bson.deserialize(data, options);
      measurements.push(process.hrtime(s));
    }

    var total = measurements.reduce(function(prev, curr) {
      var value = [prev[0], prev[1]];
      value[0] += curr[0];
      value[1] += curr[1];
      return value;
    }, [0, 0]);

    stats.timings.push(total);
    callback();
  })
  .setup(function(context, options, callback) {
    // Create a bson serializer
    var bson = new BSON([BSONJS.Long, BSONJS.ObjectID, BSONJS.Binary, BSONJS.Code, BSONJS.DBRef, BSONJS.Symbol, BSONJS.Double, BSONJS.Timestamp, BSONJS.MaxKey, BSONJS.MinKey]);
    // Get the json document
    var json = fs.readFileSync(f('%s/performance-data/EXTENDED_JSON/full_bson.json', __dirname), 'utf8');
    json = JSON.parse(json);
    json = deflate(json);
    // Add to the context
    context.json = json;
    // Serialized
    context.bson = bson.serialize(json);
    // Add the total bytes of json we are parsing
    context.size = bsonBytes;
    // Finish up the setup
    callback();
  }));

module.exports = suite;
