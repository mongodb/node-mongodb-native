"use strict";
const path = require("path");
const fs = require("fs");
const MongoClient = require('../../index.js').MongoClient;
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

function environmentSetup(environmentCallback, done) {
  const mongodb_uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  mongoClient = new MongoClient(mongodb_uri);
  mongoClient.connect((err, client) => {
    if (err) {
      return environmentCallback(err);
    }
    createFilters(environmentParser);

    function environmentParser(environmentName, version) {
      const Environment = environments[environmentName];

      function callEnvironmentCallback(result, version, err) {
        const environment = new Environment(result, version);
        environment.mongo = require('../../index');
        environmentCallback(err, environment);
        return client.close(done);
      }

      client.db('admin').command({ isMaster: 1, }, (err, result) => {
        if (err) {
          return environmentCallback(err);
        }
        if (result.hosts) {
          //This iterates through each host until it finds a primary node (i.e. ismaster is true)
          for (let i = 0; i < result.hosts.length; i++) {
            if (result.ismaster) {
              //the primary node has been found
              return callEnvironmentCallback(result, version, err);
            } else if (i === result.hosts.length - 1) {
              //the primary node is not in the array.
              //If so, then recursively repeat until the primary node is found.
              return environmentParser(environmentName, version)
            }
          }
        }
        else {
          return callEnvironmentCallback(result, version, err);
        }
      });
    }
  });
}
function createFilters(callback) {
  let filtersInitialized = 0;
  const filterFiles = fs.readdirSync(path.join(__dirname, 'filters'));
  let topology, version;
  filterFiles.filter(x => path.parse(x).ext === '.js').forEach(x => {
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
    if (err) done(err);
    this.configuration = new TestConfiguration(environment);
  }, done);
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
      if (!self.currentTest.parent.parent.root) {
        // self.currentTest.parent.pending = true; <-- this makes apm_tests skip when they should not
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
