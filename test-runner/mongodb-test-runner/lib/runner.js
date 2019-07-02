#!/usr/bin/env node

'use strict';
const path = require('path');
const f = require('util').format;
const fs = require('fs');
const m = require('mongodb-version-manager');
const Metamocha = require('metamocha').Metamocha;
const ServerManager = require('mongodb-topology-manager').Server;

const argv = require('yargs')
  .usage('Usage: $0 -l -s -t [timeout] -e [environment] [files]')
  .help()
  .wrap(null)
  .options({
    e: {
      alias: 'environment',
      describe: 'MongoDB environment to run the tests against',
      default: 'single'
    },
    s: {
      alias: 'skipStartup',
      describe:
        'Skips the MongoDB environment setup. Used when a local MongoDB instance is preferred over the one created by the test runner',
      type: 'boolean'
    },
    t: {
      alias: 'timeout',
      describe: 'Timeout time for the tests, in ms',
      default: 30000
    },
    l: {
      alias: 'local',
      describe:
        'Skips downloading MongoDB, and instead uses an existing installation of the server',
      type: 'boolean'
    },
    g: {
      alias: 'grep',
      describe: 'only run tests matching <pattern>',
      type: 'string'
    }
  }).argv;

const mochaOptions = {};
if (argv.t) mochaOptions.timeout = argv.t;
if (argv.g) mochaOptions.grep = argv.g;

const metamocha = new Metamocha(mochaOptions);
const environmentName = process.env['MONGODB_ENVIRONMENT'] || argv.e;

// Add tests
argv._.forEach(function(file) {
  metamocha.lookupFiles(file);
});

// Skipping parameters
const startupOptions = {
  skipStartup: argv.s,
  skipRestart: argv.s,
  skipShutdown: argv.s,
  skip: false
};

const testPath = path.join(process.cwd(), 'test');
const configPath = path.join(testPath, 'config.js');
const envPath = path.join(testPath, 'environments.js');

if (!fs.existsSync(envPath)) {
  console.warn('Project must provide an environments configuration file');
  process.exit(1);
  return;
}

if (!fs.existsSync(configPath)) {
  console.warn('Project must provide a test configuration file');
  process.exit(1);
  return;
}

const environments = require(envPath);
if (!environments.hasOwnProperty(environmentName)) {
  console.warn('Invalid environment specified: ' + environmentName);
  process.exit(1);
  return;
}

console.log(`[environment: ${environmentName}]`);
const Environment = environments[environmentName];
const TestConfiguration = require(configPath);

// Add filters
fs
  .readdirSync(path.join(__dirname, 'filters'))
  .filter(x => x.indexOf('js') !== -1)
  .forEach(x => {
    const FilterModule = require(path.join(__dirname, 'filters', x));
    metamocha.addFilter(new FilterModule({ runtimeTopology: Environment.displayName || environmentName }));
  });

// Setup database
function findMongo(packagePath) {
  if (fs.existsSync(f('%s/package.json', packagePath))) {
    const obj = JSON.parse(fs.readFileSync(f('%s/package.json', packagePath)));
    if (obj.name && (obj.name === 'mongodb-core' || obj.name === 'mongodb')) {
      return {
        path: packagePath,
        package: obj.name
      };
    }

    return findMongo(path.dirname(packagePath));
  } else if (packagePath === '/') {
    return false;
  }

  return findMongo(path.dirname(packagePath));
}

const errorHandler = err => {
  console.dir(err);
  process.exit(1);
};

// Download MongoDB and run tests
function start() {
  const versionCheckManager = new ServerManager();
  return versionCheckManager.discover().then(function(serverInfo) {
    const environment = new Environment(serverInfo);
    const mongoPackage = findMongo(path.dirname(module.filename));

    try {
      environment.mongo = require(mongoPackage.path);
    } catch (err) {
      throw new Error('The test runner must be a dependency of mongodb or mongodb-core');
    }

    // patch environment based on skip info
    if (startupOptions.skipStartup) environment.skipStart = true;
    if (startupOptions.skipShutdown) environment.skipTermination = true;

    environment.setup(err => {
      if (err) return errorHandler(err);

      const dbConfig = new TestConfiguration(environment);
      dbConfig.start(function(err) {
        if (err) return errorHandler(err);

        // Run the tests
        metamocha.run(dbConfig, function(failures) {
          process.on('exit', function() {
            process.exit(failures);
          });

          dbConfig.stop(function() {
            process.exit();
          });
        });
      });
    });
  });
}

if (argv.l) {
  start();
  return;
}

m(function(err) {
  if (err) return errorHandler(err);
  start();
});
