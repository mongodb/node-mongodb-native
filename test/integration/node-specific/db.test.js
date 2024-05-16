'use strict';
const { setupDatabase, assert: test } = require(`../shared`);
const { expect } = require('chai');
const { MongoClient, MongoInvalidArgumentError, MongoServerError } = require('../../mongodb');

describe('Db', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  describe('when given illegal db name', function () {
    let client;
    let db;

    beforeEach(function () {
      client = this.configuration.newClient();
    });

    afterEach(async function () {
      db = undefined;
      await client.close();
    });

    describe('of type string, containing no dot characters', function () {
      it('should throw error on server only', async function () {
        db = client.db('a\x00b');
        const error = await db.createCollection('spider').catch(error => error);
        expect(error).to.be.instanceOf(MongoServerError);
        expect(error).to.have.property('code', 73);
        expect(error).to.have.property('codeName', 'InvalidNamespace');
      });
    });

    describe('of type string, containing a dot character', function () {
      it('should throw MongoInvalidArgumentError', function () {
        expect(() => client.db('a.b')).to.throw(MongoInvalidArgumentError);
      });
    });

    describe('of type non-string type', function () {
      it('should not throw client-side', function () {
        expect(() => client.db(5)).to.not.throw();
      });
    });
  });

  it(
    'shouldCorrectlyHandleFailedConnection',
    {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },
    function (done) {
      var configuration = this.configuration;
      var fs_client = configuration.newClient('mongodb://127.0.0.1:25117/test', {
        serverSelectionTimeoutMS: 10
      });
      fs_client.connect(function (err) {
        test.ok(err != null);
        done();
      });
    }
  );

  it(
    'shouldCorrectlyGetErrorDroppingNonExistingDb',
    {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },
    function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        var _db = client.db('nonexistingdb');
        _db.dropDatabase(function (err, result) {
          expect(err).to.not.exist;
          test.equal(true, result);
          client.close(done);
        });
      });
    }
  );
  it.skip('shouldCorrectlyThrowWhenTryingToReOpenConnection', {
    metadata: {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },
    test: function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(err => {
        expect(err).to.not.exist;
        try {
          client.connect(function () {});
          test.ok(false);
        } catch (err) {
          client.close(done);
        }
      });
    }
  });

  it(
    'should not cut collection name when it is the same as the database',
    {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },
    function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        var db1 = client.db('node972');
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
  );

  it(
    'shouldCorrectlyUseCursorWithListCollectionsCommand',
    {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },
    function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        // Get a db we that does not have any collections
        var db1 = client.db('shouldCorrectlyUseCursorWithListCollectionsCommand');
        // Create a collection
        db1.collection('test').insertOne({ a: 1 }, function (err) {
          expect(err).to.not.exist;
          // Create a collection
          db1.collection('test1').insertOne({ a: 1 }, function () {
            expect(err).to.not.exist;
            // Get listCollections filtering out the name
            var cursor = db1.listCollections({ name: 'test1' });
            cursor.toArray(function (err, names) {
              expect(err).to.not.exist;
              test.equal(1, names.length);
              client.close(done);
            });
          });
        });
      });
    }
  );

  it(
    'shouldCorrectlyUseCursorWithListCollectionsCommandAndBatchSize',
    {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },
    function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        // Get a db we that does not have any collections
        var db1 = client.db('shouldCorrectlyUseCursorWithListCollectionsCommandAndBatchSize');
        // Create a collection
        db1.collection('test').insertOne({ a: 1 }, function (err) {
          expect(err).to.not.exist;
          // Create a collection
          db1.collection('test1').insertOne({ a: 1 }, function () {
            expect(err).to.not.exist;
            // Get listCollections filtering out the name
            var cursor = db1.listCollections({ name: 'test' }, { batchSize: 1 });
            cursor.toArray(function (err, names) {
              expect(err).to.not.exist;
              test.equal(1, names.length);
              client.close(done);
            });
          });
        });
      });
    }
  );

  it(
    'should correctly list collection names with . in the middle',
    {
      requires: { topology: ['single', 'replicaset', 'sharded'] }
    },
    function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        // Get a db we that does not have any collections
        var db1 = client.db('shouldCorrectlyListCollectionsWithDotsOnThem');
        // Create a collection
        db1.collection('test.collection1').insertOne({ a: 1 }, function (err) {
          expect(err).to.not.exist;
          // Create a collection
          db1.collection('test.collection2').insertOne({ a: 1 }, function () {
            expect(err).to.not.exist;
            // Get listCollections filtering out the name
            var cursor = db1.listCollections({ name: /test.collection/ });
            cursor.toArray(function (err, names) {
              expect(err).to.not.exist;
              test.equal(2, names.length);
              // Get listCollections filtering out the name
              var cursor = db1.listCollections({ name: 'test.collection1' }, {});
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
  );

  it(
    'should correctly list collection names with batchSize 1 for 2.8 or higher',
    {
      requires: {
        topology: ['single', 'replicaset', 'sharded'],
        mongodb: '>= 2.8.0'
      }
    },
    function (done) {
      var configuration = this.configuration;
      var client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
      client.connect(function (err, client) {
        expect(err).to.not.exist;
        // Get a db we that does not have any collections
        var db1 = client.db('shouldCorrectlyListCollectionsWithDotsOnThemFor28');
        // Create a collection
        db1.collection('test.collection1').insertOne({ a: 1 }, function (err) {
          expect(err).to.not.exist;
          // Create a collection
          db1.collection('test.collection2').insertOne({ a: 1 }, function () {
            expect(err).to.not.exist;
            // Get listCollections filtering out the name
            var cursor = db1.listCollections({ name: /test.collection/ }, { batchSize: 1 });
            cursor.toArray(function (err, names) {
              expect(err).to.not.exist;
              test.equal(2, names.length);
              client.close(done);
            });
          });
        });
      });
    }
  );

  it('should throw if Db.collection is passed a deprecated callback argument', () => {
    const client = new MongoClient('mongodb://iLoveJavascript');
    expect(() => client.db('test').collection('test', () => {})).to.throw(
      'The callback form of this helper has been removed.'
    );
  });
});
