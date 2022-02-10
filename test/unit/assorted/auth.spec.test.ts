import { loadSpecTests } from '../../spec';
import { executeUriValidationTest } from '../../tools/uri_spec_runner';

const SKIP = ['should throw an exception if username and no password (MONGODB-AWS)'];

describe('Auth option spec tests', function () {
  const suites = loadSpecTests('auth');

  for (const suite of suites) {
    describe(suite.name, function () {
      for (const test of suite.tests) {
        it(`${test.description}`, function () {
          if (SKIP.includes(test.description)) {
            this.test.skipReason = 'NODE-3986: Fix MONGODB-AWS Spec Test';
            this.skip();
          }
          executeUriValidationTest(test);
        });
      }
    });
  }
});
