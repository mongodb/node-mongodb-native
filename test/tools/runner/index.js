'use strict';

require('source-map-support').install({
  hookRequire: true
});

const path = require('path');
const fs = require('fs');
const { MongoClient } = require('../../../src');
const { TestConfiguration } = require('./config');
const { getEnvironmentalOptions } = require('../utils');
const { eachAsync } = require('../../../src/utils');
const mock = require('../mongodb-mock/index');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_API_VERSION = process.env.MONGODB_API_VERSION;
// Load balancer fronting 1 mongos.
const SINGLE_MONGOS_LB_URI = process.env.SINGLE_MONGOS_LB_URI;
// Load balancer fronting 2 mongoses.
const MULTI_MONGOS_LB_URI = process.env.MULTI_MONGOS_LB_URI;

const TRACE_TEST_FILTERS = process.env.TRACE_TEST_FILTERS;

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
  const filteredTests = [];

  for (const test of suite.tests) {
    let shouldRun = true;
    for (const filterer of filters) {
      shouldRun = shouldRun && filterer.filter(test);
      if (shouldRun === false && TRACE_TEST_FILTERS) {
        console.log(`${test.fullTitle()} filtered by ${filterer.name}`);
        break;
      }
    }

    if (shouldRun === true) {
      filteredTests.push(test);
    }
  }
  suite.tests = filteredTests;

  for (const currentSuite of suite.suites) {
    filterOutTests(currentSuite);
  }
}

before(function (_done) {
  const loadBalanced = SINGLE_MONGOS_LB_URI && MULTI_MONGOS_LB_URI;
  const client = new MongoClient(
    loadBalanced ? SINGLE_MONGOS_LB_URI : MONGODB_URI,
    getEnvironmentalOptions()
  );
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

      // Ensure test MongoClients set a serverApi parameter when required
      if (MONGODB_API_VERSION) {
        context.serverApi = MONGODB_API_VERSION;
      }

      if (SINGLE_MONGOS_LB_URI && MULTI_MONGOS_LB_URI) {
        context.singleMongosLoadBalancerUri = SINGLE_MONGOS_LB_URI;
        context.multiMongosLoadBalancerUri = MULTI_MONGOS_LB_URI;
      }

      // replace this when mocha supports dynamic skipping with `afterEach`
      filterOutTests(this._runnable.parent);
      this.configuration = new TestConfiguration(MONGODB_URI, context);
      done();
    });
  });
});

// ensure all mock connections are closed after the suite is run
after(() => mock.cleanup());

// optionally enable test runner-wide plugins
require('./plugins/deferred');
require('./plugins/session_leak_checker');
require('./plugins/client_leak_checker');

// configure mocha
require('mocha-sinon');
