'use strict';
const expect = require('chai').expect;
const resolveConnectionString = require('./utils').resolveConnectionString;

class TestRunnerContext {
  constructor() {
    this.url = null;
    this.sharedClient = null;
    this.failPointClients = [];
    this.appliedFailPoints = [];
    this.commandEvents = [];
  }

  runForAllClients(fn) {
    const allClients = [this.sharedClient].concat(this.failPointClients);
    return Promise.all(allClients.map(fn));
  }

  runFailPointCmd(fn) {
    return this.failPointClients.length
      ? Promise.all(this.failPointClients.map(fn))
      : fn(this.sharedClient);
  }

  setup(config) {
    this.sharedClient = config.newClient(
      resolveConnectionString(config, { useMultipleMongoses: true })
    );

    if (config.options && config.options.proxies) {
      this.failPointClients = config.options.proxies.map(proxy =>
        config.newClient(`mongodb://${proxy.host}:${proxy.port}/`)
      );
    }

    return this.runForAllClients(client => client.connect());
  }

  teardown() {
    this.runForAllClients(client => client.close());
  }

  cleanupAfterSuite() {
    const context = this;

    // clean up applied failpoints
    const cleanupPromises = this.appliedFailPoints.map(failPoint => {
      return context.disableFailPoint(failPoint);
    });

    this.appliedFailPoints = [];

    return Promise.all(cleanupPromises).then(() => {
      // cleanup
      if (context.testClient) {
        return context.testClient.close().then(() => {
          delete context.testClient;
        });
      }
    });
  }

  targetedFailPoint(options) {
    const session = options.session;
    const failPoint = options.failPoint;
    expect(session.transaction.isPinned).to.be.true;

    return new Promise((resolve, reject) => {
      const server = session.transaction.server;
      server.command(`admin.$cmd`, failPoint, err => {
        if (err) return reject(err);

        this.appliedFailPoints.push(failPoint);
        resolve();
      });
    });
  }

  assertSessionPinned(options) {
    expect(options).to.have.property('session');

    const session = options.session;
    expect(session.transaction.isPinned).to.be.true;
  }

  assertSessionUnpinned(options) {
    expect(options).to.have.property('session');

    const session = options.session;
    expect(session.transaction.isPinned).to.be.false;
  }

  enableFailPoint(failPoint) {
    return this.runFailPointCmd(client => {
      return client.db(this.dbName).executeDbAdminCommand(failPoint);
    });
  }

  disableFailPoint(failPoint) {
    return this.runFailPointCmd(client => {
      return client.db(this.dbName).executeDbAdminCommand({
        configureFailPoint: failPoint.configureFailPoint,
        mode: 'off'
      });
    });
  }
}

module.exports = { TestRunnerContext };
