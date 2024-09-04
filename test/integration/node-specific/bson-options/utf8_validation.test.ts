import { expect } from 'chai';
import * as net from 'net';
import * as sinon from 'sinon';
import { inspect } from 'util';

import {
  BSON,
  BSONError,
  type Collection,
  type MongoClient,
  MongoServerError,
  OnDemandDocument,
  OpMsgResponse
} from '../../../mongodb';

describe('class MongoDBResponse', () => {
  let client;

  afterEach(async () => {
    sinon.restore();
    if (client) await client.close();
  });

  context(
    'when the server is given a long multibyte utf sequence and there is a writeError that includes invalid utf8',
    () => {
      let client: MongoClient;
      let error: MongoServerError;
      for (const { optionDescription, options } of [
        { optionDescription: 'explicitly enabled', options: { enableUtf8Validation: true } },
        { optionDescription: 'explicitly disabled', options: { enableUtf8Validation: false } },
        { optionDescription: 'omitted', options: {} }
      ]) {
        context('when utf8 validation is ' + optionDescription, function () {
          beforeEach(async function () {
            client = this.configuration.newClient();

            async function generateWriteErrorWithInvalidUtf8() {
              // Insert a large string of multibyte UTF-8 characters
              const _id = '\u{1F92A}'.repeat(100);

              const test = client.db('parsing').collection<{ _id: string }>('parsing');
              await test.insertOne({ _id }, options);

              const spy = sinon.spy(OpMsgResponse.prototype, 'parse');

              error = await test.insertOne({ _id }).catch(error => error);

              // Check that the server sent us broken BSON (bad UTF)
              expect(() => {
                BSON.deserialize(spy.returnValues[0], { validation: { utf8: true } });
              }).to.throw(
                BSON.BSONError,
                /Invalid UTF/i,
                'did not generate error with invalid utf8'
              );
            }

            await generateWriteErrorWithInvalidUtf8();
          });

          afterEach(async function () {
            sinon.restore();
            await client.db('parsing').dropDatabase();
            await client.close();
          });

          it('does not throw a UTF-8 parsing error', function () {
            // Assert the driver squashed it
            expect(error).to.be.instanceOf(MongoServerError);
            expect(error.message).to.match(/duplicate/i);
            expect(error.message).to.not.match(/utf/i);
            expect(error.errmsg).to.include('\uFFFD');
          });
        });
      }
    }
  );
});

describe('parsing of utf8-invalid documents wish cursors', function () {
  let client: MongoClient;
  let collection: Collection;

  /**
   * Inserts a document with malformed utf8 bytes.  This method spies on socket.write, and then waits
   * for an OP_MSG payload corresponding to `collection.insertOne({ field: 'é' })`, and then modifies the
   * bytes of the character 'é', to produce invalid utf8.
   */
  async function insertDocumentWithInvalidUTF8() {
    const stub = sinon.stub(net.Socket.prototype, 'write').callsFake(function (...args) {
      const providedBuffer = args[0].toString('hex');
      const targetBytes = Buffer.from(document.field, 'utf-8').toString('hex');

      if (providedBuffer.includes(targetBytes)) {
        if (providedBuffer.split(targetBytes).length !== 2) {
          sinon.restore();
          const message = `too many target bytes sequences: received ${
            providedBuffer.split(targetBytes).length
          }`;
          throw new Error(message);
        }
        const buffer = Buffer.from(providedBuffer.replace(targetBytes, 'c301'.repeat(8)), 'hex');
        const result = stub.wrappedMethod.apply(this, [buffer]);
        sinon.restore();
        return result;
      }
      const result = stub.wrappedMethod.apply(this, args);
      return result;
    });

    const document = {
      field: 'é'.repeat(8)
    };

    await collection.insertOne(document);

    sinon.restore();
  }

  beforeEach(async function () {
    client = this.configuration.newClient();
    await client.connect();
    const db = client.db('test');
    collection = db.collection('invalidutf');

    await collection.deleteMany({});
    await insertDocumentWithInvalidUTF8();
  });

  afterEach(async function () {
    sinon.restore();
    await client.close();
  });

  context('when utf-8 validation is explicitly disabled', function () {
    it('documents can be read using a for-await loop without errors', async function () {
      for await (const _doc of collection.find({}, { enableUtf8Validation: false }));
    });
    it('documents can be read using next() without errors', async function () {
      const cursor = collection.find({}, { enableUtf8Validation: false });

      while (await cursor.hasNext()) {
        await cursor.next();
      }
    });

    it('documents can be read using toArray() without errors', async function () {
      const cursor = collection.find({}, { enableUtf8Validation: false });
      await cursor.toArray();
    });

    it('documents can be read using .stream() without errors', async function () {
      const cursor = collection.find({}, { enableUtf8Validation: false });
      await cursor.stream().toArray();
    });

    it('documents can be read with tryNext() without error', async function () {
      const cursor = collection.find({}, { enableUtf8Validation: false });

      while (await cursor.hasNext()) {
        await cursor.tryNext();
      }
    });
  });

  async function expectReject(fn: () => Promise<void>) {
    try {
      await fn();
      expect.fail('expected the provided callback function to reject, but it did not.');
    } catch (error) {
      expect(error).to.match(/Invalid UTF-8 string in BSON document/);
      expect(error).to.be.instanceOf(BSONError);
    }
  }

  context('when utf-8 validation is explicitly enabled', function () {
    it('a for-await loop throws a BSON error', async function () {
      await expectReject(async () => {
        for await (const _doc of collection.find({}, { enableUtf8Validation: true }));
      });
    });
    it('next() throws a BSON error', async function () {
      await expectReject(async () => {
        const cursor = collection.find({}, { enableUtf8Validation: true });

        while (await cursor.hasNext()) {
          await cursor.next();
        }
      });
    });

    it('toArray() throws a BSON error', async function () {
      await expectReject(async () => {
        const cursor = collection.find({}, { enableUtf8Validation: true });
        await cursor.toArray();
      });
    });

    it('.stream() throws a BSONError', async function () {
      await expectReject(async () => {
        const cursor = collection.find({}, { enableUtf8Validation: true });
        await cursor.stream().toArray();
      });
    });

    it('tryNext() throws a BSONError', async function () {
      await expectReject(async () => {
        const cursor = collection.find({}, { enableUtf8Validation: true });

        while (await cursor.hasNext()) {
          await cursor.tryNext();
        }
      });
    });
  });

  context('utf-8 validation defaults to enabled', function () {
    it('a for-await loop throws a BSON error', async function () {
      await expectReject(async () => {
        for await (const _doc of collection.find({}));
      });
    });
    it('next() throws a BSON error', async function () {
      await expectReject(async () => {
        const cursor = collection.find({});

        while (await cursor.hasNext()) {
          await cursor.next();
        }
      });
    });

    it('toArray() throws a BSON error', async function () {
      await expectReject(async () => {
        const cursor = collection.find({});
        await cursor.toArray();
      });
    });

    it('.stream() throws a BSONError', async function () {
      await expectReject(async () => {
        const cursor = collection.find({});
        await cursor.stream().toArray();
      });
    });

    it('tryNext() throws a BSONError', async function () {
      await expectReject(async () => {
        const cursor = collection.find({}, { enableUtf8Validation: true });

        while (await cursor.hasNext()) {
          await cursor.tryNext();
        }
      });
    });
  });
});
