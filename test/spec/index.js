'use strict';
const path = require('path');
const fs = require('fs');
const { EJSON } = require('bson');

function hasDuplicates(testArray) {
  const testNames = testArray.map(test => test.description);
  const testNameSet = new Set(testNames);
  return testNameSet.size !== testNames.length;
}

/**
 * Given spec test folder names, loads the corresponding JSON
 *
 * @param  {...string} args - the spec test name to load
 * @returns {any[]}
 */
function loadSpecTests(...args) {
  const specPath = path.resolve(...[__dirname].concat(args));

  const suites = fs
    .readdirSync(specPath)
    .filter(x => x.includes('.json'))
    .map(x => ({
      ...EJSON.parse(fs.readFileSync(path.join(specPath, x)), { relaxed: true }),
      name: path.basename(x, '.json')
    }));

  for (const suite of suites) {
    if (suite.tests && hasDuplicates(suite.tests)) {
      throw new Error(
        `Failed to load suite ${suite.name} because it contains duplicate test cases`
      );
    }
  }

  return suites;
}

module.exports = {
  loadSpecTests
};
