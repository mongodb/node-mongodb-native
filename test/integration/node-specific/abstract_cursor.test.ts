import { expect } from 'chai';

import { Collection, MongoClient } from '../../../src';

describe('class AbstractCursor', function () {
  let client: MongoClient;

  let collection: Collection;
  beforeEach(async function () {
    client = await this.configuration.newClient().connect();

    collection = client.db('abstract_cursor_integration').collection('test');

    await collection.insertMany(Array.from({ length: 5 }, (_, index) => ({ index })));
  });

  afterEach(async function () {
    await collection.deleteMany({});
    await client.close();
  });

  context('toArray() with custom transforms', function () {
    const falseyValues = [0, NaN, '', false];
    for (const value of falseyValues) {
      it(`supports mapping to falsey value '${value}'`, async function () {
        const cursor = collection.find();
        cursor.map(() => value);

        const result = await cursor.toArray();

        const expected = Array.from({ length: 5 }, () => value);
        expect(result).to.deep.equal(expected);
      });
    }

    it('does not support mapping to `null`', async function () {
      const cursor = collection.find();
      cursor.map(() => null);

      const result = await cursor.toArray();

      expect(result).to.deep.equal([]);
    });
  });

  context('Symbol.asyncIterator() with custom transforms', function () {
    const falseyValues = [0, NaN, '', false];
    for (const value of falseyValues) {
      it(`supports mapping to falsey value '${value}'`, async function () {
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

    it('does not support mapping to `null`', async function () {
      const cursor = collection.find();
      cursor.map(() => null);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const document of cursor) {
        expect.fail('Expected no documents from cursor, received at least one.');
      }
    });
  });

  context('forEach() with custom transforms', function () {
    const falseyValues = [0, NaN, '', false];
    for (const value of falseyValues) {
      it(`supports mapping to falsey value '${value}'`, async function () {
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

    it('does not support mapping to `null`', async function () {
      const cursor = collection.find();
      cursor.map(() => null);

      function transform() {
        expect.fail('Expected no documents from cursor, received at least one.');
      }

      await cursor.forEach(transform);
    });
  });
});
