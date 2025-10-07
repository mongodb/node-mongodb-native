import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const SKIP = [
  'delete when multiple revisions of the file exist',
  'delete when file name does not exist',
  'rename when multiple revisions of the file exist',
  'rename when file name does not exist'
];

describe('GridFS Unified Tests', function () {
  runUnifiedSuite(loadSpecTests('gridfs'), ({ description }) => {
    if (SKIP.includes(description)) {
      return 'TODO(NODE-6511): Implement rename GridFS functionality';
    }
    return description === 'download when final chunk is missing' ? `TODO(NODE-xxxx)` : false;
  });
});
