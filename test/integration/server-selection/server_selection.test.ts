import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Server Selection Unified Tests (Node Driver)', function () {
  /* TODO(NODE-5774) duplicate server selection for bulkWrite and other wrapper operations
   * Remove once the actual unified tests (test/spec/server-selection/logging) are passing
   */
  const clonedAndAlteredSpecTests = loadSpecTests(
    '../integration/server-selection/unified-server-selection-node-specs-logging'
  );
  runUnifiedSuite(clonedAndAlteredSpecTests);
});
