import { join } from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const skipped = {
  bulkWrite: 'TODO(NODE-6274)',
  'change-streams': 'TODO(NODE-6035)',
  'convenient-transactions': 'TODO(NODE-5687)',
  'deprecated-options': 'TODO(NODE-5689)',
  'gridfs-advanced': 'TODO(NODE-6275)',
  'gridfs-delete': 'TODO(NODE-6275)',
  'gridfs-download': 'TODO(NODE-6275)',
  'gridfs-find': 'TODO(NODE-6275)',
  'gridfs-upload': 'TODO(NODE-6275)',
  'sessions-inherit-timeoutMS': 'TODO(NODE-5687)',
  'sessions-override-operation-timeoutMS': 'TODO(NODE-5687)',
  'sessions-override-timeoutMS': 'TODO(NODE-5687)',
  'tailable-awaitData': 'TODO(NODE-6035)',
  'tailable-non-awaitData': 'TODO(NODE-6035)'
};

const bulkWriteOperations =
  /timeoutMS applies to whole operation, not individual attempts - (bulkWrite|insertMany) on .*/;

describe('CSOT spec tests', function () {
  const specs = loadSpecTests(join('client-side-operations-timeout'));
  for (const spec of specs) {
    for (const test of spec.tests) {
      if (skipped[spec.name] != null) {
        test.skipReason = skipped[spec.name];
      }

      if (bulkWriteOperations.test(test.description))
        test.skipReason =
          'TODO(NODE-6274): update test runner to check errorResponse field of MongoBulkWriteError in isTimeoutError assertion';
    }
  }

  runUnifiedSuite(specs);
});
