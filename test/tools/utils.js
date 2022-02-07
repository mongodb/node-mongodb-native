'use strict';

const { Logger } = require('../../src/logger');
const { deprecateOptions } = require('../../src/utils');
const util = require('util');
const chai = require('chai');

const expect = chai.expect;
const sinonChai = require('sinon-chai');
const { EJSON } = require('bson');

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

ClassWithLogger.prototype.getLogger = function () {
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

ClassWithUndefinedLogger.prototype.getLogger = function () {
  return undefined;
};

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

function getSymbolFrom(target, symbolName, assertExists = true) {
  const symbol = Object.getOwnPropertySymbols(target).filter(
    s => s.toString() === `Symbol(${symbolName})`
  )[0];

  if (assertExists && !symbol) {
    throw new Error(`Did not find Symbol(${symbolName}) on ${target}`);
  }

  return symbol;
}

function getEnvironmentalOptions() {
  const options = {};
  if (process.env.MONGODB_API_VERSION) {
    Object.assign(options, {
      serverApi: { version: process.env.MONGODB_API_VERSION }
    });
  }
  if (process.env.SERVERLESS) {
    Object.assign(options, {
      auth: {
        username: process.env.SERVERLESS_ATLAS_USER,
        password: process.env.SERVERLESS_ATLAS_PASSWORD
      },
      tls: true,
      compressors: 'snappy,zlib'
    });
  }
  return options;
}

function shouldRunServerlessTest(testRequirement, isServerless) {
  if (!testRequirement) return true;
  switch (testRequirement) {
    case 'forbid':
      // return true if the configuration is NOT serverless
      return !isServerless;
    case 'allow':
      // always return true
      return true;
    case 'require':
      // only return true if the configuration is serverless
      return isServerless;
    default:
      throw new Error(`Invalid serverless filter: ${testRequirement}`);
  }
}

/**
 * Use as a template string tag to stringify objects in the template string
 * Attempts to use EJSON (to make type information obvious)
 * falls back to util.inspect if there's an error (circular reference)
 */
function ejson(strings, ...values) {
  const stringParts = [strings[0]];
  for (const [idx, value] of values.entries()) {
    if (typeof value === 'object') {
      let stringifiedObject;
      try {
        stringifiedObject = EJSON.stringify(value, { relaxed: false });
      } catch (error) {
        stringifiedObject = util.inspect(value, {
          depth: Infinity,
          showHidden: true,
          compact: true
        });
      }
      stringParts.push(stringifiedObject);
    } else {
      stringParts.push(String(value));
    }
    stringParts.push(strings[idx + 1]);
  }

  return stringParts.join('');
}

/**
 * Run an async function after some set timeout
 * @param {() => Promise<void>} fn - function to run
 * @param {number} ms - timeout in MS
 * @returns {Promise<void>}
 */
const runLater = (fn, ms) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => fn().then(resolve).catch(reject), ms);
  });
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * If you are using sinon fake timers, it can end up blocking queued IO from running
 * awaiting a nextTick call will allow the event loop to process Networking/FS callbacks
 */
const processTick = () => new Promise(resolve => process.nextTick(resolve));

function getIndicesOfAuthInUrl(connectionString) {
  const doubleSlashIndex = connectionString.indexOf('//');
  const atIndex = connectionString.indexOf('@');

  if (doubleSlashIndex === -1 || atIndex === -1) {
    return null;
  }

  return {
    start: doubleSlashIndex + 2,
    end: atIndex
  };
}

function removeAuthFromConnectionString(connectionString) {
  const { start, end } = getIndicesOfAuthInUrl(connectionString);

  if (start === -1 || end === -1) {
    return connectionString;
  }

  return connectionString.slice(0, start + 2) + connectionString.slice(end + 1);
}

function extractAuthFromConnectionString(connectionString) {
  const indices = getIndicesOfAuthInUrl(connectionString);
  if (!indices) {
    return null;
  }

  return connectionString.slice(indices.start, indices.end);
}

module.exports = {
  processTick,
  sleep,
  runLater,
  ejson,
  EventCollector,
  makeTestFunction,
  ensureCalledWith,
  ClassWithLogger,
  ClassWithoutLogger,
  ClassWithUndefinedLogger,
  getSymbolFrom,
  getEnvironmentalOptions,
  shouldRunServerlessTest,
  removeAuthFromConnectionString,
  extractAuthFromConnectionString
};
