import { expect } from 'chai';

import {
  Collection,
  type Db,
  MongoClient,
  MongoInvalidArgumentError,
  MongoServerError
} from '../../../src';
import { setupDatabase } from '../shared';

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

  it('should not throw error dropping non existing Db', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
    const _db = client.db('nonexistingdb');
    await _db.dropDatabase();
    await client.close();
  });

  it('should not cut collection name when it is the same as the database', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
    const db1 = client.db('node972');
    await db1.collection('node972.test').insertOne({ a: 1 });

    const collections = await db1.collections();
    const collection = collections.find(c => c.collectionName === 'node972.test');
    expect(collection).to.be.instanceOf(Collection);
    await client.close();
  });

  it('should correctly use cursor with list collections command', async function () {
    const configuration = this.configuration;

    const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });

    const db1 = client.db('shouldCorrectlyUseCursorWithListCollectionsCommand');

    // create 2 collections by inserting documents in them
    await db1.collection('test').insertOne({ a: 1 });
    await db1.collection('test1').insertOne({ a: 1 });

    // Get listCollections filtering out the name
    const collections = await db1.listCollections({ name: 'test1' }).toArray();
    expect(collections.length).to.equal(1);
    await client.close();
  });

  it('should correctly use cursor with listCollections command and batchSize', async function () {
    const configuration = this.configuration;

    const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
    const db1 = client.db('shouldCorrectlyUseCursorWithListCollectionsCommandAndBatchSize');

    await db1.collection('test').insertOne({ a: 1 });

    await db1.collection('test1').insertOne({ a: 1 });

    // Get listCollections filtering out the name
    const collections = await db1.listCollections({ name: 'test' }, { batchSize: 1 }).toArray();
    expect(collections.length).to.equal(1);
    await client.close();
  });

  it('should correctly list collection names with . in the middle', async function () {
    const configuration = this.configuration;

    const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
    const db1 = client.db('shouldCorrectlyListCollectionsWithDotsOnThem');

    await db1.collection('test.collection1').insertOne({ a: 1 });
    await db1.collection('test.collection2').insertOne({ a: 1 });

    const collections = await db1.listCollections({ name: /test.collection/ }).toArray();
    expect(collections.length).to.equal(2);

    // Get listCollections filtering out the name
    const filteredCollections = await db1
      .listCollections({ name: 'test.collection1' }, {})
      .toArray();
    expect(filteredCollections.length).to.equal(1);
    await client.close();
  });

  it('should correctly list collection names with batchSize 1', async function () {
    const configuration = this.configuration;

    const client = configuration.newClient(configuration.writeConcernMax(), { maxPoolSize: 1 });
    const db1 = client.db('shouldCorrectlyListCollectionsWithDotsOnThemFor28');

    await db1.collection('test.collection1').insertOne({ a: 1 });

    await db1.collection('test.collection2').insertOne({ a: 1 });

    // Get listCollections filtering out the name
    const collections = await db1
      .listCollections({ name: /test.collection/ }, { batchSize: 1 })
      .toArray();
    expect(collections.length).to.equal(2);
    await client.close();
  });

  it('should throw if Db.collection is passed a deprecated callback argument', () => {
    const client = new MongoClient('mongodb://iLoveJavascript');
    // @ts-expect-error Not allowed in TS, but can be used in JS
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    expect(() => client.db('test').collection('test', () => {})).to.throw(
      'The callback form of this helper has been removed.'
    );
  });
});
