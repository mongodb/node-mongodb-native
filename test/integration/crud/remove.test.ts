import { expect } from 'chai';

import { type MongoClient } from '../../../src';

describe('Remove', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();
  });

  afterEach(async function () {
    await client.close();
  });

  it('should correctly clear out collection', async function () {
    const db = client.db();

    const collection = await db.createCollection('test_clear');

    await collection.insertOne({ i: 1 }, { writeConcern: { w: 1 } });

    await collection.insertOne({ i: 2 }, { writeConcern: { w: 1 } });
    const count = await collection.countDocuments();
    expect(count).to.equal(2);

    // Clear the collection
    const r = await collection.deleteMany({}, { writeConcern: { w: 1 } });
    expect(r).property('deletedCount').to.equal(2);

    const c = await collection.countDocuments();
    expect(c).to.equal(0);
  });

  it('should correctly remove document using RegExp', async function () {
    const db = client.db(this.configuration.db);

    const collection = await db.createCollection('test_remove_regexp');

    await collection.insertOne({ address: '485 7th ave new york' }, { writeConcern: { w: 1 } });

    // Clear the collection
    const r = await collection.deleteMany({ address: /485 7th ave/ }, { writeConcern: { w: 1 } });
    expect(r).property('deletedCount').to.equal(1);

    const count = await collection.countDocuments();
    expect(count).to.equal(0);
  });

  it('should not throw error on empty remove', async function () {
    const db = client.db(this.configuration.db);
    const collection = db.collection('remove_test');

    await collection.deleteMany({});
  });
});
