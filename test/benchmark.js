"use strict";

// console.log(argv._);
var argv = require('optimist')
    .usage('Usage: $0 -n [name]')
    .argv;

// Get all the functions needed
var read_all_tests = require('./util').read_all_tests
  , fs = require('fs')
  , run_test = require('./util').run_test
  , spawn = require('child_process').spawn
  , RunningStats = require('./util').RunningStats;

// Load all the tests
var tests = read_all_tests(__dirname + "/benchmarks");
// Number of times to run the test
var run_number_of_times = 1000;
// Number of iterations to run for JIT warmup
var warm_up_iterations = 100;
// Run serially or all of them at the same time
var concurrent = false;
// Number of operations in one concurrent batch
var concurrent_batch_size = 10;
// Default connection url
var default_url = "mongodb://localhost:27017/db";
// Additional options
var options = {};
// If we want to run a single benchmark test
if(argv.n != null) {
  options.test_name = argv.n;
}

// Start time
var start = new Date();

console.log("=======================================================");
console.log("= running benchmarks                                  =")
console.log("=======================================================");

var run_tests = function(_tests) {
  if(_tests.length == 0) process.exit(0);

  // Get a test file
  var testFile = _tests.shift();

  // Run the test file
  run_test(default_url
    , testFile
    , run_number_of_times
    , warm_up_iterations
    , concurrent
    , concurrent_batch_size
    , options
    , function(err, results) {
      // Let's run the test and calculate the results
      var end = new Date();
      // Iterate over all the results
      for(var key in results) {
        // Calculate the averages
        var result = results[key];
        var total_time = 0;
        var stats = new RunningStats();
        var startMemory = process.memoryUsage().rss;

        // console.dir(result)
        // Result file used for gnuplot
        var resultfile = result.results.map(function(x, i) { 
          return (i + 1) + " " + x.time; 
        }).join("\n");

        // Iterate over all the items
        for(var i = warm_up_iterations; i < result.results.length; i++) {
          stats.push(result.results[i].time);
        }

        // Filename
        var dataFileName = "./" + key.replace(/ /g, "_") + ".dat";
        // Write out the data to a file
        fs.writeFileSync(dataFileName, resultfile);

        // Execute the gnuplot to create the png file
        executeGnuPlot(key.replace(/ /g, "_"), dataFileName);

        // console.log("============================== data for key " + key)
        // console.dir(result)

        // End time
        var end = new Date();
        // End memory size
        var endMemory = process.memoryUsage().rss;
        // Calculate the average
        var average = total_time / result.results.length;
        console.log("= test: " + key);
        console.log("  total    :: " + (end.getTime() - start.getTime()));
        console.log("  num      :: " + stats.numDataValues);
        console.log("  avg      :: " + stats.mean);
        console.log("  variance :: " + stats.variance);
        console.log("  std dev  :: " + stats.standardDeviation);
        console.log("  bytes used  :: " + (endMemory - startMemory));
      }

      // Run next batch of tests
      run_tests(_tests);
  });

}

var executeGnuPlot = function(key, dataFileName) {
  var gnuplot = spawn('gnuplot', ['-p', '-e', "set term png; set output './" + key + ".png'; plot '" + dataFileName + "'"])
  gnuplot.stdout.on('data', function (data) {
    console.log('stdout: ' + data);
  });

  gnuplot.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });

  gnuplot.on('close', function (code) {
    // console.log('child process exited with code ' + code);
  });  
}

// Run all the tests
run_tests(tests);