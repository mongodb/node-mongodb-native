'use strict';
const setupDatabase = require('../../shared').setupDatabase;
const expect = require('chai').expect;

describe('examples(remove-documents):', function () {
  let client;
  let db;

  before(async function () {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = await this.configuration.newClient().connect();
    db = client.db(this.configuration.db);
    await db.collection('inventory').deleteMany({});
    // Start Example 55
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
        status: 'P'
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
    // End Example 55
  });

  afterEach(async function () {
    await client.close();
    client = undefined;
    db = undefined;
  });

  it(
    'Delete All Documents',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 56
      await db.collection('inventory').deleteMany({});
      // End Example 56
      const cursor = db.collection('inventory').find({});
      expect(await cursor.count()).to.equal(0);
    }
  );

  it(
    'Delete All Documents that Match a Condition',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 57
      await db.collection('inventory').deleteMany({ status: 'A' });
      // End Example 57
      const cursor = db.collection('inventory').find({});
      expect(await cursor.count()).to.equal(3);
    }
  );

  it(
    'Delete Only One Document that Matches a Condition',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 58
      await db.collection('inventory').deleteOne({ status: 'D' });
      // End Example 58
      const cursor = db.collection('inventory').find({});
      expect(await cursor.count()).to.equal(4);
    }
  );
});
