'use strict';

const [major] = process.versions.node.split('.');

/** @type {import("mocha").MochaOptions} */
module.exports = {
  require: [
    'test/tools/runner/throw_rejections.cjs',
    'test/integration/node-specific/examples/setup.js'
  ],
  extension: ['js'],
  ui: 'test/tools/runner/metadata_ui.js',
  recursive: true,
  timeout: 6000,
  failZero: true,
  reporter: 'test/tools/reporter/mongodb_reporter.js',
  sort: true,
  color: true,
  'node-option': Number(major) >= 23 ? ['no-experimental-strip-types'] : undefined
};
