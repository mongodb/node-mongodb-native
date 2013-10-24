// console.log(argv._);
var argv = require('optimist')
    .usage('Usage: $0 -t [target] -e [environment] -n [name]')
    .demand(['t'])
    .argv;

// Configuration
var Configuration = require('integra').Configuration;

// Configurations
var replica_set_config = require('./configurations/replicasets').replica_set_config
  , single_server_config = require('./configurations/single_server').single_server_config
  , sharded_config = require('./configurations/sharded').sharded_config
  , replica_set_config_auth = require('./configurations/replicasets').replica_set_config_auth
  , none = require('./configurations/none').none;

// 
//  Configurations
//
var configurations = Configuration  
  // Single server configuration
  .add('single_server', single_server_config())
  .add('single_server_auth', single_server_config({auth:true}))
  // Simple Replicaset Configuration
  .add('replica_set', replica_set_config())
  .add('replica_set_auth', replica_set_config_auth({auth:true}))
  // Simple Sharded Configuration
  .add('sharded', sharded_config())
  .add('sharded_auth', sharded_config({auth:true}))
  // No operations configuration
  .add('none', none);

//
//  Runners
//
var replicaset_runners = require('./runners/replicaset_runner')(configurations)
  , sharded_runners = require('./runners/sharded_runner')(configurations)
  , standalone_runners = require('./runners/standalone_runner')(configurations)
  , ssl_runners = require('./runners/ssl_runner')(configurations)
  , kerberos_runners = require('./runners/kerberos_runners')(configurations);

// Running a specific test
var run_options = {};
if(argv.n) run_options.test = argv.n;
// Handle the targets
if(argv.t == 'functional') {
  var environment = argv.e ? argv.e : 'single_server'
  standalone_runners.runner.on('end', function() {
    process.exit(0);
  });
  standalone_runners.runner.run(environment, run_options);
} else if(argv.t == 'auth') {
  // Trap end of tests
  standalone_runners.runner_auth.on('end', function() {
    replicaset_runners.runner_auth.run('replica_set_auth', run_options);
  });

  replicaset_runners.runner_auth.on('end', function() {
    sharded_runners.runner_auth.run('sharded_auth', run_options);
  });

  // Start chain of auth tests
  standalone_runners.runner_auth.run('single_server_auth', run_options);
} else if(argv.t == 'ssl') {
  ssl_runners.runner.run('none', run_options);
  ssl_runners.runner.on('end', function() {
    process.exit(0);
  });
} else if(argv.t == 'sharded') {
  sharded_runners.runner.run('sharded', run_options);
} else if(argv.t == 'replicaset') {
  replicaset_runners.runner.run('replica_set', run_options);
} else if(argv.t == 'kerberos') {
  kerberos_runners.runner.run('none', run_options);
}