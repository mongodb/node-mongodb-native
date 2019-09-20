'use strict';

const path = require('path');
const fs = require('fs');
const MongoClient = require('../..').MongoClient;
const TestConfiguration = require('./config');
const parseConnectionString = require('../../lib/core/uri_parser');
const mock = require('mongodb-mock-server');
const eachAsync = require('../../lib/core/utils').eachAsync;

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
    err => callback(err, context)
  );
}

before(function(_done) {
  console.log(`connection string: ${MONGODB_URI}`);
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

      parseConnectionString(MONGODB_URI, (err, parsedURI) => {
        if (err) {
          done(err);
          return;
        }

        this.configuration = new TestConfiguration(parsedURI, context);
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
