import { loadSpecTests } from '../../spec';
import { executeUriValidationTest } from '../../tools/uri_spec_runner';

const SKIP = ['should throw an exception if username and no password (MONGODB-AWS)'];

describe('Auth option spec tests', function () {
  const suites = loadSpecTests('auth');

  for (const suite of suites) {
    describe(suite.name, function () {
      for (const test of suite.tests) {
        if (SKIP.includes(test.description)) {
          beforeEach(function () {
            this.currentTest.skipReason = 'NODE-3986: Fix MONGODB-AWS Spec Test';
          });
        }
        it(`${test.description}`, function () {
          executeUriValidationTest(test);
        });
      }
    });
  }
});
