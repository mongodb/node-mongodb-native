import { expect } from 'chai';

import { Collection, type Db, type MongoClient, ObjectId } from '../../mongodb';

describe('Collection Management and Db Management', function () {
  let client: MongoClient;
  let db: Db;

  beforeEach(async function () {
    client = this.configuration.newClient();
    db = client.db();
    await db.dropDatabase();
  });

  afterEach(async function () {
    await client.close();
  });

  it('returns a collection object after calling createCollection', async function () {
    const collection = await db.createCollection(new ObjectId().toHexString());
    expect(collection).to.be.instanceOf(Collection);
  });

  it('creates a collection named collection1, renames collection1 to collection2, and returns true after calling dropCollection on collection2', async function () {
    const createCollection = await db.createCollection('collection1');
    expect(createCollection).to.be.instanceOf(Collection);
    const renameCollection = await db.renameCollection('collection1', 'collection2');
    expect(renameCollection).to.be.instanceOf(Collection);
    expect(renameCollection).to.have.nested.property('s.namespace.collection').equal('collection2');
    const dropCollection = await db.dropCollection('collection2');
    expect(dropCollection).to.be.true;
  });

  it('returns true after calling dropDatabase', async function () {
    const dropCollection = await db.dropDatabase();
    expect(dropCollection).to.be.true;
  });

  it('creates two collections, and returns an array of length 2 after calling db.collections()', async function () {
    const collection1 = await db.createCollection('promiseCollectionCollections1');
    expect(collection1).to.be.instanceOf(Collection);
    const collection2 = await db.createCollection('promiseCollectionCollections2');
    expect(collection2).to.be.instanceOf(Collection);
    const collectionArray = await db.collections();
    expect(collectionArray).to.be.an('array');
    expect(collectionArray).to.have.length(2);
  });
});
