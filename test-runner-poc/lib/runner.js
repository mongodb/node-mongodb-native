"use strict";

const path = require("path");
const fs = require("fs");
const utils = require("mocha").utils;
const MongoClient = require('mongodb').MongoClient;
const MongoClientOptions = require('mongodb').MongoClientOptions;

let mongoClient;
let filters = [];

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

function environmentSetup(done) {
	//replace with mongodb_uri later
	
	mongoClient = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018');

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

		client.db('admin').command({buildInfo: true}, (err, result) => {
			currentVersion = result.version;
			createFilters(environmentName, currentVersion);
			done();
		});
	});
}

function createFilters(environmentName, currentVersion) {
	fs.readdirSync(path.join(__dirname, "filters"))
		.filter(x => x.indexOf("js") !== -1)
		.forEach(x => {
			const FilterModule = require(path.join(__dirname, "filters", x));
			addFilter(new FilterModule({ runtimeTopology: environmentName, version: currentVersion}));
		});
}


before(function(done) {
		environmentSetup(done);
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

after(function() {
	mongoClient.close();
})
