'use strict';
const { expect } = require('chai');
const { runLater } = require('../../tools/utils');

describe('Tailable cursor tests', function () {
  describe('awaitData', () => {
    let client;
    let cursor;

    beforeEach(async function () {
      client = await this.configuration.newClient().connect();
    });

    afterEach(async () => {
      if (cursor) await cursor.close();
      await client.close();
    });

    it(
      'should block waiting for new data to arrive when the cursor reaches the end of the capped collection',
      {
        metadata: { requires: { mongodb: '>=3.2' } },
        async test() {
          const db = client.db('cursor_tailable');

          try {
            await db.collection('cursor_tailable').drop();
            // eslint-disable-next-line no-empty
          } catch (_) {}

          const collection = await db.createCollection('cursor_tailable', {
            capped: true,
            size: 10000
          });

          const res = await collection.insertOne({ a: 1 });
          expect(res).property('insertedId').to.exist;

          cursor = collection.find({}, { batchSize: 2, tailable: true, awaitData: true });
          const doc0 = await cursor.next();
          expect(doc0).to.have.property('a', 1);

          // After 300ms make an insert
          const later = runLater(async () => {
            const res = await collection.insertOne({ b: 2 });
            expect(res).property('insertedId').to.exist;
          }, 300);

          const start = new Date();
          const doc1 = await cursor.next();
          expect(doc1).to.have.property('b', 2);
          const end = new Date();

          await later; // make sure this finished, without a failure

          // We should see here that cursor.next blocked for at least 300ms
          expect(end.getTime() - start.getTime()).to.be.at.least(300);
        }
      }
    );
  });
});
