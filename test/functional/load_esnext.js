'use strict';

function loadTests() {
  const fs = require('fs');
  const path = require('path');

  const directory = path.resolve.apply(path, arguments);
  fs.readdirSync(directory)
    .filter(filePath => filePath.match(/.*\.js$/))
    .map(filePath => path.resolve(directory, filePath))
    .forEach(x => require(x));
}

describe('ES2017', function() {
  loadTests(__dirname, '..', 'examples');
});

describe('ES2018', function() {
  loadTests(__dirname, '..', 'node-next', 'es2018');
});
