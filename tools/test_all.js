var nodeunit = require('../deps/nodeunit'),
  debug = require('util').debug,
  inspect = require('util').inspect,
  fs = require('fs'),
  exec = require('child_process').exec,
  Step = require('step'),
  ServerManager = require('../test/tools/server_manager').ServerManager,
  ReplicaSetManager = require('../test/tools/replica_set_manager').ReplicaSetManager;

// Manage the test server
var serverManager = new ServerManager();
var replicaSetManager = new ReplicaSetManager();
// test directories
var files = [];
var directories = [{dir: __dirname + "/../test", path: "/test/"}, 
      {dir: __dirname + "/../test/gridstore", path: "/test/gridstore/"}];

// Generate a list of tests
directories.forEach(function(dirEntry) {
  // Add the files
  files = files.concat(fs.readdirSync(dirEntry.dir).filter(function(item) {
    return item.indexOf('_test.js') != -1;
  }).map(function(file) {
    return dirEntry.path + file; 
  }));
});

// Replicasetfiles
var replicasetFiles = fs.readdirSync(__dirname + "/../test/replicaset").filter(function(item) {
  return item.indexOf('_test.js') != -1;
}).map(function(file) {
  return "/test/replicaset/" + file; 
});

// Basic default test runner
var runner = nodeunit.reporters.default;
var options = { error_prefix: '\u001b[31m',
  error_suffix: '\u001b[39m',
  ok_prefix: '\u001b[32m',
  ok_suffix: '\u001b[39m',
  bold_prefix: '\u001b[1m',
  bold_suffix: '\u001b[22m',
  assertion_prefix: '\u001b[35m',
  assertion_suffix: '\u001b[39m' };

// cleanup output directory
exec('rm -rf ./output', function(err, stdout, stderr) {
  // if we have a junit reporter
  if(process.argv[process.argv.length - 1] == "--junit") {
    // Remove directory
    fs.mkdirSync("./output", 0777);
    // Set up the runner for junit
    runner = nodeunit.reporters.junit;
    // Set up options
    options.output = './output';
  }

  // Boot up the test server and run the tests
  Step(
    // Start the single server
    function startSingleServer() {
      serverManager.start(true, this);
    },

    // Run all the integration tests using the pure js bson parser
    function runPureJS() {
      options.suffix = 'pure';
      runner.run(files, options, this);
    },

    // Run all integration tests using the native bson parser
    function runNativeJS() {
      process.env['TEST_NATIVE'] = 'TRUE';
      options.suffix = 'native';
      runner.run(files, options, this);      
    },

    // Execute all the replicaset tests
    function executeReplicaSetTests() {
      runner.run(replicasetFiles, options, this);      
    },    

    function done() {
      // Kill all mongod server
      replicaSetManager.killAll(function() {
        // Force exit
        process.exit();
      })
    }
  );    
});


  // fs.rmdirSync("./output"); 
// } catch(err) { debug(err)}


// // if we have a junit reporter
// if(process.argv[process.argv.length - 1] == "--junit") {
//   // Remove directory
//   fs.mkdirSync("./output", 0777);
//   // Set up the runner for junit
//   runner = nodeunit.reporters.junit;
//   // Set up options
//   options = {output:'./output'};
// }
// 
// // Boot up the test server and run the tests
// Step(
//   // Start the single server
//   function startSingleServer() {
//     serverManager.start(true, this);
//   },
// 
//   // Run all the integration tests using the pure js bson parser
//   function runPureJS() {
//     options.suffix = 'pure';
//     runner.run(files, options, this);
//   },
//   
//   // Run all integration tests using the native bson parser
//   function runNativeJS() {
//     process.env['TEST_NATIVE'] = 'TRUE';
//     options.suffix = 'native';
//     runner.run(files, options, this);      
//   },
// 
//   // Execute all the replicaset tests
//   function executeReplicaSetTests() {
//     runner.run(replicasetFiles, options, this);      
//   },    
//   
//   function done() {
//     // Kill all mongod server
//     replicaSetManager.killAll(function() {
//       // Force exit
//       process.exit();
//     })
//   }
// );