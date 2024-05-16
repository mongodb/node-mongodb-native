'use strict';
const setupDatabase = require('../../shared').setupDatabase;
const expect = require('chai').expect;

describe('examples(update-documents):', function () {
  let client;
  let db;

  before(async function () {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = await this.configuration.newClient().connect();
    db = client.db(this.configuration.db);
    await db.collection('inventory').deleteMany({});
    // Start Example 51
    await db.collection('inventory').insertMany([
      {
        item: 'canvas',
        qty: 100,
        size: { h: 28, w: 35.5, uom: 'cm' },
        status: 'A'
      },
      {
        item: 'journal',
        qty: 25,
        size: { h: 14, w: 21, uom: 'cm' },
        status: 'A'
      },
      {
        item: 'mat',
        qty: 85,
        size: { h: 27.9, w: 35.5, uom: 'cm' },
        status: 'A'
      },
      {
        item: 'mousepad',
        qty: 25,
        size: { h: 19, w: 22.85, uom: 'cm' },
        status: 'P'
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
      },
      {
        item: 'sketchbook',
        qty: 80,
        size: { h: 14, w: 21, uom: 'cm' },
        status: 'A'
      },
      {
        item: 'sketch pad',
        qty: 95,
        size: { h: 22.85, w: 30.5, uom: 'cm' },
        status: 'A'
      }
    ]);
    // End Example 51
  });

  afterEach(async function () {
    await client.close();
    client = undefined;
    db = undefined;
  });

  it(
    'Update a Single Document',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 52
      await db.collection('inventory').updateOne(
        { item: 'paper' },
        {
          $set: { 'size.uom': 'cm', status: 'P' },
          $currentDate: { lastModified: true }
        }
      );
      // End Example 52
      const cursor = db.collection('inventory').find({
        item: 'paper'
      });
      const docs = await cursor.toArray();
      docs.forEach(function (doc) {
        expect(doc).to.have.nested.property('size.uom').that.equals('cm');
        expect(doc).to.have.property('status').that.equals('P');
        expect(doc).to.have.property('lastModified');
      });
    }
  );

  it(
    'Update Multiple Documents',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 53
      await db.collection('inventory').updateMany(
        { qty: { $lt: 50 } },
        {
          $set: { 'size.uom': 'in', status: 'P' },
          $currentDate: { lastModified: true }
        }
      );
      // End Example 53
      const cursor = db.collection('inventory').find({
        qty: { $lt: 50 }
      });
      const docs = await cursor.toArray();
      docs.forEach(function (doc) {
        expect(doc).to.have.nested.property('size.uom').that.equals('in');
        expect(doc).to.have.property('status').that.equals('P');
        expect(doc).to.have.property('lastModified');
      });
    }
  );

  it(
    'Replace a Document',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 54
      await db.collection('inventory').replaceOne(
        { item: 'paper' },
        {
          item: 'paper',
          instock: [
            { warehouse: 'A', qty: 60 },
            { warehouse: 'B', qty: 40 }
          ]
        }
      );
      // End Example 54
      const cursor = db.collection('inventory').find({ item: 'paper' }).project({ _id: 0 });
      const docs = await cursor.toArray();
      docs.forEach(function (doc) {
        expect(Object.keys(doc)).to.have.a.lengthOf(2);
        expect(doc).to.have.property('item');
        expect(doc).to.have.property('instock').that.has.a.lengthOf(2);
      });
    }
  );
});
