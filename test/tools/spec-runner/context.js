'use strict';
const { expect } = require('chai');
const { setTimeout } = require('timers');
const { resolveConnectionString } = require('./utils');
const { ns } = require('../../../src/utils');
const { extractAuthFromConnectionString } = require('../utils');

class Thread {
  constructor() {
    this._killed = false;
    this._error = undefined;
    this._promise = new Promise(resolve => {
      this.start = () => setTimeout(resolve);
    });
  }

  run(opPromise) {
    if (this._killed || this._error) {
      throw new Error('Attempted to run operation on killed thread');
    }

    this._promise = this._promise.then(() => opPromise).catch(e => (this._error = e));
  }

  finish() {
    this._killed = true;
    return this._promise.then(() => {
      if (this._error) {
        throw this._error;
      }
    });
  }
}
class TestRunnerContext {
  constructor(opts) {
    const defaults = {
      password: undefined,
      user: undefined,
      authSource: undefined,
      useSessions: true,
      skipPrepareDatabase: false,
      requiresCSFLE: false
    };
    opts = Object.assign({}, defaults, opts || {});
    this.skipPrepareDatabase = opts.skipPrepareDatabase;
    this.useSessions = opts.useSessions;
    this.user = opts.user;
    this.password = opts.password;
    this.authSource = opts.authSource;
    this.sharedClient = null;
    this.failPointClients = [];
    this.appliedFailPoints = [];

    // event tracking
    this.commandEvents = [];
    this.sdamEvents = [];
    this.cmapEvents = [];

    this.threads = new Map();
    this.requiresCSFLE = opts.requiresCSFLE;
  }

  async runForAllClients(fn) {
    const allClients = [...this.failPointClients];
    if (this.sharedClient) allClients.unshift(this.sharedClient);
    return Promise.all(allClients.map(fn));
  }

  runFailPointCmd(fn) {
    return this.failPointClients.length
      ? Promise.all(this.failPointClients.map(fn))
      : fn(this.sharedClient);
  }

  setup(config) {
    const options = {};
    if (this.requiresCSFLE) {
      options.promoteValues = false;
      options.promoteLongs = false;
    }
    this.sharedClient = config.newClient(
      resolveConnectionString(config, { useMultipleMongoses: true }, this),
      options
    );
    if (config.topologyType === 'Sharded') {
      this.failPointClients = config.options.hostAddresses.map(proxy => {
        const authString =
          process.env.AUTH === 'auth'
            ? `${extractAuthFromConnectionString(process.env.MONGODB_URI)}@`
            : '';
        return config.newClient(
          `mongodb://${authString}${proxy.host}:${proxy.port}/${
            process.env.AUTH === 'auth' ? '?authSource=admin' : ''
          }`
        );
      });
    }

    return this.runForAllClients(client => client.connect());
  }

  async teardown() {
    await this.runForAllClients(client => client.close());
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
      context.threads.clear();

      const client = context.testClient;
      context.testClient = undefined;
      return err ? client.close().then(() => Promise.reject(err)) : client.close();
    };

    return Promise.all(cleanupPromises).then(cleanup, cleanup);
  }

  async targetedFailPoint(options) {
    const session = options.session;
    const failPoint = options.failPoint;
    expect(session.isPinned).to.be.true;

    const serverOrConnection = session.loadBalanced
      ? session.pinnedConnection
      : session.transaction.server;

    await serverOrConnection.command(ns('admin.$cmd'), failPoint, {});
    this.appliedFailPoints.push(failPoint);
  }

  enableFailPoint(failPoint) {
    return this.runFailPointCmd(client => {
      return client.db('admin').command(failPoint);
    });
  }

  disableFailPoint(failPoint) {
    return this.runFailPointCmd(client => {
      return client.db('admin').command({
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

  runAdminCommand(command, options) {
    return this.sharedClient.db('admin').command(command, options);
  }

  // simulated thread helpers
  wait(options) {
    const ms = options.ms;
    return new Promise(r => setTimeout(r, ms));
  }

  startThread(options) {
    const name = options.name;
    const threads = this.threads;
    if (threads.has(name)) {
      throw new Error(`Thread "${name}" already exists`);
    }

    const thread = new Thread();
    threads.set(name, thread);
    thread.start();
  }

  runOnThread(threadName, operation) {
    const threads = this.threads;
    if (!threads.has(threadName)) {
      throw new Error(`Attempted to run operation on non-existent thread "${threadName}"`);
    }

    const thread = threads.get(threadName);
    thread.run(operation);
  }

  waitForThread(options) {
    const name = options.name;
    const threads = this.threads;
    if (!threads.has(name)) {
      throw new Error(`Attempted to wait for non-existent thread "${name}"`);
    }

    const thread = threads.get(name);
    return thread.finish().catch(e => {
      throw e;
    });
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
