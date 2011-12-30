var nodeunit = require('../deps/nodeunit');

// Let's parse the argv (ensure we have all the number of parameters)
if(process.argv.length === 4) {
  // Pop the arguments off
  var options = JSON.parse(process.argv.pop());
  var files = JSON.parse(process.argv.pop());
  
  // Basic default test runner
  var runner = options['junit'] == true ? nodeunit.reporters.junit : nodeunit.reporters.default;
  var nativeExecution = options['native'] == null ? false : options['native'];
  // Remove junit tag if it exists
  delete options['junit'];
  delete options['native'];
  
  // Set native process 
  if(nativeExecution) {
    process.env['TEST_NATIVE'] = 'TRUE';    
  }
  
  // Let's set up nodeunit to run
  runner.run(files, options, function() {
    process.exit(0);
  });
  // console.dir(options)
  // console.dir(nodeunit)
} else {
  console.error("Must pass in a list of files and options object");
}
