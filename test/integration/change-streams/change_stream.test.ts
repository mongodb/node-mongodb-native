import { strict as assert } from 'assert';
import { Long, UUID } from 'bson';
import { expect } from 'chai';
import { on, once } from 'events';
import * as process from 'process';
import { gte, lt } from 'semver';
import * as sinon from 'sinon';
import { PassThrough } from 'stream';
import { setTimeout } from 'timers';

import {
  type ChangeStream,
  type ChangeStreamDocument,
  type ChangeStreamOptions,
  type ResumeToken
} from '../../../src/change_stream';
import { type CommandStartedEvent } from '../../../src/cmap/command_monitoring_events';
import { type Collection } from '../../../src/collection';
import { LEGACY_HELLO_COMMAND } from '../../../src/constants';
import { type Db } from '../../../src/db';
import { MongoAPIError, MongoChangeStreamError, MongoServerError } from '../../../src/error';
import { type MongoClient } from '../../../src/mongo_client';
import { ReadPreference } from '../../../src/read_preference';
import { isHello } from '../../../src/utils';
import * as mock from '../../tools/mongodb-mock/index';
import { TestBuilder, UnifiedTestSuiteBuilder } from '../../tools/unified_suite_builder';
import { type FailCommandFailPoint, sleep } from '../../tools/utils';
import { delay, filterForCommands } from '../shared';

const initIteratorMode = async (cs: ChangeStream) => {
  const initEvent = once(cs.cursor, 'init');
  //@ts-expect-error: private method
  await cs.cursor.cursorInit();
  await initEvent;
  return;
};

const is4_2Server = (serverVersion: string) =>
  gte(serverVersion, '4.2.0') && lt(serverVersion, '4.3.0');

// Define the pipeline processing changes
const pipeline = [
  { $addFields: { addedField: 'This is a field added using $addFields' } },
  { $project: { documentKey: false } },
  { $addFields: { comment: 'The documentKey field has been projected out of this document.' } }
];

async function forcePrimaryStepDown(client: MongoClient) {
  await client
    .db('admin')
    .command({ replSetFreeze: 0 }, { readPreference: ReadPreference.SECONDARY });
  await client
    .db('admin')
    .command({ replSetStepDown: 15, secondaryCatchUpPeriodSecs: 10, force: true });

  // wait for secondary to become primary but also allow previous primary to become next primary
  // in subsequent test runs
  await sleep(15_000);
}

