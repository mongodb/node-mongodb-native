import * as path from 'path';

import { loadSpecTests } from '../../spec/index';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

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
      return unacknowledgedHintTests.includes(description)
        ? `TODO(NODE-3541)`
        : isLoadBalanced && loadBalancedCollationTests.includes(description)
          ? `TODO(NODE-6280): fix collation for find and modify commands on load balanced mode`
          : false;
    }
  );
});
