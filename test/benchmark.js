"use strict"

var co = require('co');

// Load the test suites
var featherWeightSuite = require('./benchmarks/featherweight');
var lightWeightSuite = require('./benchmarks/lightweight');
var parallelSuite = require('./benchmarks/parallel');

// Execute the processes
co(function*() {
  // // Execute feather weight
  // yield featherWeightSuite.execute();
  // Execute light weight benchmarks
  yield lightWeightSuite.execute();
  // // Execute parallel suite
  // yield parallelSuite.execute();
});
