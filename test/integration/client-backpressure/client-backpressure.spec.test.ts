import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';
import { type Test } from '../../tools/unified-spec-runner/schema';

const skippedTests = {
  'collection.dropIndexes retries at most maxAttempts times (maxAttempts=5)':
    'TODO(NODE-6517): dropIndexes squashes all errors other than ns not found'
};

function shouldSkip({ description }: Test) {
  return skippedTests[description] ?? false;
}

describe('Client Backpressure (spec)', function () {
  runUnifiedSuite(loadSpecTests('client-backpressure'), shouldSkip);
});
