import * as path from 'path';

import { loadSpecTests } from '../../spec/index';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const loadBalancedCollationTests = [
  'FindOneAndUpdate when many documents match with collation returning the document before modification',
  'FindOneAndReplace when one document matches with collation returning the document after modification',
  'FindOneAndDelete when one document matches with collation',
  'Distinct with a collation'
];

const unimplementedCrudTests = {
  'inserting _id with type null via clientBulkWrite':
    'TODO(NODE-6468): Test that inserts and upserts respect null _id values (DRIVERS-2124)',
  'inserting _id with type null via insertOne':
    'TODO(NODE-6468): Test that inserts and upserts respect null _id values (DRIVERS-2124)',
  'inserting _id with type null via insertMany':
    'TODO(NODE-6468): Test that inserts and upserts respect null _id values (DRIVERS-2124)',
  'inserting _id with type null via bulkWrite':
    'TODO(NODE-6468): Test that inserts and upserts respect null _id values (DRIVERS-2124)',
  'partialResult is unset when all operations fail during an unordered bulk write':
    'TODO(NODE-6384): do not set partialResult when using unacknowledged writes',
  'partialResult is unset when first operation fails during an ordered bulk write (summary)':
    'TODO(NODE-6384): do not set partialResult when using unacknowledged writes',
  'partialResult is unset when first operation fails during an ordered bulk write (verbose)':
    'TODO(NODE-6384): do not set partialResult when using unacknowledged writes',
  'InsertMany passes bypassDocumentValidation: false':
    'TODO(NODE-6484): Allow drivers to set bypassDocumentValidation: false on write commands (DRIVERS-2865)',
  'FindOneAndUpdate passes bypassDocumentValidation: false':
    'TODO(NODE-6484): Allow drivers to set bypassDocumentValidation: false on write commands (DRIVERS-2865)',
  'FindOneAndReplace passes bypassDocumentValidation: false':
    'TODO(NODE-6484): Allow drivers to set bypassDocumentValidation: false on write commands (DRIVERS-2865)',
  'BulkWrite passes bypassDocumentValidation: false':
    'TODO(NODE-6484): Allow drivers to set bypassDocumentValidation: false on write commands (DRIVERS-2865)',
  'Aggregate with $out passes bypassDocumentValidation: false':
    'TODO(NODE-6484): Allow drivers to set bypassDocumentValidation: false on write commands (DRIVERS-2865)'
};

describe('CRUD unified', function () {
  runUnifiedSuite(
    loadSpecTests(path.join('crud', 'unified')),
    ({ description }, { isLoadBalanced }) => {
      if (isLoadBalanced && loadBalancedCollationTests.includes(description)) {
        return `TODO(NODE-6280): fix collation for find and modify commands on load balanced mode`;
      }
      return unimplementedCrudTests[description] ?? false;
    }
  );
});
