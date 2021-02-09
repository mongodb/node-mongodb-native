import { loadSpecTests } from '../../spec/index';
import { runUnifiedSuite } from './runner';

describe('Unified test format runner', function unifiedTestRunner() {
  // Valid tests that should pass
  runUnifiedSuite(loadSpecTests('unified-test-format/valid-pass'));

  // Valid tests that should fail
  // for (const unifiedSuite of loadSpecTests('unified-test-format/valid-fail')) {
  //   // TODO
  // }

  // Tests that are invalid, would be good to gracefully fail on
  // for (const unifiedSuite of loadSpecTests('unified-test-format/invalid')) {
  //   // TODO
  // }
});
