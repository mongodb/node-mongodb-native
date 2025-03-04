'use strict';

const [major] = process.versions.node.split('.');

/** @type {import("mocha").MochaOptions} */
module.exports = {
  require: [
    'source-map-support/register',
    'ts-node/register',
    'test/tools/runner/throw_rejections.cjs',
    'test/tools/runner/chai_addons.ts',
    'test/tools/runner/ee_checker.ts',
    'test/tools/runner/hooks/configuration.ts',
    'test/tools/runner/hooks/leak_checker.ts',
    'test/tools/runner/hooks/legacy_crud_shims.ts'
  ],
  extension: ['js', 'ts'],
  ui: 'test/tools/runner/metadata_ui.js',
  recursive: true,
  timeout: 60000,
  failZero: true,
  reporter: 'test/tools/reporter/mongodb_reporter.js',
  sort: true,
  color: true,
  ignore: [
    'test/integration/node-specific/examples/handler.js',
    'test/integration/node-specific/examples/handler.test.js',
    'test/integration/node-specific/examples/aws_handler.js',
    'test/integration/node-specific/examples/aws_handler.test.js',
    'test/integration/node-specific/examples/setup.js'
  ],
  'node-option': Number(major) >= 23 ? ['no-experimental-strip-types'] : undefined
};
