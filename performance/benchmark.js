var read_all_tests = require('./util').read_all_tests
  , run_test = require('./util').run_test
  , RunningStats = require('./util').RunningStats;

// Load all the tests
var tests = read_all_tests(__dirname + "/test");

// Number of times to run the test
var run_number_of_times = 10000;
// Number of iterations to run for JIT warmup
var warm_up_iterations = 10;
// Run serially or all of them at the same time
var concurrent = false;
// Number of operations in one concurrent batch
var concurrent_batch_size = 10;
// Default connection url
var default_url = "mongodb://localhost:27017/db";

console.log("=======================================================");
console.log("= running benchmarks                                  =")
console.log("=======================================================");

var start = new Date();
run_test(default_url, tests[0], run_number_of_times, warm_up_iterations, concurrent, concurrent_batch_size, function(err, results) {
  var end = new Date();
  for(var key in results) {
    // Calculate the averages
    var result = results[key];
    var total_time = 0;
    var stats = new RunningStats();

    // Iterate over all the items
    for(var i = warm_up_iterations; i < result.results.length; i++) {
      // total_time = total_time + result.results[i].time;
      stats.push(result.results[i].time);
    }
    
    // Calculate the average
    var average = total_time / result.results.length;
    console.log("= test: " + key);
    console.log("  num      :: " + stats.numDataValues);
    console.log("  avg      :: " + stats.mean);
    console.log("  variance :: " + stats.variance);
    console.log("  std dev  :: " + stats.standardDeviation);
  }
});


// console.dir(tests)