'use strict';
const expect = require('chai').expect;
const resolveConnectionString = require('./utils').resolveConnectionString;

class TestRunnerContext {
  constructor() {
    this.url = null;
    this.sharedClient = null;
    this.failPointClients = [];
    this.appliedFailPoints = [];

    // event tracking
    this.commandEvents = [];
    this.sdamEvents = [];
    this.cmapEvents = [];
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
      resolveConnectionString(config, { useMultipleMongoses: true }),
      { useUnifiedTopology: true }
    );

    if (config.topologyType === 'Sharded') {
      this.failPointClients = config.options.hosts.map(proxy =>
        config.newClient(`mongodb://${proxy.host}:${proxy.port}/`, { useUnifiedTopology: true })
      );
    }

    return this.runForAllClients(client => client.connect());
  }

  teardown() {
    return Promise.all([
      this.runForAllClients(client => client.close()),
      this.sharedClient.close()
    ]);
  }

  cleanupAfterSuite() {
    const context = this;

    // clean up applied failpoints
    const cleanupPromises = this.appliedFailPoints.map(failPoint => {
      return context.disableFailPoint(failPoint);
    });

    this.appliedFailPoints = [];

    const cleanup = err => {
      if (Array.isArray(err)) {
        err = undefined;
      }

      if (!context.testClient) {
        if (err) throw err;
        return;
      }

      // clean up state
      context.commandEvents = [];
      context.sdamEvents = [];
      context.cmapEvents = [];

      const client = context.testClient;
      context.testClient = undefined;
      return err ? client.close().then(() => Promise.reject(err)) : client.close();
    };

    return Promise.all(cleanupPromises).then(cleanup, cleanup);
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

  // event helpers
  waitForEvent(options) {
    const eventName = options.event;
    const count = options.count;

    return new Promise(resolve => {
      const checkForEvent = () => {
        const matchingEvents = findMatchingEvents(this, eventName);
        if (matchingEvents.length >= count) {
          resolve();
          return;
        }

        setTimeout(() => checkForEvent(), 1000);
      };

      checkForEvent();
    });
  }

  assertEventCount(options) {
    const eventName = options.event;
    const count = options.count;
    const matchingEvents = findMatchingEvents(this, eventName);
    expect(matchingEvents).to.have.lengthOf.at.least(count);
  }
}

function findMatchingEvents(context, eventName) {
  const allEvents = context.sdamEvents.concat(context.cmapEvents);
  return eventName === 'ServerMarkedUnknownEvent'
    ? context.sdamEvents
        .filter(event => event.constructor.name === 'ServerDescriptionChangedEvent')
        .filter(event => event.newDescription.type === 'Unknown')
    : allEvents.filter(event => event.constructor.name.match(new RegExp(eventName)));
}

module.exports = { TestRunnerContext };
