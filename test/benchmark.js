"use strict"

var co = require('co'),
  f = require('util').format,
  EventEmitter = require('events').EventEmitter,
  Stats = require('fast-stats').Stats,
  Promise = global.Promise || require('mongodb-es6');

// Load the test suites
var featherWeightSuite = require('./benchmarks/featherweight'),
  lightWeightSuite = require('./benchmarks/lightweight');

// Execute the processes
co(function*() {
  // console.log("--------------------------------- 0")
  // Execute feather weight
  // yield featherWeightSuite.execute();
  // Execute light weight benchmarks
  yield lightWeightSuite.execute();

  // console.log("--------------------------------- 1")
});
