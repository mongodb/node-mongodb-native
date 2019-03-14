'use strict';

if (Symbol.asyncIterator) {
  const fs = require('fs');
  const path = require('path');

  fs
    .readdirSync(path.resolve(__dirname, '..', 'node-next', 'es2018'))
    .filter(filePath => filePath.match(/.*\.js$/))
    .map(filePath => path.resolve(__dirname, '..', 'node-next', 'es2018', filePath))
    .forEach(x => require(x));
} else {
  console.warn(
    `Warning: Current Node Version ${
      process.version
    } is not high enough to support running es2018 tests`
  );
}
