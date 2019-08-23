"use strict";

const path = require("path");
const fs = require("fs");
const MongoClient = require('mongodb').MongoClient;
const environments = require('../environments');
const TestConfiguration = require('../config');
const parseConnectionString = require('../../lib/core/uri_parser');
const mock = require('mongodb-mock-server');

let mongoClient;
let filters = [];
let files = [];

function addFilter(filter) {
  if (typeof filter !== 'object') {
    throw new Error('Type of filter must be an object');
  }
  if (!filter.filter || typeof filter.filter !== 'function') {
    throw new Error('Object filters must have a function named filter');
  }
  filters.push(filter);

}
function environmentSetup(environmentCallback) {
  const mongodb_uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  mongoClient = new MongoClient(mongodb_uri);

  mongoClient.connect((err, client) => {
    if (err) {
      return environmentCallback(err);
    }
    createFilters(environmentParser);

    function environmentParser(environmentName, version) {
      console.log('environmentName ', environmentName);
      const Environment = environments[environmentName];
      parseConnectionString(mongodb_uri, (err, parsedURI) => {
        if (err) {
          return environmentCallback(err);
        }
        const environment = new Environment(parsedURI, version);
        environment.mongo = require('../../index');
        client.close(() => environmentCallback(err, environment));
      });
    }
  });
}

function createFilters(callback) {
  let filtersInitialized = 0;
  const filterFiles = fs.readdirSync(path.join(__dirname, 'filters'));

  let topology, version;

  filterFiles.filter(x => x.indexOf('js') !== -1).forEach(x => {
    const FilterModule = require(path.join(__dirname, 'filters', x));
    const filter = new FilterModule();

    if (typeof filter.initializeFilter === 'function') {
      filter.initializeFilter(_increment);
    } else {
      _increment();
    }

    //Makes sure to wait for all the filters to be initialized and added before calling the callback
    function _increment() {
      topology = topology || filter.runtimeTopology;
      version = version || filter.mongoVersion;
      filtersInitialized += 1;
      addFilter(filter);

      if (filtersInitialized === filterFiles.length) {
        callback(topology, version);
      }
    }
  });
}

before(function(done) {
  environmentSetup((err, environment) => {
    if (err) {
      done(err);
    } else {
      this.configuration = new TestConfiguration(environment);
      done();
    }
  });
});

beforeEach(function(done) {
  // Assigned this to a new variable called self in order to preserve context and access tests within the _run function.
  const self = this;
  let filtersExecuted = 0;
  if (filters.length) {
    filters.forEach(function(filter) {
      _run(filter);
    });
  }

  function _run(filter) {
    filtersExecuted += 1;

    if (!filter.filter(self.currentTest)) {
      //If we filter out a test, we'd like to ensure that any before hooks are skipped, as long as that hook is not the root hook.
      if (!self.currentTest.parent.parent.root) {
        self.currentTest.parent._beforeEach = [];
      }
      self.skip();
    }
    if (filtersExecuted === filters.length) {
      done();
    }
  }
});

afterEach(() => mock.cleanup());

after(function(done) {
  mongoClient.close(() => {
    done();
  });
});
