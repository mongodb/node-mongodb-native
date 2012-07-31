var nodeunit = require('nodeunit'),
  debug = require('util').debug,
  inspect = require('util').inspect,
  fs = require('fs'),
  exec = require('child_process').exec,
  spawn = require('child_process').spawn,
  Step = require('step/lib/step'),
  ServerManager = require('../../test/tools/server_manager').ServerManager,
  ReplicaSetManager = require('../../test/tools/replica_set_manager').ReplicaSetManager;

// Manage the test server
var serverManager = new ServerManager();
var replicaSetManager = new ReplicaSetManager();
// test directories
var files = [];
var directories = [{dir: __dirname + "/../../test", path: "/test/"}, 
      {dir: __dirname + "/../../test/gridstore", path: "/test/gridstore/"},
      {dir: __dirname + "/../../test/connection", path: "/test/connection/"}];

// Generate a list of tests
directories.forEach(function(dirEntry) {
  // Add the files
  files = files.concat(fs.readdirSync(dirEntry.dir).filter(function(item) {
    return /_test\.js$/i.test(item);
  }).map(function(file) {
    return dirEntry.path + file; 
  }));
});

// Replicasetfiles
var replicasetFiles = fs.readdirSync(__dirname + "/../../test/replicaset").filter(function(item) {
  return /_test\.js$/i.test(item);
}).map(function(file) {
  return "/test/replicaset/" + file; 
});

var specifedParameter = function(arguments, param) {
  for(var i = 0; i < arguments.length; i++) {
    if(arguments[i] == param) return true;
  }  
  return false;
}

// Different options
var junit = specifedParameter(process.argv, '--junit', false);
var noReplicaSet = specifedParameter(process.argv, '--noreplicaset', false);
var boot = specifedParameter(process.argv, '--boot', false);
var nonative = specifedParameter(process.argv, '--nonative', false);
var nokill = specifedParameter(process.argv, '--nokill', false);
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
  if(junit) {
    // Remove directory
    fs.mkdirSync("./output", 0777);
    // Set up options
    options.output = './output';
    options.junit = true;
  }

  // Run all tests including replicaset ones
  if(!noReplicaSet) {
    // Boot up the test server and run the tests
    Step(
      // Start the single server
      function startSingleServer() {
        if(boot) {   
          if(!nokill) {
            serverManager.start(true, {purgedirectories:true}, this);                      
          } else {
            this(null, null);
          }
        } else {
          this(null, null);
        }
      },

      // Run all the integration tests using the pure js bson parser
      function runPureJS() {
        options.suffix = 'pure';
        var test_set_runner = spawn('node', ['./dev/tools/test_set_runner.js', JSON.stringify(files), JSON.stringify(options)]);
        test_set_runner.stdout.on('data', function(data) {
          process.stdout.write(data.toString());
        });
        test_set_runner.stderr.on('data', function(data) {
          process.stdout.write("err: " + data.toString());
        });

        test_set_runner.on('exit', this);        
      },

      // Execute all the replicaset tests
      function executeReplicaSetTests() {
        options.suffix = 'pure';
        var test_set_runner = spawn('node', ['./dev/tools/test_set_runner.js', JSON.stringify(replicasetFiles), JSON.stringify(options)]);
        test_set_runner.stdout.on('data', function(data) {
          process.stdout.write(data.toString());
        });
        test_set_runner.stderr.on('data', function(data) {
          process.stdout.write("err: " + data.toString());
        });

        test_set_runner.on('exit', this);        
      },    

      function done() {
        if(boot) {          
          if(!nokill) {
            // Kill all mongod server
            replicaSetManager.killAll(function() {
              // Force exit
              process.exit();
            })
          } else {
            process.exit();            
          }
        } else {
          process.exit();
        }
      }
    );    
  } else {
    // Execute without replicaset tests
    Step(
      function startSingleServer() {
        if(!nokill) {
          serverManager.start(true, {purgedirectories:true}, this);
        } else {
          this(null, null);
        }
      },
      
      function runPureJS() {
        options.suffix = 'pure';
        var test_set_runner = spawn('node', ['./dev/tools/test_set_runner.js', JSON.stringify(files), JSON.stringify(options)]);
        test_set_runner.stdout.on('data', function(data) {
          process.stdout.write(data.toString());
        });
        test_set_runner.stderr.on('data', function(data) {
          process.stdout.write("err: " + data.toString());
        });

        test_set_runner.on('exit', this);                
      },
      
      function runNativeJS() {
        if(nonative) {
          return this(null, null);
        }
        
        options.suffix = 'native';
        options.native = true;

        var test_set_runner = spawn('node', ['./dev/tools/test_set_runner.js', JSON.stringify(files), JSON.stringify(options)]);
        test_set_runner.stdout.on('data', function(data) {
          process.stdout.write(data.toString());
        });
        test_set_runner.stderr.on('data', function(data) {
          process.stdout.write("err: " + data.toString());
        });

        test_set_runner.on('exit', this);        
      },
      
      function done() {
        if(boot) {          
          if(!nokill) {
            // Kill all mongod server
            replicaSetManager.killAll(function() {
              // Force exit
              process.exit();
            })
          } else {            
            process.exit();
          }
        } else {
          process.exit();
        }
      }
    );    
  }
});
