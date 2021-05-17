'use strict';

const Logger = require('../../lib/core').Logger;
const deprecateOptions = require('../../lib/utils').deprecateOptions;
const arrayStrictEqual = require('../../lib/core/utils').arrayStrictEqual;
const errorStrictEqual = require('../../lib/core/utils').errorStrictEqual;
const chalk = require('chalk');
const util = require('util');
const chai = require('chai');
const expect = chai.expect;
const sinonChai = require('sinon-chai');
chai.use(sinonChai);

function makeTestFunction(config) {
  const fn = options => {
    if (options) options = null;
  };
  return deprecateOptions(config, fn);
}

function ensureCalledWith(stub, args) {
  args.forEach(m => expect(stub).to.have.been.calledWith(m));
}

// creation of class with a logger
function ClassWithLogger() {
  this.logger = new Logger('ClassWithLogger');
}

ClassWithLogger.prototype.f = makeTestFunction({
  name: 'f',
  deprecatedOptions: ['maxScan', 'snapshot', 'fields'],
  optionsIndex: 0
});

ClassWithLogger.prototype.getLogger = function() {
  return this.logger;
};

// creation of class without a logger
function ClassWithoutLogger() {}

ClassWithoutLogger.prototype.f = makeTestFunction({
  name: 'f',
  deprecatedOptions: ['maxScan', 'snapshot', 'fields'],
  optionsIndex: 0
});

// creation of class where getLogger returns undefined
function ClassWithUndefinedLogger() {}

ClassWithUndefinedLogger.prototype.f = makeTestFunction({
  name: 'f',
  deprecatedOptions: ['maxScan', 'snapshot', 'fields'],
  optionsIndex: 0
});

ClassWithUndefinedLogger.prototype.getLogger = function() {
  return undefined;
};

function diff(lhs, rhs, fields, comparator) {
  return fields.reduce((diff, field) => {
    if ((lhs[field] == null || rhs[field] == null) && field !== 'error') {
      return diff;
    }

    if (!comparator(lhs[field], rhs[field])) {
      diff.push(
        `  ${field}: ${chalk.green(`${util.inspect(lhs[field])}`)} => ${chalk.green(
          `${util.inspect(rhs[field])}`
        )}`
      );
    }

    return diff;
  }, []);
}

function serverDescriptionDiff(lhs, rhs) {
  const objectIdFields = ['electionId'];
  const arrayFields = ['hosts', 'tags'];
  const simpleFields = [
    'type',
    'minWireVersion',
    'me',
    'setName',
    'setVersion',
    'electionId',
    'primary',
    'logicalSessionTimeoutMinutes'
  ];

  return diff(lhs, rhs, simpleFields, (x, y) => x === y)
    .concat(diff(lhs, rhs, ['error'], (x, y) => errorStrictEqual(x, y)))
    .concat(diff(lhs, rhs, arrayFields, (x, y) => arrayStrictEqual(x, y)))
    .concat(diff(lhs, rhs, objectIdFields, (x, y) => x.equals(y)))
    .join(',\n');
}

function topologyDescriptionDiff(lhs, rhs) {
  const simpleFields = [
    'type',
    'setName',
    'maxSetVersion',
    'stale',
    'compatible',
    'compatibilityError',
    'logicalSessionTimeoutMinutes',
    'error',
    'commonWireVersion'
  ];

  return diff(lhs, rhs, simpleFields, (x, y) => x === y).join(',\n');
}

function visualizeMonitoringEvents(client) {
  function print(msg) {
    console.log(`${chalk.white(new Date().toISOString())} ${msg}`);
  }

  client.on('serverHeartbeatStarted', event =>
    print(`${chalk.yellow('heartbeat')} ${chalk.bold('started')} host: '${event.connectionId}`)
  );

  client.on('serverHeartbeatSucceeded', event =>
    print(
      `${chalk.yellow('heartbeat')} ${chalk.green('succeeded')} host: '${
        event.connectionId
      }' ${chalk.gray(`(${event.duration} ms)`)}`
    )
  );

  client.on('serverHeartbeatFailed', event =>
    print(
      `${chalk.yellow('heartbeat')} ${chalk.red('failed')} host: '${
        event.connectionId
      }' ${chalk.gray(`(${event.duration} ms)`)}`
    )
  );

  // server information
  client.on('serverOpening', event => {
    print(
      `${chalk.cyan('server')} [${event.address}] ${chalk.bold('opening')} in topology#${
        event.topologyId
      }`
    );
  });

  client.on('serverClosed', event => {
    print(
      `${chalk.cyan('server')} [${event.address}] ${chalk.bold('closed')} in topology#${
        event.topologyId
      }`
    );
  });

  client.on('serverDescriptionChanged', event => {
    print(`${chalk.cyan('server')} [${event.address}] changed:`);
    console.log(serverDescriptionDiff(event.previousDescription, event.newDescription));
  });

  // topology information
  client.on('topologyOpening', event => {
    print(`${chalk.magenta('topology')} adding topology#${event.topologyId}`);
  });

  client.on('topologyClosed', event => {
    print(`${chalk.magenta('topology')} removing topology#${event.topologyId}`);
  });

  client.on('topologyDescriptionChanged', event => {
    const diff = topologyDescriptionDiff(event.previousDescription, event.newDescription);
    if (diff !== '') {
      print(`${chalk.magenta('topology')} [topology#${event.topologyId}] changed:`);
      console.log(diff);
    }
  });
}

class EventCollector {
  constructor(obj, events, options) {
    this._events = Object.create(null);
    this._timeout = options ? options.timeout : 5000;

    events.forEach(eventName => {
      this._events[eventName] = [];
      obj.on(eventName, event => this._events[eventName].push(event));
    });
  }

  waitForEvent(eventName, count, callback) {
    if (typeof count === 'function') {
      callback = count;
      count = 1;
    }

    this.waitForEventImpl(this, Date.now(), eventName, count, callback);
  }

  /**
   * Will only return one event at a time from the front of the list
   * Useful for iterating over the events in the order they occurred
   *
   * @param {string} eventName
   * @returns {Promise<Record<string, any>>}
   */
  waitAndShiftEvent(eventName) {
    return new Promise((resolve, reject) => {
      if (this._events[eventName].length > 0) {
        return resolve(this._events[eventName].shift());
      }
      this.waitForEventImpl(this, Date.now(), eventName, 1, error => {
        if (error) return reject(error);
        resolve(this._events[eventName].shift());
      });
    });
  }

  reset(eventName) {
    if (eventName == null) {
      Object.keys(this._events).forEach(eventName => {
        this._events[eventName] = [];
      });

      return;
    }

    if (this._events[eventName] == null) {
      throw new TypeError(`invalid event name "${eventName}" specified for reset`);
    }

    this._events[eventName] = [];
  }

  waitForEventImpl(collector, start, eventName, count, callback) {
    const events = collector._events[eventName];
    if (events.length >= count) {
      return callback(undefined, events);
    }

    if (Date.now() - start >= collector._timeout) {
      return callback(new Error(`timed out waiting for event "${eventName}"`));
    }

    setTimeout(() => this.waitForEventImpl(collector, start, eventName, count, callback), 10);
  }
}

module.exports = {
  EventCollector,
  makeTestFunction,
  ensureCalledWith,
  ClassWithLogger,
  ClassWithoutLogger,
  ClassWithUndefinedLogger,
  visualizeMonitoringEvents
};
