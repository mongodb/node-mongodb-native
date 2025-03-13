'use strict';

const [major] = process.versions.node.split('.');

/** @type {import("mocha").MochaOptions} */
module.exports = {
  require: [
    'ts-node/register',
    'test/tools/runner/throw_rejections.cjs',
    'test/tools/runner/chai_addons.ts'
  ],
  reporter: 'test/tools/reporter/mongodb_reporter.js',
  failZero: true,
  color: true,
  timeout: 10000,
  'node-option': Number(major) >= 23 ? ['no-experimental-strip-types'] : undefined
};
