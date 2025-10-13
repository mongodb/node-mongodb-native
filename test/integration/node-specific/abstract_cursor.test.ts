import { expect } from 'chai';
import { once } from 'events';
import * as sinon from 'sinon';
import { Transform } from 'stream';
import { inspect } from 'util';

import {
  AbstractCursor,
  type Collection,
  type CommandStartedEvent,
  CSOTTimeoutContext,
  CursorTimeoutContext,
  CursorTimeoutMode,
  type FindCursor,
  MongoAPIError,
  type MongoClient,
  MongoCursorExhaustedError,
  MongoOperationTimeoutError,
  MongoServerError,
  TimeoutContext
} from '../../mongodb';
import { clearFailPoint, configureFailPoint } from '../../tools/utils';
import { filterForCommands } from '../shared';

describe('class AbstractCursor', function () {
  describe('lazy implicit session acquisition', function () {
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

    it('does not allocate a session when the cursor is constructed', function () {
      const cursor = collection.find();
      expect(cursor.session).to.be.null;
    });

    it('allocates a session once the cursor is initialized', async function () {
      const cursor = collection.find({}, { batchSize: 1 });
      await cursor.next();
      expect(cursor.session).not.to.be.null;
    });

    it('sets the session to `null` when rewound', async function () {
      const cursor = collection.find({}, { batchSize: 1 });
      await cursor.next();
      cursor.rewind();
      expect(cursor.session).to.be.null;
    });
  });

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

    context(`hasNext()`, function () {
      context('when there is a transform on the cursor', function () {
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
      context(`${method}()`, function () {
        context('when there is a transform on the cursor', function () {
          it(`the transform is called`, async () => {
            const cursor = collection.find().map(transformSpy);

            const doc = await func(cursor);
            expect(transformSpy).to.have.been.calledOnce;
            expect(doc.name).to.equal('JOHN DOE');
          });
          context('when the transform throws', function () {
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

        context('when there is not a transform on the cursor', function () {
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

    it('wraps transform in result checking for each map call', async () => {
      const control = { functionThatShouldReturnNull: 0 };
      const makeCursor = () => {
        const cursor = collection.find();
        cursor
          .map(doc => (control.functionThatShouldReturnNull === 0 ? null : doc))
          .map(doc => (control.functionThatShouldReturnNull === 1 ? null : doc))
          .map(doc => (control.functionThatShouldReturnNull === 2 ? null : doc));
        return cursor;
      };

      for (const testFn of [0, 1, 2]) {
        control.functionThatShouldReturnNull = testFn;
        const error = await makeCursor()
          .toArray()
          .catch(error => error);
        expect(error).to.be.instanceOf(MongoAPIError);
      }
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
        expect(cursor.id.isZero()).to.be.true;
        // The first batch exhausted the cursor, the only thing to clean up is the session
        expect(cursor.session.hasEnded).to.be.true;
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
          expect(cursor.id.isZero()).to.be.true;
          // The first batch exhausted the cursor, the only thing to clean up is the session
          expect(cursor.session.hasEnded).to.be.true;
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
        expect(cursor.id.isZero()).to.be.true;
        // The first batch exhausted the cursor, the only thing to clean up is the session
        expect(cursor.session.hasEnded).to.be.true;
      });
    });
  });

  describe('cursor end state', function () {
    let client: MongoClient;
    let cursor: FindCursor;

    beforeEach(async function () {
      client = this.configuration.newClient();
      const test = client.db().collection('test');
      await test.deleteMany({});
      await test.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);
    });

    afterEach(async function () {
      await cursor.close();
      await client.close();
    });

    describe('when the last batch has been received', () => {
      it('has a zero id and is not closed and is never killed', async function () {
        cursor = client.db().collection('test').find({});
        expect(cursor).to.have.property('closed', false);
        await cursor.tryNext();
        expect(cursor.id.isZero()).to.be.true;
        expect(cursor).to.have.property('closed', false);
        expect(cursor).to.have.property('killed', false);
      });
    });

    describe('when the last document has been iterated', () => {
      it('has a zero id and is closed and is never killed', async function () {
        cursor = client.db().collection('test').find({});
        await cursor.next();
        await cursor.next();
        await cursor.next();
        await cursor.next();
        expect(await cursor.next()).to.be.null;
        expect(cursor.id.isZero()).to.be.true;
        expect(cursor).to.have.property('closed', true);
        expect(cursor).to.have.property('killed', false);
      });
    });

    describe('when some documents have been iterated and the cursor is closed', () => {
      it('has a zero id and is not closed and is killed', async function () {
        cursor = client.db().collection('test').find({}, { batchSize: 2 });
        await cursor.next();
        await cursor.close();
        expect(cursor).to.have.property('closed', false);
        expect(cursor).to.have.property('killed', true);
        expect(cursor.id.isZero()).to.be.true;
        const error = await cursor.next().catch(error => error);
        expect(error).to.be.instanceOf(MongoCursorExhaustedError);
      });
    });
  });

  describe('toArray', () => {
    let nextSpy;
    let client: MongoClient;
    let cursor: AbstractCursor;
    let col: Collection;
    const numBatches = 10;
    const batchSize = 4;

    beforeEach(async function () {
      client = this.configuration.newClient();
      col = client.db().collection('test');
      await col.deleteMany({});
      for (let i = 0; i < numBatches; i++) {
        await col.insertMany([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }]);
      }
      nextSpy = sinon.spy(AbstractCursor.prototype, 'next');
    });

    afterEach(async function () {
      sinon.restore();
      await cursor.close();
      await client.close();
    });

    it('iterates per batch not per document', async () => {
      cursor = client.db().collection('test').find({}, { batchSize });
      await cursor.toArray();
      expect(nextSpy.callCount).to.equal(numBatches + 1);
      const numDocuments = numBatches * batchSize;
      expect(nextSpy.callCount).to.be.lessThan(numDocuments);
    });
  });

  describe('externally provided timeout contexts', function () {
    let client: MongoClient;
    let collection: Collection;
    let context: CursorTimeoutContext;
    const commands: CommandStartedEvent[] = [];
    let internalContext: TimeoutContext;

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      client.on('commandStarted', filterForCommands('killCursors', commands));

      collection = client.db('abstract_cursor_integration').collection('test');
      internalContext = TimeoutContext.create({ timeoutMS: 1000, serverSelectionTimeoutMS: 2000 });

      context = new CursorTimeoutContext(internalContext, Symbol());

      await collection.insertMany([{ a: 1 }, { b: 2 }, { c: 3 }]);
    });

    afterEach(async function () {
      sinon.restore();
      await collection.deleteMany({});
      await client.close();
    });

    it('CursorTimeoutMode.refresh is a no-op', async function () {
      const cursorTimeoutRefreshSpy = sinon.spy(CursorTimeoutContext.prototype, 'refresh');
      const csotTimeoutContextRefreshSpy = sinon.spy(CSOTTimeoutContext.prototype, 'refresh');
      const abstractCursorGetMoreSpy = sinon.spy(AbstractCursor.prototype, 'getMore');

      const cursor = collection.find(
        {},
        { timeoutMode: CursorTimeoutMode.ITERATION, timeoutContext: context, batchSize: 1 }
      );
      await cursor.toArray();

      expect(abstractCursorGetMoreSpy).to.have.been.calledThrice;

      expect(cursorTimeoutRefreshSpy.getCalls()).to.have.length(3);
      expect(csotTimeoutContextRefreshSpy).to.not.have.been.called;
    });

    it('CursorTimeoutMode.clear is a no-op', async function () {
      const cursorTimeoutClearSpy = sinon.spy(CursorTimeoutContext.prototype, 'clear');
      const csotTimeoutContextRefreshSpy = sinon.spy(CSOTTimeoutContext.prototype, 'clear');
      const abstractCursorGetMoreSpy = sinon.spy(AbstractCursor.prototype, 'getMore');

      const cursor = collection.find(
        {},
        { timeoutMode: CursorTimeoutMode.ITERATION, timeoutContext: context, batchSize: 1 }
      );
      await cursor.toArray();

      expect(abstractCursorGetMoreSpy).to.have.been.calledThrice;

      expect(cursorTimeoutClearSpy.getCalls()).to.have.length(4);
      expect(csotTimeoutContextRefreshSpy).to.not.have.been.called;
    });

    describe('when timeoutMode is omitted', function () {
      it('stores timeoutContext as the timeoutContext on the cursor', function () {
        const cursor = collection.find({}, { timeoutContext: context, timeoutMS: 1000 });

        // @ts-expect-error Private access.
        expect(cursor.timeoutContext).to.equal(context);
      });
    });

    describe('when timeoutMode is LIFETIME', function () {
      it('stores timeoutContext as the timeoutContext on the cursor', function () {
        const cursor = collection.find(
          {},
          { timeoutContext: context, timeoutMS: 1000, timeoutMode: CursorTimeoutMode.LIFETIME }
        );

        // @ts-expect-error Private access.
        expect(cursor.timeoutContext).to.equal(context);
      });
    });

    describe('when the cursor is initialized', function () {
      it('the provided timeoutContext is not overwritten', async function () {
        const cursor = collection.find(
          {},
          { timeoutContext: context, timeoutMS: 1000, timeoutMode: CursorTimeoutMode.LIFETIME }
        );

        await cursor.toArray();

        // @ts-expect-error Private access.
        expect(cursor.timeoutContext).to.equal(context);
      });
    });

    describe('when the cursor refreshes the timeout for killCursors', function () {
      let uri: string;

      before(function () {
        uri = this.configuration.url({ useMultipleMongoses: false });
      });

      beforeEach(async function () {
        commands.length = 0;
        await configureFailPoint(
          this.configuration,
          {
            configureFailPoint: 'failCommand',
            mode: { times: 1 },
            data: {
              failCommands: ['getMore'],
              blockConnection: true,
              blockTimeMS: 5000
            }
          },
          uri
        );
      });

      afterEach(async function () {
        await clearFailPoint(this.configuration, 'failCommand', uri);
      });

      it(
        'the provided timeoutContext is not modified',
        {
          requires: {
            mongodb: '>=4.4',
            topology: '!load-balanced'
          }
        },
        async function () {
          const cursor = collection.find(
            {},
            {
              timeoutContext: context,
              timeoutMS: 150,
              timeoutMode: CursorTimeoutMode.LIFETIME,
              batchSize: 1
            }
          );

          const refresh = sinon.spy(context, 'refresh');
          const refreshed = sinon.spy(context, 'refreshed');
          const error = await cursor.toArray().catch(e => e);

          expect(error).to.be.instanceof(MongoOperationTimeoutError);
          expect(refresh.called).to.be.false;
          expect(refreshed.called).to.be.true;
        }
      );
    });
  });

  describe('cursor tracking', () => {
    let client: MongoClient;
    let collection: Collection;

    beforeEach(async function () {
      client = this.configuration.newClient();
      collection = client.db('activeCursors').collection('activeCursors');
      await collection.drop().catch(() => null);
      await collection.insertMany(Array.from({ length: 50 }, (_, i) => ({ i })));
    });

    afterEach(async function () {
      await client.close();
    });

    it('adds itself to a set upon construction', () => {
      collection.find({}, { batchSize: 1 });
      expect(client.s.activeCursors).to.have.lengthOf(1);
    });

    it('adds itself to a set upon rewind', async () => {
      const cursor = collection.find({}, { batchSize: 1 });
      await cursor.next();
      expect(client.s.activeCursors).to.have.lengthOf(1);
      await cursor.close();
      expect(client.s.activeCursors).to.have.lengthOf(0);
      cursor.rewind();
      expect(client.s.activeCursors).to.have.lengthOf(1);
    });

    it('does not add more than one close listener', async () => {
      const cursor = collection.find({}, { batchSize: 1 });
      await cursor.next();
      expect(cursor.listeners('close')).to.have.lengthOf(1);
      await cursor.close();
      expect(cursor.listeners('close')).to.have.lengthOf(0);
      cursor.rewind();
      cursor.rewind();
      cursor.rewind();
      expect(cursor.listeners('close')).to.have.lengthOf(1);
    });
  });
});
