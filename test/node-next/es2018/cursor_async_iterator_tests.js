'use strict';

const { expect } = require('chai');
const { MongoError } = require('../../../index');

describe('Cursor Async Iterator Tests', function() {
  let client, collection;
  before(async function() {
    client = this.configuration.newClient();

    await client.connect();
    const docs = Array.from({ length: 1000 }).map((_, index) => ({ foo: index, bar: 1 }));

    collection = client.db(this.configuration.db).collection('async_cursor_tests');

    await collection.deleteMany({});
    await collection.insertMany(docs);
    await client.close();
  });

  beforeEach(async function() {
    client = this.configuration.newClient();
    await client.connect();
    collection = client.db(this.configuration.db).collection('async_cursor_tests');
  });

  afterEach(() => client.close());

  it('should be able to use a for-await loop on a find command cursor', {
    metadata: { requires: { node: '>=10.5.0' } },
    test: async function() {
      const cursor = collection.find({ bar: 1 });

      let counter = 0;
      for await (const doc of cursor) {
        expect(doc).to.have.property('bar', 1);
        counter += 1;
      }

      expect(counter).to.equal(1000);
    }
  });

  it('should be able to use a for-await loop on an aggregation cursor', {
    metadata: { requires: { node: '>=10.5.0' } },
    test: async function() {
      const cursor = collection.aggregate([{ $match: { bar: 1 } }]);

      let counter = 0;
      for await (const doc of cursor) {
        expect(doc).to.have.property('bar', 1);
        counter += 1;
      }

      expect(counter).to.equal(1000);
    }
  });

  it('should be able to use a for-await loop on a command cursor', {
    metadata: { requires: { node: '>=10.5.0', mongodb: '>=3.0.0' } },
    test: async function() {
      const cursor1 = collection.listIndexes();
      const cursor2 = collection.listIndexes();

      const indexes = await cursor1.toArray();
      let counter = 0;
      for await (const doc of cursor2) {
        expect(doc).to.exist;
        counter += 1;
      }

      expect(counter).to.equal(indexes.length);
    }
  });

  it('should properly error when cursor is closed', {
    metadata: { requires: { node: '>=10.5.0' } },
    test: async function() {
      const cursor = collection.find();

      try {
        for await (const doc of cursor) {
          expect(doc).to.exist;
          cursor.close();
        }
        throw new Error('expected closing the cursor to break iteration');
      } catch (e) {
        expect(e).to.be.an.instanceOf(MongoError);
      }
    }
  });
});
