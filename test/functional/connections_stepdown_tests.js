'use strict';

const chai = require('chai');
const expect = chai.expect;

function ignoreNsNotFound(err) {
  if (!err.message.match(/ns not found/)) throw err;
}

function connectionCount(db) {
  return db
    .admin()
    .serverStatus()
    .then(result => result.connections.totalCreated);
}

function expectPoolWasCleared(initialCount) {
  return count => expect(count).to.equal(initialCount + 1);
}

function expectPoolWasNotCleared(initialCount) {
  return count => expect(count).to.equal(initialCount);
}

describe('Connections survive primary step down', function() {
  let client;
  let db;
  let collection;

  beforeEach(function() {
    client = this.configuration.newClient(
      { w: 1 },
      { poolSize: 1, retryWrites: false, useUnifiedTopology: true }
    );

    return client
      .connect()
      .then(() => {
        db = client.db('step-down');
        collection = db.collection('step-down');
      })
      .then(() => collection.drop({ w: 'majority' }))
      .catch(ignoreNsNotFound)
      .then(() => db.createCollection('step-down', { w: 'majority' }));
  });

  let deferred = [];
  afterEach(function() {
    return Promise.all(deferred.map(d => d())).then(() => {
      deferred = [];
      client.close();
    });
  });

  it('getMore iteration', {
    metadata: { requires: { mongodb: '>=4.2.0', topology: 'replicaset' } },

    test: function() {
      return connectionCount(db).then(initialConnectionCount => {
        return collection
          .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }], {
            w: 'majority'
          })
          .then(result => expect(result.insertedCount).to.equal(5))
          .then(() => {
            const cursor = collection.find({}, { batchSize: 2 });
            deferred.push(() => cursor.close());

            return cursor
              .next()
              .then(item => expect(item.a).to.equal(1))
              .then(() => cursor.next())
              .then(item => expect(item.a).to.equal(2))
              .then(() =>
                db
                  .executeDbAdminCommand(
                    { replSetStepDown: 5, force: true },
                    { readPreference: 'primary' }
                  )
                  .then(() => cursor.next())
                  .then(item => expect(item.a).to.equal(3))
                  .then(() =>
                    connectionCount(db).then(expectPoolWasNotCleared(initialConnectionCount))
                  )
              );
          });
      });
    }
  });

  it('Not Master - Keep Connection Pool', {
    metadata: { requires: { mongodb: '>=4.2.0', topology: 'replicaset' } },
    test: function() {
      return connectionCount(db).then(initialConnectionCount => {
        return db
          .executeDbAdminCommand({
            configureFailPoint: 'failCommand',
            mode: { times: 1 },
            data: { failCommands: ['insert'], errorCode: 10107 }
          })
          .then(() => {
            deferred.push(() =>
              db.executeDbAdminCommand({ configureFailPoint: 'failCommand', mode: 'off' })
            );

            return collection.insertOne({ test: 1 }).catch(err => expect(err.code).to.equal(10107));
          })
          .then(() =>
            collection.insertOne({ test: 1 }).then(result => {
              expect(result.insertedCount).to.equal(1);
            })
          )
          .then(() => connectionCount(db).then(expectPoolWasNotCleared(initialConnectionCount)));
      });
    }
  });

  it('Not Master - Reset Connection Pool', {
    metadata: { requires: { mongodb: '4.0.x', topology: 'replicaset' } },
    test: function() {
      return connectionCount(db).then(initialConnectionCount => {
        return db
          .executeDbAdminCommand({
            configureFailPoint: 'failCommand',
            mode: { times: 1 },
            data: { failCommands: ['insert'], errorCode: 10107 }
          })
          .then(() => {
            deferred.push(() =>
              db.executeDbAdminCommand({ configureFailPoint: 'failCommand', mode: 'off' })
            );

            collection.insertOne({ test: 1 }).catch(err => expect(err.code).to.equal(10107));
          })
          .then(() => connectionCount(db).then(expectPoolWasCleared(initialConnectionCount)));
      });
    }
  });

  it('Shutdown in progress - Reset Connection Pool', {
    metadata: { requires: { mongodb: '>=4.0.0', topology: 'replicaset' } },
    test: function() {
      return connectionCount(db).then(initialConnectionCount => {
        return db
          .executeDbAdminCommand({
            configureFailPoint: 'failCommand',
            mode: { times: 1 },
            data: { failCommands: ['insert'], errorCode: 91 }
          })
          .then(() => {
            deferred.push(() =>
              db.executeDbAdminCommand({ configureFailPoint: 'failCommand', mode: 'off' })
            );
            return collection.insertOne({ test: 1 }).catch(err => expect(err.code).to.equal(91));
          })
          .then(() => connectionCount(db).then(expectPoolWasCleared(initialConnectionCount)));
      });
    }
  });

  it('Interrupted at shutdown - Reset Connection Pool', {
    metadata: { requires: { mongodb: '>=4.0.0', topology: 'replicaset' } },
    test: function() {
      return connectionCount(db).then(initialConnectionCount => {
        return db
          .executeDbAdminCommand({
            configureFailPoint: 'failCommand',
            mode: { times: 1 },
            data: { failCommands: ['insert'], errorCode: 11600 }
          })
          .then(() => {
            deferred.push(() =>
              db.executeDbAdminCommand({ configureFailPoint: 'failCommand', mode: 'off' })
            );
            return collection.insertOne({ test: 1 }).catch(err => expect(err.code).to.equal(11600));
          })
          .then(() => connectionCount(db).then(expectPoolWasCleared(initialConnectionCount)));
      });
    }
  });
});
