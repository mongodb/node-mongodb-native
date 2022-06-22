'use strict';

const expect = require('chai').expect;
const { setTimeout } = require('timers');

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
    maxPoolSize: 1
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
 * Safely perform a test with an arbitrary cursor.
 *
 * @param {{close: () => void}} cursor any cursor that needs to be closed
 * @param {(cursor: object, done: Mocha.Done) => void} body test body
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
 *   // same as above, but excludes 'insert' events
 *   this.commandStarted = new EventCollector(this.client, 'commandStarted', {
 *     exclude: ['insert']
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
  withCursor,
  APMEventCollector
};
