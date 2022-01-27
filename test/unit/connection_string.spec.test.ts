import { loadSpecTests } from '../spec';
import { executeUriValidationTest } from '../tools/uri_spec_runner';

const skipTests = [
  // TODO: supposedly this one test should be caught by node, but it isn't
  'Missing delimiting slash between hosts and options',

  // We don't actually support `wtimeoutMS` which this test depends upon
  'Deprecated (or unknown) options are ignored if replacement exists'
];

describe('Connection String spec tests', function () {
  const testsThatDoNotThrowOnWarn = ['Repeated option keys'];
  const suites = loadSpecTests('connection-string'); /**.concat(loadSpecTests('auth'))*/

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
