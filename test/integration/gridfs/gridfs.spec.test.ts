import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('GridFS Unified Tests', function () {
  runUnifiedSuite(loadSpecTests('gridfs'), ({ description }) => {
    return description === 'download when final chunk is missing' ? `TODO(NODE-xxxx)` : false;
  });
});
