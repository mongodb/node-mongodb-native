import { expect } from 'chai';

import { cleanup, createServer, HELLO } from '../tools/mongodb-mock';
import { MongoClient } from '../../src/mongo_client';
import { isHello } from '../../src/utils';
import { Long } from 'bson';

describe('Collection', function () {
  let server = null;

  beforeEach(async () => {
    server = await createServer();
  });

  afterEach(async () => {
    await cleanup();
  });

  context('#aggregate', () => {
    // general test for aggregate function
    async function testAggregate(config) {
      const client = new MongoClient(`mongodb://${server.uri()}/test`);

      server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.aggregate) {
          expect(doc.bypassDocumentValidation).equal(config.expected);
          request.reply({
            ok: 1,
            cursor: {
              firstBatch: [{}],
              id: Long.ZERO,
              ns: 'test.test'
            }
          });
        }

        if (isHello(doc)) {
          request.reply(Object.assign({}, HELLO));
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      await client.connect();
      const db = client.db('test');
      const collection = db.collection('test_c');

      const options = { bypassDocumentValidation: config.actual };

      const pipeline = [
        {
          $project: {}
        }
      ];
      await collection.aggregate(pipeline, options).next();
    }

    context('bypass document validation', () => {
      it('should only set bypass document validation if strictly true in aggregate', async function () {
        await testAggregate({ expected: true, actual: true });
      });

      it('should not set bypass document validation if not strictly true in aggregate', async function () {
        await testAggregate({ expected: undefined, actual: false });
      });
    });
  });

  context('#findOneAndModify', () => {
    async function testFindOneAndUpdate(config) {
      const client = new MongoClient(`mongodb://${server.uri()}/test`);

      server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.findAndModify) {
          expect(doc.bypassDocumentValidation).equal(config.expected);
          request.reply({
            ok: 1
          });
        }

        if (isHello(doc)) {
          request.reply(Object.assign({}, HELLO));
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      await client.connect();
      const db = client.db('test');
      const collection = db.collection('test_c');

      const options = { bypassDocumentValidation: config.actual };

      await collection.findOneAndUpdate({ name: 'Andy' }, { $inc: { score: 1 } }, options);
    }

    it('should only set bypass document validation if strictly true in findOneAndUpdate', async function () {
      await testFindOneAndUpdate({ expected: true, actual: true });
    });

    it('should not set bypass document validation if not strictly true in findOneAndUpdate', async function () {
      await testFindOneAndUpdate({ expected: undefined, actual: false });
    });
  });

  context('#bulkWrite', () => {
    async function testBulkWrite(config) {
      const client = new MongoClient(`mongodb://${server.uri()}/test`);

      server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.insert) {
          expect(doc.bypassDocumentValidation).equal(config.expected);
          request.reply({
            ok: 1
          });
        }

        if (isHello(doc)) {
          request.reply(Object.assign({}, HELLO));
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      await client.connect();
      const db = client.db('test');
      const collection = db.collection('test_c');

      const options = {
        bypassDocumentValidation: config.actual,
        ordered: config.ordered
      };

      await collection.bulkWrite([{ insertOne: { document: { a: 1 } } }], options);
    };

    // ordered bulk write, testing change in ordered.js
    it('should only set bypass document validation if strictly true in ordered bulkWrite', async function () {
      await testBulkWrite({ expected: true, actual: true, ordered: true });
    });

    it('should not set bypass document validation if not strictly true in ordered bulkWrite', async function () {
      await testBulkWrite({ expected: undefined, actual: false, ordered: true });
    });

    // unordered bulk write, testing change in ordered.js
    it('should only set bypass document validation if strictly true in unordered bulkWrite', async function () {
      await testBulkWrite({ expected: true, actual: true, ordered: false });
    });

    it('should not set bypass document validation if not strictly true in unordered bulkWrite', async function () {
      await testBulkWrite({ expected: undefined, actual: false, ordered: false });
    });
  });
});
