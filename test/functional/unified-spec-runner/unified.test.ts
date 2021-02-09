import { loadSpecTests } from '../../spec/index';
import { log } from './unified-utils';
import { runUnifiedTest, TestConfiguration } from './runner';

interface MongoDBMochaTestContext extends Mocha.Context {
  configuration: TestConfiguration;
}

describe('Unified test format', function unifiedTestRunner() {
  // Valid tests that should pass
  for (const unifiedSuite of loadSpecTests('unified-test-format/valid-pass')) {
    context(String(unifiedSuite.description), function runUnifiedTestSuite() {
      for (const test of unifiedSuite.tests) {
        it(String(test.description), async function runOneUnifiedTest() {
          try {
            await runUnifiedTest(this as MongoDBMochaTestContext, unifiedSuite, test);
          } catch (error) {
            if (error.message.includes('not implemented.')) {
              log(`${test.description}: was skipped due to missing functionality`);
              log(error.stack);
              this.skip();
            } else {
              throw error;
            }
          }
        });
      }
    });
  }

  // Valid tests that should fail
  // for (const unifiedSuite of loadSpecTests('unified-test-format/valid-fail')) {
  //   // TODO
  // }

  // Tests that are invalid, would be good to gracefully fail on
  // for (const unifiedSuite of loadSpecTests('unified-test-format/invalid')) {
  //   // TODO
  // }
});
