var fs = require('fs');

var read_all_tests = function(directory) {
  return fs.readdirSync(directory).filter(function(element, index, array) {
    return element.indexOf(".js") != -1;
  }).map(function(element) {
    return directory + "/" + element;
  })
}

var run_test = function(url, file, number_of_times, concurrent, test_name, callback) {
  var final_results = {};  
  var number_of_test_to_run = 0;
  // If we have not test_name set up
  if(typeof test_name == 'function') {
    callback = test_name;
    test_name = null;
  }

  // Load the file
  var _module = require(file);
  // No test set run all the available tests and store the results
  if(test_name == null) {
    // Execute the setup
    var keys = Object.keys(_module);
    var number_of_tests = keys.length;
    // Go over all the tests
    for(var i = 0; i < keys.length; i++) {
      // Wrap the scope so we can execute it by itself
      new function(_key, _module_func) {
        run_single_test(url, _key, _module_func, number_of_times, concurrent, function(err, results) {          
          // Final results
          final_results[_key] = { results: results};
          if(err) { final_results[_key].err = err; }
          // Adjust number of tests left to run
          number_of_tests = number_of_tests - 1;
          if(number_of_tests == 0) callback(null, final_results)
        });
      }(keys[i], _module[keys[i]])
    }
  } else {

  }
}

var run_single_test = function(url, func_name, func, number_of_times, concurrent, callback) {
  var results = [];
  var test = func(url)();

  // Run the setup part first
  test.setup(function(err, setup_result) {
    if(err) return callback(err, null);

    if(!concurrent) {
      exceute_test_serially(url, func_name, test, number_of_times, results, function(err, test_results) {
        test.teardown(function(_t_err, _t_result) {
          if(_t_err) return callback(_t_err, null);
          callback(err, test_results)
        })
      });
    } else {
      var number_left_to_run = number_of_times;
      // Execute all the tests
      for(var i = 0; i < number_of_times; i++) {
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
            if(number_left_to_run == 0) {
              test.teardown(function(_t_err, _t_result) {
                if(_t_err) return callback(_t_err, null);
                callback(err, results)
              })            
            }
          });          
        }();
      }
    }
  })
}

var exceute_test_serially = function(url, func_name, test, number_of_times, results, callback) {
  if(number_of_times == 0) return callback(null, results);
  number_of_times = number_of_times - 1;
  // Set start function
  var start = new Date();
  // Execute function
  test.test(function(err, result) {
    var end = new Date();
    var time = end.getTime() - start.getTime();
    results.push({start: start, end: end, time: time});
    // Execute the next tick
    process.nextTick(function() {
      exceute_test_serially(url, func_name, test, number_of_times - 1, results, callback);
    })
  });
}


exports.read_all_tests = read_all_tests;
exports.run_test = run_test;