describe('Change Streams', function () {
  let client: MongoClient;
  let collection: Collection;
  let changeStream: ChangeStream;
  let db: Db;

  beforeEach(async function () {
    const configuration = this.configuration;
    client = configuration.newClient();

    await client.connect();
    db = client.db('integration_tests');
    await db.createCollection('test').catch(() => null);

    const csDb = client.db('changestream_integration_test');
    await csDb.dropDatabase().catch(() => null);
    await csDb.createCollection('test').catch(() => null);
    collection = csDb.collection('test');
    changeStream = collection.watch();
    changeStream.on('error', () => null);
  });

  afterEach(async () => {
    sinon.restore();
    await changeStream.close();
    await client.close();
    await mock.cleanup();
  });

  context('ChangeStreamCursor options', function () {
    let client, db, collection;

    beforeEach(function () {
      client = this.configuration.newClient();
      db = client.db('db');
      collection = db.collection('collection');
    });

    afterEach(async function () {
      await client.close();
      client = undefined;
      db = undefined;
      collection = undefined;
    });

    context('fullDocument', () => {
      it('does not set fullDocument if no value is provided', function () {
        const changeStream = client.watch();

        expect(changeStream).not.to.have.nested.property(
          'cursor.pipeline[0].$changeStream.fullDocument'
        );
      });

      it('does not validate the value passed in for the fullDocument property', function () {
        const changeStream = client.watch([], { fullDocument: 'invalid value' });

        expect(changeStream).to.have.nested.property(
          'cursor.pipeline[0].$changeStream.fullDocument',
          'invalid value'
        );
      });

      it('assigns fullDocument to the correct value if it is passed as an option', function () {
        const changeStream = client.watch([], { fullDocument: 'updateLookup' });

        expect(changeStream).to.have.nested.property(
          'cursor.pipeline[0].$changeStream.fullDocument',
          'updateLookup'
        );
      });
    });

    context('allChangesForCluster', () => {
      it('assigns allChangesForCluster to true if the ChangeStream.type is Cluster', function () {
        const changeStream = client.watch();

        expect(changeStream).to.have.nested.property(
          'cursor.pipeline[0].$changeStream.allChangesForCluster',
          true
        );
      });

      it('does not assign allChangesForCluster if the ChangeStream.type is Db', function () {
        const changeStream = db.watch();

        expect(changeStream).not.to.have.nested.property(
          'cursor.pipeline[0].$changeStream.allChangesForCluster'
        );
      });

      it('does not assign allChangesForCluster if the ChangeStream.type is Collection', function () {
        const changeStream = collection.watch();

        expect(changeStream).not.to.have.nested.property(
          'cursor.pipeline[0].$changeStream.allChangesForCluster'
        );
      });
    });

    it('allows invalid option values', function () {
      const changeStream = collection.watch([], { invalidOption: true });

      expect(changeStream).to.have.nested.property(
        'cursor.pipeline[0].$changeStream.invalidOption'
      );
    });
  });

  it('should close the listeners after the cursor is closed', {
    metadata: { requires: { topology: 'replicaset' } },
    async test() {
      const collection = db.collection('closesListeners');
      const changeStream = collection.watch(pipeline);
      const willBeChanges = on(changeStream, 'change');
      await once(changeStream.cursor, 'init');
      await collection.insertOne({ a: 1 });

      await willBeChanges.next();
      expect(changeStream.cursorStream?.listenerCount('data')).to.equal(1);

      await changeStream.close();
      expect(changeStream.cursorStream).to.not.exist;
    }
  });

  it('contains a wallTime date property on the change', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=6.0.0' } },
    async test() {
      const collection = db.collection('wallTimeTest');
      const changeStream = collection.watch(pipeline);

      const willBeChanges = on(changeStream, 'change');
      await once(changeStream.cursor, 'init');

      await collection.insertOne({ d: 4 });

      const change = (await willBeChanges.next()).value[0];

      await changeStream.close();

      expect(change).to.have.property('wallTime');
      expect(change.wallTime).to.be.instanceOf(Date);
    }
  });

  it('should create a ChangeStream on a collection and emit change events', {
    metadata: { requires: { topology: 'replicaset' } },
    async test() {
      const collection = db.collection('docsDataEvent');
      const changeStream = collection.watch(pipeline);

      const willBeChanges = on(changeStream, 'change');
      await once(changeStream.cursor, 'init');

      await collection.insertOne({ d: 4 });
      await collection.updateOne({ d: 4 }, { $inc: { d: 2 } });

      const changes = [
        (await willBeChanges.next()).value[0],
        (await willBeChanges.next()).value[0]
      ];

      await changeStream.close();

      expect(changes).to.have.length(2);
      expect(changes[0]).to.not.have.property('documentKey');
      expect(changes[0]).to.containSubset({
        operationType: 'insert',
        fullDocument: { d: 4 },
        ns: {
          db: 'integration_tests',
          coll: 'docsDataEvent'
        },
        comment: 'The documentKey field has been projected out of this document.'
      });

      expect(changes[1]).to.containSubset({
        operationType: 'update',
        updateDescription: {
          updatedFields: { d: 6 }
        }
      });
    }
  });

  describe('when creating multiple simultaneous ChangeStreams', () => {
    let client;
    let changeStream1;
    let changeStream2;
    let changeStream3;

    beforeEach(async function () {
      client = this.configuration.newClient();
      await client.connect();
    });

    afterEach(async function () {
      await changeStream1?.close();
      await changeStream2?.close();
      await changeStream3?.close();
      await client?.close();
    });

    it(
      'supports simultaneous parallel ChangeStream use',
      { requires: { topology: '!single' } },
      async function () {
        const database = client.db('integration_tests');
        const collection1 = database.collection('simultaneous1');
        const collection2 = database.collection('simultaneous2');

        changeStream1 = collection1.watch([{ $addFields: { changeStreamNumber: 1 } }]);
        changeStream2 = collection2.watch([{ $addFields: { changeStreamNumber: 2 } }]);
        changeStream3 = collection2.watch([{ $addFields: { changeStreamNumber: 3 } }]);

        setTimeout(() => {
          collection1.insertMany([{ a: 1 }]).then(() => collection2.insertMany([{ a: 1 }]));
        }, 50);

        const hasNexts = await Promise.all([
          changeStream1.hasNext(),
          changeStream2.hasNext(),
          changeStream3.hasNext()
        ]);

        // Check all the Change Streams have a next item
        expect(hasNexts[0]).to.be.true;
        expect(hasNexts[1]).to.be.true;
        expect(hasNexts[2]).to.be.true;

        const changes = await Promise.all([
          changeStream1.next(),
          changeStream2.next(),
          changeStream3.next()
        ]);

        // Check the values of the change documents are correct
        expect(changes[0].operationType).to.be.equal('insert');
        expect(changes[1].operationType).to.be.equal('insert');
        expect(changes[2].operationType).to.be.equal('insert');

        expect(changes[0]).to.have.nested.property('fullDocument.a', 1);
        expect(changes[1]).to.have.nested.property('fullDocument.a', 1);
        expect(changes[2]).to.have.nested.property('fullDocument.a', 1);

        expect(changes[0]).to.have.nested.property('ns.db', 'integration_tests');
        expect(changes[1]).to.have.nested.property('ns.db', 'integration_tests');
        expect(changes[2]).to.have.nested.property('ns.db', 'integration_tests');

        expect(changes[0]).to.have.nested.property('ns.coll', 'simultaneous1');
        expect(changes[1]).to.have.nested.property('ns.coll', 'simultaneous2');
        expect(changes[2]).to.have.nested.property('ns.coll', 'simultaneous2');

        expect(changes[0]).to.have.nested.property('changeStreamNumber', 1);
        expect(changes[1]).to.have.nested.property('changeStreamNumber', 2);
        expect(changes[2]).to.have.nested.property('changeStreamNumber', 3);
      }
    );
  });

  it('should properly close ChangeStream cursor', {
    metadata: { requires: { topology: 'replicaset' } },

    test: async function () {
      const configuration = this.configuration;
      const client = configuration.newClient();

      await client.connect();
      const database = client.db('integration_tests');
      const changeStream = database.collection('changeStreamCloseTest').watch(pipeline);

      assert.equal(changeStream.closed, false);
      assert.equal(changeStream.cursor.closed, false);

      await changeStream.close();

      // Check the cursor is closed
      expect(changeStream.closed).to.be.true;
      expect(changeStream.cursor).property('closed', true);

      await changeStream.close();
      await client.close();
    }
  });

  it(
    'should error when attempting to create a ChangeStream with a forbidden aggregation pipeline stage',
    {
      metadata: { requires: { topology: 'replicaset' } },

      test: async function () {
        const configuration = this.configuration;
        const client = configuration.newClient();

        await client.connect();

        const forbiddenStage = {};
        const forbiddenStageName = '$alksdjfhlaskdfjh';
        forbiddenStage[forbiddenStageName] = 2;

        const database = client.db('integration_tests');
        const changeStream = database.collection('forbiddenStageTest').watch([forbiddenStage]);

        const err = await changeStream.next().catch(e => e);
        assert.ok(err);
        assert.ok(err.message);
        assert.ok(
          err.message.indexOf(`Unrecognized pipeline stage name: '${forbiddenStageName}'`) > -1
        );

        await changeStream.close();
        await client.close();
      }
    }
  );

  describe('cache the change stream resume token', () => {
    describe('using iterator form', () => {
      context('#next', () => {
        it('caches the resume token on change', {
          metadata: { requires: { topology: 'replicaset' } },

          async test() {
            await initIteratorMode(changeStream);
            await collection.insertOne({ a: 1 });

            const change = await changeStream.next();
            expect(change).to.have.property('_id').that.deep.equals(changeStream.resumeToken);
          }
        });

        it('caches the resume token correctly when preceded by #hasNext', {
          metadata: { requires: { topology: 'replicaset' } },
          async test() {
            await initIteratorMode(changeStream);
            await collection.insertOne({ a: 1 });

            await changeStream.hasNext();

            const change = await changeStream.next();
            expect(change).to.have.property('_id').that.deep.equals(changeStream.resumeToken);
          }
        });
      });

      it('#tryNext', {
        metadata: { requires: { topology: 'replicaset' } },

        async test() {
          await initIteratorMode(changeStream);
          await collection.insertOne({ a: 1 });

          const change = await changeStream.tryNext();
          expect(change).to.have.property('_id').that.deep.equals(changeStream.resumeToken);
        }
      });

      context('#hasNext', () => {
        it('does not cache the resume token', {
          metadata: { requires: { topology: 'replicaset' } },
          async test() {
            await initIteratorMode(changeStream);
            const resumeToken = changeStream.resumeToken;

            await collection.insertOne({ a: 1 });

            const hasNext = await changeStream.hasNext();
            expect(hasNext).to.be.true;

            expect(changeStream.resumeToken).to.equal(resumeToken);
          }
        });
      });
    });

    it('should cache using event listener form', {
      metadata: { requires: { topology: 'replicaset' } },
      async test() {
        const willBeChange = once(changeStream, 'change');
        await once(changeStream.cursor, 'init');
        await collection.insertOne({ a: 1 });

        const [change] = await willBeChange;
        expect(change).to.have.property('_id').that.deep.equals(changeStream.resumeToken);
      }
    });
  });

  it('should error if resume token projected out of change stream document using iterator', {
    metadata: { requires: { topology: 'replicaset' } },
    async test() {
      const configuration = this.configuration;
      const client = configuration.newClient();

      await client.connect();

      const database = client.db('integration_tests');
      const collection = database.collection('resumetokenProjectedOutCallback');
      const changeStream = collection.watch([{ $project: { _id: false } }]);

      await initIteratorMode(changeStream);

      const res = await collection.insertOne({ b: 2 });
      expect(res).to.exist;

      const err = await changeStream.next().catch(e => e);
      expect(err).to.exist;
      await changeStream.close();
      await client.close();
    }
  });

  it('should error if resume token projected out of change stream document using event listeners', {
    metadata: { requires: { topology: 'replicaset' } },
    async test() {
      const changeStream = collection.watch([{ $project: { _id: false } }]);

      const willBeChangeOrError = once(changeStream, 'change').catch(error => error);
      await once(changeStream.cursor, 'init');

      await collection.insertOne({ a: 1 });

      const error = await willBeChangeOrError;

      await changeStream.close();

      if (error instanceof MongoServerError) {
        // Newer servers
        expect(error).to.be.instanceOf(MongoServerError);
        expect(error).to.have.property('code', 280); // ChangeStreamFatalError code
      } else if (error instanceof MongoChangeStreamError) {
        // Older servers do not error, but the driver will
        expect(error).to.be.instanceOf(MongoChangeStreamError);
        expect(error.message).to.match(/that lacks a resume token/);
      } else {
        expect.fail(`error needs to be a known instance, got ${error.constructor.name}`);
      }
    }
  });

  it('should invalidate change stream on collection rename using event listeners', {
    metadata: { requires: { topology: 'replicaset' } },
    async test() {
      const willBeChange = once(changeStream, 'change');
      await once(changeStream.cursor, 'init');

      collection.insertOne({ a: 1 });

      const [change] = await willBeChange;
      expect(change).to.have.property('operationType', 'insert');
      expect(change).to.have.nested.property('fullDocument.a', 1);

      const willBeClose = once(changeStream, 'close');

      const changes = on(changeStream, 'change');

      await collection.rename('renamedDocs', { dropTarget: true });

      const [renameChange] = (await changes.next()).value;
      expect(renameChange).to.have.property('operationType', 'rename');

      const [invalidateChange] = (await changes.next()).value;
      expect(invalidateChange).to.have.property('operationType', 'invalidate');

      await willBeClose; // Server will close this changestream
    }
  });

  it('should invalidate change stream on database drop using iterator form', {
    metadata: { requires: { topology: 'replicaset' } },
    async test() {
      const db = client.db('droppableDb');
      const collection = db.collection('invalidateCallback');

      // ensure ns exists before making cs
      await collection.insertOne({ random: Math.random() });

      const changeStream = collection.watch(pipeline);
      await initIteratorMode(changeStream);

      await collection.insertOne({ a: 1 });

      const insertChange = await changeStream.next();
      expect(insertChange).to.have.property('operationType', 'insert');

      await db.dropDatabase();

      const dropChange = await changeStream.next();
      expect(dropChange).to.have.property('operationType', 'drop');

      const invalidateChange = await changeStream.next();
      expect(invalidateChange).to.have.property('operationType', 'invalidate');

      const hasNext = await changeStream.hasNext();
      expect(hasNext).to.be.false;

      expect(changeStream.closed).to.be.true;
    }
  });

  it('should resume from point in time using user-provided resumeAfter', {
    metadata: { requires: { topology: 'replicaset' } },

    async test() {
      const collection = db.collection('resumeAfterTest2');

      await collection.drop();

      let resumeToken;
      const docs = [{ a: 0 }, { a: 1 }, { a: 2 }];

      let secondChangeStream;
      const firstChangeStream = collection.watch(pipeline);
      this.defer(() => firstChangeStream.close());

      return initIteratorMode(firstChangeStream)
        .then(() =>
          collection
            .insertMany([docs[0]])
            .then(() => collection.insertOne(docs[1]))
            .then(() => collection.insertOne(docs[2]))
        )
        .then(() => firstChangeStream.hasNext())
        .then(hasNext => {
          assert.equal(true, hasNext);
          return firstChangeStream.next();
        })
        .then(change => {
          expect(change).to.have.property('operationType', 'insert');
          expect(change).to.have.nested.property('fullDocument.a', docs[0].a);

          // Save the resumeToken
          resumeToken = change._id;
          return firstChangeStream.next();
        })
        .then(change => {
          expect(change).to.have.property('operationType', 'insert');
          expect(change).to.have.nested.property('fullDocument.a', docs[1].a);

          return firstChangeStream.next();
        })
        .then(change => {
          expect(change).to.have.property('operationType', 'insert');
          expect(change).to.have.nested.property('fullDocument.a', docs[2].a);

          return firstChangeStream.close();
        })
        .then(() => {
          secondChangeStream = collection.watch(pipeline, {
            resumeAfter: resumeToken
          });
          this.defer(() => secondChangeStream.close());

          return initIteratorMode(secondChangeStream).then(() => delay(200));
        })
        .then(() => secondChangeStream.hasNext())
        .then(hasNext => {
          assert.equal(true, hasNext);
          return secondChangeStream.next();
        })
        .then(change => {
          assert.equal(change.operationType, 'insert');
          assert.equal(change.fullDocument.a, docs[1].a);
          return secondChangeStream.next();
        })
        .then(change => {
          assert.equal(change.operationType, 'insert');
          assert.equal(change.fullDocument.a, docs[2].a);
          return secondChangeStream.close();
        });
    }
  });

  it('should support full document lookup', {
    metadata: { requires: { topology: 'replicaset' } },
    async test() {
      const collection = db.collection('fullDocumentLookup');
      const changeStream = collection.watch([], { fullDocument: 'updateLookup' });

      await initIteratorMode(changeStream);

      const { insertedId: _id } = await collection.insertOne({ f: 128 });

      const insertChange = await changeStream.next();

      expect(insertChange).to.have.property('operationType', 'insert');
      expect(insertChange).to.have.nested.property('fullDocument.f', 128);
      expect(insertChange).to.not.have.nested.property('fullDocument.c');

      await collection.updateOne({ _id }, { $set: { c: 2 } });

      const updateChange = await changeStream.next();

      expect(updateChange).to.have.property('operationType', 'update');

      expect(updateChange).to.have.property('fullDocument').that.is.a('object');
      expect(updateChange).to.have.nested.property('fullDocument.f', 128);
      expect(updateChange).to.have.nested.property('fullDocument.c', 2);
      expect(updateChange).to.have.nested.property('updateDescription.updatedFields.c', 2);

      await changeStream.close();
    }
  });

  it('should support full document lookup with deleted documents', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function () {
      const database = client.db('integration_tests');
      const collection = database.collection('fullLookupTest');
      const changeStream = collection.watch(pipeline, { fullDocument: 'updateLookup' });

      return initIteratorMode(changeStream)
        .then(() =>
          collection.insertMany([{ i: 128 }]).then(() => collection.deleteOne({ i: 128 }))
        )
        .then(() => changeStream.hasNext())
        .then(function (hasNext) {
          assert.equal(true, hasNext);
          return changeStream.next();
        })
        .then(function (change) {
          expect(change).to.have.property('operationType', 'insert');
          expect(change).to.have.nested.property('fullDocument.i', 128);
          expect(change).to.have.nested.property('ns.db', database.databaseName);
          expect(change).to.have.nested.property('ns.coll', collection.collectionName);
          expect(change).to.not.have.property('documentKey');
          expect(change).to.have.property(
            'comment',
            'The documentKey field has been projected out of this document.'
          );
          // Trigger the second database event
          return collection.updateOne({ i: 128 }, { $set: { c: 2 } });
        })
        .then(() => changeStream.hasNext())
        .then(function (hasNext) {
          assert.equal(true, hasNext);
          return changeStream.next();
        })
        .then(function (change) {
          expect(change).to.have.property('operationType', 'delete');
          expect(change).to.not.have.property('lookedUpDocument');
        })
        .finally(() => {
          return changeStream.close();
        });
    }
  });

  it('should create Change Streams with correct read preferences', {
    metadata: { requires: { topology: 'replicaset' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(client => {
        this.defer(() => client.close());

        // should get preference from database
        const database = client.db('integration_tests', {
          readPreference: ReadPreference.PRIMARY_PREFERRED
        });

        const changeStream0 = database.collection('docs0').watch(pipeline);
        this.defer(() => changeStream0.close());

        assert.deepEqual(
          changeStream0.cursor.readPreference.preference,
          ReadPreference.PRIMARY_PREFERRED
        );

        // should get preference from collection
        const collection = database.collection('docs1', {
          readPreference: ReadPreference.SECONDARY_PREFERRED
        });

        const changeStream1 = collection.watch(pipeline);
        assert.deepEqual(
          changeStream1.cursor.readPreference.preference,
          ReadPreference.SECONDARY_PREFERRED
        );
        this.defer(() => changeStream1.close());

        // should get preference from Change Stream options
        const changeStream2 = collection.watch(pipeline, {
          readPreference: ReadPreference.NEAREST
        });
        this.defer(() => changeStream2.close());

        assert.deepEqual(changeStream2.cursor.readPreference.preference, ReadPreference.NEAREST);
      });
    }
  });

  it('should support piping of Change Streams', {
    metadata: { requires: { topology: 'replicaset' } },

    async test() {
      await initIteratorMode(changeStream);

      const outStream = new PassThrough({ objectMode: true });

      const transform = doc => ({ doc: JSON.stringify(doc) });
      changeStream
        .stream()
        .map(transform)
        .on('error', () => null)
        .pipe(outStream)
        .on('error', () => null);

      const willBeData = once(outStream, 'data');

      await collection.insertMany([{ a: 1 }]);

      const [data] = await willBeData;
      const parsedEvent = JSON.parse(data.doc);
      expect(parsedEvent).to.have.nested.property('fullDocument.a', 1);

      outStream.destroy();
    }
  });

  describe('should error when used as iterator and emitter concurrently', function () {
    let client, coll, changeStream;

    beforeEach(async function () {
      client = this.configuration.newClient();
      await client.connect();

      coll = client.db(this.configuration.db).collection('tester');
      changeStream = coll.watch();
    });

    afterEach(async function () {
      await changeStream.close();
      await client?.close();
    });

    it('should throw when mixing event listeners with iterator methods', {
      metadata: { requires: { topology: 'replicaset' } },
      async test() {
        expect(changeStream).to.have.property('mode', false);
        changeStream.on('change', () => {
          // ChangeStream detects emitter usage via 'newListener' event
          // so this covers all emitter methods
        });
        changeStream.on('error', () => null); // one must listen for errors if they use EE mode.

        await once(changeStream.cursor, 'init');
        expect(changeStream).to.have.property('mode', 'emitter');

        const errRegex = /ChangeStream cannot be used as an iterator/;

        const nextError = await changeStream.next().catch(error => error);
        expect(nextError.message).to.match(errRegex);

        const hasNextError = await changeStream.hasNext().catch(error => error);
        expect(hasNextError.message).to.match(errRegex);

        const tryNextError = await changeStream.tryNext().catch(error => error);
        expect(tryNextError.message).to.match(errRegex);
      }
    });

    it('should throw when mixing iterator methods with event listeners', {
      metadata: { requires: { topology: 'replicaset' } },
      async test() {
        await initIteratorMode(changeStream);
        expect(changeStream).to.have.property('mode', false);
        const res = await changeStream.tryNext();
        expect(res).to.not.exist;
        expect(changeStream).to.have.property('mode', 'iterator');

        expect(() => {
          changeStream.on('change', () => {
            // This does throw synchronously
            // the newListener event is called sync
            // which calls streamEvents, which calls setIsEmitter, which will throw
          });
        }).to.throw(/ChangeStream cannot be used as an EventEmitter/);
      }
    });
  });

  describe('should properly handle a changeStream event being processed mid-close', function () {
    let client, coll, changeStream;

    function write() {
      return Promise.resolve()
        .then(() => coll.insertOne({ a: 1 }))
        .then(() => coll.insertOne({ b: 2 }));
    }

    function lastWrite() {
      return coll.insertOne({ c: 3 });
    }

    beforeEach(function () {
      client = this.configuration.newClient();
      return client.connect().then(_client => {
        client = _client;
        coll = client.db(this.configuration.db).collection('tester');
        changeStream = coll.watch();
      });
    });

    afterEach(async function () {
      await changeStream?.close();
      await client?.close();
      coll = undefined;
      changeStream = undefined;
      client = undefined;
    });

    it('when invoked with promises', {
      metadata: { requires: { topology: '!single' } },
      test: async function () {
        const read = async () => {
          await changeStream.next();
          await changeStream.next();

          const write = lastWrite();

          const nextP = changeStream.next();
          nextP.catch(() => null);

          await changeStream.close();

          await write;
          await nextP;
        };

        const error = await Promise.all([read(), write()]).then(
          () => null,
          error => error
        );

        expect(error.message).to.equal('ChangeStream is closed');
      }
    });

    it.skip('when invoked using eventEmitter API', {
      metadata: {
        requires: { topology: 'replicaset' }
      },
      async test() {
        const changes = on(changeStream, 'change');
        await once(changeStream.cursor, 'init');

        await write();
        await lastWrite().catch(() => null);

        let counter = 0;

        for await (const _ of changes) {
          counter += 1;
          if (counter === 2) {
            await changeStream.close();
            break;
          }
        }

        const result = await Promise.race([changes.next(), sleep(800).then(() => 42)]);
        expect(result, 'should not have recieved a third event').to.equal(42);
      }
    }).skipReason =
      'This test only worked because of timing, changeStream.close does not remove the change listener';
  });

  describe('iterator api', function () {
    describe('#tryNext()', function () {
      it('should return null on single iteration of empty cursor', {
        metadata: { requires: { topology: 'replicaset' } },
        async test() {
          const doc = await changeStream.tryNext();
          expect(doc).to.be.null;
        }
      });

      it('should iterate a change stream until first empty batch', {
        metadata: { requires: { topology: 'replicaset' } },
        async test() {
          // tryNext doesn't send the initial agg, just checks the driver document batch cache
          const firstTry = await changeStream.tryNext();
          expect(firstTry).to.be.null;

          await initIteratorMode(changeStream);
          await collection.insertOne({ a: 42 });

          const secondTry = await changeStream.tryNext();
          expect(secondTry).to.be.an('object');

          const thirdTry = await changeStream.tryNext();
          expect(thirdTry).to.be.null;
        }
      });
    });

    describe('#asyncIterator', function () {
      describe('for-await iteration', function () {
        it('can iterate through changes', { requires: { topology: '!single' } }, async function () {
          changeStream = collection.watch([]);
          await initIteratorMode(changeStream);

          const docs = [{ city: 'New York City' }, { city: 'Seattle' }, { city: 'Boston' }];
          await collection.insertMany(docs);

          for await (const change of changeStream) {
            const { fullDocument } = change;
            const expectedDoc = docs.shift();
            expect(fullDocument.city).to.equal(expectedDoc.city);
            if (docs.length === 0) {
              break;
            }
          }

          expect(docs).to.have.length(0, 'expected to find all docs before exiting loop');
        });

        it(
          'cannot be resumed from partial iteration',
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);

            const docs = [{ city: 'New York City' }, { city: 'Seattle' }, { city: 'Boston' }];
            await collection.insertMany(docs);

            for await (const change of changeStream) {
              const { fullDocument } = change;
              const expectedDoc = docs.shift();
              expect(fullDocument.city).to.equal(expectedDoc.city);
              break;
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const change of changeStream) {
              expect.fail('Change stream was resumed after partial iteration');
            }

            expect(docs).to.have.length(
              2,
              'expected to find remaining docs after partial iteration'
            );
          }
        );

        it(
          'cannot be used with emitter-based iteration',
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            changeStream.on('change', sinon.stub()).on('error', () => null);

            try {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              for await (const change of changeStream) {
                expect.fail('Async iterator was used with emitter-based iteration');
              }
            } catch (error) {
              expect(error).to.be.instanceOf(MongoAPIError);
            }
          }
        );

        it(
          'can be used with raw iterator API',
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);

            const docs = [{ city: 'Los Angeles' }, { city: 'Miami' }];
            await collection.insertMany(docs);

            await changeStream.next();
            docs.shift();

            try {
              for await (const change of changeStream) {
                const { fullDocument } = change;
                const expectedDoc = docs.shift();
                expect(fullDocument.city).to.equal(expectedDoc.city);

                if (docs.length === 0) {
                  break;
                }
              }
            } catch {
              expect.fail('Async could not be used with raw iterator API');
            }
          }
        );

        it(
          'when closed throws "ChangeStream is closed"',
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch();

            const loop = (async function () {
              for await (const _change of changeStream) {
                return 'loop entered'; // loop should never be entered
              }
              return 'loop ended without error'; // loop should not finish without error
            })();

            await sleep(1);
            const closeResult = changeStream.close().catch(error => error);
            expect(closeResult).to.not.be.instanceOf(Error);

            const result = await loop.catch(error => error);
            expect(result).to.be.instanceOf(MongoAPIError);
            expect(result.message).to.match(/ChangeStream is closed/i);
          }
        );
      });

      describe('#return', function () {
        it(
          'should close the change stream when return is called',
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);
            const changeStreamIterator = changeStream[Symbol.asyncIterator]();

            const docs = [{ city: 'New York City' }, { city: 'Seattle' }, { city: 'Boston' }];
            await collection.insertMany(docs);

            await changeStreamIterator.next();
            await changeStreamIterator.return();
            expect(changeStream.closed).to.be.true;
            expect(changeStream.cursor).property('isClosed', true);
            expect(changeStream.cursor).nested.property('session.hasEnded', true);
          }
        );

        it(
          'ignores errors thrown from close',
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);
            const changeStreamIterator = changeStream[Symbol.asyncIterator]();

            sinon.stub(changeStream.cursor, 'close').throws(new MongoAPIError('testing'));

            try {
              await changeStreamIterator.return();
            } catch {
              expect.fail('Async iterator threw an error on close');
            }
          }
        );
      });

      describe('#next', function () {
        it(
          'should close the change stream when an error is thrown',
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);
            const changeStreamIterator = changeStream[Symbol.asyncIterator]();

            const unresumableErrorCode = 1000;
            await client.db('admin').command({
              configureFailPoint: is4_2Server(this.configuration.version)
                ? 'failCommand'
                : 'failGetMoreAfterCursorCheckout',
              mode: { times: 1 },
              data: {
                failCommands: ['getMore'],
                errorCode: unresumableErrorCode
              }
            } as FailCommandFailPoint);

            await collection.insertOne({ city: 'New York City' });
            try {
              await changeStreamIterator.next();
              expect.fail(
                'Change stream did not throw unresumable error and did not produce any events'
              );
            } catch {
              expect(changeStream.closed).to.be.true;
              expect(changeStream.cursor).property('closed', true);
            }
          }
        );

        it(
          'should not produce events on closed stream',
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            changeStream.close();

            const changeStreamIterator = changeStream[Symbol.asyncIterator]();
            const change = await changeStreamIterator.next();

            expect(change.value).to.be.undefined;
          }
        );
      });
    });
  });

  describe('startAfter', function () {
    let client: MongoClient;
    let collection: Collection;
    let startAfter: ResumeToken;
    let changeStream;

    beforeEach(async function () {
      client = this.configuration.newClient();
      collection = db.collection('setupAfterTest');
      const changeStreamForResumeToken = collection.watch();

      const changes = on(changeStreamForResumeToken, 'change');
      await once(changeStreamForResumeToken.cursor, 'init');

      await collection.insertOne({ x: 1 }); // ensure ns exists
      await collection.drop(); // invalidate this change stream

      for await (const [change] of changes) {
        if (change.operationType === 'invalidate') {
          startAfter = change._id;
          break;
        }
      }

      await changeStreamForResumeToken.close();
      changeStream = collection.watch([], { startAfter });
    });

    afterEach(async function () {
      await changeStream.close();
      await client?.close();
    });

    it('should work with events', {
      metadata: { requires: { topology: 'replicaset' } },
      async test() {
        const willBeChange = once(changeStream, 'change');
        await once(changeStream.cursor, 'init');
        await collection.insertOne({ x: 2 });

        const [change] = await willBeChange;
        expect(change).to.have.property('operationType', 'insert');
        expect(change).to.have.nested.property('fullDocument.x', 2);
      }
    });

    it('should work with callbacks', {
      metadata: { requires: { topology: 'replicaset' } },
      async test() {
        await initIteratorMode(changeStream);

        await collection.insertOne({ x: 2 });

        const change = await changeStream.next();
        expect(change).to.have.property('operationType', 'insert');
        expect(change).to.have.nested.property('fullDocument.x', 2);
      }
    });
  });

  describe('Change Stream Resume Error Tests', function () {
    it.skip('should continue piping changes after a resumable error', {
      metadata: { requires: { topology: 'replicaset' } },
      test: done => {
        const d = new PassThrough({ objectMode: true });
        const bucket = [];
        d.on('data', data => {
          bucket.push(data.fullDocument.x);
          if (bucket.length === 2) {
            expect(bucket[0]).to.equal(1);
            expect(bucket[1]).to.equal(2);
            done();
          }
        });
        changeStream.stream().pipe(d);
        // waitForStarted(changeStream, () => {
        //   collection.insertOne({ x: 1 }, (err, result) => {
        //     expect(err).to.not.exist;
        //     expect(result).to.exist;
        //     triggerResumableError(changeStream, 250, () => {
        //       collection.insertOne({ x: 2 }, (err, result) => {
        //         expect(err).to.not.exist;
        //         expect(result).to.exist;
        //       });
        //     });
        //   });
        // });
      }
    }).skipReason = 'TODO(NODE-3884): Fix when implementing prose case #3';

    describe('NODE-2626 - handle null changes without error', function () {
      let mockServer;

      beforeEach(async () => {
        mockServer = await mock.createServer();
      });

      afterEach(async () => {
        await mock.cleanup();
      });

      it(
        'changeStream should close if cursor id for initial aggregate is Long.ZERO',
        {
          requires: {
            predicate: () => (process.env.SSL === 'ssl' ? 'test requries no TLS' : true)
          }
        },
        async function () {
          mockServer.setMessageHandler(req => {
            const doc = req.document;
            if (isHello(doc)) {
              return req.reply(mock.HELLO);
            }
            if (doc.aggregate) {
              return req.reply({
                ok: 1,
                cursor: {
                  id: Long.ZERO,
                  firstBatch: []
                }
              });
            }
            if (doc.getMore) {
              return req.reply({
                ok: 1,
                cursor: {
                  id: new Long(1407, 1407),
                  nextBatch: []
                }
              });
            }
            req.reply({ ok: 1 });
          });
          const client = this.configuration.newClient(`mongodb://${mockServer.uri()}/`, {
            serverApi: null // TODO(NODE-3807): remove resetting serverApi when the usage of mongodb mock server is removed
          });
          await client.connect();
          const collection = client.db('cs').collection('test');
          const changeStream = collection.watch();

          const err = await changeStream.next().catch(e => e);
          expect(err).to.exist;
          expect(err?.message).to.equal('ChangeStream is closed');

          await changeStream.close();
          await client.close();
        }
      );
    });
  });

  UnifiedTestSuiteBuilder.describe('document shapes')
    .runOnRequirement({
      auth: true,
      // Running on replicaset because other topologies are finiky with the cluster-wide events
      // Dropping and renaming and creating collections in order to achieve a clean slate isn't worth the goal of these tests
      // We just want to show that the new ChangeStreamDocument type information can reproduced in a real env
      topologies: ['replicaset']
    })
    .createEntities([
      { client: { id: 'client0' } },

      // transaction test
      { session: { id: 'session0', client: 'client0' } },
      {
        database: {
          id: 'changeStreamDocShape',
          client: 'client0',
          databaseName: 'changeStreamDocShape'
        }
      },
      {
        collection: {
          id: 'collection0',
          database: 'changeStreamDocShape',
          collectionName: 'collection0'
        }
      },

      // rename test
      { database: { id: 'admin', databaseName: 'admin', client: 'client0' } },
      { database: { id: 'renameDb', databaseName: 'renameDb', client: 'client0' } },
      { collection: { id: 'collToRename', collectionName: 'collToRename', database: 'renameDb' } },

      // drop test
      { database: { id: 'dbToDrop', databaseName: 'dbToDrop', client: 'client0' } },
      {
        collection: { id: 'collInDbToDrop', collectionName: 'collInDbToDrop', database: 'dbToDrop' }
      }
    ])
    .test(
      TestBuilder.it('change stream dropDatabase, drop, and invalidate events')
        .operation({
          object: 'dbToDrop',
          name: 'createCollection',
          arguments: { collection: 'collInDbToDrop' },
          saveResultAsEntity: 'collInDbToDrop',
          ignoreResultAndError: true
        })
        .operation({
          object: 'client0',
          name: 'createChangeStream',
          saveResultAsEntity: 'changeStreamOnClient'
        })
        .operation({
          object: 'collInDbToDrop',
          name: 'createChangeStream',
          saveResultAsEntity: 'changeStreamOnCollection'
        })
        .operation({
          object: 'dbToDrop',
          name: 'runCommand',
          arguments: { command: { dropDatabase: 1 } },
          expectResult: { ok: 1 }
        })
        .operation({
          object: 'changeStreamOnClient',
          name: 'iterateUntilDocumentOrError',
          expectResult: {
            _id: { $$exists: true },
            operationType: 'drop',
            ns: { db: 'dbToDrop', coll: 'collInDbToDrop' },
            clusterTime: { $$type: 'timestamp' },
            txnNumber: { $$exists: false },
            lsid: { $$exists: false }
          }
        })
        .operation({
          object: 'changeStreamOnClient',
          name: 'iterateUntilDocumentOrError',
          expectResult: {
            _id: { $$exists: true },
            operationType: 'dropDatabase',
            ns: { db: 'dbToDrop', coll: { $$exists: false } },
            clusterTime: { $$type: 'timestamp' },
            txnNumber: { $$exists: false },
            lsid: { $$exists: false }
          }
        })
        .operation({
          object: 'changeStreamOnCollection',
          name: 'iterateUntilDocumentOrError',
          expectResult: {
            _id: { $$exists: true },
            operationType: 'drop',
            ns: { db: 'dbToDrop', coll: 'collInDbToDrop' },
            clusterTime: { $$type: 'timestamp' },
            txnNumber: { $$exists: false },
            lsid: { $$exists: false }
          }
        })
        .operation({
          object: 'changeStreamOnCollection',
          name: 'iterateUntilDocumentOrError',
          expectResult: {
            _id: { $$exists: true },
            operationType: 'invalidate',
            clusterTime: { $$type: 'timestamp' },
            txnNumber: { $$exists: false },
            lsid: { $$exists: false }
          }
        })
        .toJSON()
    )
    .test(
      TestBuilder.it('change stream event inside transaction')
        .operation({
          object: 'changeStreamDocShape',
          name: 'runCommand',
          arguments: { command: { dropDatabase: 1 } },
          ignoreResultAndError: true
        })
        .operation({
          object: 'changeStreamDocShape',
          name: 'createCollection',
          arguments: { collection: 'collection0' },
          ignoreResultAndError: true
        })
        .operation({
          object: 'collection0',
          name: 'createChangeStream',
          saveResultAsEntity: 'changeStreamOnCollection'
        })
        .operation({
          name: 'startTransaction',
          object: 'session0'
        })
        .operation({
          name: 'insertOne',
          object: 'collection0',
          arguments: {
            session: 'session0',
            document: {
              _id: 3
            }
          },
          expectResult: {
            $$unsetOrMatches: {
              insertedId: {
                $$unsetOrMatches: 3
              }
            }
          }
        })
        .operation({
          name: 'commitTransaction',
          object: 'session0'
        })
        .operation({
          object: 'changeStreamOnCollection',
          name: 'iterateUntilDocumentOrError',
          expectResult: {
            _id: { $$exists: true },
            operationType: 'insert',
            fullDocument: { _id: 3 },
            documentKey: { _id: 3 },
            ns: { db: 'changeStreamDocShape', coll: 'collection0' },
            clusterTime: { $$type: 'timestamp' },
            txnNumber: { $$type: ['long', 'int'] },
            lsid: { $$sessionLsid: 'session0' }
          }
        })
        .toJSON()
    )
    .test(
      TestBuilder.it('change stream rename event')
        .operation({
          object: 'renameDb',
          name: 'runCommand',
          arguments: { command: { dropDatabase: 1 } },
          ignoreResultAndError: true
        })
        .operation({
          object: 'renameDb',
          name: 'createCollection',
          arguments: { collection: 'collToRename' },
          saveResultAsEntity: 'collToRename',
          ignoreResultAndError: true
        })
        .operation({
          object: 'renameDb',
          name: 'createChangeStream',
          saveResultAsEntity: 'changeStreamOnDb'
        })
        .operation({
          name: 'insertOne',
          object: 'collToRename',
          arguments: {
            document: {
              _id: 3
            }
          },
          expectResult: {
            $$unsetOrMatches: {
              insertedId: {
                $$unsetOrMatches: 3
              }
            }
          }
        })
        .operation({
          object: 'changeStreamOnDb',
          name: 'iterateUntilDocumentOrError',
          expectResult: {
            _id: { $$exists: true },
            operationType: 'insert',
            fullDocument: { _id: 3 },
            documentKey: { _id: 3 },
            ns: { db: 'renameDb', coll: 'collToRename' },
            clusterTime: { $$type: 'timestamp' },
            txnNumber: { $$exists: false },
            lsid: { $$exists: false }
          }
        })
        .operation({
          name: 'runCommand',
          object: 'admin',
          arguments: {
            command: {
              renameCollection: 'renameDb.collToRename',
              to: 'renameDb.newCollectionName',
              dropTarget: false
            }
          },
          expectResult: { ok: 1 }
        })
        .operation({
          object: 'changeStreamOnDb',
          name: 'iterateUntilDocumentOrError',
          expectResult: {
            _id: { $$exists: true },
            operationType: 'rename',
            ns: { db: 'renameDb', coll: 'collToRename' },
            to: { db: 'renameDb', coll: 'newCollectionName' },
            clusterTime: { $$type: 'timestamp' },
            txnNumber: { $$exists: false },
            lsid: { $$exists: false }
          }
        })
        .toJSON()
    )
    .run();

  UnifiedTestSuiteBuilder.describe('entity.watch() server-side options')
    .runOnRequirement({
      topologies: ['replicaset', 'sharded-replicaset', 'sharded', 'load-balanced'],
      minServerVersion: '4.4.0'
    })
    .createEntities([
      { client: { id: 'client0', observeEvents: ['commandStartedEvent'] } },
      { database: { id: 'db0', client: 'client0', databaseName: 'watchOpts' } },
      { collection: { id: 'collection0', database: 'db0', collectionName: 'watchOpts' } }
    ])
    .test(
      TestBuilder.it(
        'should use maxAwaitTimeMS option to set maxTimeMS on getMore and should not set maxTimeMS on aggregate'
      )
        .operation({
          object: 'collection0',
          name: 'createChangeStream',
          saveResultAsEntity: 'changeStreamOnClient',
          arguments: { maxAwaitTimeMS: 5000 }
        })
        .operation({
          name: 'insertOne',
          object: 'collection0',
          arguments: { document: { a: 1 } },
          ignoreResultAndError: true
        })
        .operation({
          object: 'changeStreamOnClient',
          name: 'iterateUntilDocumentOrError',
          ignoreResultAndError: true
        })
        .expectEvents({
          client: 'client0',
          events: [
            {
              commandStartedEvent: {
                commandName: 'aggregate',
                command: { maxTimeMS: { $$exists: false } }
              }
            },
            { commandStartedEvent: { commandName: 'insert' } },
            { commandStartedEvent: { commandName: 'getMore', command: { maxTimeMS: 5000 } } }
          ]
        })
        .toJSON()
    )
    .test(
      TestBuilder.it(
        'should use maxTimeMS option to set maxTimeMS on aggregate and not set maxTimeMS on getMore'
      )
        .operation({
          object: 'collection0',
          name: 'createChangeStream',
          saveResultAsEntity: 'changeStreamOnClient',
          arguments: { maxTimeMS: 5000 }
        })
        .operation({
          name: 'insertOne',
          object: 'collection0',
          arguments: { document: { a: 1 } },
          ignoreResultAndError: true
        })
        .operation({
          object: 'changeStreamOnClient',
          name: 'iterateUntilDocumentOrError',
          ignoreResultAndError: true
        })
        .expectEvents({
          client: 'client0',
          ignoreExtraEvents: true, // Sharded clusters have extra getMores
          events: [
            { commandStartedEvent: { commandName: 'aggregate', command: { maxTimeMS: 5000 } } },
            { commandStartedEvent: { commandName: 'insert' } },
            {
              commandStartedEvent: {
                commandName: 'getMore',
                command: { maxTimeMS: { $$exists: false } }
              }
            }
          ]
        })
        .toJSON()
    )
    .test(
      TestBuilder.it(
        'should use maxTimeMS option to set maxTimeMS on aggregate and maxAwaitTimeMS option to set maxTimeMS on getMore'
      )
        .operation({
          object: 'collection0',
          name: 'createChangeStream',
          saveResultAsEntity: 'changeStreamOnClient',
          arguments: { maxTimeMS: 5000, maxAwaitTimeMS: 6000 }
        })
        .operation({
          name: 'insertOne',
          object: 'collection0',
          arguments: { document: { a: 1 } },
          ignoreResultAndError: true
        })
        .operation({
          object: 'changeStreamOnClient',
          name: 'iterateUntilDocumentOrError',
          ignoreResultAndError: true
        })
        .expectEvents({
          client: 'client0',
          ignoreExtraEvents: true, // Sharded clusters have extra getMores
          events: [
            { commandStartedEvent: { commandName: 'aggregate', command: { maxTimeMS: 5000 } } },
            { commandStartedEvent: { commandName: 'insert' } },
            { commandStartedEvent: { commandName: 'getMore', command: { maxTimeMS: 6000 } } }
          ]
        })
        .toJSON()
    )
    .run();

  describe('BSON Options', function () {
    let client: MongoClient;
    let db: Db;
    let collection: Collection;
    let cs: ChangeStream;

    beforeEach(async function () {
      client = await this.configuration.newClient({ monitorCommands: true }).connect();
      db = client.db('db');
      collection = await db.createCollection('collection');
    });

    afterEach(async function () {
      await db.dropCollection('collection');
      await cs.close();
      await client.close();
    });

    context('promoteLongs', () => {
      context('when set to true', () => {
        it('does not convert Longs to numbers', {
          metadata: { requires: { topology: '!single' } },
          test: async function () {
            cs = collection.watch([], { promoteLongs: true, useBigInt64: false });

            const willBeChange = once(cs, 'change').then(args => args[0]);
            await once(cs.cursor, 'init');

            const result = await collection.insertOne({ a: Long.fromNumber(0) });
            expect(result).to.exist;

            const change = await willBeChange;

            expect(change.fullDocument.a).to.be.a('number');
          }
        });
      });

      context('when set to false', () => {
        it('converts Long values to native numbers', {
          metadata: { requires: { topology: '!single' } },
          test: async function () {
            cs = collection.watch([], { promoteLongs: false, useBigInt64: false });

            const willBeChange = once(cs, 'change').then(args => args[0]);
            await once(cs.cursor, 'init');

            const result = await collection.insertOne({ a: Long.fromNumber(0) });
            expect(result).to.exist;

            const change = await willBeChange;
            expect(change).to.have.nested.property('fullDocument.a').that.is.instanceOf(Long);
          }
        });
      });

      context('when omitted', () => {
        it('defaults to true', {
          metadata: { requires: { topology: '!single' } },
          test: async function () {
            cs = collection.watch([], { useBigInt64: false });

            const willBeChange = once(cs, 'change').then(args => args[0]);
            await once(cs.cursor, 'init');

            const result = await collection.insertOne({ a: Long.fromNumber(0) });
            expect(result).to.exist;

            const change = await willBeChange;
            expect(typeof change.fullDocument.a).to.equal('number');
          }
        });
      });
    });

    context('useBigInt64', () => {
      const useBigInt64FalseTest = async (options: ChangeStreamOptions) => {
        cs = collection.watch([], options);
        const willBeChange = once(cs, 'change').then(args => args[0]);
        await once(cs.cursor, 'init');

        await collection.insertOne({ a: Long.fromNumber(10) });

        const change = await willBeChange;

        expect(typeof change.fullDocument.a).to.equal('number');
      };

      context('when set to false', function () {
        it('converts Long to number', {
          metadata: {
            requires: { topology: '!single' }
          },
          test: async function () {
            await useBigInt64FalseTest({ useBigInt64: false });
          }
        });
      });

      context('when set to true', function () {
        it('converts Long to bigint', {
          metadata: {
            requires: { topology: '!single' }
          },
          test: async function () {
            cs = collection.watch([], { useBigInt64: true });
            const willBeChange = once(cs, 'change').then(args => args[0]);
            await once(cs.cursor, 'init');

            await collection.insertOne({ a: Long.fromNumber(10) });

            const change = await willBeChange;

            expect(change.fullDocument).property('a').to.be.a('bigint');
            expect(change.fullDocument).property('a', 10n);
          }
        });
      });

      context('when unset', function () {
        it('defaults to false', {
          metadata: { requires: { topology: '!single' } },
          test: async function () {
            await useBigInt64FalseTest({});
          }
        });
      });
    });

    context('invalid options', function () {
      it('server errors on invalid options on the initialize', {
        metadata: { requires: { topology: '!single' } },
        test: async function () {
          const started: CommandStartedEvent[] = [];

          client.on('commandStarted', filterForCommands(['aggregate'], started));
          const doc = { invalidBSONOption: true };
          // @ts-expect-error: checking for invalid options
          cs = collection.watch([], doc);

          const error = await once(cs, 'change').catch(error => error);
          expect(error).to.be.instanceOf(MongoServerError);
        }
      });
    });
  });

  describe("NODE-4763 - doesn't produce duplicates after resume", function () {
    let client: MongoClient;
    let collection: Collection;
    let changeStream: ChangeStream;
    let aggregateEvents: CommandStartedEvent[] = [];
    const resumableError = { code: 6, message: 'host unreachable' };

    beforeEach(async function () {
      const dbName = 'node-4763';
      const collectionName = 'test-collection';

      client = this.configuration.newClient({ monitorCommands: true });
      client.on('commandStarted', filterForCommands(['aggregate'], aggregateEvents));
      collection = client.db(dbName).collection(collectionName);

      changeStream = collection.watch([]);
    });

    afterEach(async function () {
      await client.db('admin').command({
        configureFailPoint: is4_2Server(this.configuration.version)
          ? 'failCommand'
          : 'failGetMoreAfterCursorCheckout',
        mode: 'off'
      } as FailCommandFailPoint);

      await changeStream.close();
      await client.close();
      aggregateEvents = [];
    });

    describe('when using iterator form', function () {
      it('#next', { requires: { topology: 'replicaset' } }, async function test() {
        await initIteratorMode(changeStream);

        await collection.insertOne({ a: 1 });
        const change = await changeStream.next();
        expect(change).to.containSubset({
          operationType: 'insert',
          fullDocument: { a: 1 }
        });

        await client.db('admin').command({
          configureFailPoint: is4_2Server(this.configuration.version)
            ? 'failCommand'
            : 'failGetMoreAfterCursorCheckout',
          mode: { times: 1 },
          data: {
            failCommands: ['getMore'],
            errorCode: resumableError.code,
            errmsg: resumableError.message
          }
        } as FailCommandFailPoint);

        await collection.insertOne({ a: 2 });
        const change2 = await changeStream.next();
        expect(change2).to.containSubset({
          operationType: 'insert',
          fullDocument: { a: 2 }
        });

        expect(aggregateEvents.length).to.equal(2);
      });

      it('#tryNext', { requires: { topology: 'replicaset' } }, async function test() {
        await initIteratorMode(changeStream);

        await collection.insertOne({ a: 1 });
        const change = await changeStream.tryNext();
        expect(change).to.containSubset({
          operationType: 'insert',
          fullDocument: { a: 1 }
        });

        await client.db('admin').command({
          configureFailPoint: is4_2Server(this.configuration.version)
            ? 'failCommand'
            : 'failGetMoreAfterCursorCheckout',
          mode: { times: 1 },
          data: {
            failCommands: ['getMore'],
            errorCode: resumableError.code,
            errmsg: resumableError.message
          }
        } as FailCommandFailPoint);

        await collection.insertOne({ a: 2 });
        const change2 = await changeStream.tryNext();
        expect(change2).to.containSubset({
          operationType: 'insert',
          fullDocument: { a: 2 }
        });

        expect(aggregateEvents.length).to.equal(2);
      });
    });

    it('in an event listener form', { requires: { topology: 'replicaset' } }, async function () {
      const willBeChange = on(changeStream, 'change');
      await once(changeStream.cursor, 'init');

      await collection.insertOne({ a: 1 });
      const change = await willBeChange.next();
      expect(change.value[0]).to.containSubset({
        operationType: 'insert',
        fullDocument: { a: 1 }
      });

      await client.db('admin').command({
        configureFailPoint: is4_2Server(this.configuration.version)
          ? 'failCommand'
          : 'failGetMoreAfterCursorCheckout',
        mode: { times: 1 },
        data: {
          failCommands: ['getMore'],
          errorCode: resumableError.code,
          errmsg: resumableError.message
        }
      } as FailCommandFailPoint);

      // There's an inherent race condition here because we need to make sure that the `aggregates` that succeed when
      // resuming a change stream don't return the change event.
      // So we defer the insert until a period of time after the change stream has received the first change.
      // 2000ms is long enough for the change stream to attempt to resume and fail once before exhausting the failpoint
      // and succeeding.
      await sleep(2000);
      await collection.insertOne({ a: 2 });

      const change2 = await willBeChange.next();
      expect(change2.value[0]).to.containSubset({
        operationType: 'insert',
        fullDocument: { a: 2 }
      });

      expect(aggregateEvents.length).to.equal(2);
    });
  });
});

