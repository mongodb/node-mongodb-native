import { expect } from 'chai';

import {
  type Collection,
  type CommandStartedEvent,
  type CommandSucceededEvent,
  type Db,
  type MongoClient,
  MongoServerError
} from '../mongodb';
import { type FailCommandFailPoint } from '../tools/utils';
import { assert as test, filterForCommands, setupDatabase } from './shared';

describe('Indexes', function () {
  let client: MongoClient;
  let db: Db;
  let collection: Collection;

  before(function () {
    return setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = this.configuration.newClient({}, { monitorCommands: true });
    db = client.db('indexes_test_db');
    collection = await db.createCollection('indexes_test_coll', { w: 1 });
  });

  afterEach(async function () {
    await db.dropDatabase({ writeConcern: { w: 1 } }).catch(() => null);
    await client.close();
  });

  it('Should correctly execute createIndex', async function () {
    // Create an index
    const response = await db.createIndex('promiseCollectionCollections1', { a: 1 }, { w: 1 });
    expect(response).to.exist;
  });

  it('createIndex() throws an error error when createIndex fails', async function () {
    await client.db('admin').command(<FailCommandFailPoint>{
      configureFailPoint: 'failCommand',
      mode: { times: 1 },
      data: {
        failCommands: ['createIndexes'],
        errorCode: 10
      }
    });
    const error = await db.createIndex('promiseCollectionCollections1', { a: 1 }).catch(e => e);
    expect(error).to.be.instanceOf(MongoServerError);
  });

  it('shouldCorrectlyExtractIndexInformation', async function () {
    const collection = await db.createCollection('test_index_information');
    await collection.insertMany([{ a: 1 }], this.configuration.writeConcernMax());

    // Create an index on the collection
    const indexName = await db.createIndex(
      collection.collectionName,
      'a',
      this.configuration.writeConcernMax()
    );
    expect(indexName).to.equal('a_1');

    // Let's fetch the index information
    const collectionInfo = await db.indexInformation(collection.collectionName);
    test.ok(collectionInfo['_id_'] != null);
    test.equal('_id', collectionInfo['_id_'][0][0]);
    test.ok(collectionInfo['a_1'] != null);
    test.deepEqual([['a', 1]], collectionInfo['a_1']);

    const collectionInfo2 = await db.indexInformation(collection.collectionName);
    const count1 = Object.keys(collectionInfo).length,
      count2 = Object.keys(collectionInfo2).length;

    // Tests
    test.ok(count2 >= count1);
    test.ok(collectionInfo2['_id_'] != null);
    test.equal('_id', collectionInfo2['_id_'][0][0]);
    test.ok(collectionInfo2['a_1'] != null);
    test.deepEqual([['a', 1]], collectionInfo2['a_1']);
    test.ok(collectionInfo[indexName] != null);
    test.deepEqual([['a', 1]], collectionInfo[indexName]);
  });

  it('shouldCorrectlyHandleMultipleColumnIndexes', async function () {
    await collection.insertOne({ a: 1 });

    const indexName = await db.createIndex(
      collection.collectionName,
      [
        ['a', -1],
        ['b', 1],
        ['c', -1]
      ],
      this.configuration.writeConcernMax()
    );
    test.equal('a_-1_b_1_c_-1', indexName);
    // Let's fetch the index information
    const collectionInfo = await db.indexInformation(collection.collectionName);
    const count1 = Object.keys(collectionInfo).length;

    // Test
    test.equal(2, count1);
    test.ok(collectionInfo[indexName] != null);
    test.deepEqual(
      [
        ['a', -1],
        ['b', 1],
        ['c', -1]
      ],
      collectionInfo[indexName]
    );
  });

  describe('Collection.indexes()', function () {
    beforeEach(() => collection.createIndex({ age: 1 }));

    afterEach(() => collection.dropIndexes());

    context('when `full` is not provided', () => {
      it('returns an array of indexes', async function () {
        const indexes = await collection.indexes();
        expect(indexes).to.be.a('array');
      });
    });

    context('when `full` is set to `true`', () => {
      it('returns an array of indexes', async function () {
        const indexes = await collection.indexes({ full: true });
        expect(indexes).to.be.a('array');
      });
    });

    context('when `full` is set to `false`', () => {
      it('returns a document mapping key to index definition', async function () {
        const indexes = await collection.indexes({ full: false });
        expect(indexes).to.be.a('object');
        expect(indexes)
          .to.have.property('age_1')
          .to.deep.equal([['age', 1]]);
      });
    });
  });

  describe('Collection.indexInformation()', function () {
    beforeEach(() => collection.createIndex({ age: 1 }));

    afterEach(() => collection.dropIndexes());

    context('when `full` is not provided', () => {
      it('defaults to `false` and returns a document', async function () {
        const indexes = await collection.indexInformation();
        expect(indexes).to.be.a('object');
        expect(indexes)
          .to.have.property('age_1')
          .to.deep.equal([['age', 1]]);
      });
    });

    context('when `full` is set to `true`', () => {
      it('returns an array of indexes', async function () {
        const indexes = await collection.indexInformation({ full: true });
        expect(indexes).to.be.a('array');
      });
    });

    context('when `full` is set to `false`', () => {
      it('returns a document mapping key to index definition', async function () {
        const indexes = await collection.indexInformation({ full: false });
        expect(indexes).to.be.a('object');
        expect(indexes)
          .to.have.property('age_1')
          .to.deep.equal([['age', 1]]);
      });
    });
  });

  describe('Collection.createIndex()', function () {
    const started: CommandStartedEvent[] = [];

    beforeEach(() => {
      started.length = 0;
      client.on('commandStarted', filterForCommands('createIndexes', started));
    });

    context('when version is not specified as an option', function () {
      it('does not attach `v` to the command', async () => {
        await collection.createIndex({ age: 1 });
        const { command } = started[0];
        expect(command).to.exist;
        expect(command.indexes[0]).not.to.have.property('v');
      });
    });

    context('when version is specified as an option', function () {
      it('attaches `v` to the command with the value of `version`', async () => {
        await collection.createIndex({ age: 1 }, { version: 1 });
        const { command } = started[0];
        expect(command).to.exist;
        expect(command.indexes[0]).to.have.property('v', 1);
      });
    });
  });

  describe('Collection.createIndexes()', function () {
    const started: CommandStartedEvent[] = [];

    beforeEach(() => {
      started.length = 0;
      client.on('commandStarted', filterForCommands('createIndexes', started));
    });

    context('when version is not specified as an option', function () {
      it('does not attach `v` to the command', async () => {
        await collection.createIndexes([{ key: { age: 1 } }]);
        const { command } = started[0];
        expect(command).to.exist;
        expect(command.indexes[0]).not.to.have.property('v');
      });
    });

    context('when version is specified as an option', function () {
      it('does not attach `v` to the command', async () => {
        await collection.createIndexes([{ key: { age: 1 } }], { version: 1 });
        const { command } = started[0];
        expect(command).to.exist;
        expect(command.indexes[0]).not.to.have.property('v', 1);
      });
    });

    context('when version is provided in the index description and the options', function () {
      it('the value in the description takes precedence', async () => {
        await collection.createIndexes([{ key: { age: 1 }, version: 1 }], { version: 0 });
        const { command } = started[0];
        expect(command).to.exist;
        expect(command.indexes[0]).to.have.property('v', 1);
      });
    });

    context(
      'when version is provided in some of the index descriptions and the options',
      function () {
        it('does not specify a version from the `version` provided in the options', async () => {
          await collection.createIndexes([{ key: { age: 1 }, version: 1 }, { key: { date: 1 } }], {
            version: 0
          });
          const { command } = started[0];
          expect(command).to.exist;
          expect(command.indexes[0]).to.have.property('v', 1);
          expect(command.indexes[1]).not.to.have.property('v');
        });
      }
    );
  });

  describe('Collection.indexExists()', function () {
    beforeEach(() => collection.createIndex({ age: 1 }));

    afterEach(() => collection.dropIndexes());

    context('when provided a string index name', () => {
      it('returns true when the index exists', async () => {
        expect(await collection.indexExists('age_1')).to.be.true;
      });

      it('returns false when the index does not exist', async () => {
        expect(await collection.indexExists('name_1')).to.be.false;
      });
    });

    context('when provided an array of index names', () => {
      it('returns true when all indexes exists', async () => {
        expect(await collection.indexExists(['age_1'])).to.be.true;
      });

      it('returns false when the none of the indexes exist', async () => {
        expect(await collection.indexExists(['name_1'])).to.be.false;
      });

      it('returns false when only some of hte indexes exist', async () => {
        expect(await collection.indexExists(['name_1', 'age_1'])).to.be.false;
      });
    });
  });

  it('shouldCorrectlyHandleUniqueIndex', async function () {
    await db.createCollection('test_unique_index');
    await db.createIndex(collection.collectionName, 'hello', this.configuration.writeConcernMax());
    // Insert some docs
    await collection.insertMany(
      [{ hello: 'world' }, { hello: 'mike' }, { hello: 'world' }],
      this.configuration.writeConcernMax()
    );
    // Create a unique index and test that insert fails
    {
      const collection = await db.createCollection('test_unique_index2');
      await db.createIndex(collection.collectionName, 'hello', {
        unique: true,
        writeConcern: { w: 1 }
      });
      // Insert some docs
      const err = await collection
        .insertMany(
          [{ hello: 'world' }, { hello: 'mike' }, { hello: 'world' }],
          this.configuration.writeConcernMax()
        )
        .catch(e => e);
      expect(err).to.be.instanceOf(Error).to.have.property('code', 11000);
    }
  });

  it('shouldCorrectlyCreateSubfieldIndex', async function () {
    await collection.insertMany(
      [{ hello: { a: 4, b: 5 } }, { hello: { a: 7, b: 2 } }, { hello: { a: 4, b: 10 } }],
      this.configuration.writeConcernMax()
    );

    // Create a unique subfield index and test that insert fails
    const collection2 = await db.createCollection('test_index_on_subfield2');
    await collection2.createIndex('hello_a', { writeConcern: { w: 1 }, unique: true });
    const err = await collection2
      .insertMany(
        [{ hello: { a: 4, b: 5 } }, { hello: { a: 7, b: 2 } }, { hello: { a: 4, b: 10 } }],
        this.configuration.writeConcernMax()
      )
      .catch(e => e);
    expect(err).to.be.instanceOf(Error);
  });

  context('when dropIndexes succeeds', function () {
    let collection;

    beforeEach(async function () {
      collection = await db.createCollection('test_drop_indexes');
      await collection.insertOne({ a: 1 });
      // Create an index on the collection
      await db.createIndex(collection.collectionName, 'a');
    });

    afterEach(async function () {
      await db.dropCollection('test_drop_indexes');
    });

    it('should return true and should no longer exist in the collection', async function () {
      // Drop all the indexes
      const result = await collection.dropIndexes();
      expect(result).to.equal(true);

      const res = await collection.indexInformation();
      expect(res['a_1']).to.equal(undefined);
    });
  });

  context('when dropIndexes fails', function () {
    beforeEach(async function () {
      await collection.insertOne({ a: 1 });
      // Create an index on the collection
      await collection.createIndex('a');
      await client
        .db()
        .admin()
        .command({
          configureFailPoint: 'failCommand',
          mode: {
            times: 1
          },
          data: {
            failCommands: ['dropIndexes'],
            errorCode: 91
          }
        });
    });

    it('should return false', async function () {
      const result = await collection.dropIndexes();
      expect(result).to.equal(false);
    });
  });

  context('indexExists', function () {
    let collection;

    beforeEach(async function () {
      collection = await db.createCollection('test_index_exists');
      await collection.insertOne({ a: 1 });

      await db.createIndex(collection.collectionName, 'a');
      await db.createIndex(collection.collectionName, ['c', 'd', 'e']);
    });

    afterEach(async function () {
      await db.dropCollection('test_index_exists');
    });

    it('should return true when index of type string exists', async function () {
      const result = await collection.indexExists('a_1');
      expect(result).to.equal(true);
    });

    it('should return false when index of type string does not exist', async function () {
      const result = await collection.indexExists('b_2');
      expect(result).to.equal(false);
    });

    it('should return true when an array of indexes exists', async function () {
      const result = await collection.indexExists(['c_1_d_1_e_1', 'a_1']);
      expect(result).to.equal(true);
    });

    it('should return false when an array of indexes does not exist', async function () {
      const result = await collection.indexExists(['d_1_e_1', 'c_1']);
      expect(result).to.equal(false);
    });
  });

  it('shouldCorrectlyHandleDistinctIndexes', async function () {
    await collection.insertMany(
      [
        { a: 0, b: { c: 'a' } },
        { a: 1, b: { c: 'b' } },
        { a: 1, b: { c: 'c' } },
        { a: 2, b: { c: 'a' } },
        { a: 3 },
        { a: 3 }
      ],
      this.configuration.writeConcernMax()
    );
    {
      const docs = await collection.distinct('a');
      expect(docs.sort()).to.deep.equal([0, 1, 2, 3]);
    }

    {
      const docs = await collection.distinct('b.c');
      expect(docs.sort()).to.deep.equal(['a', 'b', 'c']);
    }
  });

  it('shouldCorrectlyCreateAndUseSparseIndex', async function () {
    const db = client.db(this.configuration.db);
    await db.createCollection('create_and_use_sparse_index_test');
    const collection = db.collection('create_and_use_sparse_index_test');
    await collection.createIndex({ title: 1 }, { sparse: true, writeConcern: { w: 1 } });
    await collection.insertMany(
      [{ name: 'Jim' }, { name: 'Sarah', title: 'Princess' }],
      this.configuration.writeConcernMax()
    );
    const items = await collection
      .find({ title: { $ne: null } })
      .sort({ title: 1 })
      .toArray();
    expect(items).to.have.lengthOf(1);
    expect(items[0]).to.have.property('name', 'Sarah');

    // Fetch the info for the indexes
    const indexInfo = await collection.indexInformation({ full: true });
    expect(indexInfo).to.have.lengthOf(2);
  });

  it('shouldCorrectlyHandleGeospatialIndexes', async function () {
    await collection.createIndex({ loc: '2d' }, this.configuration.writeConcernMax());
    await collection.insertOne({ loc: [-100, 100] }, this.configuration.writeConcernMax());

    const err = await collection
      .insertOne({ loc: [200, 200] }, this.configuration.writeConcernMax())
      .catch(e => e);
    test.ok(err.errmsg.indexOf('point not in interval of') !== -1);
    test.ok(err.errmsg.indexOf('-180') !== -1);
    test.ok(err.errmsg.indexOf('180') !== -1);
  });

  it('shouldCorrectlyHandleGeospatialIndexesAlteredRange', async function () {
    await collection.createIndex({ loc: '2d' }, { min: 0, max: 1024, writeConcern: { w: 1 } });
    await collection.insertOne({ loc: [100, 100] }, this.configuration.writeConcernMax());
    await collection.insertOne({ loc: [200, 200] }, this.configuration.writeConcernMax());
    const err = await collection
      .insertOne({ loc: [-200, -200] }, this.configuration.writeConcernMax())
      .catch(e => e);
    test.ok(err.errmsg.indexOf('point not in interval of') !== -1);
    test.ok(err.errmsg.indexOf('0') !== -1);
    test.ok(err.errmsg.indexOf('1024') !== -1);
  });

  it('shouldThrowDuplicateKeyErrorWhenCreatingIndex', async function () {
    await collection.insertMany([{ a: 1 }, { a: 1 }], this.configuration.writeConcernMax());
    const err = await collection
      .createIndex({ a: 1 }, { unique: true, writeConcern: { w: 1 } })
      .catch(e => e);
    expect(err).to.exist;
  });

  it('shouldThrowDuplicateKeyErrorWhenDriverInStrictMode', async function () {
    await collection.insertMany([{ a: 1 }, { a: 1 }], this.configuration.writeConcernMax());
    const err = await collection
      .createIndex({ a: 1 }, { unique: true, writeConcern: { w: 1 } })
      .catch(e => e);
    expect(err)
      .to.be.instanceOf(MongoServerError)
      .to.match(/duplicate key error/);
  });

  it('shouldCorrectlyUseMinMaxForSettingRangeInEnsureIndex', async function () {
    await collection.createIndex({ loc: '2d' }, { min: 200, max: 1400, writeConcern: { w: 1 } });
    await collection.insertOne({ loc: [600, 600] }, this.configuration.writeConcernMax());
  });

  it('Should correctly create an index with overriden name', async function () {
    await collection.createIndex('name', { name: 'myfunky_name' });

    // Fetch full index information
    const indexInformation = await collection.indexInformation({ full: false });
    expect(indexInformation).to.have.property('myfunky_name');
  });

  it('should correctly return error message when applying unique index to duplicate documents', async function () {
    await collection.insertMany(
      [{ a: 1 }, { a: 1 }, { a: 1 }],
      this.configuration.writeConcernMax()
    );

    const err = await collection
      .createIndex({ a: 1 }, { writeConcern: { w: 1 }, unique: true })
      .catch(e => e);
    expect(err)
      .to.be.instanceOf(MongoServerError)
      .to.match(/duplicate key error/);
  });

  it('should correctly drop index with no callback', async function () {
    await collection.insertMany([{ a: 1 }], this.configuration.writeConcernMax());

    await collection.createIndex({ a: 1 }, { writeConcern: this.configuration.writeConcernMax() });
    await collection.dropIndex('a_1');
  });

  it('should correctly apply hint to find', async function () {
    await collection.insertMany([{ a: 1 }], this.configuration.writeConcernMax());

    await collection.createIndex({ a: 1 }, { writeConcern: this.configuration.writeConcernMax() });
    await collection.indexInformation({ full: false });

    const [doc] = await collection.find({}, { hint: 'a_1' }).toArray();
    expect(doc.a).to.equal(1);
  });

  it('should correctly set language_override option', async function () {
    await collection.insertMany([{ text: 'Lorem ipsum dolor sit amet.', langua: 'italian' }]);

    await collection.createIndex(
      { text: 'text' },
      { language_override: 'langua', name: 'language_override_index' }
    );

    const indexInformation = await collection.indexInformation({ full: true });
    for (let i = 0; i < indexInformation.length; i++) {
      if (indexInformation[i].name === 'language_override_index')
        test.equal(indexInformation[i].language_override, 'langua');
    }
  });

  it('should correctly use listIndexes to retrieve index list', async function () {
    await db.collection('testListIndexes').createIndex({ a: 1 });

    const indexes = await db.collection('testListIndexes').listIndexes().toArray();
    expect(indexes).to.have.lengthOf(2);
  });

  it('should correctly use listIndexes to retrieve index list using hasNext', async function () {
    await db.collection('testListIndexes_2').createIndex({ a: 1 });

    const result = await db.collection('testListIndexes_2').listIndexes().hasNext();
    expect(result).to.be.true;
  });

  it('should correctly ensureIndex for nested style index name c.d', async function () {
    await db.collection('ensureIndexWithNestedStyleIndex').createIndex({ 'c.d': 1 });

    // Get the list of indexes
    const indexes = await db.collection('ensureIndexWithNestedStyleIndex').listIndexes().toArray();
    expect(indexes).to.have.lengthOf(2);
  });

  it('should correctly execute createIndexes with multiple indexes', async function () {
    const r = await db
      .collection('createIndexes')
      .createIndexes([{ key: { a: 1 } }, { key: { b: 1 }, name: 'hello1' }]);
    expect(r).to.deep.equal(['a_1', 'hello1']);

    const docs = await db.collection('createIndexes').listIndexes().toArray();
    const keys = {};

    for (let i = 0; i < docs.length; i++) {
      keys[docs[i].name] = true;
    }

    test.ok(keys['a_1']);
    test.ok(keys['hello1']);
  });

  it('should correctly execute createIndexes with one index', async function () {
    const r = await db.collection('createIndexes').createIndexes([{ key: { a: 1 } }]);
    expect(r).to.deep.equal(['a_1']);

    await collection.indexExists('a_1');
  });

  it('shouldCorrectlyCreateTextIndex', async function () {
    const r = await collection.createIndex({ '$**': 'text' }, { name: 'TextIndex' });
    expect(r).to.equal('TextIndex');
  });

  it('should correctly pass partialIndexes through to createIndexCommand', async function () {
    const configuration = this.configuration;
    const started: Array<CommandStartedEvent> = [];
    const succeeded: Array<CommandSucceededEvent> = [];

    client.on('commandStarted', function (event) {
      if (event.commandName === 'createIndexes') started.push(event);
    });

    client.on('commandSucceeded', function (event) {
      if (event.commandName === 'createIndexes') succeeded.push(event);
    });

    const db = client.db(configuration.db);

    await db
      .collection('partialIndexes')
      .createIndex({ a: 1 }, { partialFilterExpression: { a: 1 } });
    expect(started[0].command.indexes[0].partialFilterExpression).to.deep.equal({ a: 1 });
  });

  it('should not retry partial index expression error', async function () {
    // Can't use $exists: false in partial filter expression, see
    // https://jira.mongodb.org/browse/SERVER-17853
    const opts = { partialFilterExpression: { a: { $exists: false } } };
    const err = await db
      .collection('partialIndexes')
      .createIndex({ a: 1 }, opts)
      .catch(e => e);
    expect(err).to.be.instanceOf(Error).to.have.property('code', 67);
  });

  it('should correctly create index on embedded key', async function () {
    await collection.insertMany([
      {
        a: { a: 1 }
      },
      {
        a: { a: 2 }
      }
    ]);

    await collection.createIndex({ 'a.a': 1 });
  });

  it('should correctly create index using . keys', async function () {
    await collection.createIndex(
      { 'key.external_id': 1, 'key.type': 1 },
      { unique: true, sparse: true, name: 'indexname' }
    );
  });

  it('error on duplicate key index', async function () {
    await collection.insertMany([
      {
        key: { external_id: 1, type: 1 }
      },
      {
        key: { external_id: 1, type: 1 }
      }
    ]);
    const err = await collection
      .createIndex(
        { 'key.external_id': 1, 'key.type': 1 },
        { unique: true, sparse: true, name: 'indexname' }
      )
      .catch(e => e);

    expect(err).to.be.instanceOf(Error).to.have.property('code', 11000);
  });

  it('should correctly create Index with sub element', async function () {
    await collection.createIndex(
      { temporary: 1, 'store.addressLines': 1, lifecycleStatus: 1 },
      this.configuration.writeConcernMax()
    );
  });

  it(
    'should correctly fail detect error code 85 when performing createIndex',
    {
      requires: {
        mongodb: '<=4.8.0'
      }
    },
    async function () {
      await collection.createIndex({ 'a.one': 1, 'a.two': 1 }, { name: 'n1', sparse: false });

      const err = await collection
        .createIndex({ 'a.one': 1, 'a.two': 1 }, { name: 'n2', sparse: true })
        .catch(e => e);
      expect(err).to.be.instanceOf(Error).to.have.property('code', 85);
    }
  );

  it('should correctly fail by detecting error code 86 when performing createIndex', async function () {
    await collection.createIndex({ 'b.one': 1, 'b.two': 1 }, { name: 'test' });
    const err = await collection
      .createIndex({ 'b.one': -1, 'b.two': -1 }, { name: 'test' })
      .catch(err => err);

    expect(err).to.be.instanceOf(Error).to.have.property('code', 86);
  });

  it('should correctly create Index with sub element running in background', async function () {
    await collection.createIndex({ 'accessControl.get': 1 }, { background: true });
  });

  context('commitQuorum', function () {
    let client;
    beforeEach(async function () {
      client = this.configuration.newClient({ monitorCommands: true });
    });

    afterEach(async function () {
      await client.close();
    });

    function throwErrorTest(testCommand: (db: Db, collection: Collection) => Promise<any>) {
      return {
        metadata: { requires: { mongodb: '<4.4' } },
        test: async function () {
          const db = client.db('test');
          const collection = db.collection('commitQuorum');
          const err = await testCommand(db, collection).catch(e => e);
          expect(err.message).to.equal(
            'Option `commitQuorum` for `createIndexes` not supported on servers < 4.4'
          );
        }
      };
    }
    it(
      'should throw an error if commitQuorum specified on db.createIndex',
      throwErrorTest((db, collection) =>
        db.createIndex(collection.collectionName, 'a', { commitQuorum: 'all' })
      )
    );
    it(
      'should throw an error if commitQuorum specified on collection.createIndex',
      throwErrorTest((db, collection) => collection.createIndex('a', { commitQuorum: 'all' }))
    );
    it(
      'should throw an error if commitQuorum specified on collection.createIndexes',
      throwErrorTest((db, collection) =>
        collection.createIndexes([{ key: { a: 1 } }, { key: { b: 1 } }], { commitQuorum: 'all' })
      )
    );

    function commitQuorumTest(
      testCommand: (db: Db, collection: Collection) => Promise<unknown>
    ): any {
      return {
        metadata: { requires: { mongodb: '>=4.4', topology: ['replicaset', 'sharded'] } },
        test: async function () {
          const events: CommandStartedEvent[] = [];
          client.on('commandStarted', event => {
            if (event.commandName === 'createIndexes') events.push(event);
          });

          const db = client.db('test');
          const collection = db.collection('commitQuorum');
          await collection.insertOne({ a: 1 });
          await testCommand(db, collection);

          expect(events).to.be.an('array').with.lengthOf(1);
          expect(events[0]).nested.property('command.commitQuorum').to.equal(0);
          await collection.drop();
        }
      };
    }
    it(
      'should run command with commitQuorum if specified on db.createIndex',
      commitQuorumTest(
        async (db, collection) =>
          await db.createIndex(collection.collectionName, 'a', {
            // @ts-expect-error revaluate this?
            writeConcern: { w: 'majority' },
            commitQuorum: 0
          })
      )
    );
    it(
      'should run command with commitQuorum if specified on collection.createIndex',
      commitQuorumTest((db, collection) =>
        // @ts-expect-error revaluate this?
        collection.createIndex('a', { writeConcern: { w: 'majority' }, commitQuorum: 0 })
      )
    );
    it(
      'should run command with commitQuorum if specified on collection.createIndexes',
      commitQuorumTest((db, collection) =>
        collection.createIndexes([{ key: { a: 1 } }], {
          // @ts-expect-error revaluate this?
          writeConcern: { w: 'majority' },
          commitQuorum: 0
        })
      )
    );
  });

  it(
    'should create index hidden',
    {
      requires: { mongodb: '>=4.4', topology: 'single' }
    },
    async function () {
      const collection = await db.createCollection('hidden_index_collection');
      const indexName = await collection.createIndex('a', { hidden: true });
      expect(indexName).to.equal('a_1');
      const indexes = await collection.listIndexes().toArray();
      expect(indexes).to.deep.equal([
        { v: 2, key: { _id: 1 }, name: '_id_' },
        { v: 2, key: { a: 1 }, name: 'a_1', hidden: true }
      ]);
    }
  );
});
