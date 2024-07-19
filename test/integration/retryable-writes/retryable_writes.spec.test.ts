import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const clientBulkWriteTests = [
  'client bulkWrite with one network error succeeds after retry',
  'client bulkWrite with two network errors fails after retry',
  'client bulkWrite with no multi: true operations succeeds after retryable top-level error',
  'client bulkWrite with multi: true operations fails after retryable top-level error',
  'client bulkWrite with no multi: true operations succeeds after retryable writeConcernError',
  'client bulkWrite with multi: true operations fails after retryable writeConcernError',
  'client bulkWrite with retryWrites: false does not retry',
  'client.clientBulkWrite succeeds after retryable handshake network error',
  'client.clientBulkWrite succeeds after retryable handshake server error (ShutdownInProgress)'
];

describe('Retryable Writes (unified)', function () {
  runUnifiedSuite(loadSpecTests(path.join('retryable-writes', 'unified')), ({ description }) => {
    return clientBulkWriteTests.includes(description)
      ? `TODO(NODE-6257): implement client-level bulk write.`
      : description ===
        'RetryableWriteError label is not added based on writeConcernError in pre-4.4 mongos response'
      ? 'TODO(NODE-5720)'
      : false;
  });
});
