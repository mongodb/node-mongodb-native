'use strict';

const { MongoClient } = require('../../src');

const expect = require('chai').expect;

// helpers for using chai.expect in the assert style
const assert = {
  equal: function (a, b) {
    expect(a).to.equal(b);
  },

  deepEqual: function (a, b) {
    expect(a).to.eql(b);
  },

  strictEqual: function (a, b) {
    expect(a).to.eql(b);
  },

  notEqual: function (a, b) {
    expect(a).to.not.equal(b);
  },

  ok: function (a) {
    expect(a).to.be.ok;
  },

  throws: function (func) {
    expect(func).to.throw;
  }
};

function delay(timeout) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve();
    }, timeout);
  });
}

function dropCollection(dbObj, collectionName) {
  return dbObj.dropCollection(collectionName).catch(ignoreNsNotFound);
}

function filterForCommands(commands, bag) {
  if (typeof commands === 'function') {
    return function (event) {
      if (commands(event.commandName)) bag.push(event);
    };
  }
  commands = Array.isArray(commands) ? commands : [commands];
  return function (event) {
    if (commands.indexOf(event.commandName) !== -1) bag.push(event);
  };
}

function filterOutCommands(commands, bag) {
  if (typeof commands === 'function') {
    return function (event) {
      if (!commands(event.commandName)) bag.push(event);
    };
  }
  commands = Array.isArray(commands) ? commands : [commands];
  return function (event) {
    if (commands.indexOf(event.commandName) === -1) bag.push(event);
  };
}

function ignoreNsNotFound(err) {
  if (!err.message.match(/ns not found/)) throw err;
}

function setupDatabase(configuration, dbsToClean) {
  dbsToClean = Array.isArray(dbsToClean) ? dbsToClean : [];
  var configDbName = configuration.db;
  var client = configuration.newClient(configuration.writeConcernMax(), {
    poolSize: 1
  });

  dbsToClean.push(configDbName);

  return client
    .connect()
    .then(() =>
      dbsToClean.reduce(
        (result, dbName) =>
          result
            .then(() =>
              client.db(dbName).command({ dropAllUsersFromDatabase: 1, writeConcern: { w: 1 } })
            )
            .then(() => client.db(dbName).dropDatabase({ writeConcern: { w: 1 } })),
        Promise.resolve()
      )
    )
    .then(
      () => client.close(),
      err => client.close(() => Promise.reject(err))
    );
}

/** @typedef {((this: Mocha.Context, client: MongoClient) => Promise) | ((this: Mocha.Context, client: MongoClient, done: Function) => void)} withClientCallback */
/**
 * Safely perform a test with provided MongoClient, ensuring client won't leak.
 *
 * @this Mocha.Context
 * @param {string|MongoClient|withClientCallback} clientOrCallback if not provided, `withClient` must be bound to test function `this`
 * @param {withClientCallback} [callback] the test function
 * @returns any
 */
function withClient(clientOrCallback, callback) {
  const connectionString = typeof clientOrCallback === 'string' ? clientOrCallback : undefined;
  let client = clientOrCallback instanceof MongoClient ? clientOrCallback : undefined;
  callback = typeof clientOrCallback === 'function' ? clientOrCallback : callback;

  if (!callback) throw new Error('withClient is missing a callback');

  if (callback.length === 2) {
    const cb = callback.bind(this);
    callback = client => new Promise(resolve => cb(client, resolve));
  }

  function cleanup(err, client) {
    return new Promise((resolve, reject) => {
      try {
        client.close(closeErr => {
          const finalErr = err || closeErr;
          if (finalErr) {
            return reject(finalErr);
          }
          return resolve();
        });
      } catch (e) {
        return reject(err || e);
      }
    });
  }

  /**
   * @this Mocha.Context
   */
  function lambda() {
    if (!client) {
      client = this.configuration.newClient(connectionString);
    }
    const lambdaCallback = callback;
    if (!client) throw new Error('withClient lambda does not have client available');
    if (!lambdaCallback) throw new Error('withClient lambda is missing a callback');
    return client
      .connect()
      .then(() => lambdaCallback.bind(this))
      .then(err => {
        cleanup(err, client);
        if (err) {
          throw err;
        }
      }, cleanup);
  }

  if (this && this.configuration) {
    /** Executes Functon */
    return lambda.call(this);
  }
  /** Returns Functon */
  return lambda;
}

