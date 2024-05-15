import { loadSpecTests } from '../../spec';
import { executeUriValidationTest } from '../../tools/uri_spec_runner';

// TODO(NODE-6172): Handle commas in TOKEN_RESOURCE.
const SKIP = 'should handle a complicated url-encoded TOKEN_RESOURCE (MONGODB-OIDC)';

describe('Auth option spec tests (legacy)', function () {
  const suites = loadSpecTests('auth', 'legacy');

  for (const suite of suites) {
    describe(suite.name, function () {
      for (const test of suite.tests) {
        it(`${test.description}`, function () {
          if (test.description === SKIP) {
            this.test.skip();
          }
          executeUriValidationTest(test);
        });
      }
    });
  }
});
