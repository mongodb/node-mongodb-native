import { join } from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const enabled = [
  'override-collection-timeoutMS',
  'override-database-timeoutMS',
  'override-operation-timeoutMS',
  'retryability-legacy-timeouts',
  'retryability-timeoutMS'
];

const cursorOperations = [
  'aggregate',
  'countDocuments',
  'listIndexes',
  'createChangeStream',
  'listCollections',
  'listCollectionNames'
];

const bulkWriteOperations = [
  'timeoutMS applies to whole operation, not individual attempts - bulkWrite on collection',
  'timeoutMS applies to whole operation, not individual attempts - insertMany on collection'
];

describe('CSOT spec tests', function () {
  const specs = loadSpecTests(join('client-side-operations-timeout'));
  for (const spec of specs) {
    for (const test of spec.tests) {
      // not one of the test suites listed in kickoff
      if (!enabled.includes(spec.name)) {
        test.skipReason = 'TODO(NODE-5684): Not working yet';
      }

      // Cursor operation
      if (test.operations.find(operation => cursorOperations.includes(operation.name)))
        test.skipReason = 'TODO(NODE-5684): Not working yet';

      if (bulkWriteOperations.includes(test.description))
        test.skipReason =
          'TODO(NODE-6274): update test runner to check errorResponse field of MongoBulkWriteError in isTimeoutError assertion';
    }
  }
  runUnifiedSuite(specs);
});
