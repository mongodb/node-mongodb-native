import { loadSpecTests } from '../../spec';
import { executeUriValidationTest } from '../../tools/uri_spec_runner';

const SKIP = [
  'should throw an exception if username and no password (MONGODB-AWS)',
  'should use username and password if specified (MONGODB-AWS)',
  'should use username, password and session token if specified (MONGODB-AWS)'
];

describe('Auth option spec tests (legacy)', function () {
  const suites = loadSpecTests('auth', 'legacy');

  for (const suite of suites) {
    describe(suite.name, function () {
      for (const test of suite.tests) {
        it(`${test.description}`, function () {
          if (SKIP.includes(test.description)) {
            this.test.skipReason = `NODE-7046: ${test.description}`;
            this.test.skip();
          }
          executeUriValidationTest(test);
        });
      }
    });
  }
});
