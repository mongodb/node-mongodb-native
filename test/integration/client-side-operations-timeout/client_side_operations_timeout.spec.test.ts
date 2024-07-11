import { join } from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const enabled = [
  'override-collection-timeoutMS',
  'override-database-timeoutMS',
  'override-operation-timeoutMS'
];

const cursorOperations = [
  'aggregate',
  'countDocuments',
  'listIndexes',
  'createChangeStream',
  'listCollections',
  'listCollectionNames'
];

describe('CSOT spec tests', function () {
  const specs = loadSpecTests(join('client-side-operations-timeout'));
  for (const spec of specs) {
    for (const test of spec.tests) {
      // not one of the test suites listed in kickoff
      if (!enabled.includes(spec.name)) test.skipReason = 'Not working yet';

      // Cursor operation
      if (test.operations.find(operation => cursorOperations.includes(operation.name)))
        test.skipReason = 'Not working yet';

      // runCommand only uses options directly passed to it
      if (
        test.operations.find(
          operation => operation.name === 'runCommand' && operation.arguments.timeoutMS == null
        )
      )
        test.skipReason = 'Not working yet';
    }
  }
  runUnifiedSuite(specs);
});
