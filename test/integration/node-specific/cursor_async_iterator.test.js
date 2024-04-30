'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

describe('Cursor Async Iterator Tests', function () {
  context('default promise library', function () {
    let client, collection;
    before(async function () {
      client = this.configuration.newClient();

      await client.connect();
      const docs = Array.from({ length: 1000 }).map((_, index) => ({ foo: index, bar: 1 }));

      collection = client.db(this.configuration.db).collection('async_cursor_tests');

      await collection.deleteMany({});
      await collection.insertMany(docs);
      await client.close();
    });

    beforeEach(async function () {
      client = this.configuration.newClient();
      await client.connect();
      collection = client.db(this.configuration.db).collection('async_cursor_tests');
    });

    afterEach(() => client.close());

    it('should be able to use a for-await loop on a find command cursor', async function () {
      const cursor = collection.find({ bar: 1 });

      let counter = 0;
      for await (const doc of cursor) {
        expect(doc).to.have.property('bar', 1);
        counter += 1;
      }

      expect(counter).to.equal(1000);
      expect(cursor.closed).to.be.true;
    });

    it('should be able to use a for-await loop on an aggregation cursor', async function () {
      const cursor = collection.aggregate([{ $match: { bar: 1 } }]);

      let counter = 0;
      for await (const doc of cursor) {
        expect(doc).to.have.property('bar', 1);
        counter += 1;
      }

      expect(counter).to.equal(1000);
      expect(cursor.closed).to.be.true;
    });

    it('should be able to use a for-await loop on a command cursor', {
      metadata: { requires: { mongodb: '>=3.0.0' } },
      test: async function () {
        const cursor1 = collection.listIndexes();
        const cursor2 = collection.listIndexes();

        const indexes = await cursor1.toArray();
        let counter = 0;
        for await (const doc of cursor2) {
          expect(doc).to.exist;
          counter += 1;
        }

        expect(counter).to.equal(indexes.length);
        expect(cursor1.closed).to.be.true;
        expect(cursor2.closed).to.be.true;
      }
    });

    it('should not iterate if closed immediately', async function () {
      const cursor = collection.find();
      await cursor.close();

      let count = 0;
      // eslint-disable-next-line no-unused-vars
      for await (const _ of cursor) count++;

      expect(count).to.equal(0);
      expect(cursor.closed).to.be.true;
    });

    it('should properly stop when cursor is closed', async function () {
      const cursor = collection.find();

      let count = 0;
      for await (const doc of cursor) {
        expect(doc).to.exist;
        count++;
        await cursor.close();
      }

      expect(count).to.equal(1);
      expect(cursor.closed).to.be.true;
    });

    it('cleans up cursor when breaking out of for await of loops', async function () {
      const cursor = collection.find();

      for await (const doc of cursor) {
        expect(doc).to.exist;
        break;
      }

      expect(cursor.closed).to.be.true;
    });

    it('returns when attempting to reuse the cursor after a break', async function () {
      const cursor = collection.find();
      const spy = sinon.spy(cursor);

      for await (const doc of cursor) {
        expect(doc).to.exist;
        break;
      }

      expect(cursor.closed).to.be.true;

      for await (const doc of cursor) {
        expect.fail('Async generator returns immediately if cursor is closed', doc);
      }
      // cursor.close() should only be called once.
      expect(spy.close.calledOnce).to.be.true;
    });
  });
});
