"use strict"

var co = require('co');

// Load the test suites
var featherWeightSuite = require('./benchmarks/featherweight');
var lightWeightSuite = require('./benchmarks/lightweight');

// Execute the processes
co(function*() {
  // console.log("--------------------------------- 0")
  // // Execute feather weight
  // yield featherWeightSuite.execute();
  // Execute light weight benchmarks
  yield lightWeightSuite.execute();

  // console.log("--------------------------------- 1")
});
