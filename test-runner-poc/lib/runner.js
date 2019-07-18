"use strict";

const path = require("path");
const fs = require("fs");
const utils = require("mocha").utils;
const MongoClient = require('mongodb').MongoClient;
const MongoClientOptions = require('mongodb').MongoClientOptions;

let mongoClient;
let filters = [];
let initializedFilters = 0;

function addFilter(filter, callback) {
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

function environmentSetup(done) {
	//replace with mongodb_uri later
	mongoClient = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');

	let environmentName;
	let currentVersion;
	mongoClient.connect((err, client) => {
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
		done();

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
		environmentSetup(done);
});

beforeEach(function(done) {
	var self = this;
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
			self.skip();
		}
		if (filtersExecuted === filters.length) done();
	}
});

function applyFilter(test, filter) {
	return filter.filter(test);
}

after(function() {
	mongoClient.close();
})
