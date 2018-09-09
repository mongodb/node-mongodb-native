'use strict';

const setupDatabase = require('../functional/shared').setupDatabase;
const expect = require('chai').expect;

describe('examples(query-array-of-documents):', function() {
  let client;
  let db;

  before(async function() {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function() {
    client = this.configuration.newClient();
    await client.connect();

    db = client.db(this.configuration.db);
    await db.collection('inventory').deleteMany({});
    // Start Example 29
    await db.collection('inventory').insertMany([
      {
        item: 'journal',
        instock: [{ warehouse: 'A', qty: 5 }, { warehouse: 'C', qty: 15 }]
      },
      {
        item: 'notebook',
        instock: [{ warehouse: 'C', qty: 5 }]
      },
      {
        item: 'paper',
        instock: [{ warehouse: 'A', qty: 60 }, { warehouse: 'B', qty: 15 }]
      },
      {
        item: 'planner',
        instock: [{ warehouse: 'A', qty: 40 }, { warehouse: 'B', qty: 5 }]
      },
      {
        item: 'postcard',
        instock: [{ warehouse: 'B', qty: 15 }, { warehouse: 'C', qty: 35 }]
      }
    ]);
    // End Example 29
  });

  afterEach(async function() {
    await client.close();
    client = undefined;
    db = undefined;
  });

  it('Query for a Document Nested in an Array', {
    metadata: { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    test: async function() {
      // Start Example 30
      const cursor = db.collection('inventory').find({
        instock: { warehouse: 'A', qty: 5 }
      });
      // End Example 30

      expect(await cursor.count()).to.equal(1);
    }
  });

  it('Query for a Document Nested in an Array - document order', {
    metadata: { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    test: async function() {
      // Start Example 31
      const cursor = db.collection('inventory').find({
        instock: { qty: 5, warehouse: 'A' }
      });
      // End Example 31

      expect(await cursor.count()).to.equal(0);
    }
  });

  it('Use the Array Index to Query for a Field in the Embedded Document', {
    metadata: { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    test: async function() {
      // Start Example 32
      const cursor = db.collection('inventory').find({
        'instock.0.qty': { $lte: 20 }
      });
      // End Example 32

      expect(await cursor.count()).to.equal(3);
    }
  });

  it('Specify a Query Condition on a Field Embedded in an Array of Documents', {
    metadata: { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    test: async function() {
      // Start Example 33
      const cursor = db.collection('inventory').find({
        'instock.qty': { $lte: 20 }
      });
      // End Example 33

      expect(await cursor.count()).to.equal(5);
    }
  });

  it('A Single Nested Document Meets Multiple Query Conditions on Nested Fields', {
    metadata: { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    test: async function() {
      // Start Example 34
      const cursor = db.collection('inventory').find({
        instock: { $elemMatch: { qty: 5, warehouse: 'A' } }
      });
      // End Example 34

      expect(await cursor.count()).to.equal(1);
    }
  });

  it('A Single Nested Document Meets Multiple Query Conditions on Nested Fields: operators', {
    metadata: { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    test: async function() {
      // Start Example 35
      const cursor = db.collection('inventory').find({
        instock: { $elemMatch: { qty: { $gt: 10, $lte: 20 } } }
      });
      // End Example 35

      expect(await cursor.count()).to.equal(3);
    }
  });

  it('Combination of Elements Satisfies the Criteria', {
    metadata: { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    test: async function() {
      // Start Example 36
      const cursor = db.collection('inventory').find({
        'instock.qty': { $gt: 10, $lte: 20 }
      });
      // End Example 36

      expect(await cursor.count()).to.equal(4);
    }
  });

  it('Combination of Elements Satisfies the Criteria 2', {
    metadata: { requires: { topology: ['single'], mongodb: '>= 2.8.0' } },
    test: async function() {
      // Start Example 37
      const cursor = db.collection('inventory').find({
        'instock.qty': 5,
        'instock.warehouse': 'A'
      });
      // End Example 37

      expect(await cursor.count()).to.equal(2);
    }
  });
});
