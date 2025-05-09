import * as path from 'path';

import { loadSpecTests } from '../../spec';
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
  'Find with deterministic encryption',
  'Find with $in with deterministic encryption',
  'findOneAndReplace with deterministic encryption',
  'findOneAndUpdate with deterministic encryption',
  'Insert a document with auto encryption using GCP KMS provider',
  'getMore with encryption',
  'unset works with an encrypted field',
  'updateOne with deterministic encryption',
  'updateMany with deterministic encryption',
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

// TODO(NODE-6048): Int32 and Long not allowed as batchSize option to cursor.
const skippedNoAuthTests = ['getMore with encryption'];

const SKIPPED_TESTS = new Set([
  ...(isAuthEnabled ? skippedAuthTests.concat(skippedNoAuthTests) : skippedNoAuthTests),
  ...[
    // the node driver does not have a mapReduce helper
    'mapReduce deterministic encryption (unsupported)'
  ]
]);

const isServerless = !!process.env.SERVERLESS;

describe('Client Side Encryption (Legacy)', function () {
  const testContext = new TestRunnerContext({ requiresCSFLE: true });
  const testSuites = gatherTestSuites(
    path.join(__dirname, '../../spec/client-side-encryption/tests/legacy'),
    testContext
  );

  after(() => testContext.teardown());

  before(function () {
    return testContext.setup(this.configuration);
  });

  generateTopologyTests(testSuites, testContext, (test, configuration) => {
    const { description } = test;
    if (SKIPPED_TESTS.has(description)) {
      return 'Skipped by generic test name skip filter.';
    }
    if (
      [
        'timeoutMS applied to listCollections to get collection schema',
        'remaining timeoutMS applied to find to get keyvault data'
      ].includes(description)
    ) {
      return 'TODO(NODE-5686): add CSOT support to FLE';
    }

    if (isServerless) {
      // TODO(NODE-4730): Fix failing csfle tests against serverless
      const isSkippedTest = [
        'BypassQueryAnalysis decrypts',
        'encryptedFieldsMap is preferred over remote encryptedFields'
      ].includes(description);

      return isSkippedTest ? 'TODO(NODE-4730): Fix failing csfle tests against serverless' : true;
    }

    if (
      [
        'Insert a document with auto encryption using KMIP delegated KMS provider',
        'Automatically encrypt and decrypt with a named KMS provider'
      ].includes(description)
    ) {
      const result = configuration.filters.ClientSideEncryptionFilter.filter({
        metadata: { requires: { clientSideEncryption: '>=6.0.1' } }
      });

      if (typeof result === 'string') return result;
    }

    if (['Insert with deterministic encryption, then find it'].includes(description)) {
      const result = configuration.filters.ClientSideEncryptionFilter.filter({
        metadata: { requires: { clientSideEncryption: '>=6.4.0' } }
      });

      if (typeof result === 'string') return result;
    }
    return true;
  });
});

describe('Client Side Encryption (Unified)', function () {
  runUnifiedSuite(
    loadSpecTests(path.join('client-side-encryption', 'tests', 'unified')),
    ({ description }, configuration) => {
      const delegatedKMIPTests = [
        'rewrap with current KMS provider',
        'rewrap with new local KMS provider',
        'rewrap with new KMIP delegated KMS provider',
        'rewrap with new KMIP KMS provider',
        'rewrap with new GCP KMS provider',
        'rewrap with new Azure KMS provider',
        'rewrap with new AWS KMS provider',
        'create datakey with KMIP delegated KMS provider',
        'Insert a document with auto encryption using KMIP delegated KMS provider',
        'create data key with named AWS KMS provider',
        'create datakey with named Azure KMS provider',
        'create datakey with named GCP KMS provider',
        'create datakey with named KMIP KMS provider',
        'create datakey with named local KMS provider',
        'can explicitly decrypt with a named KMS provider',
        'rewrap to aws:name1',
        'rewrap to azure:name1',
        'rewrap to gcp:name1',
        'rewrap to kmip:name1',
        'rewrap to local:name1',
        'rewrap from local:name1 to local:name2',
        'rewrap from aws:name1 to aws:name2',
        'can explicitly encrypt with a named KMS provider'
      ];
      const dekExpirationTests = ['decrypt, wait, and decrypt again'];
      if (delegatedKMIPTests.includes(description)) {
        const shouldSkip = configuration.filters.ClientSideEncryptionFilter.filter({
          metadata: { requires: { clientSideEncryption: '>=6.0.1' } }
        });
        if (typeof shouldSkip === 'string') return shouldSkip;
      }
      if (dekExpirationTests.includes(description)) {
        const shouldSkip = configuration.filters.ClientSideEncryptionFilter.filter({
          metadata: { requires: { clientSideEncryption: '>=6.4.0' } }
        });
        if (typeof shouldSkip === 'string') return shouldSkip;
      }

      return isServerless ? 'Unified CSFLE tests to not run on serverless' : false;
    }
  );
});
