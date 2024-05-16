'use strict';
const setupDatabase = require('../../shared').setupDatabase;
const expect = require('chai').expect;

describe('examples(query-for-null-fields):', function () {
  let client;
  let db;

  before(async function () {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = await this.configuration.newClient().connect();
    db = client.db(this.configuration.db);
    await db.collection('inventory').deleteMany({});
    // Start Example 38
    await db.collection('inventory').insertMany([{ _id: 1, item: null }, { _id: 2 }]);
    // End Example 38
  });

  afterEach(async function () {
    await client.close();
    client = undefined;
    db = undefined;
  });

  it(
    'Equality Filter',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 39
      const cursor = db.collection('inventory').find({
        item: null
      });
      // End Example 39
      expect(await cursor.count()).to.equal(2);
    }
  );

  it('Type Check', { requires: { topology: ['single'], mongodb: '>= 2.8.0' } }, async function () {
    // Start Example 40
    const cursor = db.collection('inventory').find({
      item: { $type: 10 }
    });
    // End Example 40
    expect(await cursor.count()).to.equal(1);
  });

  it(
    'Existence Check',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 41
      const cursor = db.collection('inventory').find({
        item: { $exists: false }
      });
      // End Example 41
      expect(await cursor.count()).to.equal(1);
    }
  );
});
