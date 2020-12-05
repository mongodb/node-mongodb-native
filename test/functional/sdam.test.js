'use strict';
const TestRunnerContext = require('./spec-runner').TestRunnerContext;
const loadSpecTests = require('../spec').loadSpecTests;
const generateTopologyTests = require('./spec-runner').generateTopologyTests;

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

describe('SDAM', function() {
  context('integration spec tests', function() {
    const testContext = new SDAMRunnerContext();
    const testSuites = loadSpecTests('server-discovery-and-monitoring/integration');
    after(() => testContext.teardown());
    before(function() {
      return testContext.setup(this.configuration);
    });

    generateTopologyTests(testSuites, testContext);
  });
});
