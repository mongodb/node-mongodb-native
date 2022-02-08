'use strict';

const path = require('path');
const {
  TestRunnerContext,
  gatherTestSuites,
  generateTopologyTests
} = require('../../tools/spec-runner');

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
  'replaceOne with encryption',
  'Insert with encryption on a missing key',
  'A local schema should override',
  'Insert a document with auto encryption using local KMS provider',
  'Insert with encryption using key alt name',
  'insertMany with encryption',
  'insertOne with encryption',
  'findOneAndDelete with deterministic encryption',
  '$unset works with an encrypted field'
];

const SKIPPED_TESTS = new Set(isAuthEnabled ? skippedAuthTests : []);

describe('Client Side Encryption', function () {
  // TODO: Replace this with using the filter once the filter works on describe blocks
  const skipTests = process.env.CSFLE_KMS_PROVIDERS == null;
  if (skipTests) {
    // console.log('skipping Client Side Encryption Spec tests due to lack of AWS credentials');
    return;
  }

  try {
    require('mongodb-client-encryption');
  } catch (e) {
    console.error(
      'skipping Client Side Encryption Spec tests due to inability to load mongodb-client-encryption'
    );
    return;
  }

  const testContext = new TestRunnerContext();
  const testSuites = gatherTestSuites(
    path.join(__dirname, '../../spec/client-side-encryption/tests')
  );

  after(() => testContext.teardown());
  before(function () {
    return testContext.setup(this.configuration);
  });

  generateTopologyTests(testSuites, testContext, spec => {
    return (
      !spec.description.match(/type=symbol/) &&
      !spec.description.match(/maxWireVersion < 8/) &&
      !spec.description.match(/Count with deterministic encryption/) &&
      !SKIPPED_TESTS.has(spec.description)
    );
  });
});
