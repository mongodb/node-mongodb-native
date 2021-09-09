'use strict';
const TestRunnerContext = require('./spec-runner').TestRunnerContext;
const path = require('path');
const fs = require('fs');
const EJSON = require('mongodb-extjson');
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

// TODO -- NODE-2994
const SKIP_SDAM_INTEGRATION_FILES = [
  'auth-error.json',
  'auth-misc-command-error.json',
  'auth-network-error.json',
  'auth-network-timeout-error.json',
  'auth-shutdown-error.json',
  'find-network-timeout-error.json',
  'pool-cleared-error.json',
  'minPoolSize-error.json'
];

describe('SDAM', function() {
  context('integration spec tests', function() {
    const testContext = new SDAMRunnerContext();
    const specPath = path.resolve(__dirname, '../spec/server-discovery-and-monitoring/integration');

    const testSuites = fs
      .readdirSync(specPath)
      .filter(x => x.indexOf('.json') !== -1)
      .filter(fn => SKIP_SDAM_INTEGRATION_FILES.indexOf(fn) === -1)
      .map(x =>
        Object.assign(EJSON.parse(fs.readFileSync(path.join(specPath, x)), { relaxed: true }), {
          name: path.basename(x, '.json')
        })
      );

    after(() => testContext.teardown());
    before(function() {
      return testContext.setup(this.configuration);
    });

    generateTopologyTests(testSuites, testContext);
  });
});
