import { loadSpecTests } from '../../spec';
import { executeUriValidationTest } from '../../tools/uri_spec_runner';

describe('Auth option spec tests', function () {
  const suites = loadSpecTests('auth');

  for (const suite of suites) {
    describe(suite.name, function () {
      for (const test of suite.tests) {
        it(`${test.description}`, function () {
          executeUriValidationTest(test);
        });
      }
    });
  }
});
