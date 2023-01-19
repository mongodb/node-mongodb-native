import { expect } from 'chai';
import { inspect } from 'util';

import { Collection, MongoAPIError, MongoClient } from '../../mongodb';

const falseyValues = [0, 0n, NaN, '', false, undefined];

describe('class AbstractCursor', function () {
  let client: MongoClient;

  let collection: Collection;
  beforeEach(async function () {
    client = this.configuration.newClient();

    collection = client.db('abstract_cursor_integration').collection('test');

    await collection.insertMany(Array.from({ length: 5 }, (_, index) => ({ index })));
  });

  afterEach(async function () {
    await collection.deleteMany({});
    await client.close();
  });

  context('toArray() with custom transforms', function () {
    for (const value of falseyValues) {
      it(`supports mapping to falsey value '${inspect(value)}'`, async function () {
        const cursor = collection.find();
        cursor.map(() => value);

        const result = await cursor.toArray();

        const expected = Array.from({ length: 5 }, () => value);
        expect(result).to.deep.equal(expected);
      });
    }

    it('throws when mapping to `null` and cleans up cursor', async function () {
      const cursor = collection.find();
      cursor.map(() => null);

      const error = await cursor.toArray().catch(e => e);

      expect(error).be.instanceOf(MongoAPIError);
      expect(cursor.closed).to.be.true;
    });
  });

  context('Symbol.asyncIterator() with custom transforms', function () {
    for (const value of falseyValues) {
      it(`supports mapping to falsey value '${inspect(value)}'`, async function () {
        const cursor = collection.find();
        cursor.map(() => value);

        let count = 0;

        for await (const document of cursor) {
          expect(document).to.deep.equal(value);
          count++;
        }

        expect(count).to.equal(5);
      });
    }

    it('throws when mapping to `null` and cleans up cursor', async function () {
      const cursor = collection.find();
      cursor.map(() => null);

      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const document of cursor) {
          expect.fail('Expected error to be thrown');
        }
      } catch (error) {
        expect(error).to.be.instanceOf(MongoAPIError);
        expect(cursor.closed).to.be.true;
      }
    });
  });

  context('forEach() with custom transforms', function () {
    for (const value of falseyValues) {
      it(`supports mapping to falsey value '${inspect(value)}'`, async function () {
        const cursor = collection.find();
        cursor.map(() => value);

        let count = 0;

        function transform(value) {
          expect(value).to.deep.equal(value);
          count++;
        }

        await cursor.forEach(transform);

        expect(count).to.equal(5);
      });
    }

    it('throws when mapping to `null` and cleans up cursor', async function () {
      const cursor = collection.find();
      cursor.map(() => null);

      function iterator() {
        expect.fail('Expected no documents from cursor, received at least one.');
      }

      const error = await cursor.forEach(iterator).catch(e => e);
      expect(error).to.be.instanceOf(MongoAPIError);
      expect(cursor.closed).to.be.true;
    });
  });
});
