import { expect } from 'chai';

import { type Db, MongoClient, MongoInvalidArgumentError, MongoServerError } from '../../mongodb';
import { assert as test, setupDatabase } from '../shared';

describe('Db', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  context('when given illegal db name', function () {
    let client: MongoClient;
    let db: Db;

    beforeEach(function () {
      client = this.configuration.newClient();
    });

    afterEach(async function () {
      db = undefined;
      await client.close();
    });

    context('of type string, containing no dot characters', function () {
      it('should throw error on server only', async function () {
        db = client.db('a\x00b');
        const error = await db.createCollection('spider').catch(error => error);
        expect(error).to.be.instanceOf(MongoServerError);
        expect(error).to.have.property('code', 73);
        expect(error).to.have.property('codeName', 'InvalidNamespace');
      });
    });

    context('of type string, containing a dot character', function () {
      it('should throw MongoInvalidArgumentError', function () {
        expect(() => client.db('a.b')).to.throw(MongoInvalidArgumentError);
      });
    });

    context('of type non-string type', function () {
      it('should not throw client-side', function () {
        expect(() => client.db(5)).to.not.throw();
      });
    });
  });

  it('should correctly handle failed connection', async function () {
    const client = this.configuration.newClient('mongodb://iLoveJS', {
      serverSelectionTimeoutMS: 10
    });
    const error = await client.connect().catch(error => error);
    expect(error).to.be.instanceOf(Error);
  });

  it('shouldCorrectlyGetErrorDroppingNonExistingDb', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        const _db = client.db('nonexistingdb');

        _db.dropDatabase(function (err, result) {
          expect(err).to.not.exist;
          test.equal(true, result);

          client.close(done);
        });
      });
    }
  });

  it.skip('shouldCorrectlyThrowWhenTryingToReOpenConnection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(err => {
        expect(err).to.not.exist;

        try {
          client.connect(function () {});
          test.ok(false);
        } catch {
          client.close(done);
        }
      });
    }
  });

  it('should not cut collection name when it is the same as the database', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        const db1 = client.db('node972');
        db1.collection('node972.test').insertOne({ a: 1 }, function (err) {
          expect(err).to.not.exist;

          db1.collections(function (err, collections) {
            expect(err).to.not.exist;
            collections = collections.map(function (c) {
              return c.collectionName;
            });
            test.notEqual(-1, collections.indexOf('node972.test'));
            client.close(done);
          });
        });
      });
    }
  });

  it('shouldCorrectlyUseCursorWithListCollectionsCommand', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function (done) {
      const configuration = this.configuration;

      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        // Get a db we that does not have any collections
        const db1 = client.db('shouldCorrectlyUseCursorWithListCollectionsCommand');

        // Create a collection
        db1.collection('test').insertOne({ a: 1 }, function (err) {
          expect(err).to.not.exist;

          // Create a collection
          db1.collection('test1').insertOne({ a: 1 }, function () {
            expect(err).to.not.exist;

            // Get listCollections filtering out the name
            const cursor = db1.listCollections({ name: 'test1' });
            cursor.toArray(function (err, names) {
              expect(err).to.not.exist;
              test.equal(1, names.length);

              client.close(done);
            });
          });
        });
      });
    }
  });

  it('shouldCorrectlyUseCursorWithListCollectionsCommandAndBatchSize', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function (done) {
      const configuration = this.configuration;

      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        // Get a db we that does not have any collections
        const db1 = client.db('shouldCorrectlyUseCursorWithListCollectionsCommandAndBatchSize');

        // Create a collection
        db1.collection('test').insertOne({ a: 1 }, function (err) {
          expect(err).to.not.exist;

          // Create a collection
          db1.collection('test1').insertOne({ a: 1 }, function () {
            expect(err).to.not.exist;

            // Get listCollections filtering out the name
            const cursor = db1.listCollections({ name: 'test' }, { batchSize: 1 });
            cursor.toArray(function (err, names) {
              expect(err).to.not.exist;
              test.equal(1, names.length);

              client.close(done);
            });
          });
        });
      });
    }
  });

  it('should correctly list collection names with . in the middle', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },

    test: function (done) {
      const configuration = this.configuration;

      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        // Get a db we that does not have any collections
        const db1 = client.db('shouldCorrectlyListCollectionsWithDotsOnThem');

        // Create a collection
        db1.collection('test.collection1').insertOne({ a: 1 }, function (err) {
          expect(err).to.not.exist;

          // Create a collection
          db1.collection('test.collection2').insertOne({ a: 1 }, function () {
            expect(err).to.not.exist;

            // Get listCollections filtering out the name
            const cursor = db1.listCollections({ name: /test.collection/ });
            cursor.toArray(function (err, names) {
              expect(err).to.not.exist;
              test.equal(2, names.length);

              // Get listCollections filtering out the name
              const cursor = db1.listCollections({ name: 'test.collection1' }, {});
              cursor.toArray(function (err, names) {
                expect(err).to.not.exist;
                test.equal(1, names.length);

                client.close(done);
              });
            });
          });
        });
      });
    }
  });

  it('should correctly list collection names with batchSize 1 for 2.8 or higher', {
    metadata: {
      requires: {
        topology: ['single', 'replicaset', 'sharded'],
        mongodb: '>= 2.8.0'
      }
    },

    test: function (done) {
      const configuration = this.configuration;

      const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;

        // Get a db we that does not have any collections
        const db1 = client.db('shouldCorrectlyListCollectionsWithDotsOnThemFor28');

        // Create a collection
        db1.collection('test.collection1').insertOne({ a: 1 }, function (err) {
          expect(err).to.not.exist;

          // Create a collection
          db1.collection('test.collection2').insertOne({ a: 1 }, function () {
            expect(err).to.not.exist;

            // Get listCollections filtering out the name
            const cursor = db1.listCollections({ name: /test.collection/ }, { batchSize: 1 });
            cursor.toArray(function (err, names) {
              expect(err).to.not.exist;
              test.equal(2, names.length);

              client.close(done);
            });
          });
        });
      });
    }
  });

  it('should throw if Db.collection is passed a deprecated callback argument', () => {
    const client = new MongoClient('mongodb://iLoveJavascript');
    expect(() => client.db('test').collection('test', () => {})).to.throw(
      'The callback form of this helper has been removed.'
    );
  });
});
