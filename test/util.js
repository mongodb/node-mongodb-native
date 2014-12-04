"use strict";

var fs = require('fs');

var read_all_tests = function(directory) {
  return fs.readdirSync(directory).filter(function(element, index, array) {
    return element.indexOf(".js") != -1;
  }).map(function(element) {
    return directory + "/" + element;
  })
}

var run_test = function(url, file, number_of_times, warm_up_iterations, concurrent, concurrent_batch_size, options, callback) {
  var final_results = {};  
  var number_of_test_to_run = 0;
  // Set the options
  if(typeof options == 'function') {
    callback = options;
    options = {};
  }

  // Ensure options is set
  options = options == null ? {} : options
  // Ensure the batch size is correct
  if(concurrent && (number_of_times % concurrent_batch_size > 0)) return callback("Number of iterations must be divisible by batch size");

  // Load the file
  var _module = require(file);
  var test_name = options.test_name;
  
  // No test set run all the available tests and store the results
  run_file_tests(_module, Object.keys(_module), {
      url: url
    , file: file
    , final_results: final_results
    , number_of_times: number_of_times
    , warm_up_iterations: warm_up_iterations
    , concurrent: concurrent
    , concurrent_batch_size: concurrent_batch_size
    , test_name: test_name
  }, function(err, results) {
    callback(null, final_results);
  });
}

var run_file_tests = function(module, keys, options, callback) {
  if(keys.length == 0) return callback();  

  // Get the next key
  var _key = keys.shift();
  var _module_func = module[_key];
  var final_results = options.final_results;
  var test_name = options.test_name;

  // Skip the test if we have test_name specified
  if(test_name != null && test_name != _key) {
    return run_file_tests(module, keys, options, callback);
  }

  // Execute the test
  run_single_test(options.url
    , _key
    , _module_func
    , options.number_of_times
    , options.warm_up_iterations
    , options.concurrent
    , options.concurrent_batch_size
    , function(err, results) { 
      // Final results
      final_results[_key] = { results: results};
      if(err) { final_results[_key].err = err; }
      // Run all the tests
      run_file_tests(module, keys, options, callback);
  });
}

var run_single_test = function(url, func_name, func, number_of_times, warm_up_iterations, concurrent, concurrent_batch_size, callback) {
  var results = [];
  var test = func(url)();

  // Run the setup part first
  test.setup(function(err, setup_result) {
    if(err) return callback(err, null);

    if(!concurrent) {
      // Ensure we run warm up
      number_of_times = number_of_times + warm_up_iterations;
      // Execute the test
      exceute_test_serially(func_name, test, number_of_times, results, function(err, test_results) {
        test.teardown(function(_t_err, _t_result) {
          if(_t_err) return callback(_t_err, null);
          callback(err, test_results);
        })
      });
    } else {      
      // Number of batches to run
      var number_of_batches = number_of_times / concurrent_batch_size;
      // Number of items in each batch
      var number_left_to_run = number_of_batches;

      // Warm up the JIT
      exceute_test_serially(func_name, test, warm_up_iterations, [], function(err, test_results) {
        if(err) return callback(err, null);

        // Iterate over the number of batches
        execute_test_batches(func_name, test, concurrent_batch_size, number_of_batches, results, function(err, test_results) {
          test.teardown(function(_t_err, _t_result) {
            if(_t_err) return callback(_t_err, null);
            callback(err, test_results);
          });
        });
      });
    }
  })
}

var execute_test_batches = function(func_name, test, number_left_to_run_batch, number_of_batches, results, callback) {
  var number_left_to_run = number_left_to_run_batch;

  if(number_of_batches == -1) return callback(null, results);

  for(var i = 0; i < number_left_to_run_batch; i++) {
    new function() {
      // Set start function
      var start = new Date();
      
      // Execute function
      test.test(function(err, result) {
        var end = new Date();
        var time = end.getTime() - start.getTime();
        results.push({start: start, end: end, time: time});
        
        // Adjust the number of tests to run
        number_left_to_run = number_left_to_run - 1;
        // Callback
        if(number_left_to_run == 0) {
          process.nextTick(function() {
            execute_test_batches(func_name, test, number_left_to_run_batch, number_of_batches - 1, results, callback);          
          });
        }
      });          
    }();    
  }
}

var exceute_test_serially = function(func_name, test, number_of_times, results, callback) {
  if(number_of_times == 0) return callback(null, results);

  // Set start function
  var start = new Date();

  // Execute function
  test.test(function(err, result) {
    var end = new Date();
    var time = end.getTime() - start.getTime();
    results.push({start: start, end: end, time: time});
    
    // Execute the next tick
    process.nextTick(function() {
      exceute_test_serially(func_name, test, number_of_times - 1, results, callback);
    })
  });
}

/**
 * Internal statistics object used for calculating average and standard devitation on
 * running queries
 * @ignore
 */
var RunningStats = function() {
  var self = this;
  this.m_n = 0;
  this.m_oldM = 0.0;
  this.m_oldS = 0.0;
  this.m_newM = 0.0;
  this.m_newS = 0.0;

  // Define getters
  Object.defineProperty(this, "numDataValues", { enumerable: true
    , get: function () { return this.m_n; }
  });

  Object.defineProperty(this, "mean", { enumerable: true
    , get: function () { return (this.m_n > 0) ? this.m_newM : 0.0; }
  });

  Object.defineProperty(this, "variance", { enumerable: true
    , get: function () { return ((this.m_n > 1) ? this.m_newS/(this.m_n - 1) : 0.0); }
  });

  Object.defineProperty(this, "standardDeviation", { enumerable: true
    , get: function () { return Math.sqrt(this.variance); }
  });

  Object.defineProperty(this, "sScore", { enumerable: true
    , get: function () {
      var bottom = this.mean + this.standardDeviation;
      if(bottom == 0) return 0;
      return ((2 * this.mean * this.standardDeviation)/(bottom));
    }
  });
}

/**
 * @ignore
 */
RunningStats.prototype.push = function(x) {
  // Update the number of samples
  this.m_n = this.m_n + 1;
  
  // See Knuth TAOCP vol 2, 3rd edition, page 232
  if(this.m_n == 1) {
    this.m_oldM = this.m_newM = x;
    this.m_oldS = 0.0;
  } else {
    this.m_newM = this.m_oldM + (x - this.m_oldM) / this.m_n;
    this.m_newS = this.m_oldS + (x - this.m_oldM) * (x - this.m_newM);

    // set up for next iteration
    this.m_oldM = this.m_newM;
    this.m_oldS = this.m_newS;
  }
}

exports.read_all_tests = read_all_tests;
exports.run_test = run_test;
exports.RunningStats = RunningStats;