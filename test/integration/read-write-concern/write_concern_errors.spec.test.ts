import * as path from 'node:path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Write Concern Errors Unified Tests', function () {
  runUnifiedSuite(
    loadSpecTests(path.join('read-write-concern', 'write-concern-errors')),
    ({ description }) => {
      return description.toLowerCase().includes('mapreduce')
        ? 'The node driver does not implement mapReduce.'
        : false;
    }
  );
});
