import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { installNode18DNSHooks } from '../../tools/runner/hooks/configuration';
import {
  gatherTestSuites,
  generateTopologyTests,
  TestRunnerContext
} from '../../tools/spec-runner';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

const isAuthEnabled = process.env.AUTH === 'auth';

// 'TODO: NODE-3891 - fix tests broken when AUTH enabled'
const skippedAuthTests = [
  'Insert a document with auto encryption using the AWS provider with temporary credentials',
  'Insert a document with auto encryption using Azure KMS provider',
  '$rename works if target value has same encryption options',
  'Insert with deterministic encryption, then find it',
  'Insert with randomized encryption, then find it',
  'Bulk write with encryption',
  'Insert with bypassAutoEncryption',
  'Insert with bypassAutoEncryption for local schema',
  'ping is bypassed',
  'deleteOne with deterministic encryption',
  'deleteMany with deterministic encryption',
  'distinct with deterministic encryption',
  'Explain a find with deterministic encryption',
  'Find with deterministic encryption',
  'Find with $in with deterministic encryption',
  'findOneAndReplace with deterministic encryption',
  'findOneAndUpdate with deterministic encryption',
  'Insert a document with auto encryption using GCP KMS provider',
  'getMore with encryption',
  'unset works with an encrypted field',
  'updateOne with deterministic encryption',
  'updateMany with deterministic encryption',
  'type=date',
  'type=regex',
  'type=timestamp',
  'type=javascript',
  'type=binData',
  'type=int',
  'type=objectId',
  'type=symbol',
  'replaceOne with encryption',
  'Insert with encryption on a missing key',
  'A local schema should override',
  'Count with deterministic encryption',
  'Insert a document with auto encryption using local KMS provider',
  'Insert with encryption using key alt name',
  'insertMany with encryption',
  'insertOne with encryption',
  'findOneAndDelete with deterministic encryption',
  '$unset works with an encrypted field',
  'Insert a document with auto encryption using KMIP KMS provider'
];

// TODO(NODE-4006): Investigate csfle test "operation fails with maxWireVersion < 8"
// TODO(NODE-4324): Int32 and Long not allowed as batchSize option to cursor.
const skippedNoAuthTests = ['getMore with encryption', 'operation fails with maxWireVersion < 8'];

const SKIPPED_TESTS = new Set([
  ...(isAuthEnabled ? skippedAuthTests.concat(skippedNoAuthTests) : skippedNoAuthTests)
]);

describe('Client Side Encryption (Legacy)', function () {
  const testContext = new TestRunnerContext({ requiresCSFLE: true });
  const testSuites = gatherTestSuites(
    path.join(__dirname, '../../spec/client-side-encryption/tests/legacy'),
    testContext
  );

  installNode18DNSHooks();

  after(() => testContext.teardown());
  before(function () {
    return testContext.setup(this.configuration);
  });

  generateTopologyTests(testSuites, testContext, spec => {
    return !SKIPPED_TESTS.has(spec.description);
  });
});

describe('Client Side Encryption (Unified)', function () {
  installNode18DNSHooks();
  runUnifiedSuite(loadSpecTests(path.join('client-side-encryption', 'tests', 'unified')));
});