describe('ChangeStream resumability', function () {
  let client: MongoClient;
  let utilClient: MongoClient;
  let collection: Collection;
  let changeStream: ChangeStream;
  let aggregateEvents: CommandStartedEvent[] = [];
  let appName: string;

  const changeStreamResumeOptions: ChangeStreamOptions = {
    fullDocument: 'updateLookup',
    collation: { locale: 'en', maxVariable: 'punct' },
    maxAwaitTimeMS: 2000,
    batchSize: 200
  };

  const resumableErrorCodes = [
    { error: 'HostUnreachable', code: 6, message: 'host unreachable' },
    { error: 'HostNotFound', code: 7, message: 'hot not found' },
    { error: 'NetworkTimeout', code: 89, message: 'network timeout' },
    { error: 'ShutdownInProgress', code: 91, message: 'shutdown in progress' },
    { error: 'PrimarySteppedDown', code: 189, message: 'primary stepped down' },
    { error: 'ExceededTimeLimit', code: 262, message: 'operation exceeded time limit' },
    { error: 'SocketException', code: 9001, message: 'socket exception' },
    { error: 'NotWritablePrimary', code: 10107, message: 'not writable primary' },
    { error: 'InterruptedAtShutdown', code: 11600, message: 'interrupted at shutdown' },
    {
      error: 'InterruptedDueToReplStateChange',
      code: 11602,
      message: 'interrupted due to state change'
    },
    { error: 'NotPrimaryNoSecondaryOk', code: 13435, message: 'not primary and no secondary ok' },
    { error: 'StaleShardVersion', code: 63, message: 'stale shard version' },
    { error: 'StaleEpoch', code: 150, message: 'stale epoch' },
    { error: 'RetryChangeStream', code: 234, message: 'retry change stream' },
    {
      error: 'FailedToSatisfyReadPreference',
      code: 133,
      message: 'failed to satisfy read preference'
    },
    { error: 'CursorNotFound', code: 43, message: 'cursor not found' }
  ];

  beforeEach(function () {
    assert(this.currentTest != null);
    if (
      this.currentTest.title.includes('StaleShardVersion') &&
      gte(this.configuration.version, '6.0.0')
    ) {
      this.currentTest.skipReason = 'TODO(NODE-4434): fix StaleShardVersion resumability test';
      this.skip();
    }
  });

  beforeEach(async function () {
    const dbName = 'resumabilty_tests';
    const collectionName = 'foo';

    utilClient = this.configuration.newClient();

    // 3.6 servers do not support creating a change stream on a database that doesn't exist
    await utilClient
      .db(dbName)
      .dropDatabase()
      .catch(e => e);
    await utilClient.db(dbName).createCollection(collectionName);

    // we are going to switch primary in tests and cleanup of failpoints is difficult,
    // so generating unique appname instead of cleaning for each test is an easier solution
    appName = new UUID().toString();

    client = this.configuration.newClient(
      {},
      {
        monitorCommands: true,
        serverSelectionTimeoutMS: 10_000,
        heartbeatFrequencyMS: 5_000,
        appName: appName
      }
    );
    client.on('commandStarted', filterForCommands(['aggregate'], aggregateEvents));
    collection = client.db(dbName).collection(collectionName);
  });

  afterEach(async function () {
    await changeStream.close();
    await utilClient.close();
    await client.close();
    aggregateEvents = [];
  });

  context('iterator api', function () {
    context('#next', function () {
      for (const { error, code, message } of resumableErrorCodes) {
        it(
          `resumes on error code ${code} (${error})`,
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);

            await client.db('admin').command({
              configureFailPoint: is4_2Server(this.configuration.version)
                ? 'failCommand'
                : 'failGetMoreAfterCursorCheckout',
              mode: { times: 1 },
              data: {
                failCommands: ['getMore'],
                errorCode: code,
                errmsg: message
              }
            } as FailCommandFailPoint);

            await collection.insertOne({ name: 'bailey' });

            const change = await changeStream.next();
            expect(change).to.have.property('operationType', 'insert');

            expect(aggregateEvents).to.have.lengthOf(2);
          }
        );

        it(
          `supports consecutive resumes on error code ${code} ${error}`,
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);

            await client.db('admin').command({
              configureFailPoint: is4_2Server(this.configuration.version)
                ? 'failCommand'
                : 'failGetMoreAfterCursorCheckout',
              mode: { times: 5 },
              data: {
                failCommands: ['getMore'],
                errorCode: code,
                errmsg: message
              }
            } as FailCommandFailPoint);

            // There's an inherent race condition here because we need to make sure that the `aggregates` that succeed when
            // resuming a change stream don't return the change event.  So we defer the insert until a period of time
            // after the change stream has started listening for a change.  2000ms is long enough for the change
            // stream to attempt to resume and fail multiple times before exhausting the failpoint and succeeding.
            const [, value] = await Promise.allSettled([
              sleep(2000).then(() => collection.insertOne({ name: 'bailey' })),
              changeStream.next()
            ]);

            const change = (value as PromiseFulfilledResult<ChangeStreamDocument>).value;

            expect(change).to.have.property('operationType', 'insert');

            // More than one aggregate event indicates that the change stream attempted more than one
            // resume attempt.
            expect(aggregateEvents.length).to.be.greaterThan(1);
          }
        );
      }

      it(
        'maintains change stream options on resume',
        { requires: { topology: '!single' } },
        async function () {
          changeStream = collection.watch([], changeStreamResumeOptions);
          await initIteratorMode(changeStream);

          await client.db('admin').command({
            configureFailPoint: is4_2Server(this.configuration.version)
              ? 'failCommand'
              : 'failGetMoreAfterCursorCheckout',
            mode: { times: 1 },
            data: {
              failCommands: ['getMore'],
              errorCode: resumableErrorCodes[0].code,
              errmsg: resumableErrorCodes[0].message
            }
          } as FailCommandFailPoint);

          expect(changeStream.cursor)
            .to.have.property('changeStreamCursorOptions')
            .that.containSubset(changeStreamResumeOptions);

          await collection.insertOne({ name: 'bailey' });

          await changeStream.next();

          expect(changeStream.cursor)
            .to.have.property('changeStreamCursorOptions')
            .that.containSubset(changeStreamResumeOptions);
        }
      );

      context('when the error is not a resumable error', function () {
        it('does not resume', { requires: { topology: '!single' } }, async function () {
          changeStream = collection.watch([]);

          const unresumableErrorCode = 1000;
          await client.db('admin').command({
            configureFailPoint: is4_2Server(this.configuration.version)
              ? 'failCommand'
              : 'failGetMoreAfterCursorCheckout',
            mode: { times: 1 },
            data: {
              failCommands: ['getMore'],
              errorCode: unresumableErrorCode
            }
          } as FailCommandFailPoint);

          await initIteratorMode(changeStream);

          await collection.insertOne({ name: 'bailey' });

          const error = await changeStream.next().catch(err => err);

          expect(error).to.be.instanceOf(MongoServerError);
          expect(aggregateEvents).to.have.lengthOf(1);
        });
      });

      context('when the error occurs on the aggregate command', function () {
        it('does not resume', { requires: { topology: '!single' } }, async function () {
          const resumableErrorCode = 7; // Host not found
          await client.db('admin').command({
            configureFailPoint: 'failCommand',
            mode: { times: 2 }, // Fail twice to account for retry attempt in executeOperation which is separate from the change stream's resume attempt
            data: {
              failCommands: ['aggregate'],
              errorCode: resumableErrorCode
            }
          } as FailCommandFailPoint);

          changeStream = collection.watch([]);

          await collection.insertOne({ name: 'bailey' });

          const maybeError = await changeStream.next().catch(e => e);

          expect(maybeError).to.be.instanceof(MongoServerError);
          expect(aggregateEvents).to.have.lengthOf(2);
          expect(changeStream.closed).to.be.true;
        });
      });

      context('when the error is not a server error', function () {
        it(
          'should resume on ServerSelectionError',
          { requires: { topology: ['replicaset'] } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);

            await collection.insertOne({ a: 1 });

            await utilClient.db('admin').command({
              configureFailPoint: 'failCommand',
              mode: 'alwaysOn',
              data: {
                failCommands: ['ping', 'hello', LEGACY_HELLO_COMMAND],
                closeConnection: true,
                appName: appName
              }
            } as FailCommandFailPoint);

            await forcePrimaryStepDown(utilClient);

            const change = await changeStream.next();
            expect(change).to.containSubset({ operationType: 'insert', fullDocument: { a: 1 } });

            expect(aggregateEvents).to.have.lengthOf(2);
            const [e1, e2] = aggregateEvents;
            expect(e1.address).to.not.equal(e2.address);
          }
        );
      });
    });

    context('#hasNext', function () {
      for (const { error, code, message } of resumableErrorCodes) {
        it(
          `resumes on error code ${code} (${error})`,
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);

            await client.db('admin').command({
              configureFailPoint: is4_2Server(this.configuration.version)
                ? 'failCommand'
                : 'failGetMoreAfterCursorCheckout',
              mode: { times: 1 },
              data: {
                failCommands: ['getMore'],
                errorCode: code,
                errmsg: message
              }
            } as FailCommandFailPoint);

            await collection.insertOne({ name: 'bailey' });

            const hasNext = await changeStream.hasNext();
            expect(hasNext).to.be.true;

            expect(aggregateEvents).to.have.lengthOf(2);
          }
        );

        it(
          `supports consecutive resumes on error code ${code} ${error}`,
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);

            await client.db('admin').command({
              configureFailPoint: is4_2Server(this.configuration.version)
                ? 'failCommand'
                : 'failGetMoreAfterCursorCheckout',
              mode: { times: 5 },
              data: {
                failCommands: ['getMore'],
                errorCode: code,
                errmsg: message
              }
            } as FailCommandFailPoint);

            // There's an inherent race condition here because we need to make sure that the `aggregates` that succeed when
            // resuming a change stream don't return the change event.  So we defer the insert until a period of time
            // after the change stream has started listening for a change.  2000ms is long enough for the change
            // stream to attempt to resume and fail multiple times before exhausting the failpoint and succeeding.
            const [, value] = await Promise.allSettled([
              sleep(2000).then(() => collection.insertOne({ name: 'bailey' })),
              changeStream.hasNext()
            ]);

            const change = (value as PromiseFulfilledResult<boolean>).value;

            expect(change).to.be.true;

            // More than one aggregate event indicates that the change stream attempted more than one
            // resume attempt.
            expect(aggregateEvents.length).to.be.greaterThan(1);
          }
        );
      }

      it(
        'maintains change stream options on resume',
        { requires: { topology: '!single' } },
        async function () {
          changeStream = collection.watch([], changeStreamResumeOptions);
          await initIteratorMode(changeStream);

          await client.db('admin').command({
            configureFailPoint: is4_2Server(this.configuration.version)
              ? 'failCommand'
              : 'failGetMoreAfterCursorCheckout',
            mode: { times: 1 },
            data: {
              failCommands: ['getMore'],
              errorCode: resumableErrorCodes[0].code,
              errmsg: resumableErrorCodes[0].message
            }
          } as FailCommandFailPoint);

          expect(changeStream.cursor)
            .to.have.property('changeStreamCursorOptions')
            .that.containSubset(changeStreamResumeOptions);

          await collection.insertOne({ name: 'bailey' });

          await changeStream.hasNext();

          expect(changeStream.cursor)
            .to.have.property('changeStreamCursorOptions')
            .that.containSubset(changeStreamResumeOptions);
        }
      );

      context('when the error is not a resumable error', function () {
        it('does not resume', { requires: { topology: '!single' } }, async function () {
          changeStream = collection.watch([]);

          const unresumableErrorCode = 1000;
          await client.db('admin').command({
            configureFailPoint: is4_2Server(this.configuration.version)
              ? 'failCommand'
              : 'failGetMoreAfterCursorCheckout',
            mode: { times: 1 },
            data: {
              failCommands: ['getMore'],
              errorCode: unresumableErrorCode
            }
          } as FailCommandFailPoint);

          await initIteratorMode(changeStream);

          await collection.insertOne({ name: 'bailey' });

          const error = await changeStream.hasNext().catch(err => err);

          expect(error).to.be.instanceOf(MongoServerError);
          expect(aggregateEvents).to.have.lengthOf(1);
        });
      });

      context('when the error occurs on the aggregate command', function () {
        it('does not resume', { requires: { topology: '!single' } }, async function () {
          const resumableErrorCode = 7; // Host not found
          await client.db('admin').command({
            configureFailPoint: 'failCommand',
            mode: { times: 2 }, // Fail twice to account for retry attempt in executeOperation which is separate from the change stream's resume attempt
            data: {
              failCommands: ['aggregate'],
              errorCode: resumableErrorCode
            }
          } as FailCommandFailPoint);

          changeStream = collection.watch([]);

          await collection.insertOne({ name: 'bailey' });

          const maybeError = await changeStream.hasNext().catch(e => e);

          expect(maybeError).to.be.instanceof(MongoServerError);
          expect(aggregateEvents).to.have.lengthOf(2);
          expect(changeStream.closed).to.be.true;
        });
      });
    });

    context('#tryNext', function () {
      for (const { error, code, message } of resumableErrorCodes) {
        it(
          `resumes on error code ${code} (${error})`,
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);

            await client.db('admin').command({
              configureFailPoint: is4_2Server(this.configuration.version)
                ? 'failCommand'
                : 'failGetMoreAfterCursorCheckout',
              mode: { times: 1 },
              data: {
                failCommands: ['getMore'],
                errorCode: code,
                errmsg: message
              }
            } as FailCommandFailPoint);

            try {
              // tryNext is not blocking and on sharded clusters we don't have control of when
              // the actual change event will be ready on the change stream pipeline. This introduces
              // a race condition, where sometimes we receive the change event and sometimes
              // we don't when we call tryNext, depending on the timing of the sharded cluster.

              // Since we really only care about the resumability, it's enough for this test to throw
              // if tryNext ever throws and assert on the number of aggregate events.
              await changeStream.tryNext();
            } catch (err) {
              expect.fail(`expected tryNext to resume, received error instead: ${err}`);
            }
            expect(aggregateEvents).to.have.lengthOf(2);
          }
        );

        it(
          `supports consecutive resumes on error code ${code} ${error}`,
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);

            await client.db('admin').command({
              configureFailPoint: is4_2Server(this.configuration.version)
                ? 'failCommand'
                : 'failGetMoreAfterCursorCheckout',
              mode: { times: 5 },
              data: {
                failCommands: ['getMore'],
                errorCode: code,
                errmsg: message
              }
            } as FailCommandFailPoint);

            try {
              // tryNext is not blocking and on sharded clusters we don't have control of when
              // the actual change event will be ready on the change stream pipeline. This introduces
              // a race condition, where sometimes we receive the change event and sometimes
              // we don't when we call tryNext, depending on the timing of the sharded cluster.

              // Since we really only care about the resumability, it's enough for this test to throw
              // if tryNext ever throws and assert on the number of aggregate events.
              await changeStream.tryNext();
            } catch (err) {
              expect.fail(`expected tryNext to resume, received error instead: ${err}`);
            }

            // More than one aggregate event indicates that the change stream attempted more than one
            // resume attempt.
            expect(aggregateEvents.length).to.be.greaterThan(1);
          }
        );
      }

      it(
        'maintains change stream options on resume',
        { requires: { topology: '!single' } },
        async function () {
          changeStream = collection.watch([], changeStreamResumeOptions);
          await initIteratorMode(changeStream);

          await client.db('admin').command({
            configureFailPoint: is4_2Server(this.configuration.version)
              ? 'failCommand'
              : 'failGetMoreAfterCursorCheckout',
            mode: { times: 1 },
            data: {
              failCommands: ['getMore'],
              errorCode: resumableErrorCodes[0].code,
              errmsg: resumableErrorCodes[0].message
            }
          } as FailCommandFailPoint);

          expect(changeStream.cursor)
            .to.have.property('changeStreamCursorOptions')
            .that.containSubset(changeStreamResumeOptions);

          await collection.insertOne({ name: 'bailey' });

          await changeStream.tryNext();

          expect(changeStream.cursor)
            .to.have.property('changeStreamCursorOptions')
            .that.containSubset(changeStreamResumeOptions);
        }
      );

      context('when the error is not a resumable error', function () {
        it('does not resume', { requires: { topology: '!single' } }, async function () {
          changeStream = collection.watch([]);

          const unresumableErrorCode = 1000;
          await client.db('admin').command({
            configureFailPoint: is4_2Server(this.configuration.version)
              ? 'failCommand'
              : 'failGetMoreAfterCursorCheckout',
            mode: { times: 1 },
            data: {
              failCommands: ['getMore'],
              errorCode: unresumableErrorCode
            }
          } as FailCommandFailPoint);

          await initIteratorMode(changeStream);

          const error = await changeStream.tryNext().catch(err => err);

          expect(error).to.be.instanceOf(MongoServerError);
          expect(aggregateEvents).to.have.lengthOf(1);
        });
      });

      context('when the error occurs on the aggregate command', function () {
        it('does not resume', { requires: { topology: '!single' } }, async function () {
          const resumableErrorCode = 7; // Host not found
          await client.db('admin').command({
            configureFailPoint: 'failCommand',
            mode: { times: 2 }, // Fail twice to account for retry attempt in executeOperation which is separate from the change stream's resume attempt
            data: {
              failCommands: ['aggregate'],
              errorCode: resumableErrorCode
            }
          } as FailCommandFailPoint);

          changeStream = collection.watch([]);

          await collection.insertOne({ name: 'bailey' });

          const maybeError = await changeStream.tryNext().catch(e => e);

          expect(maybeError).to.be.instanceof(MongoServerError);
          expect(aggregateEvents).to.have.lengthOf(2);
          expect(changeStream.closed).to.be.true;
        });
      });

      context('when the error is not a server error', function () {
        it(
          'should resume on ServerSelectionError',
          { requires: { topology: ['replicaset'] } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);

            await collection.insertOne({ a: 1 });

            await utilClient.db('admin').command({
              configureFailPoint: 'failCommand',
              mode: 'alwaysOn',
              data: {
                failCommands: ['ping', 'hello', LEGACY_HELLO_COMMAND],
                closeConnection: true,
                appName: appName
              }
            } as FailCommandFailPoint);
            await forcePrimaryStepDown(utilClient);

            const change = await changeStream.tryNext();
            expect(change).to.containSubset({ operationType: 'insert', fullDocument: { a: 1 } });

            expect(aggregateEvents).to.have.lengthOf(2);
            const [e1, e2] = aggregateEvents;
            expect(e1.address).to.not.equal(e2.address);
          }
        );
      });
    });

    context('#asyncIterator', function () {
      for (const { error, code, message } of resumableErrorCodes) {
        it(
          `resumes on error code ${code} (${error})`,
          { requires: { topology: '!single' } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);

            const docs = [{ city: 'New York City' }, { city: 'Seattle' }, { city: 'Boston' }];
            await collection.insertMany(docs);

            await client.db('admin').command({
              configureFailPoint: is4_2Server(this.configuration.version)
                ? 'failCommand'
                : 'failGetMoreAfterCursorCheckout',
              mode: { times: 1 },
              data: {
                failCommands: ['getMore'],
                errorCode: code,
                errmsg: message
              }
            } as FailCommandFailPoint);

            for await (const change of changeStream) {
              const { fullDocument } = change;
              const expectedDoc = docs.shift();
              expect(fullDocument.city).to.equal(expectedDoc.city);
              if (docs.length === 0) {
                break;
              }
            }

            expect(docs).to.have.length(0, 'expected to find all docs before exiting loop');
            expect(aggregateEvents).to.have.lengthOf(2);
          }
        );
      }

      it(
        'maintains change stream options on resume',
        { requires: { topology: '!single' } },
        async function () {
          changeStream = collection.watch([], changeStreamResumeOptions);
          await initIteratorMode(changeStream);
          const changeStreamIterator = changeStream[Symbol.asyncIterator]();

          await client.db('admin').command({
            configureFailPoint: is4_2Server(this.configuration.version)
              ? 'failCommand'
              : 'failGetMoreAfterCursorCheckout',
            mode: { times: 1 },
            data: {
              failCommands: ['getMore'],
              errorCode: resumableErrorCodes[0].code,
              errmsg: resumableErrorCodes[0].message
            }
          } as FailCommandFailPoint);

          expect(changeStream.cursor)
            .to.have.property('changeStreamCursorOptions')
            .that.containSubset(changeStreamResumeOptions);

          await collection.insertOne({ city: 'New York City' });
          await changeStreamIterator.next();

          expect(changeStream.cursor)
            .to.have.property('changeStreamCursorOptions')
            .that.containSubset(changeStreamResumeOptions);
        }
      );

      context('when the error is not a resumable error', function () {
        it('does not resume', { requires: { topology: '!single' } }, async function () {
          changeStream = collection.watch([]);
          await initIteratorMode(changeStream);

          const docs = [{ city: 'New York City' }, { city: 'Seattle' }, { city: 'Boston' }];
          await collection.insertMany(docs);

          const unresumableErrorCode = 1000;
          await client.db('admin').command({
            configureFailPoint: is4_2Server(this.configuration.version)
              ? 'failCommand'
              : 'failGetMoreAfterCursorCheckout',
            mode: { times: 1 },
            data: {
              failCommands: ['getMore'],
              errorCode: unresumableErrorCode
            }
          } as FailCommandFailPoint);

          try {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const change of changeStream) {
              expect.fail('Change stream produced events on an unresumable error');
            }
          } catch (error) {
            expect(error).to.be.instanceOf(MongoServerError);
            expect(aggregateEvents).to.have.lengthOf(1);
          }
        });
      });

      context('when the error occurs on the aggregate command', function () {
        it('does not resume', { requires: { topology: '!single' } }, async function () {
          changeStream = collection.watch([]);

          const docs = [{ city: 'New York City' }, { city: 'Seattle' }, { city: 'Boston' }];
          await collection.insertMany(docs);

          const resumableErrorCode = 7;
          await client.db('admin').command({
            configureFailPoint: 'failCommand',
            mode: { times: 2 }, // Account for retry in executeOperation which is separate from change stream's resume
            data: {
              failCommands: ['aggregate'],
              errorCode: resumableErrorCode
            }
          } as FailCommandFailPoint);

          try {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const change of changeStream) {
              expect.fail('Change stream produced events on an unresumable error');
            }
            expect.fail('Change stream did not iterate and did not throw an error');
          } catch (error) {
            expect(error).to.be.instanceOf(MongoServerError);
            expect(aggregateEvents).to.have.lengthOf(2);
            expect(changeStream.closed).to.be.true;
          }
        });
      });

      context('when the error is not a server error', function () {
        it(
          'should resume on ServerSelectionError',
          { requires: { topology: ['replicaset'] } },
          async function () {
            changeStream = collection.watch([]);
            await initIteratorMode(changeStream);
            const changeStreamIterator = changeStream[Symbol.asyncIterator]();

            await collection.insertOne({ a: 1 });

            await utilClient.db('admin').command({
              configureFailPoint: 'failCommand',
              mode: 'alwaysOn',
              data: {
                failCommands: ['ping', 'hello', LEGACY_HELLO_COMMAND],
                closeConnection: true,
                appName: appName
              }
            } as FailCommandFailPoint);
            await forcePrimaryStepDown(utilClient);

            const change = await changeStreamIterator.next();
            expect(change.value).to.containSubset({
              operationType: 'insert',
              fullDocument: { a: 1 }
            });

            expect(aggregateEvents).to.have.lengthOf(2);
            const [e1, e2] = aggregateEvents;
            expect(e1.address).to.not.equal(e2.address);
          }
        );
      });
    });
  });

  describe('event emitter based iteration', function () {
    for (const { error, code, message } of resumableErrorCodes) {
      it(
        `resumes on error code ${code} (${error})`,
        { requires: { topology: '!single' } },
        async function () {
          changeStream = collection.watch([]);

          await client.db('admin').command({
            configureFailPoint: is4_2Server(this.configuration.version)
              ? 'failCommand'
              : 'failGetMoreAfterCursorCheckout',
            mode: { times: 1 },
            data: {
              failCommands: ['getMore'],
              errorCode: code,
              errmsg: message
            }
          } as FailCommandFailPoint);

          const changes = once(changeStream, 'change');
          await once(changeStream.cursor, 'init');

          await collection.insertOne({ name: 'bailey' });

          const [change] = await changes;
          expect(change).to.have.property('operationType', 'insert');

          expect(aggregateEvents).to.have.lengthOf(2);
        }
      );

      it(
        `supports consecutive resumes on error code ${code} (${error})`,
        { requires: { topology: '!single' } },
        async function () {
          changeStream = collection.watch([]);

          await client.db('admin').command({
            configureFailPoint: is4_2Server(this.configuration.version)
              ? 'failCommand'
              : 'failGetMoreAfterCursorCheckout',
            mode: { times: 5 },
            data: {
              failCommands: ['getMore'],
              errorCode: code,
              errmsg: message
            }
          } as FailCommandFailPoint);

          const changes = once(changeStream, 'change');
          await once(changeStream.cursor, 'init');

          // There's an inherent race condition here because we need to make sure that the `aggregates` that succeed when
          // resuming a change stream don't return the change event.  So we defer the insert until a period of time
          // after the change stream has started listening for a change.  2000ms is long enough for the change
          // stream to attempt to resume and fail multiple times before exhausting the failpoint and succeeding.
          const [, value] = await Promise.allSettled([
            sleep(2000).then(() => collection.insertOne({ name: 'bailey' })),
            changes
          ]);

          const [change] = (value as PromiseFulfilledResult<ChangeStreamDocument[]>).value;
          expect(change).to.have.property('operationType', 'insert');

          // More than one aggregate event indicates that the change stream attempted more than one
          // resume attempt.
          expect(aggregateEvents.length).to.be.greaterThan(1);
        }
      );
    }

    it(
      'maintains the change stream options on resume',
      { requires: { topology: '!single' } },
      async function () {
        changeStream = collection.watch([], changeStreamResumeOptions);

        await client.db('admin').command({
          configureFailPoint: is4_2Server(this.configuration.version)
            ? 'failCommand'
            : 'failGetMoreAfterCursorCheckout',
          mode: { times: 1 },
          data: {
            failCommands: ['getMore'],
            errorCode: resumableErrorCodes[0].code,
            errmsg: resumableErrorCodes[0].message
          }
        } as FailCommandFailPoint);

        expect(changeStream.cursor)
          .to.have.property('changeStreamCursorOptions')
          .that.containSubset(changeStreamResumeOptions);

        const changes = once(changeStream, 'change');
        await once(changeStream.cursor, 'init');

        await collection.insertOne({ name: 'bailey' });

        await changes;

        expect(changeStream.cursor)
          .to.have.property('changeStreamCursorOptions')
          .that.containSubset(changeStreamResumeOptions);
      }
    );

    context('when the error is not a resumable error', function () {
      it('does not resume', { requires: { topology: '!single' } }, async function () {
        changeStream = collection.watch([]);

        const unresumableErrorCode = 1000;
        await client.db('admin').command({
          configureFailPoint: is4_2Server(this.configuration.version)
            ? 'failCommand'
            : 'failGetMoreAfterCursorCheckout',
          mode: { times: 1 },
          data: {
            failCommands: ['getMore'],
            errorCode: unresumableErrorCode
          }
        } as FailCommandFailPoint);

        const willBeError = once(changeStream, 'change').catch(error => error);
        await once(changeStream.cursor, 'init');
        await collection.insertOne({ name: 'bailey' });

        const error = await willBeError;

        expect(error).to.be.instanceOf(MongoServerError);
        expect(aggregateEvents).to.have.lengthOf(1);
      });
    });

    context('when the error is operation was interrupted', function () {
      it('does not resume', { requires: { topology: '!single' } }, async function () {
        changeStream = collection.watch([]);

        const unresumableErrorCode = 237;
        await client.db('admin').command({
          configureFailPoint: is4_2Server(this.configuration.version)
            ? 'failCommand'
            : 'failGetMoreAfterCursorCheckout',
          mode: { times: 1 },
          data: {
            failCommands: ['getMore'],
            errorCode: unresumableErrorCode,
            errmsg: 'operation was interrupted'
          }
        } as FailCommandFailPoint);

        const willBeError = once(changeStream, 'change').catch(error => error);
        await once(changeStream.cursor, 'init');
        await collection.insertOne({ name: 'bailey' });

        const error = await willBeError;

        expect(error).to.be.instanceOf(MongoServerError);
        expect(aggregateEvents).to.have.lengthOf(1);
      });
    });

    context('when the error occurred on the aggregate', function () {
      it('does not resume', { requires: { topology: '!single' } }, async function () {
        changeStream = collection.watch([]);

        const resumableErrorCode = 7;
        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: { times: 2 }, // account for retry attempt in executeOperation which is separate from change stream's retry
          data: {
            failCommands: ['aggregate'],
            errorCode: resumableErrorCode
          }
        } as FailCommandFailPoint);

        const willBeError = once(changeStream, 'change').catch(error => error);
        await collection.insertOne({ name: 'bailey' });

        const error = await willBeError;

        expect(error).to.be.instanceOf(MongoServerError);
        expect(aggregateEvents).to.have.lengthOf(2);
        expect(changeStream.closed).to.be.true;
      });
    });

    context('when the error is not a server error', function () {
      it(
        'should resume on ServerSelectionError',
        { requires: { topology: ['replicaset'] } },
        async function () {
          changeStream = collection.watch([]);

          const changes = on(changeStream, 'change');
          await once(changeStream.cursor, 'init');

          await collection.insertOne({ a: 1 });

          const change = await changes.next();
          expect(change.value[0]).to.containSubset({
            operationType: 'insert',
            fullDocument: { a: 1 }
          });

          await utilClient.db('admin').command({
            configureFailPoint: 'failCommand',
            mode: 'alwaysOn',
            data: {
              failCommands: ['ping', 'hello', LEGACY_HELLO_COMMAND],
              closeConnection: true,
              appName: appName
            }
          } as FailCommandFailPoint);
          await forcePrimaryStepDown(utilClient);

          await collection.insertOne({ a: 2 });

          const change2 = await changes.next();
          expect(change2.value[0]).to.containSubset({
            operationType: 'insert',
            fullDocument: { a: 2 }
          });

          expect(aggregateEvents).to.have.lengthOf(2);
          const [e1, e2] = aggregateEvents;
          expect(e1.address).to.not.equal(e2.address);
        }
      );
    });
  });

  it(
    'caches the server version after the initial aggregate call',
    { requires: { topology: '!single' } },
    async function () {
      changeStream = collection.watch([], changeStreamResumeOptions);
      expect(changeStream.cursor.maxWireVersion).to.be.undefined;
      await initIteratorMode(changeStream);

      expect(changeStream.cursor.maxWireVersion).to.be.a('number');
    }
  );

  it(
    'updates the cached server version after the first getMore call',
    { requires: { topology: '!single' } },
    async function () {
      changeStream = collection.watch([], changeStreamResumeOptions);
      await initIteratorMode(changeStream);

      const maxWireVersion = changeStream.cursor.maxWireVersion;
      changeStream.cursor.maxWireVersion = -1;

      await changeStream.tryNext();

      expect(changeStream.cursor.maxWireVersion).equal(maxWireVersion);
    }
  );

  it(
    'updates the cached server version after each getMore call',
    { requires: { topology: '!single' } },
    async function () {
      changeStream = collection.watch([], changeStreamResumeOptions);
      await initIteratorMode(changeStream);

      const maxWireVersion = changeStream.cursor.maxWireVersion;
      changeStream.cursor.maxWireVersion = -1;

      await changeStream.tryNext();

      expect(changeStream.cursor.maxWireVersion).equal(maxWireVersion);

      changeStream.cursor.maxWireVersion = -1;

      await changeStream.tryNext();
      expect(changeStream.cursor.maxWireVersion).equal(maxWireVersion);
    }
  );
});
