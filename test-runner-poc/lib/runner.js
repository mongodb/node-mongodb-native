"use strict";

const path = require("path");
const fs = require("fs");
const utils = require("mocha").utils;
const MongoClient = require('mongodb').MongoClient;
const f = require('util').format;
const parseConnectionString = require("../../lib/core/uri_parser");

const testPath = path.join(path.join(process.cwd(), "../"), 'test');
const configPath = path.join(testPath, 'config.js');
const envPath = path.join(testPath, 'environments.js');
const environments = require(envPath);
const TestConfiguration = require(configPath);

let mongoClient;
let filters = [];
let initializedFilters = 0;

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

function environmentSetup(environmentCallback, done) {
	const mongodb_uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
	mongoClient = new MongoClient(mongodb_uri);

	let environmentName;
	let currentVersion;
	mongoClient.connect((err, client) => {
		if(err) console.log(err)
		client.db('admin').command({buildInfo: true}, (err, result) => {
			const version = result.version;
			const Environment = environments[environmentName];
			const environment = new Environment(version)

			const parsedResult = parseConnectionString(mongodb_uri, (err, parsedURI)=>{
				if (err) console.log(err);
				environment.url = mongodb_uri;
				environment.port = parsedURI.hosts[0].port;
				environment.host = parsedURI.hosts[0].host;
			})
			try {
				const mongoPackage = findMongo(path.dirname(module.filename));
				environment.mongo = require(mongoPackage.path);
			} catch (err) {
				console.log("err: ",err)
				throw new Error('The test runner must be a dependency of mongodb or mongodb-core');
			}
			environmentCallback(environment, client, done)
		});
		let topologyType = mongoClient.topology.type;
		switch (topologyType) {
			case "server":
				environmentName = 'single';
				break;
			case "replset":
				environmentName = 'replicaset';
				break;
			case "mongos":
				environmentName = 'sharded';
				break;
			default:
				console.warn("Topology type is not recognized.")
				break;
		}
		createFilters(environmentName);

	});
}

function createFilters(environmentName) {
	fs.readdirSync(path.join(__dirname, "filters"))
		.filter(x => x.indexOf("js") !== -1)
		.forEach(x => {
			const FilterModule = require(path.join(__dirname, "filters", x));
			addFilter(new FilterModule({ runtimeTopology: environmentName}));
		});
}

before(function(done) {
	environmentSetup((environment, client, d) => {
		this.configuration = new TestConfiguration(environment)
		client.close(d);
	}, done);
});

beforeEach(function(done) {
	const self = this;
	let filtersExecuted = 0;
	if (filters.length) {
		filters.forEach(function(filter) {
			if (typeof filter.initializeFilter === 'function') {
				filter.initializeFilter(callback);
			} else {
				callback();
			}
			function callback() {
				_run(filter);
			}
    });
	}

	function _run(filter) {
		filtersExecuted += 1;

		if (!filter.filter(self.currentTest)) {
			self.currentTest.parent.pending = true;
			self.skip();
		}
		if (filtersExecuted === filters.length) done();
	}
});

after(function() {
	mongoClient.close();
})
