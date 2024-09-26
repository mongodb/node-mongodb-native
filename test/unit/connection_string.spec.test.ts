import { loadSpecTests } from '../spec';
import { executeUriValidationTest } from '../tools/uri_spec_runner';

const skipTests = [
  // TODO(NODE-3914): Fix; note that wtimeoutms will be deprecated via DRIVERS-555 (NODE-3078)
  'Deprecated (or unknown) options are ignored if replacement exists',
  // Note this will always be skipped as the URI class cannot properly parse these.
  'Colon in a key value pair'
];

describe('Connection String spec tests', function () {
  const suites = loadSpecTests('connection-string');

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
