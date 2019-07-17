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
	// if (typeof filter.initializeFilter === 'function') {
	// 	console.log('calling initializeFilter function')
	// 	filter.initializeFilter(callback);
	// } else {
	// 	console.log('no initializeFilter function')
	// 	callback();
	// }
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
		createFilters(environmentName);
		done();
		/*
		client.db('admin').command({buildInfo: true}, (err, result) => {
			currentVersion = result.version;
			createFilters(environmentName, currentVersion);
			done();
		});
		*/
		/*
		.then(()=>{
			createFilters(environmentName, currentVersion);
			done();
		})
		*/

	});
}

function createFilters(environmentName) {
	fs.readdirSync(path.join(__dirname, "filters"))
		.filter(x => x.indexOf("js") !== -1)
		.forEach(x => {
			const FilterModule = require(path.join(__dirname, "filters", x));
			addFilter(new FilterModule({ runtimeTopology: environmentName}), callback);
		});
	console.log('done creating filters')
}

function callback() {
	initializedFilters += 1;
	console.log('initializedFilters ', initializedFilters)
}


before(function(done) {
		environmentSetup(done);
});

beforeEach(function(done) {
	var self = this;
	// initializedFilters = 0;

	var called = 0;
	function callback() {
		called += 1;
		if (called === filters.length) _run();
	}

	// if (initializedFilters === filters.length) _run();

	if (filters.length) {
		filters.forEach(function(filter) {
			if (typeof filter.initializeFilter === 'function') {
				filter.initializeFilter(callback);
			} else {
				callback();
			}
		});
	}

	function _run() {
		console.log('inside run')
		if (!applyFilters(self.currentTest)) {
			self.skip();
		}
		done();
	}


});

function applyFilters(test) {
	return filters.every(function(filterFunc) {

		var res = filterFunc.filter(test);
		console.log('filter: ', filterFunc, 'res ', res)
		return res;
	});
}

after(function() {
	mongoClient.close();
})
