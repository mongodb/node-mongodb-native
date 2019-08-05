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
  switch (typeof filter) {
    case 'function':
      filters.push({ filter: filter });
      break;
    case 'object':
      if (!filter.filter || typeof filter.filter !== 'function') {
        throw new Error('Object filters must have a function named filter');
      }
      filters.push(filter);
      break;
    default:
      throw new Error('Type of filter must either be a function or an object');
  }
}

function environmentSetup(environmentCallback) {
  const mongodb_uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  mongoClient = new MongoClient(mongodb_uri);

  mongoClient.connect((err, client) => {
    if (err) throw new Error(err);

    createFilters(environmentParser);

    function environmentParser(environmentName, version) {
      console.log('environmentName ', environmentName);
      const Environment = environments[environmentName];
      const environment = new Environment(version);

      parseConnectionString(mongodb_uri, (err, parsedURI) => {
        if (err) throw new Error(err);
        environment.port = parsedURI.hosts[0].port;
        environment.host = parsedURI.hosts[0].host;
        environment.url = mongodb_uri;
      });
      if (environmentName !== 'single') environment.url += '/integration_tests';

      try {
        const mongoPackage = {
          path: path.resolve(process.cwd(), '..'),
          package: 'mongodb'
        };
        environment.mongo = require(mongoPackage.path);
      } catch (err) {
        throw new Error('The test runner must be a dependency of mongodb or mongodb-core');
      }
      environmentCallback(environment, client);
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
  environmentSetup((environment, client) => {
    this.configuration = new TestConfiguration(environment);
    client.close(done);
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
