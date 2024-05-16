'use strict';
const setupDatabase = require('../../shared').setupDatabase;
const expect = require('chai').expect;

describe('examples(project-fields-from-query):', function () {
  let client;
  let db;

  before(async function () {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = await this.configuration.newClient().connect();
    db = client.db(this.configuration.db);
    await db.collection('inventory').deleteMany({});
    // Start Example 42
    await db.collection('inventory').insertMany([
      {
        item: 'journal',
        status: 'A',
        size: { h: 14, w: 21, uom: 'cm' },
        instock: [{ warehouse: 'A', qty: 5 }]
      },
      {
        item: 'notebook',
        status: 'A',
        size: { h: 8.5, w: 11, uom: 'in' },
        instock: [{ warehouse: 'C', qty: 5 }]
      },
      {
        item: 'paper',
        status: 'D',
        size: { h: 8.5, w: 11, uom: 'in' },
        instock: [{ warehouse: 'A', qty: 60 }]
      },
      {
        item: 'planner',
        status: 'D',
        size: { h: 22.85, w: 30, uom: 'cm' },
        instock: [{ warehouse: 'A', qty: 40 }]
      },
      {
        item: 'postcard',
        status: 'A',
        size: { h: 10, w: 15.25, uom: 'cm' },
        instock: [
          { warehouse: 'B', qty: 15 },
          { warehouse: 'C', qty: 35 }
        ]
      }
    ]);
    // End Example 42
  });

  afterEach(async function () {
    await client.close();
    client = undefined;
    db = undefined;
  });

  it(
    'Return All Fields in Matching Documents',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 43
      const cursor = db.collection('inventory').find({
        status: 'A'
      });
      // End Example 43
      expect(await cursor.count()).to.equal(3);
    }
  );

  it(
    'Return the Specified Fields and the ``_id`` Field Only',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 44
      const cursor = db
        .collection('inventory')
        .find({
          status: 'A'
        })
        .project({ item: 1, status: 1 });
      // End Example 44
      const docs = await cursor.toArray();
      docs.forEach(function (doc) {
        expect(doc).to.have.all.keys(['_id', 'item', 'status']);
        expect(doc).to.not.have.all.keys(['size', 'instock']);
      });
    }
  );

  it(
    'Suppress ``_id`` Field',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 45
      const cursor = db
        .collection('inventory')
        .find({
          status: 'A'
        })
        .project({ item: 1, status: 1, _id: 0 });
      // End Example 45
      const docs = await cursor.toArray();
      docs.forEach(function (doc) {
        expect(doc).to.have.all.keys(['item', 'status']);
        expect(doc).to.not.have.all.keys(['_id', 'size', 'instock']);
      });
    }
  );

  it(
    'Return All But the Excluded Fields',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 46
      const cursor = db
        .collection('inventory')
        .find({
          status: 'A'
        })
        .project({ status: 0, instock: 0 });
      // End Example 46
      const docs = await cursor.toArray();
      docs.forEach(function (doc) {
        expect(doc).to.have.all.keys(['_id', 'item', 'size']);
        expect(doc).to.not.have.all.keys(['status', 'instock']);
      });
    }
  );

  it(
    'Return Specific Fields in Embedded Documents',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 47
      const cursor = db
        .collection('inventory')
        .find({
          status: 'A'
        })
        .project({ item: 1, status: 1, 'size.uom': 1 });
      // End Example 47
      const docs = await cursor.toArray();
      docs.forEach(function (doc) {
        expect(doc).to.have.all.keys(['_id', 'item', 'status', 'size']);
        expect(doc).to.not.have.property('instock');
        const size = doc.size;
        expect(size).to.have.property('uom');
        expect(size).to.not.have.all.keys(['h', 'w']);
      });
    }
  );

  it(
    'Suppress Specific Fields in Embedded Documents',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 48
      const cursor = db
        .collection('inventory')
        .find({
          status: 'A'
        })
        .project({ 'size.uom': 0 });
      // End Example 48
      const docs = await cursor.toArray();
      docs.forEach(function (doc) {
        expect(doc).to.have.all.keys(['_id', 'item', 'status', 'size', 'instock']);
        const size = doc.size;
        expect(size).to.have.all.keys(['h', 'w']);
        expect(size).to.not.have.property('uom');
      });
    }
  );

  it(
    'Projection on Embedded Documents in an Array',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 49
      const cursor = db
        .collection('inventory')
        .find({
          status: 'A'
        })
        .project({ item: 1, status: 1, 'instock.qty': 1 });
      // End Example 49
      const docs = await cursor.toArray();
      docs.forEach(function (doc) {
        expect(doc).to.have.all.keys(['_id', 'item', 'status', 'instock']);
        expect(doc).to.not.have.property('size');
        doc.instock.forEach(function (subdoc) {
          expect(subdoc).to.have.property('qty');
          expect(subdoc).to.not.have.property('warehouse');
        });
      });
    }
  );

  it(
    'Project Specific Array Elements in the Returned Array',
    { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    async function () {
      // Start Example 50
      const cursor = db
        .collection('inventory')
        .find({
          status: 'A'
        })
        .project({ item: 1, status: 1, instock: { $slice: -1 } });
      // End Example 50
      const docs = await cursor.toArray();
      docs.forEach(function (doc) {
        expect(doc).to.have.all.keys(['_id', 'item', 'status', 'instock']);
        expect(doc).to.not.have.property('size');
        expect(doc).to.have.property('instock').with.a.lengthOf(1);
      });
    }
  );

  it('Aggregation Projection Example 1', { requires: { mongodb: '>= 4.4.0' } }, async function () {
    //  Start Aggregation Projection Example 1
    const cursor = db
      .collection('inventory')
      .find()
      .project({
        _id: 0,
        item: 1,
        status: {
          $switch: {
            branches: [
              {
                case: { $eq: ['$status', 'A'] },
                then: 'Available'
              },
              {
                case: { $eq: ['$status', 'D'] },
                then: 'Discontinued'
              }
            ],
            default: 'No status found'
          }
        },
        area: {
          $concat: [{ $toString: { $multiply: ['$size.h', '$size.w'] } }, ' ', '$size.uom']
        },
        reportNumber: { $literal: 1 }
      });
    //  End Aggregation Projection Example 1
    const docs = await cursor.toArray();
    for (const doc of docs) {
      expect(doc).to.have.all.keys(['item', 'status', 'area', 'reportNumber']);
      expect(doc).to.not.have.property('_id');
      expect(doc.area).to.be.a('string');
      expect(doc.reportNumber).to.equal(1);
    }
  });
});
