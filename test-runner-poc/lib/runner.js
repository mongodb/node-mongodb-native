"use strict";

const path = require("path");
const fs = require("fs");
const utils = require("mocha").utils;

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

before(function() {

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
