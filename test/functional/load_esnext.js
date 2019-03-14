'use strict';

const fs = require('fs');
const path = require('path');
const version = process.version;

function loadTests() {
  const directory = path.resolve.apply(path, arguments);
  fs
    .readdirSync(directory)
    .filter(filePath => filePath.match(/.*\.js$/))
    .map(filePath => path.resolve(directory, filePath))
    .forEach(x => require(x));
}

let supportES2017 = false;
try {
  new Function('return (async function foo() {})();')();
  supportES2017 = true;
} catch (e) {
  supportES2017 = false;
}

const supportES2018 = !!Symbol.asyncIterator;

if (supportES2017) {
  loadTests(__dirname, '..', 'examples');
} else {
  console.warn(
    `Warning: Current Node Version ${version} is not high enough to support running examples`
  );
}

if (supportES2018) {
  loadTests(__dirname, '..', 'node-next', 'es2018');
} else {
  console.warn(
    `Warning: Current Node Version ${version} is not high enough to support running es2018 tests`
  );
}
