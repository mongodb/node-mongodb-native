'use strict';

const path = require('path');
const TestRunnerContext = require('../spec-runner').TestRunnerContext;
const gatherTestSuites = require('../spec-runner').gatherTestSuites;
const generateTopologyTests = require('../spec-runner').generateTopologyTests;

describe('Client Side Encryption', function() {
  // TODO: Replace this with using the filter once the filter works on describe blocks
  const skipTests =
    process.env.AWS_ACCESS_KEY_ID == null || process.env.AWS_SECRET_ACCESS_KEY == null;
  if (skipTests) {
    console.log('skipping Client Side Encryption Spec tests due to lack of AWS credentials');
    return;
  }

  try {
    require('mongodb-client-encryption');
  } catch (e) {
    console.log(
      'skipping Client Side Encryption Spec tests due to inability to load mongodb-client-encryption'
    );
    return;
  }

  const testContext = new TestRunnerContext();
  const testSuites = gatherTestSuites(path.join(__dirname, '../../spec/client-side-encryption/tests'));
  after(() => testContext.teardown());
  before(function() {
    return testContext.setup(this.configuration);
  });

  generateTopologyTests(testSuites, testContext, spec => {
    // Note: we are skipping regex tests b/c we currently deserialize straight to native
    // regex representation instead of to BSONRegExp.
    return !spec.description.match(/type=regex/) && !spec.description.match(/maxWireVersion < 8/);
  });
});
