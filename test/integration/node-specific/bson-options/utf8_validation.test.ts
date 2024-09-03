import { expect } from 'chai';
import * as net from 'net';
import * as sinon from 'sinon';

import {
  BSON,
  BSONError,
  type Collection,
  type MongoClient,
  MongoDBResponse,
  MongoServerError,
  OpMsgResponse
} from '../../../mongodb';

const EXPECTED_VALIDATION_DISABLED_ARGUMENT = {
  utf8: false
};

const EXPECTED_VALIDATION_ENABLED_ARGUMENT = {
  utf8: {
    writeErrors: false
  }
};

describe('class MongoDBResponse', () => {
  let bsonSpy: sinon.SinonSpy;

  beforeEach(() => {
    bsonSpy = sinon.spy(MongoDBResponse.prototype, 'parseBsonSerializationOptions');
  });

  afterEach(() => {
    bsonSpy?.restore();
    // @ts-expect-error: Allow this to be garbage collected
    bsonSpy = null;
  });

  let client;

  afterEach(async () => {
    if (client) await client.close();
  });

  describe('enableUtf8Validation option set to false', () => {
    const option = { enableUtf8Validation: false };

    for (const passOptionTo of ['client', 'db', 'collection', 'operation']) {
      it(`should disable validation with option passed to ${passOptionTo}`, async function () {
        client = this.configuration.newClient(passOptionTo === 'client' ? option : undefined);

        const db = client.db('bson_utf8Validation_db', passOptionTo === 'db' ? option : undefined);
        const collection = db.collection(
          'bson_utf8Validation_coll',
          passOptionTo === 'collection' ? option : undefined
        );

        await collection.insertOne(
          { name: 'John Doe' },
          passOptionTo === 'operation' ? option : {}
        );

        expect(bsonSpy).to.have.been.called;
        const result = bsonSpy.lastCall.returnValue;
        expect(result).to.deep.equal(EXPECTED_VALIDATION_DISABLED_ARGUMENT);
      });
    }
  });

  describe('enableUtf8Validation option set to true', () => {
    // define client and option for tests to use
    const option = { enableUtf8Validation: true };
    for (const passOptionTo of ['client', 'db', 'collection', 'operation']) {
      it(`should enable validation with option passed to ${passOptionTo}`, async function () {
        client = this.configuration.newClient(passOptionTo === 'client' ? option : undefined);
        await client.connect();

        const db = client.db('bson_utf8Validation_db', passOptionTo === 'db' ? option : undefined);
        const collection = db.collection(
          'bson_utf8Validation_coll',
          passOptionTo === 'collection' ? option : undefined
        );

        await collection.insertOne(
          { name: 'John Doe' },
          passOptionTo === 'operation' ? option : {}
        );

        expect(bsonSpy).to.have.been.called;
        const result = bsonSpy.lastCall.returnValue;
        expect(result).to.deep.equal(EXPECTED_VALIDATION_ENABLED_ARGUMENT);
      });
    }
  });

  describe('enableUtf8Validation option not set', () => {
    const option = {};
    for (const passOptionTo of ['client', 'db', 'collection', 'operation']) {
      it(`should default to enabled with option passed to ${passOptionTo}`, async function () {
        client = this.configuration.newClient(passOptionTo === 'client' ? option : undefined);
        await client.connect();

        const db = client.db('bson_utf8Validation_db', passOptionTo === 'db' ? option : undefined);
        const collection = db.collection(
          'bson_utf8Validation_coll',
          passOptionTo === 'collection' ? option : undefined
        );

        await collection.insertOne(
          { name: 'John Doe' },
          passOptionTo === 'operation' ? option : {}
        );

        expect(bsonSpy).to.have.been.called;
        const result = bsonSpy.lastCall.returnValue;
        expect(result).to.deep.equal(EXPECTED_VALIDATION_ENABLED_ARGUMENT);
      });
    }
  });

  context(
    'when the server is given a long multibyte utf sequence and there is a writeError',
    () => {
      let client: MongoClient;
      beforeEach(async function () {
        client = this.configuration.newClient();
      });

      afterEach(async function () {
        sinon.restore();
        await client.db('parsing').dropDatabase();
        await client.close();
      });

      it('does not throw a UTF-8 parsing error', async () => {
        // Insert a large string of multibyte UTF-8 characters
        const _id = '\u{1F92A}'.repeat(100);

        const test = client.db('parsing').collection<{ _id: string }>('parsing');
        await test.insertOne({ _id });

        const spy = sinon.spy(OpMsgResponse.prototype, 'parse');

        const error = await test.insertOne({ _id }).catch(error => error);

        // Check that the server sent us broken BSON (bad UTF)
        expect(() => {
          BSON.deserialize(spy.returnValues[0], { validation: { utf8: true } });
        }).to.throw(BSON.BSONError, /Invalid UTF/i);

        // Assert the driver squashed it
        expect(error).to.be.instanceOf(MongoServerError);
        expect(error.message).to.match(/duplicate/i);
        expect(error.message).to.not.match(/utf/i);
        expect(error.errmsg).to.include('\uFFFD');
      });
    }
  );
});

describe('utf8 validation with cursors', function () {
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
      const targetBytes = Buffer.from('é').toString('hex');

      if (providedBuffer.includes(targetBytes)) {
        if (providedBuffer.split(targetBytes).length !== 2) {
          throw new Error('received buffer more than one `c3a9` sequences.  or perhaps none?');
        }
        const buffer = Buffer.from(providedBuffer.replace('c3a9', 'c301'), 'hex');
        const result = stub.wrappedMethod.apply(this, [buffer]);
        sinon.restore();
        return result;
      }
      const result = stub.wrappedMethod.apply(this, args);
      return result;
    });

    const document = {
      field: 'é'
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
    it('a for-await loop throw a BSON error', async function () {
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
    it('a for-await loop throw a BSON error', async function () {
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
