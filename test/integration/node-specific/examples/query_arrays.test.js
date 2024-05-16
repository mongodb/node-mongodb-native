'use strict';
const setupDatabase = require('../../shared').setupDatabase;
const expect = require('chai').expect;

describe('examples(query-arrays):', function () {
  let client;
  let db;

  before(async function () {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = await this.configuration.newClient().connect();
    db = client.db(this.configuration.db);
    await db.collection('inventory').deleteMany({});
    // Start Example 20
    await db.collection('inventory').insertMany([
      {
        item: 'journal',
        qty: 25,
        tags: ['blank', 'red'],
        dim_cm: [14, 21]
      },
      {
        item: 'notebook',
        qty: 50,
        tags: ['red', 'blank'],
        dim_cm: [14, 21]
      },
      {
        item: 'paper',
        qty: 100,
        tags: ['red', 'blank', 'plain'],
        dim_cm: [14, 21]
      },
      {
        item: 'planner',
        qty: 75,
        tags: ['blank', 'red'],
        dim_cm: [22.85, 30]
      },
      {
        item: 'postcard',
        qty: 45,
        tags: ['blue'],
        dim_cm: [10, 15.25]
      }
    ]);
    // End Example 20
  });

  afterEach(async function () {
    await client.close();
    client = undefined;
    db = undefined;
  });

  it(
    'Match an Array',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 21
      const cursor = db.collection('inventory').find({
        tags: ['red', 'blank']
      });
      // End Example 21
      expect(await cursor.count()).to.equal(1);
    }
  );

  it(
    'Match an Array: $all',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 22
      const cursor = db.collection('inventory').find({
        tags: { $all: ['red', 'blank'] }
      });
      // End Example 22
      expect(await cursor.count()).to.equal(4);
    }
  );

  it(
    'Query an Array for an Element',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 23
      const cursor = db.collection('inventory').find({
        tags: 'red'
      });
      // End Example 23
      expect(await cursor.count()).to.equal(4);
    }
  );

  it(
    'Query an Array for an Element w/ operators',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 24
      const cursor = db.collection('inventory').find({
        dim_cm: { $gt: 25 }
      });
      // End Example 24
      expect(await cursor.count()).to.equal(1);
    }
  );

  it(
    'Query an Array with Compound Filter Conditions on the Array Elements',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 25
      const cursor = db.collection('inventory').find({
        dim_cm: { $gt: 15, $lt: 20 }
      });
      // End Example 25
      expect(await cursor.count()).to.equal(4);
    }
  );

  it(
    'Query for an Array Element that Meets Multiple Criteria',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 26
      const cursor = db.collection('inventory').find({
        dim_cm: { $elemMatch: { $gt: 22, $lt: 30 } }
      });
      // End Example 26
      expect(await cursor.count()).to.equal(1);
    }
  );

  it(
    'Query for an Element by the Array Index Position',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 27
      const cursor = db.collection('inventory').find({
        'dim_cm.1': { $gt: 25 }
      });
      // End Example 27
      expect(await cursor.count()).to.equal(1);
    }
  );

  it(
    'Query an Array by Array Length',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 28
      const cursor = db.collection('inventory').find({
        tags: { $size: 3 }
      });
      // End Example 28
      expect(await cursor.count()).to.equal(1);
    }
  );
});
