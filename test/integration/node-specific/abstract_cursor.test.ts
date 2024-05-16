import { expect } from 'chai';
import { once } from 'events';
import * as sinon from 'sinon';
import { Transform } from 'stream';
import { inspect } from 'util';

import {
  type Collection,
  type FindCursor,
  MongoAPIError,
  type MongoClient,
  MongoServerError
} from '../../mongodb';

describe('class AbstractCursor', function () {
  describe('regression tests NODE-5372', function () {
    let client: MongoClient;
    let collection: Collection;
    const docs = [{ count: 0 }, { count: 10 }];

    beforeEach(async function () {
      client = this.configuration.newClient();
      collection = client.db('abstract_cursor_integration').collection('test');
      await collection.insertMany(docs);
    });

    afterEach(async function () {
      await collection.deleteMany({});
      await client.close();
    });

    it('cursors can be iterated with hasNext+next', async function () {
      const cursor = collection
        // sort ensures that the docs in the cursor are in the same order as the docs inserted
        .find({}, { sort: { count: 1 } })
        .map(doc => ({ ...doc, count: doc.count + 1 }));
      for (let count = 0; await cursor.hasNext(); count++) {
        const received = await cursor.next();
        const actual = docs[count];
        expect(received.count).to.equal(actual.count + 1);
      }
    });
  });

  describe('cursor iteration APIs', function () {
    let client: MongoClient;
    let collection: Collection;
    const transformSpy = sinon.spy(doc => ({ ...doc, name: doc.name.toUpperCase() }));

    beforeEach(async function () {
      client = this.configuration.newClient();
      collection = client.db('abstract_cursor_integration').collection('test');
      await collection.insertMany([{ name: 'john doe' }]);
    });

    afterEach(async function () {
      transformSpy.resetHistory();
      await collection.deleteMany({});
      await client.close();
    });

    describe(`hasNext()`, function () {
      describe('when there is a transform on the cursor', function () {
        it(`the transform is NOT called`, async () => {
          const cursor = collection.find().map(transformSpy);
          const hasNext = await cursor.hasNext();
          expect(transformSpy).not.to.have.been.called;
          expect(hasNext).to.be.true;
        });
      });
    });
    const operations: ReadonlyArray<readonly [string, (arg0: FindCursor) => Promise<unknown>]> = [
      ['tryNext', (cursor: FindCursor) => cursor.tryNext()],
      ['next', (cursor: FindCursor) => cursor.next()],
      [
        'Symbol.asyncIterator().next',
        async (cursor: FindCursor) => {
          const iterator = cursor[Symbol.asyncIterator]();
          return iterator.next().then(({ value }) => value);
        }
      ],
      [
        'Cursor.stream',
        (cursor: FindCursor) => {
          const stream = cursor.stream();
          return once(stream, 'data').then(([doc]) => doc);
        }
      ]
    ] as const;
    for (const [method, func] of operations) {
      describe(`${method}()`, function () {
        describe('when there is a transform on the cursor', function () {
          it(`the transform is called`, async () => {
            const cursor = collection.find().map(transformSpy);
            const doc = await func(cursor);
            expect(transformSpy).to.have.been.calledOnce;
            expect(doc.name).to.equal('JOHN DOE');
          });

          describe('when the transform throws', function () {
            it(`the error is propagated to the user`, async () => {
              const cursor = collection.find().map(() => {
                throw new Error('error thrown in transform');
              });
              const error = await func(cursor).catch(e => e);
              expect(error)
                .to.be.instanceOf(Error)
                .to.match(/error thrown in transform/);
              expect(cursor.closed).to.be.true;
            });
          });
        });

        describe('when there is not a transform on the cursor', function () {
          it(`it returns the cursor's documents unmodified`, async () => {
            const cursor = collection.find();
            const doc = await func(cursor);
            expect(doc.name).to.equal('john doe');
          });
        });
      });
    }
  });

  describe('custom transforms with falsy values', function () {
    let client: MongoClient;
    const falseyValues = [0, 0n, NaN, '', false, undefined];
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

    describe('toArray() with custom transforms', function () {
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

    describe('Symbol.asyncIterator() with custom transforms', function () {
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

    describe('forEach() with custom transforms', function () {
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

  describe('transform stream error handling', function () {
    let client: MongoClient;
    let collection: Collection;
    const docs = [{ count: 0 }];

    beforeEach(async function () {
      client = this.configuration.newClient();
      collection = client.db('abstract_cursor_integration').collection('test');
      await collection.insertMany(docs);
    });

    afterEach(async function () {
      await collection.deleteMany({});
      await client.close();
    });

    it('propagates errors to transform stream', async function () {
      const transform = new Transform({
        transform(data, encoding, callback) {
          callback(null, data);
        }
      });
      // MongoServerError: unknown operator: $bar
      const stream = collection.find({ foo: { $bar: 25 } }).stream({ transform });
      const error: Error | null = await new Promise(resolve => {
        stream.on('error', error => resolve(error));
        stream.on('end', () => resolve(null));
      });
      expect(error).to.be.instanceof(MongoServerError);
    });
  });
});
