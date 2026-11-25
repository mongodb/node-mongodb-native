import * as path from 'node:path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const skippedTests: Record<string, string> = {
  'deleteByName reports a writeConcernError':
    'TODO(NODE-6512): the node driver does not implement GridFS deleteByName.',
  'renameByName reports a writeConcernError':
    'TODO(NODE-6511): the node driver does not implement GridFS renameByName.'
};

describe('Write Concern Errors Unified Tests', function () {
  runUnifiedSuite(
    loadSpecTests(path.join('read-write-concern', 'write-concern-errors')),
    ({ description }) => {
      if (description.toLowerCase().includes('mapreduce')) {
        return 'The node driver does not implement mapReduce.';
      }
      return skippedTests[description] ?? false;
    }
  );
});
