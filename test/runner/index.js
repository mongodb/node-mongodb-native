'use strict';

const path = require('path');
const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const environments = require('../environments');
const TestConfiguration = require('../config');
const parseConnectionString = require('../../lib/core/uri_parser');
const mock = require('mongodb-mock-server');
const eachAsync = require('../../lib/utils').eachAsync;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const filters = [];

function initializeEnvironment(context, callback) {
  const environmentName = context.environmentName;
  const version = context.version;

  console.log(`[environment: ${environmentName}]`);
  const Environment = environments[environmentName];

  parseConnectionString(MONGODB_URI, (err, parsedURI) => {
    if (err) {
      callback(err);
      return;
    }

    const environment = new Environment(parsedURI, version);
    environment.mongo = require('../../index');
    callback(null, environment);
  });
}

function initializeFilters(client, callback) {
  const filterFiles = fs
    .readdirSync(path.join(__dirname, 'filters'))
    .filter(x => x.indexOf('js') !== -1);

  // context object that can be appended to as part of filter initialization
  const context = {};

  eachAsync(
    filterFiles,
    (filterName, cb) => {
      const FilterModule = require(path.join(__dirname, 'filters', filterFiles[filterName]));
      const filter = new FilterModule();

      if (typeof filter !== 'object') {
        throw new TypeError('Type of filter must be an object');
      }

      if (!filter.filter || typeof filter.filter !== 'function') {
        throw new TypeError('Object filters must have a function named filter');
      }

      filters.push(filter);
      if (typeof filter.initializeFilter === 'function') {
        filter.initializeFilter(client, context, cb);
      } else {
        cb();
      }
    },
    () => callback(null, context)
  );
}

before(function(done) {
  console.log(`connection string: ${MONGODB_URI}`);
  const client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  done = client.close(done);

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

      initializeEnvironment(context, (err, environment) => {
        if (err) {
          done(err);
          return;
        }

        this.configuration = new TestConfiguration(environment);
        done();
      });
    });
  });
});

beforeEach(function() {
  for (let i = 0; i < filters.length; ++i) {
    const filter = filter[i];
    if (!filter.filter(this.currentTest)) {
      // if we filter out a test, we'd like to ensure that any before hooks are skipped, as
      // long as that hook is not the root hook.
      if (!this.currentTest.parent.parent.root) {
        this.currentTest.parent._beforeEach = [];
      }

      this.skip();
      return;
    }
  }
});

afterEach(() => mock.cleanup());
