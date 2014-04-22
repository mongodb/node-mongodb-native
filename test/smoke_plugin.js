/* Note: because this plugin uses process.on('uncaughtException'), only one
 * of these can exist at any given time. This plugin and anything else that
 * uses process.on('uncaughtException') will conflict. */
exports.attachToRunner = function(runner, outputFile) {
  var smokeResults = [];
  var runningTests = {};

  var integraPlugin = {
    beforeTest: function(test, callback) {
      test.startTime = Date.now();
      runningTests[test.name] = test;
      callback();
    },
    afterTest: function(test, callback) {
      smokeResults.push({
        status: test.status,
        start: test.startTime,
        end: Date.now(),
        test_file: test.name,
        exit_code: 0,
        url: null
      });
      delete runningTests[test.name];
      callback();
    },
    beforeExit: function(obj, callback) {
      fs.writeFile(outputFile, JSON.stringify(smokeResults), function() {
        callback();
      });
    }
  };

  // In case of exception, make sure we write file
  process.on('uncaughtException', function(err) {
    // Mark all currently running tests as failed
    for (var testName in runningTests) {
      smokeResults.push({
        status: "fail",
        start: runningTests[testName].startTime,
        end: Date.now(),
        test_file: testName,
        exit_code: 0,
        url: null
      });
    }

    // write file
    fs.writeFileSync(outputFile, JSON.stringify(smokeResults));

    // Standard NodeJS uncaught exception handler
    console.error(err.stack);
    process.exit(1);
  });

  runner.plugin(integraPlugin);
  return integraPlugin;
};
