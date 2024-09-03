import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Read/Write Concern Unified Tests', function () {
  runUnifiedSuite(
    loadSpecTests(path.join('read-write-concern', 'operation')),
    ({ description }) => {
      return description.toLowerCase().includes('mapreduce')
        ? 'The node driver does not implement mapReduce.'
        : false;
    }
  );
});
