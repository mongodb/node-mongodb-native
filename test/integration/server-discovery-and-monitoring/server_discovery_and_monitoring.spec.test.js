'use strict';
const { TestRunnerContext, generateTopologyTests } = require('../../tools/spec-runner');
const { loadSpecTests } = require('../../spec');

class SDAMRunnerContext extends TestRunnerContext {
  constructor() {
    super();

    this.currentPrimary = null;
  }

  configureFailPoint(args) {
    return this.enableFailPoint(args.failPoint);
  }

  recordPrimary(client) {
    const servers = client.topology.description.servers;
    const primary = Array.from(servers.values()).filter(sd => sd.type === 'RSPrimary')[0];
    this.currentPrimary = primary.address;
  }

  waitForPrimaryChange(client) {
    const currentPrimary = this.currentPrimary;

    return new Promise(resolve => {
      function eventHandler(event) {
        if (
          event.newDescription.type === 'RSPrimary' &&
          event.newDescription.address !== currentPrimary
        ) {
          resolve();
          client.removeListener('serverDescriptionChanged', eventHandler);
        }
      }

      client.on('serverDescriptionChanged', eventHandler);
    });
  }
}

// 'TODO: NODE-3891 - fix tests broken when AUTH enabled'
// Some tests are failing when setting a failCommand when auth is enabled.
const isAuthEnabled = process.env.AUTH === 'auth';
const failpointTests = [
  'Reset server and pool after AuthenticationFailure error',
  'Reset server and pool after misc command error',
  'Reset server and pool after network error during authentication',
  'Reset server and pool after network timeout error during authentication',
  'Reset server and pool after shutdown error during authentication'
];
const skippedTests = [...(isAuthEnabled ? failpointTests : []), 'Network error on Monitor check'];

function sdamDisabledTestFilter(test) {
  const { description } = test;
  return !skippedTests.includes(description);
}

describe('SDAM', function () {
  describe('integration spec tests', function () {
    const testContext = new SDAMRunnerContext();
    const testSuites = loadSpecTests('server-discovery-and-monitoring/integration');

    beforeEach(async function () {
      if (this.configuration.isLoadBalanced) {
        this.currentTest.skipReason = 'Cannot run in a loadBalanced environment';
        this.skip();
      }
    });

    beforeEach(async function () {
      await testContext.setup(this.configuration);
    });

    afterEach(async () => {
      await testContext.teardown();
    });

    generateTopologyTests(testSuites, testContext, sdamDisabledTestFilter);
  });
});
