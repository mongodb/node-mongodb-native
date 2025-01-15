import { expect } from 'chai';

import { ReadPreference } from '../../mongodb';
import { filterForCommands, ignoreNsNotFound, setupDatabase } from '../shared';

describe('Command Monitoring', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('should correctly receive the APM events for an insert', {
    metadata: { requires: { topology: ['single', 'replicaset', 'sharded'] } },

    test: function () {
      const started = [];
      const succeeded = [];
      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      client.on('commandStarted', filterForCommands('insert', started));
      client.on('commandSucceeded', filterForCommands('insert', succeeded));

      return client
        .db(this.configuration.db)
        .collection('apm_test')
        .insertOne({ a: 1 })
        .then(r => {
          expect(r).property('insertedId').to.exist;
          expect(started.length).to.equal(1);
          expect(started[0].commandName).to.equal('insert');
          expect(started[0].command.insert).to.equal('apm_test');
          expect(succeeded.length).to.equal(1);
          return client.close();
        });
    }
  });

  it('should correctly handle cursor.close when no cursor existed', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    test: function () {
      const started = [];
      const succeeded = [];

      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      client.on('commandStarted', filterForCommands('insert', started));
      client.on('commandSucceeded', filterForCommands('insert', succeeded));

      const db = client.db(this.configuration.db);
      const collection = db.collection('apm_test_cursor');
      return collection.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }]).then(r => {
        expect(r).property('insertedCount').to.equal(3);
        const cursor = collection.find({});
        return cursor.count().then(() => {
          cursor.close(); // <-- Will cause error in APM module.
          return client.close();
        });
      });
    }
  });

  it('should correctly receive the APM events for a listCollections command', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.0.0' } },

    test: function () {
      const started = [];
      const succeeded = [];
      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      client.on('commandStarted', filterForCommands('listCollections', started));
      client.on('commandSucceeded', filterForCommands('listCollections', succeeded));

      const db = client.db(this.configuration.db);

      return db
        .collection('apm_test_list_collections')
        .insertOne({ a: 1 }, this.configuration.writeConcernMax())
        .then(r => {
          expect(r).property('insertedId').to.exist;
          return db.listCollections({}, { readPreference: ReadPreference.primary }).toArray();
        })
        .then(() => db.listCollections({}, { readPreference: ReadPreference.secondary }).toArray())
        .then(() => {
          expect(started).to.have.lengthOf(2);
          expect(started[0]).property('address').to.not.equal(started[1].address);

          return client.close();
        });
    }
  });

  it('should correctly receive the APM events for a listIndexes command', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.0.0' } },

    test: function () {
      const started = [];
      const succeeded = [];
      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      const desiredEvents = ['listIndexes', 'find'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      const db = client.db(this.configuration.db);

      return db
        .collection('apm_test_list_collections')
        .insertOne({ a: 1 }, this.configuration.writeConcernMax())
        .then(r => {
          expect(r).property('insertedId').to.exist;

          return db
            .collection('apm_test_list_collections')
            .listIndexes({ readPreference: ReadPreference.PRIMARY })
            .toArray();
        })
        .then(() =>
          db
            .collection('apm_test_list_collections')
            .listIndexes({ readPreference: ReadPreference.SECONDARY })
            .toArray()
        )
        .then(() => {
          expect(started).to.have.lengthOf(2);
          expect(started[0]).property('address').to.not.equal(started[1].address);

          return client.close();
        });
    }
  });

  it('should correctly receive the APM events for a find with getmore and killcursor', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    test: function () {
      const started = [];
      const succeeded = [];
      const failed = [];
      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      const desiredEvents = ['find', 'getMore', 'killCursors'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));
      client.on('commandFailed', filterForCommands(desiredEvents, failed));

      const db = client.db(this.configuration.db);

      // Drop the collection
      return db
        .collection('apm_test_2')
        .drop()
        .catch(ignoreNsNotFound)
        .then(() => {
          // Insert test documents
          return db
            .collection('apm_test_2')
            .insertMany([{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }], {
              writeConcern: { w: 1 }
            });
        })
        .then(r => {
          expect(r).property('insertedCount').to.equal(6);
          return db
            .collection('apm_test_2')
            .find({ a: 1 })
            .project({ _id: 1, a: 1 })
            .hint({ _id: 1 })
            .skip(1)
            .limit(100)
            .batchSize(2)
            .comment('some comment')
            .maxTimeMS(5000)
            .withReadPreference(ReadPreference.PRIMARY)
            .addCursorFlag('noCursorTimeout', true)
            .toArray();
        })
        .then(docs => {
          // Assert basic documents
          expect(docs).to.have.length(5);
          expect(started).to.have.length(3);
          expect(succeeded).to.have.length(3);
          expect(failed).to.have.length(0);

          // Success messages
          expect(succeeded[0].reply).to.not.be.null;
          expect(succeeded[0].operationId).to.equal(succeeded[1].operationId);
          expect(succeeded[0].operationId).to.equal(succeeded[2].operationId);
          expect(succeeded[1].reply).to.not.be.null;
          expect(succeeded[2].reply).to.not.be.null;

          // Started
          expect(started[0].operationId).to.equal(started[1].operationId);
          expect(started[0].operationId).to.equal(started[2].operationId);

          return client.close();
        });
    }
  });

  it('should correctly receive the APM failure event for find', {
    metadata: { requires: { topology: ['single', 'replicaset'], mongodb: '>=2.6.0' } },

    test: function () {
      const started = [];
      const succeeded = [];
      const failed = [];
      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      const desiredEvents = ['find', 'getMore', 'killCursors'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));
      client.on('commandFailed', filterForCommands(desiredEvents, failed));

      const db = client.db(this.configuration.db);

      // Drop the collection
      return db
        .collection('apm_test_2')
        .drop()
        .catch(ignoreNsNotFound)
        .then(() => {
          // Insert test documents
          return db
            .collection('apm_test_2')
            .insertMany([{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }]);
        })
        .then(r => {
          expect(r).property('insertedCount').to.equal(6);
          return db
            .collection('apm_test_2')
            .find({ $illegalfield: 1 })
            .project({ _id: 1, a: 1 })
            .hint({ _id: 1 })
            .skip(1)
            .limit(100)
            .batchSize(2)
            .comment('some comment')
            .maxTimeMS(5000)
            .withReadPreference(ReadPreference.PRIMARY)
            .addCursorFlag('noCursorTimeout', true)
            .toArray();
        })
        .then(() => {
          throw new Error('this should not happen');
        })
        .catch(() => {
          expect(failed).to.have.length(1);
          return client.close();
        });
    }
  });

  it('should correctly receive the APM events for a bulk operation', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    test: function () {
      const started = [];
      const succeeded = [];
      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      const desiredEvents = ['insert', 'update', 'delete'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      const db = client.db(this.configuration.db);
      return db
        .collection('apm_test_3')
        .bulkWrite(
          [
            { insertOne: { document: { a: 1 } } },
            { updateOne: { filter: { a: 2 }, update: { $set: { a: 2 } }, upsert: true } },
            { deleteOne: { filter: { c: 1 } } }
          ],
          { ordered: true }
        )
        .then(() => {
          expect(started).to.have.length(3);
          expect(succeeded).to.have.length(3);
          expect(started[0].operationId).to.equal(started[1].operationId);
          expect(started[0].operationId).to.equal(started[2].operationId);
          expect(succeeded[0].operationId).to.equal(succeeded[1].operationId);
          expect(succeeded[0].operationId).to.equal(succeeded[2].operationId);
          return client.close();
        });
    }
  });

  it('should correctly receive the APM explain command', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    test: function () {
      const started = [];
      const succeeded = [];
      const failed = [];
      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      const desiredEvents = ['find', 'getMore', 'killCursors', 'explain'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));
      client.on('commandFailed', filterForCommands(desiredEvents, failed));

      const db = client.db(this.configuration.db);

      return db
        .collection('apm_test_2')
        .drop()
        .catch(ignoreNsNotFound)
        .then(() =>
          db
            .collection('apm_test_2')
            .insertMany([{ a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }, { a: 1 }], {
              writeConcern: { w: 1 }
            })
        )
        .then(r => {
          expect(r).property('insertedCount').to.equal(6);
          return db.collection('apm_test_2').find({ a: 1 }).explain();
        })
        .then(explain => {
          expect(explain).to.not.be.null;
          expect(started).to.have.length(1);
          expect(started[0].commandName).to.equal('explain');
          expect(started[0].command.explain.find).to.equal('apm_test_2');
          expect(succeeded).to.have.length(1);
          expect(succeeded[0].commandName).to.equal('explain');
          expect(started[0].operationId).to.equal(succeeded[0].operationId);
          return client.close();
        });
    }
  });

  it('should correctly filter out sensitive commands', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    test: function () {
      const started = [];
      const succeeded = [];
      const failed = [];
      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      const desiredEvents = ['hello'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));
      client.on('commandFailed', filterForCommands(desiredEvents, failed));

      return client
        .db(this.configuration.db)
        .command({ hello: 1, speculativeAuthenticate: { saslStart: 1 } })
        .then(r => {
          expect(r).to.exist;
          expect(started).to.have.length(1);
          expect(succeeded).to.have.length(1);
          expect(failed).to.have.length(0);
          expect(started[0].command).to.eql({});
          expect(succeeded[0].reply).to.eql({});
          return client.close();
        });
    }
  });

  it('should correctly receive the APM events for an updateOne', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    test: function () {
      const started = [];
      const succeeded = [];
      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      const desiredEvents = ['update'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      return client
        .db(this.configuration.db)
        .collection('apm_test_u_1')
        .updateOne({ a: 1 }, { $set: { b: 1 } }, { upsert: true })
        .then(r => {
          expect(r).to.exist;
          expect(started).to.have.length(1);
          expect(started[0].commandName).to.equal('update');
          expect(started[0].command.update).to.equal('apm_test_u_1');
          expect(succeeded).to.have.length(1);
          return client.close();
        });
    }
  });

  it('should correctly receive the APM events for an updateMany', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    test: function () {
      const started = [];
      const succeeded = [];
      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      const desiredEvents = ['update'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      return client
        .db(this.configuration.db)
        .collection('apm_test_u_2')
        .updateMany({ a: 1 }, { $set: { b: 1 } }, { upsert: true })
        .then(r => {
          expect(r).to.exist;
          expect(started).to.have.length(1);
          expect(started[0].commandName).to.equal('update');
          expect(started[0].command.update).to.equal('apm_test_u_2');
          expect(succeeded).to.have.length(1);
          return client.close();
        });
    }
  });

  it('should correctly receive the APM events for deleteOne', {
    metadata: { requires: { topology: ['single', 'replicaset'] } },

    test: function () {
      const started = [];
      const succeeded = [];
      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      const desiredEvents = ['delete'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      return client
        .db(this.configuration.db)
        .collection('apm_test_u_3')
        .deleteOne({ a: 1 })
        .then(r => {
          expect(r).to.exist;
          expect(started).to.have.length(1);
          expect(started[0].commandName).to.equal('delete');
          expect(started[0].command.delete).to.equal('apm_test_u_3');
          expect(succeeded).to.have.length(1);
          return client.close();
        });
    }
  });

  it('should ensure killcursor commands are sent on 3.0 or earlier when APM is enabled', {
    metadata: { requires: { topology: ['single', 'replicaset'], mongodb: '<=3.0.x' } },

    test: function () {
      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      const db = client.db(this.configuration.db);
      const admindb = db.admin();
      let cursorCountBefore;
      let cursorCountAfter;

      const collection = db.collection('apm_killcursor_tests');

      // make sure collection has records (more than 2)
      return collection
        .insertMany([{ a: 1 }, { a: 2 }, { a: 3 }])
        .then(r => {
          expect(r).to.exist;
          return admindb.serverStatus();
        })
        .then(result => {
          cursorCountBefore = result.cursors.clientCursors_size;
          const cursor = collection.find({}).limit(2);
          return cursor.toArray().then(r => {
            expect(r).to.exist;
            return cursor.close();
          });
        })
        .then(() => admindb.serverStatus())
        .then(result => {
          cursorCountAfter = result.cursors.clientCursors_size;
          expect(cursorCountBefore).to.equal(cursorCountAfter);
          return client.close();
        });
    }
  });

  it('should correctly decorate the apm result for aggregation with cursorId', {
    metadata: { requires: { topology: ['single', 'replicaset'], mongodb: '>=3.0.0' } },

    test: function () {
      const started = [];
      const succeeded = [];

      // Generate docs
      const docs = [];
      for (let i = 0; i < 2500; i++) docs.push({ a: i });

      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      const desiredEvents = ['aggregate', 'getMore'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      const db = client.db(this.configuration.db);
      return db
        .collection('apm_test_u_4')
        .drop()
        .catch(ignoreNsNotFound)
        .then(() => db.collection('apm_test_u_4').insertMany(docs))
        .then(r => {
          expect(r).to.exist;
          return db
            .collection('apm_test_u_4')
            .aggregate([{ $match: {} }])
            .toArray();
        })
        .then(r => {
          expect(r).to.exist;
          expect(started).to.have.length(4);
          expect(succeeded).to.have.length(4);
          const cursors = succeeded.map(x => x.reply.cursor);

          // Check we have a cursor
          expect(cursors[0].id).to.exist;
          expect(cursors[0].id.toString()).to.equal(cursors[1].id.toString());
          expect(cursors[3].id.toString()).to.equal('0');

          return client.close();
        });
    }
  });

  it('should correctly decorate the apm result for listCollections with cursorId', {
    metadata: { requires: { topology: ['single', 'replicaset'], mongodb: '>=3.0.0' } },
    test: function () {
      const started = [];
      const succeeded = [];
      const client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );

      const desiredEvents = ['listCollections'];
      client.on('commandStarted', filterForCommands(desiredEvents, started));
      client.on('commandSucceeded', filterForCommands(desiredEvents, succeeded));

      const db = client.db(this.configuration.db);

      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(db.collection('_mass_collection_' + i).insertOne({ a: 1 }));
      }

      return Promise.all(promises)
        .then(r => {
          expect(r).to.exist;

          return db.listCollections().batchSize(10).toArray();
        })
        .then(r => {
          expect(r).to.exist;
          expect(started).to.have.length(1);
          expect(succeeded).to.have.length(1);

          const cursors = succeeded.map(x => x.reply.cursor);
          expect(cursors[0].id).to.exist;

          return client.close();
        });
    }
  });

  describe('Internal state references', function () {
    let client;

    beforeEach(function () {
      client = this.configuration.newClient(
        { writeConcern: { w: 1 } },
        { maxPoolSize: 1, monitorCommands: true }
      );
    });

    afterEach(function (done) {
      client.close(done);
    });
  });
});
