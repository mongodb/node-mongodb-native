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

function dropCollection(dbObj, collectionName, options = {}) {
  return dbObj.dropCollection(collectionName, options);
}

/**
 * Given a set of commands to look for when command monitoring and a destination to store them, returns an event handler
 * that collects the specified events.
 *
 * ```typescript
 * const commands = [];
 *
 * // one command
 * client.on('commandStarted', filterForCommands('ping', commands));
 * // multiple commands
 * client.on('commandStarted', filterForCommands(['ping', 'find'], commands));
 * // custom predicate
 * client.on('commandStarted', filterForCommands((command) => command.commandName === 'find', commands));
 * ```
 * @param {string | string[] | (arg0: string) => boolean} commands A set of commands to look for.  Either
 * a single command name (string), a list of command names (string[]) or a predicate function that
 * determines whether or not a command should be kept.
 * @param {Array} bag the output for the filtered commands
 * @returns a function that collects the specified comment events
 */
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

async function setupDatabase(configuration, dbsToClean) {
  dbsToClean = Array.isArray(dbsToClean) ? dbsToClean : [];
  const configDbName = configuration.db;

  dbsToClean.push(configDbName);

  const client = configuration.newClient();
  try {
    for (const dbName of dbsToClean) {
      const db = await client.db(dbName);
      for await (const { name } of db.listCollections({}, { nameOnly: true })) {
        const collection = db.collection(name);
        await collection.deleteMany({}).catch(() => null);
        await collection.drop();
      }
    }
  } finally {
    await client.close();
  }
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
  setupDatabase,
  withCursor,
  APMEventCollector
};
