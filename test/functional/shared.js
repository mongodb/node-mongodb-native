'use strict';

const MongoClient = require('../../').MongoClient;
const expect = require('chai').expect;

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
    .then(() => client.close(), err => client.close(() => Promise.reject(err)));
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

module.exports = {
  connectToDb,
  setupDatabase,
  assert,
  delay,
  withClient
};
