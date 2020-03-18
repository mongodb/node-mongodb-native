'use strict';
const path = require('path');
const fs = require('fs');
const { EJSON } = require('bson');

function loadSpecTests() {
  const specPath = path.resolve.apply(null, [__dirname].concat(Array.from(arguments)));

  return fs
    .readdirSync(specPath)
    .filter(x => x.indexOf('.json') !== -1)
    .map(x =>
      Object.assign(EJSON.parse(fs.readFileSync(path.join(specPath, x)), { relaxed: true }), {
        name: path.basename(x, '.json')
      })
    );
}

module.exports = {
  loadSpecTests
};
