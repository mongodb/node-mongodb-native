import { expect } from 'chai';

import { Collection, type Db, type MongoClient, MongoServerError } from '../../../src';
import { type TestConfiguration } from '../../tools/runner/config';
import { type FailCommandFailPoint } from '../../tools/utils';
import { setupDatabase } from '../shared';

describe('Collection', function () {
  let configuration: TestConfiguration;

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

    it('should correctly retrieve listCollections', async function () {
      await db.createCollection('test_collection_names');
      const documents = await db.listCollections().toArray();
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
      await collection.insertOne({ a: 1 }, configuration.writeConcernMax());

      const documents2 = await db.listCollections().toArray();
      documents2.forEach(document => {
        if (
          document.name === configuration.db + '.test_collection_names2' ||
          document.name === 'test_collection_names2'
        ) {
          found = true;
        }
        if (
          document.name === configuration.db + '.test_collection_names' ||
          document.name === 'test_collection_names'
        ) {
          found2 = true;
        }
      });
      expect(found).to.be.true;
      expect(found2).to.be.true;
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

    it('should correctly count on non-existent collection', async function () {
      const collection = db.collection('test_multiple_insert_2');
      const count = await collection.countDocuments();
      expect(count).to.equal(0);
    });

    it('should correctly execute insert update delete safe mode', async function () {
      const collection = await db.createCollection(
        'test_should_execute_insert_update_delete_safe_mode'
      );

      expect(collection.collectionName).to.equal(
        'test_should_execute_insert_update_delete_safe_mode'
      );

      const document = await collection.insertOne({ i: 1 }, configuration.writeConcernMax());
      expect(document).property('insertedId').to.exist;
      expect(document.insertedId.toHexString()).to.have.lengthOf(24);

      // Update the record
      const document2 = await collection.updateOne(
        { i: 1 },
        { $set: { i: 2 } },
        configuration.writeConcernMax()
      );
      expect(document2).property('modifiedCount').to.equal(1);

      // Remove safely
      await collection.deleteOne({}, configuration.writeConcernMax());
    });

    it('should correctly read back document with null', async function () {
      const collection = await db.createCollection('shouldCorrectlyReadBackDocumentWithNull', {});
      // Insert a document with a date
      await collection.insertOne({ test: null }, configuration.writeConcernMax());
      const result = await collection.findOne();
      expect(result.test).to.not.exist;
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

    for (const test of selectorTests) {
      it(test.title, async function () {
        const response = await db
          .collection(test.collectionName)
          .updateOne(test.filterObject, test.updateObject);
        expect(response).property('matchedCount').to.equal(0);
      });
    }

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

    for (const test of updateTests) {
      it(test.title, async function () {
        const collection = await db.createCollection<{ _id: number }>(test.collectionName);
        const response = await collection.updateOne(
          test.filterObject,
          test.updateObject,
          configuration.writeConcernMax()
        );

        expect(response).property('matchedCount').to.equal(0);
      });
    }

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

    for (const test of listCollectionsTests) {
      it(test.title, async function () {
        const collection = await db.createCollection(test.collectionName);
        expect(collection.collectionName).to.equal(test.collectionName);
        const documents = await db.listCollections().toArray();
        let found = false;
        documents.forEach(x => {
          if (x.name === test.collectionName) found = true;
        });

        expect(found).to.be.true;
      });
    }

    it('should filter correctly with index during list', async function () {
      const testCollection = 'collection_124';
      // Create a collection
      await db.createCollection(testCollection);

      // Index name happens to be the same as collection name
      const indexName = await db.createIndex(testCollection, 'collection_124');

      expect(indexName).to.equal('collection_124_1');

      const documents = await db.listCollections().toArray();
      expect(documents.length > 1).to.be.true;
      let found = false;

      documents.forEach(document => {
        if (document.name === testCollection) found = true;
      });

      expect(found).to.be.true;
    });

    it('should correctly list multipleCollections', async function () {
      const emptyDb = client.db('listCollectionsDb');
      await emptyDb.createCollection('test1');
      await emptyDb.createCollection('test2');
      await emptyDb.createCollection('test3');

      const collections = await emptyDb.listCollections().toArray();
      const names = [];
      for (let i = 0; i < collections.length; i++) {
        names.push(collections[i].name);
      }
      expect(names).to.include('test1');
      expect(names).to.include('test2');
      expect(names).to.include('test3');
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

    it('should correctly create TTL collection with index using createIndex', async function () {
      const collection = await db.createCollection(
        'shouldCorrectlyCreateTTLCollectionWithIndexCreateIndex'
      );
      await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 1 });

      // Insert a document with a date
      await collection.insertOne({ a: 1, createdAt: new Date() }, configuration.writeConcernMax());

      const indexes = await collection.indexInformation({ full: true });

      for (let i = 0; i < indexes.length; i++) {
        if (indexes[i].name === 'createdAt_1') {
          expect(indexes[i].expireAfterSeconds).to.equal(1);
          break;
        }
      }
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
    let collection: Collection<{ a: string }>;

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

  describe('countDocuments()', function () {
    let client: MongoClient;
    let collection: Collection<{ test: string }>;
    let aggCommands;

    beforeEach(async function () {
      client = this.configuration.newClient({ monitorCommands: true });
      collection = client.db('test').collection('countDocuments');
      await collection.insertMany(
        Array.from({ length: 100 }, (_, i) => ({ test: i < 50 ? 'a' : 'b' }))
      );
      aggCommands = [];
      client.on('commandStarted', ev => {
        if (ev.commandName === 'aggregate') aggCommands.push(ev.command);
      });
    });

    afterEach(async function () {
      await collection.deleteMany({});
      await client.close();
    });

    it('returns the correct count as a js number', async () => {
      const count = await collection.countDocuments({});
      expect(count).to.be.a('number').that.equals(100);

      const countDefault = await collection.countDocuments();
      expect(countDefault).to.be.a('number').that.equals(100);

      const countA = await collection.countDocuments({ test: 'a' });
      expect(countA).to.be.a('number').that.equals(50);

      const countC = await collection.countDocuments({ test: 'c' });
      expect(countC).to.be.a('number').that.equals(0);
    });

    it('does not mutate options', async () => {
      const options = Object.freeze(Object.create(null));
      const count = await collection.countDocuments({}, options);
      expect(count).to.be.a('number').that.equals(100);
      expect(options).to.deep.equal({});
    });

    context('when a filter is applied', () => {
      it('adds a $match pipeline', async () => {
        await collection.countDocuments({ test: 'a' });
        expect(aggCommands[0])
          .to.have.property('pipeline')
          .that.deep.equals([{ $match: { test: 'a' } }, { $group: { _id: 1, n: { $sum: 1 } } }]);
      });
    });

    describe('when aggregation fails', { requires: { mongodb: '>=4.4' } }, () => {
      beforeEach(async function () {
        await client
          .db()
          .admin()
          .command({
            configureFailPoint: 'failCommand',
            mode: 'alwaysOn',
            data: { failCommands: ['aggregate'], errorCode: 1 }
          } as FailCommandFailPoint);
      });

      afterEach(async function () {
        await client
          .db()
          .admin()
          .command({
            configureFailPoint: 'failCommand',
            mode: 'off',
            data: { failCommands: ['aggregate'] }
          } as FailCommandFailPoint);
      });

      it('rejects the countDocuments API', async () => {
        const error = await collection.countDocuments().catch(error => error);
        expect(error).to.be.instanceOf(MongoServerError);
      });
    });

    context('when provided with options', () => {
      it('adds $skip stage to the pipeline', async () => {
        await collection.countDocuments({}, { skip: 1 });
        expect(aggCommands[0])
          .to.have.property('pipeline')
          .that.deep.equals([{ $match: {} }, { $skip: 1 }, { $group: { _id: 1, n: { $sum: 1 } } }]);
      });

      it('adds $limit stage to the pipeline', async () => {
        await collection.countDocuments({}, { limit: 1 });
        expect(aggCommands[0])
          .to.have.property('pipeline')
          .that.deep.equals([
            { $match: {} },
            { $limit: 1 },
            { $group: { _id: 1, n: { $sum: 1 } } }
          ]);
      });

      it('adds $skip and $limit stages to the pipeline', async () => {
        await collection.countDocuments({}, { skip: 1, limit: 1 });
        expect(aggCommands[0])
          .to.have.property('pipeline')
          .that.deep.equals([
            { $match: {} },
            { $skip: 1 },
            { $limit: 1 },
            { $group: { _id: 1, n: { $sum: 1 } } }
          ]);
      });
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
      await client.close();
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

    it('should succeed with retryWrite=true when using updateMany', {
      metadata,
      test: function () {
        return collection.updateMany({ name: 'foobar' }, { $set: { name: 'fizzbuzz' } });
      }
    });

    it('should succeed with retryWrite=true when using update with multi=true', {
      metadata,
      test: function () {
        return collection.updateOne(
          { name: 'foobar' },
          { $set: { name: 'fizzbuzz' } },
          { multi: true }
        );
      }
    });

    it('should succeed with retryWrite=true when using remove without option single', {
      metadata,
      test: function () {
        return collection.deleteOne({ name: 'foobar' });
      }
    });

    it('should succeed with retryWrite=true when using deleteMany', {
      metadata,
      test: function () {
        return collection.deleteMany({ name: 'foobar' });
      }
    });
  });

  it('should allow an empty replacement document for findOneAndReplace', {
    metadata: { requires: { mongodb: '>=3.0.0' } },
    test: async function () {
      const configuration = this.configuration;
      const client = configuration.newClient({ w: 1 });

      const db = client.db(configuration.db);
      const collection = db.collection('find_one_and_replace');

      await collection.insertOne({ a: 1 });
      await collection.findOneAndReplace({ a: 1 }, {});
      await client.close();
    }
  });

  it('should correctly update with pipeline', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), {
      maxPoolSize: 1
    });

    const db = client.db(configuration.db);

    const collection = await db.createCollection('test_should_correctly_do_update_with_pipeline');
    const result = await collection.updateOne(
      {},
      [{ $set: { a: 1 } }, { $set: { b: 1 } }, { $set: { d: 1 } }],
      { writeConcern: { w: 'majority' } }
    );
    expect(result).property('matchedCount').to.equal(0);
    await client.close();
  });
});
