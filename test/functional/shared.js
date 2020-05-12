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

/**
 * use as the `testFn` of `withDb`
 *
 * @param {string} [name='test'] database name
 * @param {object} [options] options
 * @param {object} [options.collection={}] collection options
 * @param {object} [options.helper={}] helper options
 * @param {boolean} [options.helper.create] create collection before test
 * @param {boolean} [options.helper.drop] drop collection after test
 * @param {Function} testFn test function to execute
 */
function withCollection(name, options, testFn) {
  if (arguments.length === 1) {
    testFn = name;
    name = 'test';
    options = { collection: {}, helper: {} };
  } else if (arguments.length === 2) {
    testFn = options;
    if (typeof name === 'string') {
      options = { collection: {}, helper: {} };
    } else {
      options = name;
      name = 'test';
    }
  }
  function runTest(collection, done) {
    testFn(collection, options.helper.drop ? () => collection.drop(done) : done);
  }
  if (options.helper.create) {
    return (db, done) =>
      db.createCollection(name, options, (err, collection) => {
        if (err) return done(err);
        runTest(collection, done);
      });
  }
  return (db, done) => {
    const collection = db.collection(name, options.collection);
    runTest(collection, done);
  };
}


/**
 * use as the `operation` of `withClient`
 *
 * @param {string} [name='test'] database name
 * @param {object} [options] options
 * @param {object} [options.db={}] database options
 * @param {object} [options.helper={}] helper options
 * @param {boolean} [options.helper.drop] drop database after test
 * @param {Function} testFn test function to execute
 
 */
function withDb(name, options, testFn) {
  if (arguments.length === 1) {
    testFn = name;
    name = 'test';
    options = { db: {}, helper: {} };
  } else if (arguments.length === 2) {
    testFn = options;
    if (typeof name === 'string') {
      options = { db: {}, helper: {} };
    } else {
      options = name;
      name = 'test';
    }
  }
  return client =>
    new Promise(resolve => {
      const db = client.db(name, options.db);
      testFn(db, options.helper.drop ? () => db.dropDatabase(resolve) : resolve);
    });
}

/**
 * Safely perform a test with provided MongoClient, ensuring client won't leak.
 *
 * @param {MongoClient} [client] if not provided, withClient must be bound to test function `this`
 * @param {Function} operation (client):Promise or (client, done):void
 * @param {Function} [errorHandler]
 */
function withClient(client, operation, errorHandler) {
  if (!(client instanceof MongoClient)) {
    errorHandler = operation;
    operation = client;
    client = this.configuration.newClient();
  }

  if (operation.length === 2) {
    const callback = operation;
    operation = client => new Promise(resolve => callback(client, resolve));
  }

  function cleanup(err) {
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
  withDb,
  withCollection,
  filterForCommands,
  filterOutCommands,
  ignoreNsNotFound,
  dropCollection,
  EventCollector
};
