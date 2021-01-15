'use strict';
const path = require('path');
const fs = require('fs');
const { EJSON } = require('bson');

/**
 * Given spec test folder names, loads the corresponding JSON
 *
 * @param  {...string} args - the spec test name to load
 * @returns {any[]}
 */
function loadSpecTests(...args) {
  const specPath = path.resolve(...[__dirname].concat(args));

  return fs
    .readdirSync(specPath)
    .filter(x => x.includes('.json'))
    .map(x => ({
      ...EJSON.parse(fs.readFileSync(path.join(specPath, x)), { relaxed: true }),
      name: path.basename(x, '.json')
    }));
}

module.exports = {
  loadSpecTests
};
