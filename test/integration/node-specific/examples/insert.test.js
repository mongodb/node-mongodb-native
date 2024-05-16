'use strict';
const setupDatabase = require('../../shared').setupDatabase;
const expect = require('chai').expect;

describe('examples(insert):', function () {
  let client;
  let db;

  before(async function () {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = await this.configuration.newClient().connect();
    db = client.db(this.configuration.db);
    await db.collection('inventory').deleteMany({});
  });

  afterEach(async function () {
    await client.close();
    client = undefined;
    db = undefined;
  });

  it(
    'Insert a Single Document',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 1
      await db.collection('inventory').insertOne({
        item: 'canvas',
        qty: 100,
        tags: ['cotton'],
        size: { h: 28, w: 35.5, uom: 'cm' }
      });
      // End Example 1
      // Start Example 2
      const cursor = db.collection('inventory').find({ item: 'canvas' });
      // End Example 2
      expect(await cursor.count()).to.equal(1);
    }
  );

  it(
    'Insert Multiple Documents',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 3
      await db.collection('inventory').insertMany([
        {
          item: 'journal',
          qty: 25,
          tags: ['blank', 'red'],
          size: { h: 14, w: 21, uom: 'cm' }
        },
        {
          item: 'mat',
          qty: 85,
          tags: ['gray'],
          size: { h: 27.9, w: 35.5, uom: 'cm' }
        },
        {
          item: 'mousepad',
          qty: 25,
          tags: ['gel', 'blue'],
          size: { h: 19, w: 22.85, uom: 'cm' }
        }
      ]);
      // End Example 3
      expect(await db.collection('inventory').count({})).to.equal(3);
    }
  );
});
