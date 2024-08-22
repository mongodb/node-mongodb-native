import * as path from 'path';

import { loadSpecTests } from '../../spec/index';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const clientBulkWriteTests = new RegExp(
  [
    'client bulkWrite operations support errorResponse assertions',
    'an individual operation fails during an ordered bulkWrite',
    'an individual operation fails during an unordered bulkWrite',
    'detailed results are omitted from error when verboseResults is false',
    'a top-level failure occurs during a bulkWrite',
    'a bulk write with only errors does not report a partial result',
    'an empty list of write models is a client-side error',
    'a write concern error occurs during a bulkWrite',
    'client bulkWrite replaceOne prohibits atomic modifiers',
    'client bulkWrite updateOne requires atomic modifiers',
    'client bulkWrite updateMany requires atomic modifiers'
  ].join('|')
);

const unacknowledgedHintTests = [
  'Unacknowledged updateOne with hint document on 4.2+ server',
  'Unacknowledged updateOne with hint string on 4.2+ server',
  'Unacknowledged updateMany with hint document on 4.2+ server',
  'Unacknowledged updateMany with hint string on 4.2+ server',
  'Unacknowledged replaceOne with hint document on 4.2+ server',
  'Unacknowledged replaceOne with hint string on 4.2+ server',
  'Unacknowledged updateOne with hint document on 4.2+ server',
  'Unacknowledged updateOne with hint string on 4.2+ server',
  'Unacknowledged updateMany with hint document on 4.2+ server',
  'Unacknowledged updateMany with hint string on 4.2+ server',
  'Unacknowledged replaceOne with hint document on 4.2+ server',
  'Unacknowledged replaceOne with hint string on 4.2+ server',
  'Unacknowledged findOneAndUpdate with hint document on 4.4+ server',
  'Unacknowledged findOneAndUpdate with hint string on 4.4+ server',
  'Unacknowledged findOneAndReplace with hint document on 4.4+ server',
  'Unacknowledged findOneAndReplace with hint string on 4.4+ server',
  'Unacknowledged findOneAndDelete with hint document on 4.4+ server',
  'Unacknowledged findOneAndDelete with hint string on 4.4+ server',
  'Unacknowledged deleteOne with hint document on 4.4+ server',
  'Unacknowledged deleteOne with hint string on 4.4+ server',
  'Unacknowledged deleteMany with hint document on 4.4+ server',
  'Unacknowledged deleteMany with hint string on 4.4+ server',
  'Unacknowledged deleteOne with hint document on 4.4+ server',
  'Unacknowledged deleteOne with hint string on 4.4+ server',
  'Unacknowledged deleteMany with hint document on 4.4+ server',
  'Unacknowledged deleteMany with hint string on 4.4+ server'
];

const loadBalancedCollationTests = [
  'FindOneAndUpdate when many documents match with collation returning the document before modification',
  'FindOneAndReplace when one document matches with collation returning the document after modification',
  'FindOneAndDelete when one document matches with collation',
  'Distinct with a collation'
];

describe('CRUD unified', function () {
  runUnifiedSuite(
    loadSpecTests(path.join('crud', 'unified')),
    ({ description }, { isLoadBalanced }) => {
      return description.match(clientBulkWriteTests)
        ? 'TODO(NODE-6257): implement client level bulk write'
        : unacknowledgedHintTests.includes(description)
          ? `TODO(NODE-3541)`
          : isLoadBalanced && loadBalancedCollationTests.includes(description)
            ? `TODO(NODE-6280): fix collation for find and modify commands on load balanced mode`
            : false;
    }
  );
});
