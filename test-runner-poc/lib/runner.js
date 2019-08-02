"use strict";

const path = require("path");
const fs = require("fs");
const utils = require("mocha").utils;

const environments = require('../environments');
const TestConfiguration = require('../config');

const mock = require('mongodb-mock-server');

let mongoClient;
let filters = [];
let files = [];

function addFilter(filter) {
	if (typeof filter !== "function" && typeof filter !== "object") {
		throw new Error(
			"Type of filter must either be a function or an object"
		);
	}
	if (
		typeof filter === "object" &&
		(!filter.filter || typeof filter.filter !== "function")
	) {
		throw new Error("Object filters must have a function named filter");
	}

	if (typeof filter === "function") {
		filters.push({ filter: filter });
	} else {
		filters.push(filter);
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

	const environmentName = process.env['MONGODB_ENVIRONMENT'];

	console.log(`[environment: ${environmentName}]`);

	//apply filters
	fs.readdirSync(path.join(__dirname, "filters"))
		.filter(x => x.indexOf("js") !== -1)
		.forEach(x => {
			const FilterModule = require(path.join(__dirname, "filters", x));
			addFilter(new FilterModule({ runtimeTopology: 'sharded' }));
		});

});

beforeEach(function() {
	var self = this;

	var called = 0;
	function callback() {
		called += 1;
		if (called === filters.length) _run();
	}

	if (filters.length) {
		filters.forEach(function(filter) {
			callback();
		});
	}

	function _run() {
		if (!applyFilters(self.currentTest)) {
			self.skip();
		}
	}
});

function applyFilters(test) {
	return filters.every(function(filterFunc) {
		var res = filterFunc.filter(test);
		return res;
	});
}
