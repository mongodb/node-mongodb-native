'use strict';

const MongoClient = require('../../').MongoClient;
const expect = require('chai').expect;

function filterForCommands(commands, bag) {
  commands = Array.isArray(commands) ? commands : [commands];
  return function(event) {
    if (commands.indexOf(event.commandName) !== -1) bag.push(event);
  };
}

function filterOutCommands(commands, bag) {
  commands = Array.isArray(commands) ? commands : [commands];
  return function(event) {
    if (commands.indexOf(event.commandName) === -1) bag.push(event);
  };
}

function connectToDb(url, db, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  MongoClient.connect(url, options || {}, function(err, client) {
    if (err) return callback(err);
    callback(null, client.db(db), client);
  });
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

function makeCleanupFn(client) {
  return function(err) {
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
  };
}

function withTempDb(name, options, client, operation, errorHandler) {
  return withClient(
    client,
    client => done => {
      const db = client.db(name, options);
      operation.call(this, db)(() => db.dropDatabase(done));
    },
    errorHandler
  );
}

/**
 * Safely perform a test with provided MongoClient, ensuring client won't leak.
 *
 * @param {MongoClient} client
 * @param {Function|Promise} operation
 * @param {Function|Promise} [errorHandler]
 */
function withClient(client, operation, errorHandler) {
  const cleanup = makeCleanupFn(client);

  return client
    .connect()
    .then(operation, errorHandler)
    .then(() => cleanup(), cleanup);
}

var assert = {
  equal: function(a, b) {
    expect(a).to.equal(b);
  },

  deepEqual: function(a, b) {
    expect(a).to.eql(b);
  },

  strictEqual: function(a, b) {
    expect(a).to.eql(b);
  },

  notEqual: function(a, b) {
    expect(a).to.not.equal(b);
  },

  ok: function(a) {
    expect(a).to.be.ok;
  },

  throws: function(func) {
    expect(func).to.throw;
  }
};

var delay = function(timeout) {
  return new Promise(function(resolve) {
    setTimeout(function() {
      resolve();
    }, timeout);
  });
};

function ignoreNsNotFound(err) {
  if (!err.message.match(/ns not found/)) throw err;
}

function dropCollection(dbObj, collectionName) {
  return dbObj.dropCollection(collectionName).catch(ignoreNsNotFound);
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
class EventCollector {
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

/**
 * Perform a test with a monitored MongoClient that will filter for certain commands.
 *
 * @param {string|Array} commands commands to filter for
 * @param {object} [options] options to pass on to configuration.newClient
 * @param {object} [options.queryOptions] connection string options
 * @param {object} [options.clientOptions] MongoClient options
 * @param {withMonitoredClientCallback} callback the test function
 */
function withMonitoredClient(commands, options, callback) {
  if (arguments.length === 2) {
    callback = options;
    options = {};
  }
  if (!Object.prototype.hasOwnProperty.call(callback, 'prototype')) {
    throw new Error('withMonitoredClient callback can not be arrow function');
  }
  return function(done) {
    const configuration = this.configuration;
    const client = configuration.newClient(
      Object.assign({}, options.queryOptions),
      Object.assign({ monitorCommands: true }, options.clientOptions)
    );
    const events = [];
    client.on('commandStarted', filterForCommands(commands, events));
    client.connect((err, client) => {
      expect(err).to.not.exist;
      function _done(err) {
        client.close(err2 => done(err || err2));
      }
      callback.bind(this)(client, events, _done);
    });
  };
}

/**
 * @callback withMonitoredClientCallback
 * @param {MongoClient} client monitored client
 * @param {Array} events record of monitored commands
 * @param {Function} done trigger end of test and cleanup
 */

module.exports = {
  connectToDb,
  setupDatabase,
  assert,
  delay,
  withClient,
  withMonitoredClient,
  withTempDb,
  filterForCommands,
  filterOutCommands,
  ignoreNsNotFound,
  dropCollection,
  EventCollector
};
