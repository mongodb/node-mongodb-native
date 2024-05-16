import { expect } from 'chai';

import { Collection, type Db, isHello, type MongoClient, MongoServerError } from '../../mongodb';
import * as mock from '../../tools/mongodb-mock/index';
import { setupDatabase } from '../shared';

describe('Collection', function () {
  let configuration;

  before(function () {
    configuration = this.configuration;
    return setupDatabase(configuration, ['listCollectionsDb', 'listCollectionsDb2', 'test_db']);
  });

  describe('standard collection tests', function () {
    let client: MongoClient;
    let db: Db;

    beforeEach(function () {
      client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });
      db = client.db(configuration.db);
    });

    afterEach(async function () {
      db = undefined;
      await client.close();
    });

    it('should be able to access collections by name from db.collections() array after creating two collections', async function () {
      // Create two collections
      await db.createCollection('test.spiderman');
      await db.createCollection('test.mario');
      const collections = await db.collections();
      const nameArray = collections.map(col => col.collectionName);
      expect(nameArray).to.include('test.spiderman');
      expect(nameArray).to.include('test.mario');
      expect(collections[0]).to.be.instanceOf(Collection);
      expect(collections[1]).to.be.instanceOf(Collection);
    });

    it('should correctly retrieve listCollections', function (done) {
      db.createCollection('test_collection_names', err => {
        expect(err).to.not.exist;
        db.listCollections().toArray((err, documents) => {
          let found = false;
          let found2 = false;
          documents.forEach(document => {
            if (
              document.name === configuration.db + '.test_collection_names' ||
              document.name === 'test_collection_names'
            )
              found = true;
          });
          expect(found).to.be.true;
          // Insert a document in an non-existing collection should create the collection
          const collection = db.collection('test_collection_names2');
          collection.insertOne({ a: 1 }, configuration.writeConcernMax(), err => {
            expect(err).to.not.exist;
            db.listCollections().toArray((err, documents) => {
              documents.forEach(document => {
                if (
                  document.name === configuration.db + '.test_collection_names2' ||
                  document.name === 'test_collection_names2'
                )
                  found = true;
                if (
                  document.name === configuration.db + '.test_collection_names' ||
                  document.name === 'test_collection_names'
                )
                  found2 = true;
              });
              expect(found).to.be.true;
              expect(found2).to.be.true;
              // Let's close the db
              done();
            });
          });
        });
      });
    });

    it('should permit insert of dot and dollar keys if requested', function () {
      const collection = db.collection('test_invalid_key_names');
      return Promise.all([
        collection.insertOne({ hel$lo: 0 }, { checkKeys: false }),
        collection.insertOne({ hello: { $hello: 0 } }, { checkKeys: false }), // embedded document can have a leading dollar
        collection.insertOne({ 'hel.lo': 0 }, { checkKeys: false }),
        collection.drop()
      ]);
    });

    it('fails on server due to invalid namespace', async function () {
      const error = await db
        .collection('a\x00b')
        .insertOne({ a: 1 })
        .catch(error => error);
      expect(error).to.be.instanceOf(MongoServerError);
      expect(error).to.have.property('code', 73);
      expect(error).to.have.property('codeName', 'InvalidNamespace');
    });

    it('should correctly count on non-existent collection', function (done) {
      const collection = db.collection('test_multiple_insert_2');
      collection.countDocuments((err, count) => {
        expect(count).to.equal(0);
        // Let's close the db
        done();
      });
    });

    it('should correctly execute insert update delete safe mode', function (done) {
      db.createCollection(
        'test_should_execute_insert_update_delete_safe_mode',
        (err, collection) => {
          expect(collection.collectionName).to.equal(
            'test_should_execute_insert_update_delete_safe_mode'
          );
          collection.insertOne({ i: 1 }, configuration.writeConcernMax(), (err, r) => {
            expect(err).to.not.exist;
            expect(r).property('insertedId').to.exist;
            expect(r.insertedId.toHexString()).to.have.lengthOf(24);
            // Update the record
            collection.updateOne(
              { i: 1 },
              { $set: { i: 2 } },
              configuration.writeConcernMax(),
              (err, r) => {
                expect(err).to.not.exist;
                expect(r).property('modifiedCount').to.equal(1);
                // Remove safely
                collection.deleteOne({}, configuration.writeConcernMax(), err => {
                  expect(err).to.not.exist;
                  done();
                });
              }
            );
          });
        }
      );
    });

    it('should correctly read back document with null', function (done) {
      db.createCollection('shouldCorrectlyReadBackDocumentWithNull', {}, (err, collection) => {
        // Insert a document with a date
        collection.insertOne({ test: null }, configuration.writeConcernMax(), err => {
          expect(err).to.not.exist;
          collection.findOne((err, result) => {
            expect(err).to.not.exist;
            expect(result.test).to.not.exist;
            done();
          });
        });
      });
    });

    it('should throw error due to illegal update', async function () {
      const coll = await db.createCollection('shouldThrowErrorDueToIllegalUpdate', {});
      const filterError = await coll.updateOne(null, {}).catch(error => error);
      expect(filterError.message).to.match(/Selector must be a valid JavaScript object/);
      const updateError = await coll.updateOne({}, null).catch(error => error);
      expect(updateError.message).to.match(/Document must be a valid JavaScript object/);
    });
    const selectorTests = [
      {
        title: 'should correctly execute update with . field in selector',
        collectionName: 'executeUpdateWithElemMatch',
        filterObject: { 'item.i': 1 },
        updateObject: { $set: { a: 1 } }
      },
      {
        title: 'should correctly execute update with elemMatch field in selector',
        collectionName: 'executeUpdateWithElemMatch',
        filterObject: { item: { $elemMatch: { name: 'my_name' } } },
        updateObject: { $set: { a: 1 } }
      }
    ];
    selectorTests.forEach(test => {
      it(test.title, function (done) {
        db.collection(test.collectionName).updateOne(
          test.filterObject,
          test.updateObject,
          (err, r) => {
            expect(err).to.not.exist;
            expect(r).property('matchedCount').to.equal(0);
            done();
          }
        );
      });
    });
    const updateTests = [
      {
        title: 'should correctly update with no docs',
        collectionName: 'test_should_correctly_do_update_with_no_docs',
        filterObject: { _id: 1 },
        updateObject: { $set: { _id: 1, a: 1 } }
      },
      {
        title: 'should correctly update with pipeline',
        collectionName: 'test_should_correctly_do_update_with_atomic_modifier',
        filterObject: {},
        updateObject: { $set: { a: 1, b: 1, d: 1 } }
      }
    ];
    updateTests.forEach(test => {
      it(test.title, function (done) {
        db.createCollection(test.collectionName, (err, collection) => {
          expect(err).to.not.exist;
          collection.updateOne(
            test.filterObject,
            test.updateObject,
            configuration.writeConcernMax(),
            (err, r) => {
              expect(err).to.not.exist;
              expect(r).property('matchedCount').to.equal(0);
              done();
            }
          );
        });
      });
    });
    const listCollectionsTests = [
      {
        title: 'should filter correctly during list',
        collectionName: 'integration_tests_collection_123'
      },
      {
        title: 'should correctly list back collection names containing .',
        collectionName: 'test.game'
      }
    ];
    listCollectionsTests.forEach(test => {
      it(test.title, function (done) {
        db.createCollection(test.collectionName, (err, collection) => {
          expect(err).to.not.exist;
          expect(collection.collectionName).to.equal(test.collectionName);
          db.listCollections().toArray((err, documents) => {
            expect(err).to.not.exist;
            let found = false;
            documents.forEach(x => {
              if (x.name === test.collectionName) found = true;
            });
            expect(found).to.be.true;
            done();
          });
        });
      });
    });

    it('should filter correctly with index during list', function (done) {
      const testCollection = 'collection_124';
      // Create a collection
      db.createCollection(testCollection, err => {
        expect(err).to.not.exist;
        // Index name happens to be the same as collection name
        db.createIndex(
          testCollection,
          'collection_124',
          { writeConcern: { w: 1 } },
          (err, indexName) => {
            expect(err).to.not.exist;
            expect(indexName).to.equal('collection_124_1');
            db.listCollections().toArray((err, documents) => {
              expect(err).to.not.exist;
              expect(documents.length > 1).to.be.true;
              let found = false;
              documents.forEach(document => {
                if (document.name === testCollection) found = true;
              });
              expect(found).to.be.true;
              done();
            });
          }
        );
      });
    });

    it('should correctly list multipleCollections', function (done) {
      const emptyDb = client.db('listCollectionsDb');
      emptyDb.createCollection('test1', err => {
        expect(err).to.not.exist;
        emptyDb.createCollection('test2', err => {
          expect(err).to.not.exist;
          emptyDb.createCollection('test3', err => {
            expect(err).to.not.exist;
            emptyDb.listCollections().toArray((err, collections) => {
              expect(err).to.not.exist;
              const names = [];
              for (let i = 0; i < collections.length; i++) {
                names.push(collections[i].name);
              }
              expect(names).to.include('test1');
              expect(names).to.include('test2');
              expect(names).to.include('test3');
              done();
            });
          });
        });
      });
    });

    it('should create and access collection given the name and namespace as specified, including dots', async function () {
      const emptyDb = client.db('listCollectionsDb2');
      await emptyDb.createCollection('test.test');
      const collections = await emptyDb.collections();
      const collection_rename = collections.map(collection => {
        return {
          collectionName: collection.collectionName,
          namespace: collection.namespace
        };
      });
      expect(collection_rename).to.deep.include({
        collectionName: 'test.test',
        namespace: 'listCollectionsDb2.test.test'
      });
    });

    it('should provide access to the database name', function () {
      return client
        .db('test_db')
        .createCollection('test1')
        .then(coll => {
          expect(coll.dbName).to.equal('test_db');
        });
    });

    it('should correctly create TTL collection with index using createIndex', function (done) {
      db.createCollection(
        'shouldCorrectlyCreateTTLCollectionWithIndexCreateIndex',
        (err, collection) => {
          const errorCallBack = err => {
            expect(err).to.not.exist;
            // Insert a document with a date
            collection.insertOne(
              { a: 1, createdAt: new Date() },
              configuration.writeConcernMax(),
              err => {
                expect(err).to.not.exist;
                collection.indexInformation({ full: true }, (err, indexes) => {
                  expect(err).to.not.exist;
                  for (let i = 0; i < indexes.length; i++) {
                    if (indexes[i].name === 'createdAt_1') {
                      expect(indexes[i].expireAfterSeconds).to.equal(1);
                      break;
                    }
                  }
                  done();
                });
              }
            );
          };
          collection.createIndex(
            { createdAt: 1 },
            { expireAfterSeconds: 1, writeConcern: { w: 1 } },
            errorCallBack
          );
        }
      );
    });

    it('should support createIndex with no options', async function () {
      const collection = await db.createCollection('create_index_without_options', {});
      await collection.createIndex({ createdAt: 1 });
      expect(await collection.indexExists('createdAt_1')).to.be.true;
    });
  });

  describe('#estimatedDocumentCount', function () {
    let client: MongoClient;
    let db: Db;
    let collection: Collection<{
      a: string;
    }>;

    beforeEach(async function () {
      client = configuration.newClient({ w: 1 });
      db = client.db(configuration.db);
      collection = db.collection('test_coll');
      await collection.insertOne({ a: 'c' });
    });

    afterEach(async function () {
      await collection.drop();
      await client.close();
    });

    it('returns the total documents in the collection', async function () {
      const result = await collection.estimatedDocumentCount();
      expect(result).to.equal(1);
    });
  });

  describe('#countDocuments', function () {
    let client;
    let db;
    let collection;

    beforeEach(async function () {
      client = configuration.newClient({ w: 1 });
      await client.connect();
      db = client.db(configuration.db);
      collection = db.collection('test_coll');
      await collection.insertOne({ a: 'c' });
    });

    afterEach(async function () {
      await collection.drop();
      await client.close();
    });

    describe('when passing a non-matching query', function () {
      it('returns 0', async function () {
        const result = await collection.countDocuments({ a: 'b' });
        expect(result).to.equal(0);
      });
    });

    it('returns a promise', function () {
      const docsPromise = collection.countDocuments();
      expect(docsPromise).to.exist.and.to.be.an.instanceof(Promise);
      return docsPromise.then(result => expect(result).to.equal(1));
    });
  });

  describe('countDocuments with mock server', function () {
    let server;

    beforeEach(() => {
      return mock.createServer().then(s => {
        server = s;
      });
    });

    afterEach(() => mock.cleanup());
    function testCountDocMock(testConfiguration, config, done) {
      const client = testConfiguration.newClient(`mongodb://${server.uri()}/test`, {
        serverApi: null // TODO(NODE-3807): remove resetting serverApi when the usage of mongodb mock server is removed
      });
      const close = e => client.close(() => done(e));
      server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.aggregate) {
          try {
            config.replyHandler(doc);
            request.reply(config.reply);
          } catch (e) {
            close(e);
          }
        }
        if (isHello(doc)) {
          request.reply(Object.assign({}, mock.HELLO));
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });
      const db = client.db('test');
      const collection = db.collection('countDoc_mock');
      config.executeCountDocuments(collection, close);
    }

    it('countDocuments should return appropriate error if aggregation fails with callback given', function (done) {
      const replyHandler = () => null;
      const executeCountDocuments = (collection, close) => {
        collection.countDocuments(err => {
          expect(err).to.exist;
          expect(err.errmsg).to.equal('aggregation error - callback');
          close();
        });
      };
      testCountDocMock(
        configuration,
        {
          replyHandler,
          executeCountDocuments,
          reply: { ok: 0, errmsg: 'aggregation error - callback' }
        },
        done
      );
    });

    it('countDocuments should error if aggregation fails using Promises', function (done) {
      const replyHandler = () => null;
      const executeCountDocuments = (collection, close) => {
        collection
          .countDocuments()
          .then(() => expect(false).to.equal(true)) // should never get here; error should be caught
          .catch(e => {
            expect(e.errmsg).to.equal('aggregation error - promise');
            close();
          });
      };
      testCountDocMock(
        configuration,
        {
          replyHandler,
          executeCountDocuments,
          reply: { ok: 0, errmsg: 'aggregation error - promise' }
        },
        done
      );
    });

    it('countDocuments pipeline should be correct with skip and limit applied', function (done) {
      const replyHandler = doc => {
        expect(doc.pipeline).to.deep.include({ $skip: 1 });
        expect(doc.pipeline).to.deep.include({ $limit: 1 });
      };
      const executeCountDocuments = (collection, close) => {
        collection.countDocuments({}, { limit: 1, skip: 1 }, err => {
          expect(err).to.not.exist;
          close();
        });
      };
      testCountDocMock(
        configuration,
        {
          replyHandler,
          executeCountDocuments,
          reply: { ok: 1 }
        },
        done
      );
    });
  });
  async function testCapped(testConfiguration, config) {
    const configuration = config.config;
    const client = testConfiguration.newClient({ w: 1 });
    const db = client.db(configuration.db);
    try {
      const collection = await db.createCollection(config.collName, config.opts);
      const capped = await collection.isCapped();
      expect(capped).to.be.false;
    } finally {
      client.close();
    }
  }

  it('isCapped should return false for uncapped collections', async function () {
    await testCapped(configuration, {
      config: configuration,
      collName: 'uncapped',
      opts: { capped: false }
    });
  });

  it('isCapped should return false for collections instantiated without specifying capped', async function () {
    await testCapped(configuration, { config: configuration, collName: 'uncapped2', opts: {} });
  });

  describe('Retryable Writes on bulk ops', function () {
    let client;
    let db;
    let collection;
    const metadata = { requires: { topology: ['replicaset'] as const, mongodb: '>=3.6.0' } };

    beforeEach(async function () {
      const utilClient = this.configuration.newClient({}, { retryWrites: true });
      const utilDb = utilClient.db('test_retry_writes');
      const utilCollection = utilDb.collection('tests');
      await utilDb.dropDatabase();
      await utilCollection.insertOne({ name: 'foobar' });
      await utilClient.close();
      client = this.configuration.newClient({}, { retryWrites: true });
      db = client.db('test_retry_writes');
      collection = db.collection('tests');
    });

    afterEach(async () => {
      await client.close();
    });

    it('should succeed with retryWrite=true when using updateMany', metadata, function () {
      return collection.updateMany({ name: 'foobar' }, { $set: { name: 'fizzbuzz' } });
    });

    it(
      'should succeed with retryWrite=true when using update with multi=true',
      metadata,
      function () {
        return collection.updateOne(
          { name: 'foobar' },
          { $set: { name: 'fizzbuzz' } },
          { multi: true }
        );
      }
    );

    it(
      'should succeed with retryWrite=true when using remove without option single',
      metadata,
      function () {
        return collection.deleteOne({ name: 'foobar' });
      }
    );

    it('should succeed with retryWrite=true when using deleteMany', metadata, function () {
      return collection.deleteMany({ name: 'foobar' });
    });
  });

  it(
    'should allow an empty replacement document for findOneAndReplace',
    { requires: { mongodb: '>=3.0.0' } },
    function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient({ w: 1 });
      let finish = err => {
        finish = () => null;
        client.close(_err => done(err || _err));
      };
      const db = client.db(configuration.db);
      const collection = db.collection('find_one_and_replace');
      collection.insertOne({ a: 1 }, err => {
        expect(err).to.not.exist;
        try {
          collection.findOneAndReplace({ a: 1 }, {}, finish);
        } catch (e) {
          finish(e);
        }
      });
    }
  );

  it(
    'should correctly update with pipeline',
    {
      requires: { mongodb: '>=4.2.0' }
    },
    function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient(configuration.writeConcernMax(), {
        maxPoolSize: 1
      });
      const db = client.db(configuration.db);
      db.createCollection('test_should_correctly_do_update_with_pipeline', (err, collection) => {
        collection.updateOne(
          {},
          [{ $set: { a: 1 } }, { $set: { b: 1 } }, { $set: { d: 1 } }],
          { writeConcern: { w: 'majority' } },
          (err, r) => {
            expect(err).to.not.exist;
            expect(r).property('matchedCount').to.equal(0);
            client.close(done);
          }
        );
      });
    }
  );
});
