import { loadSpecTests } from '../spec';
import { executeUriValidationTest } from '../tools/uri_spec_runner';

const skipTests = [
  // TODO(NODE-3919): fix to match expected behavior
  'Missing delimiting slash between hosts and options',

  // TODO(NODE-3914): Fix; note that wtimeoutms will be deprecated via DRIVERS-555 (NODE-3078)
  'Deprecated (or unknown) options are ignored if replacement exists'
];

describe('Connection String spec tests', function () {
  // TODO(NODE-3920): validate repeated options
  const testsThatDoNotThrowOnWarn = ['Repeated option keys'];
  const suites = loadSpecTests('connection-string');

  for (const suite of suites) {
    describe(suite.name, function () {
      for (const test of suite.tests) {
        it(`${test.description}`, function () {
          if (skipTests.includes(test.description)) {
            return this.skip();
          }

          executeUriValidationTest(
            test,
            testsThatDoNotThrowOnWarn.some(t => t === test.description)
          );
        });
      }
    });
  }
});
