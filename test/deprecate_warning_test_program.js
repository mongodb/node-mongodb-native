'use strict';

if (require.main !== module) {
  return;
}

const deprecateOptions = require('../lib/utils.js').deprecateOptions;

const testDeprecationFlags = deprecateOptions(
  {
    name: 'testDeprecationFlags',
    deprecatedParams: ['maxScan', 'snapshot', 'fields'],
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
