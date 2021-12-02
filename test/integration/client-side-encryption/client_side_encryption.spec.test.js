'use strict';

const path = require('path');
const {
  TestRunnerContext,
  gatherTestSuites,
  generateTopologyTests
} = require('../../tools/spec-runner');

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
      !spec.description.match(/Count with deterministic encryption/) // TODO(NODE-3369): Unskip
    );
  });
});
