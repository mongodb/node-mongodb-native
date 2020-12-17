'use strict';

const chai = require('chai');
const expect = chai.expect;

function ignoreNsNotFound(err) {
  if (!err.message.match(/ns not found/)) {
    throw err;
  }
}

function connectionCount(client) {
  return client
    .db()
    .admin()
    .serverStatus()
    .then(result => result.connections.totalCreated);
}

function expectPoolWasCleared(initialCount) {
  return count => expect(count).to.greaterThan(initialCount);
}

function expectPoolWasNotCleared(initialCount) {
  return count => expect(count).to.equal(initialCount);
}

describe('Connections survive primary step down', function () {
  let client;
  let checkClient;
  let db;
  let collection;

  beforeEach(function () {
    const clientOptions = {
      maxPoolSize: 1,
      retryWrites: false,
      heartbeatFrequencyMS: 100
    };

    client = this.configuration.newClient(clientOptions);
    return client
      .connect()
      .then(() => {
        const primary = Array.from(client.topology.description.servers.values()).filter(
          sd => sd.type === 'RSPrimary'
        )[0];

        checkClient = this.configuration.newClient(
          `mongodb://${primary.address}/?directConnection=true`,
          clientOptions
        );
        return checkClient.connect();
      })
      .then(() => {
        db = client.db('step-down');
        collection = db.collection('step-down');
      })
      .then(() => collection.drop({ writeConcern: { w: 'majority' } }))
      .catch(ignoreNsNotFound)
      .then(() => db.createCollection('step-down', { writeConcern: { w: 'majority' } }));
  });

  let deferred = [];
  afterEach(function () {
    return Promise.all(deferred.map(d => d())).then(() => {
      deferred = [];
      return Promise.all([client.close(), checkClient.close()]);
    });
  });

  it('getMore iteration', {
    metadata: { requires: { mongodb: '>=4.2.0', topology: 'replicaset' } },

    test: function () {
      return collection
        .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }], {
          writeConcern: { w: 'majority' }
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
            .then(() => {
              return connectionCount(checkClient).then(initialConnectionCount => {
                return client
                  .db('admin')
                  .command({ replSetFreeze: 0 }, { readPreference: 'secondary' })
                  .then(result => expect(result).property('info').to.equal('unfreezing'))
                  .then(() =>
                    client
                      .db('admin')
                      .command({ replSetStepDown: 30, force: true }, { readPreference: 'primary' })
                  )
                  .then(() => cursor.next())
                  .then(item => expect(item.a).to.equal(3))
                  .then(() =>
                    connectionCount(checkClient).then(
                      expectPoolWasNotCleared(initialConnectionCount)
                    )
                  );
              });
            });
        });
    }
  });

  function runStepownScenario(errorCode, predicate) {
    return connectionCount(checkClient).then(initialConnectionCount => {
      return client
        .db('admin')
        .command({
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: { failCommands: ['insert'], errorCode }
        })
        .then(() => {
          deferred.push(() =>
            client.db('admin').command({ configureFailPoint: 'failCommand', mode: 'off' })
          );

          return collection.insertOne({ test: 1 }).then(
            () => Promise.reject(new Error('expected an error')),
            err => expect(err.code).to.equal(errorCode)
          );
        })
        .then(() => collection.insertOne({ test: 1 }))
        .then(() => connectionCount(checkClient).then(predicate(initialConnectionCount)));
    });
  }

  it('Not Master - Keep Connection Pool', {
    metadata: { requires: { mongodb: '>=4.2.0', topology: 'replicaset' } },
    test: function () {
      return runStepownScenario(10107, expectPoolWasNotCleared);
    }
  });

  it('Not Master - Reset Connection Pool', {
    metadata: { requires: { mongodb: '4.0.x', topology: 'replicaset' } },
    test: function () {
      return runStepownScenario(10107, expectPoolWasCleared);
    }
  });

  it('Shutdown in progress - Reset Connection Pool', {
    metadata: { requires: { mongodb: '>=4.0.0', topology: 'replicaset' } },
    test: function () {
      return runStepownScenario(91, expectPoolWasCleared);
    }
  });

  it('Interrupted at shutdown - Reset Connection Pool', {
    metadata: { requires: { mongodb: '>=4.0.0', topology: 'replicaset' } },
    test: function () {
      return runStepownScenario(11600, expectPoolWasCleared);
    }
  });
});
