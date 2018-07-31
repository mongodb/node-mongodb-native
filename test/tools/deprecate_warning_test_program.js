'use strict';

// prevent this file from being imported; it is only for use in functional/deprecate_warning_tests.js
if (require.main !== module) {
  return;
}

const deprecateOptions = require('../../lib/utils.js').deprecateOptions;

const testDeprecationFlags = deprecateOptions(
  {
    name: 'testDeprecationFlags',
    deprecatedOptions: ['maxScan', 'snapshot', 'fields'],
    optionsIndex: 0
  },
  options => {
    if (options) options = null;
  }
);

testDeprecationFlags({ maxScan: 0 });

// for tests that throw error on calling deprecated fn - this should never happen; stdout should be empty
if (process.argv[2]) {
  console.log(process.argv[2]);
}

process.nextTick(() => process.exit());
