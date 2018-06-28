'use strict';

const semver = require('semver');

if (semver.satisfies(process.version, '>=8.0.0')) {
  const fs = require('fs');
  const path = require('path');

  fs
    .readdirSync(path.resolve(__dirname, '..', 'examples'))
    .filter(filePath => filePath.match(/.*\.js$/))
    .map(filePath => path.resolve(__dirname, '..', 'examples', filePath))
    .forEach(x => require(x));
} else {
  console.warn(
    `Warning: Current Node Version ${
      process.version
    } is not high enough to support running examples`
  );
}
