'use strict';

const setupDatabase = require('../functional/shared').setupDatabase;
const expect = require('chai').expect;

describe('examples(change-stream):', function() {
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
  });

  afterEach(async function() {
    await client.close();
    client = undefined;
    db = undefined;
  });

  it('Open A Change Stream', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.6.0' } },
    test: async function() {
      await db.collection('inventory').insertOne({ a: 1 });
      setTimeout(async function() {
        await db.collection('inventory').insertOne({ a: 1 });
      }, 250);

      // Start Changestream Example 1
      const collection = db.collection('inventory');
      const changeStream = collection.watch();
      const next = await changeStream.next();
      // End Changestream Example 1

      await changeStream.close();

      expect(next)
        .to.have.property('operationType')
        .that.equals('insert');
    }
  });

  it('Lookup Full Document for Update Operations', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.6.0' } },
    test: async function() {
      await db.collection('inventory').insertOne({ a: 1, b: 2 });
      setTimeout(async function() {
        await db.collection('inventory').updateOne({ a: 1 }, { $set: { a: 2 } });
      }, 250);

      // Start Changestream Example 2
      const collection = db.collection('inventory');
      const changeStream = collection.watch({ fullDocument: 'updateLookup' });
      const next = await changeStream.next();
      // End Changestream Example 2

      await changeStream.close();

      expect(next)
        .to.have.property('operationType')
        .that.equals('update');
      expect(next)
        .to.have.property('fullDocument')
        .that.has.all.keys(['_id', 'a', 'b']);
    }
  });

  it('Resume a Change Stream', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.6.0' } },
    test: async function() {
      setTimeout(async function() {
        await db.collection('inventory').insertOne({ a: 1 });
        await db.collection('inventory').insertOne({ b: 2 });
      }, 250);

      // Start Changestream Example 3
      const collection = db.collection('inventory');
      const changeStream = collection.watch();
      const change1 = await changeStream.next();

      const resumeAfter = change1._id;
      changeStream.close();

      const newChangeStream = collection.watch({ resumeAfter });
      const change2 = await newChangeStream.next();
      // End Changestream Example 3

      await newChangeStream.close();

      expect(change1).to.have.nested.property('fullDocument.a', 1);
      expect(change2).to.have.nested.property('fullDocument.b', 2);
    }
  });

  it('Modify Change Stream Output', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.6.0' } },
    test: async function() {
      setTimeout(async function() {
        await db.collection('inventory').insertOne({ username: 'alice' });
      }, 250);

      // Start Changestream Example 4
      const pipeline = [
        { $match: { 'fullDocument.username': 'alice' } },
        { $addFields: { newField: 'this is an added field!' } }
      ];
      const collection = db.collection('inventory');
      const changeStream = collection.watch(pipeline);
      const next = await changeStream.next();
      // End Changestream Example 4

      await changeStream.close();

      expect(next).to.have.nested.property('fullDocument.username', 'alice');
      expect(next).to.have.property('newField', 'this is an added field!');
    }
  });
});
