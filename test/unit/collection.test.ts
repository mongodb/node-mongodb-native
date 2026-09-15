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

    context('command options', () => {
      it('sends command options at the command root on the two parameter path', async () => {
        const command = await captureCreateIndexes(collection =>
          collection.createIndex({ a: 1 }, { unique: true, commitQuorum: 2 })
        );

        expect(command).to.have.property('commitQuorum', 2);
        // index options belong on the index description, not the command root
        expect(command).to.not.have.property('unique');
      });

      it('sends command options at the command root on the three parameter path', async () => {
        const command = await captureCreateIndexes(collection =>
          collection.createIndex({ a: 1 }, { unique: true }, { commitQuorum: 2 })
        );

        expect(command).to.have.property('commitQuorum', 2);
        expect(command).to.not.have.property('unique');
      });

      it('does not write `comment` to the command (createIndexes never has)', async () => {
        const command = await captureCreateIndexes(collection =>
          collection.createIndex({ a: 1 }, { unique: true }, { comment: 'a comment' })
        );

        // `comment` is accepted by the option types but `buildCommandDocument` only writes
        // `commitQuorum`. Documented here so a future change to that is a deliberate one.
        expect(command).to.not.have.property('comment');
      });
    });

    context('index options', () => {
      it('keeps known index options on the index description', async () => {
        const command = await captureCreateIndexes(collection =>
          collection.createIndex({ a: 1 }, { unique: true })
        );

        expect(command.indexes).to.have.lengthOf(1);
        expect(command.indexes[0]).to.have.property('unique', true);
        expect(command.indexes[0]).to.have.property('name', 'a_1');
      });

      it('drops unknown index options on the two parameter path', async () => {
        const command = await captureCreateIndexes(collection =>
          // @ts-expect-error: unknown index options are filtered on the legacy path
          collection.createIndex({ a: 1 }, { unique: true, notARealIndexOption: true })
        );

        expect(command.indexes[0]).to.have.property('unique', true);
        expect(command.indexes[0]).to.not.have.property('notARealIndexOption');
      });

      it('keeps command level fields out of the index description', async () => {
        const command = await captureCreateIndexes(collection =>
          collection.createIndex({ a: 1 }, { unique: true, comment: 'a comment', maxTimeMS: 1000 })
        );

        expect(command.indexes[0]).to.not.have.property('comment');
        expect(command.indexes[0]).to.not.have.property('maxTimeMS');
        expect(command.indexes[0]).to.not.have.property('readConcern');
        expect(command.indexes[0]).to.not.have.property('readPreference');
        expect(command.indexes[0]).to.not.have.property('promoteLongs');
      });

      it('passes unknown index options through on the three parameter path', async () => {
        const command = await captureCreateIndexes(collection =>
          collection.createIndex(
            { a: 1 },
            // @ts-expect-error: unknown index options are passed through to the server
            { unique: true, finestIndexedLevel: 15 },
            { commitQuorum: 2 }
          )
        );

        expect(command.indexes[0]).to.have.property('unique', true);
        expect(command.indexes[0]).to.have.property('finestIndexedLevel', 15);
      });
    });
  });
});
