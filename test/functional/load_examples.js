'use strict';

let supportsAsyncAwait = false;

try {
  new Function('return (async function foo() {return await Promise.resolve(42);})();')();
  supportsAsyncAwait = true;
} catch (e) {
  supportsAsyncAwait = false;
}

if (supportsAsyncAwait) {
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
