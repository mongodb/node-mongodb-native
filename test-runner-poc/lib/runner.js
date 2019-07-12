"use strict";

const path = require("path");
const fs = require("fs");
const utils = require("mocha").utils;
const MongoClient = require('mongodb').MongoClient;
const MongoClientOptions = require('mongodb').MongoClientOptions;

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
environmentSetup();
function environmentSetup() {
	//replace with mongodb_uri later
	const mongoClient = new MongoClient('mongodb://127.0.0.1:27018');
	let environmentName;
	let currentVersion;
	mongoClient.connect(function(err, client) {
		console.log("connect")
		client.db('admin').command({buildInfo: true}, function(err, result) {
			currentVersion = result.version;
			console.log("Current version in mongoclient.connect ",currentVersion)
			createFilters(environmentName, currentVersion);
		})

	});
	mongoClient.on('topologyDescriptionChanged', function(event) {
		const informationObject = JSON.parse(JSON.stringify(event, null, 2));
		const topologyType = informationObject.newDescription.topologyType;
		const topologyServerType = informationObject.newDescription.servers[0].type;
		switch (topologyType) {
			case "Single":
				if (topologyServerType === 'Standalone') {
					environmentName = 'single';
				}
				else environmentName = 'replicaset'
				break;
			case "Sharded":
				environmentName = 'sharded';
				break;
			default:console.warn("Topology type is not recognized.")
				break;
		}

		console.log("environment name: ",environmentName)
	});

}
function createFilters(environmentName, currentVersion) {
	fs.readdirSync(path.join(__dirname, "filters"))
		.filter(x => x.indexOf("js") !== -1)
		.forEach(x => {
			const FilterModule = require(path.join(__dirname, "filters", x));
			console.log("currentVersion in runner.js ",currentVersion)
			addFilter(new FilterModule({ runtimeTopology: environmentName, version: currentVersion}));
		});
		console.log("filters.length in before ",filters.length)
}


before(function() {

})

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
		console.log("result: ",res," from filter ",filterFunc)
		return res;
	});
}
