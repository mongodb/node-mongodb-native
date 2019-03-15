'use strict';

function loadTests() {
  const fs = require('fs');
  const path = require('path');

  const directory = path.resolve.apply(path, arguments);
  fs
    .readdirSync(directory)
    .filter(filePath => filePath.match(/.*\.js$/))
    .map(filePath => path.resolve(directory, filePath))
    .forEach(x => require(x));
}

describe('ES2017', function() {
  let supportES2017 = false;
  try {
    new Function('return (async function foo() {})();')();
    supportES2017 = true;
  } catch (e) {
    supportES2017 = false;
  }

  if (supportES2017) {
    loadTests(__dirname, '..', 'examples');
  } else {
    it.skip('skipping ES2017 tests due to insufficient node version', function() {});
  }
});

describe('ES2018', function() {
  const supportES2018 = !!Symbol.asyncIterator;

  if (supportES2018) {
    loadTests(__dirname, '..', 'node-next', 'es2018');
  } else {
    it.skip('skipping ES2018 tests due to insufficient node version', function() {});
  }
});