/** @typedef {(client: MongoClient, events: Array, done: Function) => void} withMonitoredClientCallback */
/**
 * Perform a test with a monitored MongoClient that will filter for certain commands.
 *
 * @param {string|Array|Function} commands commands to filter for
 * @param {object|withMonitoredClientCallback} [options] options to pass on to configuration.newClient
 * @param {object} [options.queryOptions] connection string options
 * @param {object} [options.clientOptions] MongoClient options
 * @param {withMonitoredClientCallback} [callback] the test function
 * @returns any
 */
function withMonitoredClient(commands, options, callback) {
  if (arguments.length === 2) {
    callback = options;
    options = {};
  }
  if (!Object.prototype.hasOwnProperty.call(callback, 'prototype')) {
    throw new Error('withMonitoredClient callback can not be arrow function');
  }
  return function () {
    const monitoredClient = this.configuration.newClient(
      Object.assign({}, options.queryOptions),
      Object.assign({ monitorCommands: true }, options.clientOptions)
    );
    const events = [];
    monitoredClient.on('commandStarted', filterForCommands(commands, events));
    // @ts-ignore
    return withClient(monitoredClient, (client, done) =>
      callback.bind(this)(client, events, done)
    )();
  };
}

/**
 * Safely perform a test with an arbitrary cursor.
 *
 * @param {Function} cursor any cursor that needs to be closed
 * @param {(cursor: object, done: Function) => void} body test body
 * @param {Function} done called after cleanup
 */
function withCursor(cursor, body, done) {
  let clean = false;
  function cleanup(testErr) {
    if (clean) return;
    clean = true;
    return cursor.close(closeErr => done(testErr || closeErr));
  }
  try {
    body(cursor, cleanup);
  } catch (err) {
    cleanup(err);
  }
}

/**
 * A class for listening on specific events
 *
 * @example
 * beforeEach(function() {
 *   // capture all commandStarted events from client. Get by doing this.commandStarted.events;
 *   this.commandStarted = new EventCollector(this.client, 'commandStarted');
 * });
 * @example
 * beforeEach(function() {
 *   // same as above, but only allows 'insert' and 'find' events
 *   this.commandStarted = new EventCollector(this.client, 'commandStarted', {
 *     include: ['insert', 'find']
 *   });
 * });
 * @example
 * beforeEach(function() {
 *   // same as above, but excludes 'ismaster' events
 *   this.commandStarted = new EventCollector(this.client, 'commandStarted', {
 *     exclude: ['ismaster']
 *   });
 * });
 */
class APMEventCollector {
  constructor(client, eventName, options) {
    this._client = client;
    this._eventName = eventName;

    this._events = [];
    this._listener = e => this._events.push(e);
    this._client.on(this._eventName, this._listener);

    options = options || {};
    const include = this._buildSet(options.include);
    if (include.size > 0) {
      this._include = include;
    }
    this._exclude = this._buildSet(options.exclude);
  }

  _buildSet(input) {
    if (Array.isArray(input)) {
      return new Set(input.map(x => x.toLowerCase()));
    } else if (typeof input === 'string') {
      return new Set([input.toLowerCase()]);
    }
    return new Set();
  }

  get events() {
    let events = this._events;
    if (this._include) {
      events = events.filter(e => this._include.has(e.commandName.toLowerCase()));
    }
    return events.filter(e => !this._exclude.has(e.commandName.toLowerCase()));
  }

  clear() {
    this._events = [];
  }

  teardown() {
    this._client.removeListener(this._eventName, this._listener);
  }
}

module.exports = {
  assert,
  delay,
  dropCollection,
  filterForCommands,
  filterOutCommands,
  ignoreNsNotFound,
  setupDatabase,
  withClient,
  withMonitoredClient,
  withCursor,
  APMEventCollector
};
