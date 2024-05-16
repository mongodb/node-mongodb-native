'use strict';
const setupDatabase = require('../../shared').setupDatabase;
const expect = require('chai').expect;

describe('examples(query-embedded-documents):', function () {
  let client;
  let db;

  before(async function () {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = await this.configuration.newClient().connect();
    db = client.db(this.configuration.db);
    await db.collection('inventory').deleteMany({});
    // Start Example 14
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
    // End Example 14
  });

  afterEach(async function () {
    await client.close();
    client = undefined;
    db = undefined;
  });

  it(
    'Match an Embedded/Nested Document',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 15
      const cursor = db.collection('inventory').find({
        size: { h: 14, w: 21, uom: 'cm' }
      });
      // End Example 15
      expect(await cursor.count()).to.equal(1);
    }
  );

  it(
    'Match an Embedded/Nested Document - document order',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 16
      const cursor = db.collection('inventory').find({
        size: { w: 21, h: 14, uom: 'cm' }
      });
      // End Example 16
      expect(await cursor.count()).to.equal(0);
    }
  );

  it(
    'Specify Equality Match on a Nested Field',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 17
      const cursor = db.collection('inventory').find({
        'size.uom': 'in'
      });
      // End Example 17
      expect(await cursor.count()).to.equal(2);
    }
  );

  it(
    'Specify Match using Query Operator',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 18
      const cursor = db.collection('inventory').find({
        'size.h': { $lt: 15 }
      });
      // End Example 18
      expect(await cursor.count()).to.equal(4);
    }
  );

  it(
    'Specify ``AND`` Condition',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 19
      const cursor = db.collection('inventory').find({
        'size.h': { $lt: 15 },
        'size.uom': 'in',
        status: 'D'
      });
      // End Example 19
      expect(await cursor.count()).to.equal(1);
    }
  );
});
