'use strict';

const [major] = process.versions.node.split('.');

/** @type {import("mocha").MochaOptions} */
module.exports = {
  "require": [
    "source-map-support/register",
    "ts-node/register",
    "test/tools/runner/chai_addons.ts",
    "test/tools/runner/ee_checker.ts"
  ],
  "extension": [
    "js",
    "ts"
  ],
  "recursive": true,
  "timeout": 60000,
  "failZero": true,
  "reporter": "test/tools/reporter/mongodb_reporter.js",
  "sort": true,
  "color": true,
  "node-option": Number(major) >= 23 ? ['no-experimental-strip-types'] : undefined
}
