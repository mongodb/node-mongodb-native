import { satisfies } from 'semver';

import { loadSpecTests } from '../spec';
import { executeUriValidationTest } from '../tools/uri_spec_runner';

const skipTests = [
  // TODO(NODE-3914): Fix; note that wtimeoutms will be deprecated via DRIVERS-555 (NODE-3078)
  'Deprecated (or unknown) options are ignored if replacement exists'
];

describe('Connection String spec tests', function () {
  const suites = loadSpecTests('connection-string');

  beforeEach(function () {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const test = this.currentTest!;

    const skippedTests = [
      'Invalid port (zero) with IP literal',
      'Invalid port (zero) with hostname'
    ];
    test.skipReason =
      satisfies(process.version, '>=20.0.0') && skippedTests.includes(test.title)
        ? 'TODO(NODE-5666): fix failing unit tests on Node20+'
        : undefined;

    if (test.skipReason) this.skip();
  });

  for (const suite of suites) {
    describe(suite.name, function () {
      for (const test of suite.tests) {
        it(`${test.description}`, function () {
          if (skipTests.includes(test.description)) {
            return this.skip();
          }

          executeUriValidationTest(test);
        });
      }
    });
  }
});
