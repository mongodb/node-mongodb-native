'use strict';
const { setupDatabase } = require('../shared');
const { expect } = require('chai');

describe('Collation', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  it('cursor count method should return the correct number when used with collation set', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });
    const db = client.db(configuration.db);
    const docs = [
      { _id: 0, name: 'foo' },
      { _id: 1, name: 'Foo' }
    ];
    const collation = { locale: 'en_US', strength: 2 };
    await Promise.resolve();
    await db.createCollection('cursor_collation_count');
    const collection = db.collection('cursor_collation_count');
    await collection.insertMany(docs);
    const cursor = collection.find({ name: 'foo' }).collation(collation);
    const val = await cursor.count();
    expect(val).to.equal(2);
    await client.close();
  });

  it('should correctly create index with collation', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient();
    const db = client.db(configuration.db);
    const col = db.collection('collation_test');
    await col.createIndexes([
      { key: { a: 1 }, collation: { locale: 'nn' }, name: 'collation_test' }
    ]);
    const r = await col.listIndexes().toArray();
    const indexes = r.filter(i => i.name === 'collation_test');
    expect(indexes).to.have.length(1);
    expect(indexes[0]).to.have.property('collation');
    expect(indexes[0].collation).to.exist;
    await client.close();
  });

  it('Should correctly create collection with collation', async function () {
    const configuration = this.configuration;
    const client = configuration.newClient();
    const db = client.db(configuration.db);
    await db.createCollection('collation_test2', { collation: { locale: 'nn' } });
    const collections = await db.listCollections({ name: 'collation_test2' }).toArray();
    expect(collections).to.have.length(1);
    expect(collections[0].name).to.equal('collation_test2');
    expect(collections[0].options.collation).to.exist;
    await client.close();
  });
});
