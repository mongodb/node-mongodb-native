import { Long } from 'bson';
import { expect } from 'chai';

import { type Collection, type Document, isHello, MongoClient } from '../mongodb';
import { cleanup, createServer, HELLO } from '../tools/mongodb-mock';

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
      await client.close();
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
      await client.close();
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
      await client.close();
    }

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

  context('#createIndex', () => {
    /**
     * Runs `createIndex` against the mock server and returns the `createIndexes` command
     * that went over the wire, so both the command root and the index descriptions can be
     * asserted on.
     */
    async function captureCreateIndexes(
      run: (collection: Collection) => Promise<unknown>
    ): Promise<Document> {
      const client = new MongoClient(`mongodb://${server.uri()}/test`);
      let command: Document | undefined;

      server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.createIndexes) {
          command = doc;
          request.reply({ ok: 1, createdCollectionAutomatically: false });
        } else if (isHello(doc)) {
          request.reply(Object.assign({}, HELLO));
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      await client.connect();
      try {
        await run(client.db('test').collection('test_c'));
      } finally {
        await client.close();
      }

      expect(command, 'no createIndexes command was sent').to.exist;
      return command as Document;
    }

    context('when command options are supplied', () => {
      it('enables passthrough and passes index and command options separately', async () => {
        const command = await captureCreateIndexes(collection =>
          collection.createIndex(
            { a: 1 },
            { unique: true, finestIndexedLevel: 15, commitQuorum: 1 },
            { commitQuorum: 2 }
          )
        );

        // index options come only from the second argument, unknown ones included
        expect(command.indexes[0]).to.include({
          unique: true,
          finestIndexedLevel: 15,
          commitQuorum: 1
        });
        // command options come only from the third argument
        expect(command).to.have.property('commitQuorum', 2);
        expect(command).to.not.have.property('unique');
      });
    });

    context('when command options are not supplied', () => {
      it('disables passthrough and passes an index and command option composite', async () => {
        const command = await captureCreateIndexes(collection =>
          collection.createIndex(
            { a: 1 },
            // @ts-expect-error: the legacy options type is closed; the unknown option is dropped at runtime
            { unique: true, notARealIndexOption: true, commitQuorum: 2 }
          )
        );

        expect(command).to.have.property('commitQuorum', 2);
        // the unknown option and the command option are kept out of the index description, and
        // nothing `resolveOptions` injects (read preference, BSON options, ...) leaks into it
        expect(command.indexes[0]).to.deep.equal({ unique: true, name: 'a_1', key: { a: 1 } });
      });
    });
  });
});
