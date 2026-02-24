import { expect } from 'chai';

import { type Collection, type MongoClient, ObjectId } from '../../../mongodb';

describe('raw bson support', () => {
  describe('raw', () => {
    describe('option inheritance', () => {
      // define client and option for tests to use
      let client: MongoClient;
      const option = { raw: true };
      for (const passOptionTo of ['client', 'db', 'collection', 'operation']) {
        it(`should respond with Buffer instance when option passed to ${passOptionTo}`, async function () {
          try {
            client = this.configuration.newClient(passOptionTo === 'client' ? option : undefined);

            const db = client.db('raw_bson_option_db', passOptionTo === 'db' ? option : undefined);
            const collection = db.collection(
              'raw_bson_option_coll',
              passOptionTo === 'collection' ? option : undefined
            );

            const insertResult = await collection.insertOne({ myData: 23 }).catch(error => error);
            const findOneResult = await collection
              .findOne({ myData: 23 }, passOptionTo === 'operation' ? option : undefined)
              .catch(error => error);

            expect(insertResult).to.have.property('acknowledged').to.be.true;
            expect(insertResult).to.have.property('insertedId').that.is.instanceOf(ObjectId);
            expect(findOneResult).to.be.instanceOf(Buffer);
          } finally {
            await client.close();
          }
        });
      }
    });

    describe('returns shared buffer', () => {
      let client: MongoClient;
      let collection: Collection<{ _id: number; myData: string }>;

      beforeEach(async function () {
        client = this.configuration.newClient();
        collection = client.db('test_raw').collection('test_raw');
        await collection.drop();
        await collection.insertOne({ _id: 1, myData: 'hello' });
        await collection.insertOne({ _id: 2, myData: 'bye bye' });
      });

      afterEach(async function () {
        await client?.close();
      });

      it('returned Buffer should not overwrite previously returned Buffer', async () => {
        const resultOne = (await collection.findOne(
          { _id: 1 },
          { raw: true }
        )) as unknown as Buffer;
        expect(resultOne).to.be.instanceOf(Buffer);
        expect(resultOne.indexOf(Buffer.from('hello'))).to.be.greaterThan(5);

        const resultTwo = (await collection.findOne(
          { _id: 2 },
          { raw: true }
        )) as unknown as Buffer;

        expect(resultTwo).to.be.instanceOf(Buffer);
        expect(resultTwo.indexOf(Buffer.from('bye bye'))).to.be.greaterThan(5);

        // From the Node.js Docs for allocUnsafeSlow:
        // However, in the case where a developer may need to retain a small chunk of memory from a pool for an indeterminate amount of time,
        // it may be appropriate to create an un-pooled Buffer instance using Buffer.allocUnsafeSlow() and then copying out the relevant bits.

        // The following expectation is mostly always true however it is possible that our
        // call to allocUnsafe does not use the same pooled buffer depending on the allocation size
        // expect(resultOne.buffer).to.equal(resultTwo.buffer);
      });
    });
  });

  describe('fieldsAsRaw', () => {
    describe('option inheritance', () => {
      // define client and option for tests to use
      let client: MongoClient;
      const option = { fieldsAsRaw: { myData: true } };
      for (const passOptionTo of ['client', 'db', 'collection', 'operation']) {
        it(`should have no effect on result when passed to ${passOptionTo}`, async function () {
          try {
            client = this.configuration.newClient(
              {},
              passOptionTo === 'client' ? option : undefined
            );

            const db = client.db('raw_bson_option_db', passOptionTo === 'db' ? option : undefined);
            const collection = db.collection(
              'raw_bson_option_coll',
              passOptionTo === 'collection' ? option : undefined
            );

            const insertResult = await collection.insertOne({ myData: 23 }).catch(error => error);
            const findOneResult = await collection
              .findOne({ myData: 23 }, passOptionTo === 'operation' ? option : undefined)
              .catch(error => error);

            expect(insertResult).to.have.property('insertedId').that.is.instanceOf(ObjectId);
            expect(findOneResult).to.have.property('myData', 23);
            expect(insertResult).to.not.be.instanceOf(Buffer);
            expect(findOneResult).to.not.be.instanceOf(Buffer);
          } finally {
            await client?.close();
            // @ts-expect-error: just making sure the next test doesn't have access
            client = null;
          }
        });
      }
    });
  });
});
