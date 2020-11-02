'use strict';

const path = require('path');
const fs = require('fs');
const MongoClient = require('../../..').MongoClient;
const TestConfiguration = require('./config');
const parseConnectionString = require('../../../lib/core/uri_parser');
const eachAsync = require('../../../lib/core/utils').eachAsync;
const mock = require('mongodb-mock-server');
const wtfnode = require('wtfnode');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const filters = [];

function initializeFilters(client, callback) {
  const filterFiles = fs
    .readdirSync(path.join(__dirname, 'filters'))
    .filter(x => x.indexOf('js') !== -1);

  // context object that can be appended to as part of filter initialization
  const context = {};

  eachAsync(
    filterFiles,
    (filterName, cb) => {
      const FilterModule = require(path.join(__dirname, 'filters', filterName));
      const filter = new FilterModule();

      if (typeof filter !== 'object') {
        cb(new TypeError('Type of filter must be an object'));
        return;
      }

      if (!filter.filter || typeof filter.filter !== 'function') {
        cb(new TypeError('Object filters must have a function named filter'));
        return;
      }

      filters.push(filter);
      if (typeof filter.initializeFilter === 'function') {
        filter.initializeFilter(client, context, cb);
      } else {
        cb();
      }
    },
    err => callback(err, context)
  );
}

function filterOutTests(suite) {
  suite.tests = suite.tests.filter(test => filters.every(f => f.filter(test)));
  suite.suites.forEach(suite => filterOutTests(suite));
}

before(function(_done) {
  // NOTE: if we first parse the connection string and redact auth, then we can reenable this
  // const usingUnifiedTopology = !!process.env.MONGODB_UNIFIED_TOPOLOGY;
  // console.log(
  //   `connecting to: ${chalk.bold(MONGODB_URI)} using ${chalk.bold(
  //     usingUnifiedTopology ? 'unified' : 'legacy'
  //   )} topology`
  // );

  const client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const done = err => client.close(err2 => _done(err || err2));

  client.connect(err => {
    if (err) {
      done(err);
      return;
    }

    initializeFilters(client, (err, context) => {
      if (err) {
        done(err);
        return;
      }

      // replace this when mocha supports dynamic skipping with `afterEach`
      filterOutTests(this._runnable.parent);

      parseConnectionString(MONGODB_URI, (err, parsedURI) => {
        if (err) {
          done(err);
          return;
        }

        this.configuration = new TestConfiguration(parsedURI, context);
        client.close(done);
      });
    });
  });
});

// ensure all mock connections are closed after the suite is run
after(() => mock.cleanup());

// optionally enable test runner-wide plugins
require('./plugins/deferred');
require('./plugins/session_leak_checker');
require('./plugins/client_leak_checker');

// configure mocha and chai
require('mocha-sinon');
const chai = require('chai');
chai.use(require('sinon-chai'));
chai.use(require('../../functional/spec-runner/matcher').default);
chai.config.includeStack = true;
chai.config.showDiff = true;
chai.config.truncateThreshold = 0;

// install signal handlers for printing open/active handles
function dumpAndExit() {
  // let other potential handlers run before exiting
  process.nextTick(function() {
    try {
      wtfnode.dump();
    } catch (e) {
      console.log(e);
    }

    process.exit();
  });
}

process.on('SIGINT', dumpAndExit);
process.on('SIGTERM', dumpAndExit);
