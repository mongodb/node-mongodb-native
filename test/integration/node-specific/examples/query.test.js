'use strict';
const setupDatabase = require('../../shared').setupDatabase;
const expect = require('chai').expect;

describe('examples(query):', function () {
  let client;
  let db;

  before(async function () {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = await this.configuration.newClient().connect();
    db = client.db(this.configuration.db);
    await db.collection('inventory').deleteMany({});
    // Start Example 6
    await db.collection('inventory').insertMany([
      {
        item: 'journal',
        qty: 25,
        size: { h: 14, w: 21, uom: 'cm' },
        status: 'A'
      },
      {
        item: 'notebook',
        qty: 50,
        size: { h: 8.5, w: 11, uom: 'in' },
        status: 'A'
      },
      {
        item: 'paper',
        qty: 100,
        size: { h: 8.5, w: 11, uom: 'in' },
        status: 'D'
      },
      {
        item: 'planner',
        qty: 75,
        size: { h: 22.85, w: 30, uom: 'cm' },
        status: 'D'
      },
      {
        item: 'postcard',
        qty: 45,
        size: { h: 10, w: 15.25, uom: 'cm' },
        status: 'A'
      }
    ]);
    // End Example 6
  });

  afterEach(async function () {
    await client.close();
    client = undefined;
    db = undefined;
  });

  it(
    'select all documents in a collection',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 7
      const cursor = db.collection('inventory').find({});
      // End Example 7
      expect(await cursor.count()).to.equal(5);
    }
  );

  it(
    'Specify Equality Condition',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 9
      const cursor = db.collection('inventory').find({ status: 'D' });
      // End Example 9
      expect(await cursor.count()).to.equal(2);
    }
  );

  it(
    'Specify Conditions Using Query Operators',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 10
      const cursor = db.collection('inventory').find({
        status: { $in: ['A', 'D'] }
      });
      // End Example 10
      expect(await cursor.count()).to.equal(5);
    }
  );

  it(
    'Specify ``AND`` Condition',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 11
      const cursor = db.collection('inventory').find({
        status: 'A',
        qty: { $lt: 30 }
      });
      // End Example 11
      expect(await cursor.count()).to.equal(1);
    }
  );

  it(
    'Specify ``OR`` Condition',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 12
      const cursor = db.collection('inventory').find({
        $or: [{ status: 'A' }, { qty: { $lt: 30 } }]
      });
      // End Example 12
      expect(await cursor.count()).to.equal(3);
    }
  );

  it(
    'Specify ``AND`` as well as ``OR`` Conditions',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 13
      const cursor = db.collection('inventory').find({
        status: 'A',
        $or: [{ qty: { $lt: 30 } }, { item: { $regex: '^p' } }]
      });
      // End Example 13
      expect(await cursor.count()).to.equal(2);
    }
  );
});
