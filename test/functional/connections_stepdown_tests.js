'use strict';

const chai = require('chai');
const expect = chai.expect;

describe('Connections survive primary step down', function() {
  let client;

  beforeEach(function() {
    client = this.configuration.newClient(
      { w: 1 },
      { poolSize: 1, retryWrites: false, useUnifiedTopology: true, serverSelectionTimeoutMS: 30000 }
    );
    return client.connect();
  });

  afterEach(function() {
    return client.close();
  });

  it('getMore iteration', {
    metadata: { requires: { mongodb: '>=4.2.0', topology: 'replicaset' } },
    test: function() {
      const db = client.db('step-down');
      let numberOfConnections;

      return Promise.resolve()
        .then(() =>
          db
            .admin()
            .serverStatus()
            .then(result => {
              numberOfConnections = result.connections.totalCreated;
            })
        )
        .then(() => db.createCollection('step-down').then(coll => coll.drop({ w: 'majority' })))
        .then(() =>
          db.createCollection('step-down', { w: 'majority' }).then(collection =>
            collection
              .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }], { w: 'majority' })
              .then(result => expect(result.insertedCount).to.equal(5))
              .then(() => {
                const cursor = collection.find({}, { batchSize: 2 });
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
                        db
                          .admin()
                          .serverStatus()
                          .then(result =>
                            expect(result.connections.totalCreated).to.equal(numberOfConnections)
                          )
                          .then(() => cursor.close())
                      )
                  );
              })
          )
        );
    }
  });

  it('Not Master - Keep Connection Pool', {
    metadata: { requires: { mongodb: '>=4.2.0', topology: 'replicaset' } },
    test: function() {
      const db = client.db('step-down');
      let numberOfConnections;

      return Promise.resolve()
        .then(() =>
          db
            .admin()
            .serverStatus()
            .then(result => {
              numberOfConnections = result.connections.totalCreated;
            })
        )
        .then(() => db.createCollection('step-down').then(coll => coll.drop({ w: 'majority' })))
        .then(() =>
          db.createCollection('step-down', { w: 'majority' }).then(collection =>
            db
              .executeDbAdminCommand({
                configureFailPoint: 'failCommand',
                mode: { times: 1 },
                data: { failCommands: ['insert'], errorCode: 10107 }
              })
              .then(() =>
                collection.insertOne({ test: 1 }).catch(err => expect(err.code).to.equal(10107))
              )
              .then(() =>
                collection.insertOne({ test: 1 }).then(result => {
                  expect(result.insertedCount).to.equal(1);
                })
              )
              .then(() =>
                db.executeDbAdminCommand({ configureFailPoint: 'failCommand', mode: 'off' })
              )
              .then(() =>
                db
                  .admin()
                  .serverStatus()
                  .then(result =>
                    expect(result.connections.totalCreated).to.equal(numberOfConnections)
                  )
              )
          )
        );
    }
  });

  it('Not Master - Reset Connection Pool', {
    metadata: { requires: { mongodb: '4.0.x', topology: 'replicaset' } },
    test: function() {
      const db = client.db('step-down');
      let numberOfConnections;

      return Promise.resolve()
        .then(() =>
          db
            .admin()
            .serverStatus()
            .then(result => {
              numberOfConnections = result.connections.totalCreated;
            })
        )
        .then(() => db.createCollection('step-down').then(coll => coll.drop({ w: 'majority' })))
        .then(() =>
          db.createCollection('step-down', { w: 'majority' }).then(collection =>
            db
              .executeDbAdminCommand({
                configureFailPoint: 'failCommand',
                mode: { times: 1 },
                data: { failCommands: ['insert'], errorCode: 10107 }
              })
              .then(() =>
                collection.insertOne({ test: 1 }).catch(err => expect(err.code).to.equal(10107))
              )
              .then(() =>
                db.executeDbAdminCommand({ configureFailPoint: 'failCommand', mode: 'off' })
              )
              .then(() =>
                db
                  .admin()
                  .serverStatus()
                  .then(result =>
                    expect(result.connections.totalCreated).to.equal(numberOfConnections + 1)
                  )
              )
          )
        );
    }
  });

  it('Shutdown in progress - Reset Connection Pool', {
    metadata: { requires: { mongodb: '>=4.0.0', topology: 'replicaset' } },
    test: function() {
      const db = client.db('step-down');
      let numberOfConnections;

      return Promise.resolve()
        .then(() =>
          db
            .admin()
            .serverStatus()
            .then(result => {
              numberOfConnections = result.connections.totalCreated;
            })
        )
        .then(() => db.createCollection('step-down').then(coll => coll.drop({ w: 'majority' })))
        .then(() =>
          db.createCollection('step-down', { w: 'majority' }).then(collection =>
            db
              .executeDbAdminCommand({
                configureFailPoint: 'failCommand',
                mode: { times: 1 },
                data: { failCommands: ['insert'], errorCode: 91 }
              })
              .then(() =>
                collection.insertOne({ test: 1 }).catch(err => expect(err.code).to.equal(91))
              )
              .then(() =>
                db.executeDbAdminCommand({ configureFailPoint: 'failCommand', mode: 'off' })
              )
              .then(() =>
                db
                  .admin()
                  .serverStatus()
                  .then(result =>
                    expect(result.connections.totalCreated).to.equal(numberOfConnections + 1)
                  )
              )
          )
        );
    }
  });

  it('Interrupted at shutdown - Reset Connection Pool', {
    metadata: { requires: { mongodb: '>=4.0.0', topology: 'replicaset' } },
    test: function() {
      const db = client.db('step-down');
      let numberOfConnections;

      return Promise.resolve()
        .then(() =>
          db
            .admin()
            .serverStatus()
            .then(result => {
              numberOfConnections = result.connections.totalCreated;
            })
        )
        .then(() => db.createCollection('step-down').then(coll => coll.drop({ w: 'majority' })))
        .then(() =>
          db.createCollection('step-down', { w: 'majority' }).then(collection =>
            db
              .executeDbAdminCommand({
                configureFailPoint: 'failCommand',
                mode: { times: 1 },
                data: { failCommands: ['insert'], errorCode: 11600 }
              })
              .then(() =>
                collection.insertOne({ test: 1 }).catch(err => expect(err.code).to.equal(11600))
              )
              .then(() =>
                db.executeDbAdminCommand({ configureFailPoint: 'failCommand', mode: 'off' })
              )
              .then(() =>
                db
                  .admin()
                  .serverStatus()
                  .then(result =>
                    expect(result.connections.totalCreated).to.equal(numberOfConnections + 1)
                  )
              )
          )
        );
    }
  });
});
