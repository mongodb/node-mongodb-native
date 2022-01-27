import { loadSpecTests } from '../spec';
import { executeUriValidationTest } from '../tools/uri_spec_runner';

const skipTests = [
  // TODO: supposedly this one test should be caught by node, but it isn't
  'Missing delimiting slash between hosts and options',

  // TODO: fix? we still respect the deprecated wtimeout and not wtimeoutms
  // but wtimeoutms has recently also been deprecated via DRIVERS-555 (NODE-3078)
  // so not sure what the right answer is here
  'Deprecated (or unknown) options are ignored if replacement exists'
];

describe('Connection String spec tests', function () {
  // TODO: make these throw?
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
