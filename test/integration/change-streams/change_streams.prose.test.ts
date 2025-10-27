import { expect } from 'chai';
import { on, once } from 'events';
import * as sinon from 'sinon';
import { setTimeout } from 'timers';

import {
  type ChangeStream,
  type Collection,
  type CommandFailedEvent,
  type CommandStartedEvent,
  type CommandSucceededEvent,
  type Document,
  Long,
  type MongoClient,
  MongoNetworkError,
  ObjectId,
  Timestamp
} from '../../../src';
import { LEGACY_HELLO_COMMAND } from '../../../src/constants';
import * as mock from '../../tools/mongodb-mock/index';
import { setupDatabase } from '../shared';

/**
 * Triggers a fake resumable error on a change stream
 * changeStream
 * [delay] optional delay before triggering error
 * onClose callback when cursor closed due this error
 */
function triggerResumableError(changeStream: ChangeStream, onClose?: () => void);
function triggerResumableError(changeStream: ChangeStream, delay: number, onClose?: () => void);
function triggerResumableError(
  changeStream: ChangeStream,
  delay: number | (() => void),
  onClose?: (err?: Error) => void
) {
  if (typeof delay === 'function') {
    onClose = delay;
    delay = undefined;
  }

  const stub = sinon.stub(changeStream.cursor, 'close');
  stub.callsFake(async function () {
    stub.wrappedMethod.call(this);
    stub.restore();
    onClose();
  });

  function triggerError() {
    const cursorStream = changeStream.cursorStream;
    if (cursorStream) {
      cursorStream.emit('error', new MongoNetworkError('error triggered from test'));
      return;
    }

    const nextStub = sinon.stub(changeStream.cursor, 'next').callsFake(async function () {
      onClose(new MongoNetworkError('error triggered from test'));
      nextStub.restore();
    });

    changeStream.next();
  }

  if (typeof delay === 'number') {
    setTimeout(triggerError, delay);
    return;
  }

  triggerError();
}

const initIteratorMode = async (cs: ChangeStream) => {
  const initEvent = once(cs.cursor, 'init');
  //@ts-expect-error: private method
  await cs.cursor.cursorInit();
  await initEvent;
  return;
};

describe('Change Stream prose tests', function () {
  before(async function () {
    return await setupDatabase(this.configuration, ['integration_tests']);
  });

  beforeEach(async function () {
    const configuration = this.configuration;
    const client = configuration.newClient();

    const db = client.db('integration_tests');
    try {
      await db.createCollection('test');
    } catch {
      // ns already exists, don't care
    } finally {
      await client.close();
    }
  });

  afterEach(async () => await mock.cleanup());

  // TODO(NODE-3884): Add tests 1-4, 6-8. (#5 is removed from spec)
  // Note: #3 is partially contained in change_stream.test.js > Change Stream Resume Error Tests

  // 10 removed by spec
  describe('Change Stream prose 11-14', () => {
    class MockServerManager {
      config: any;
      cmdList: Set<string>;
      database: string;
      collection: string;
      ns: string;
      _timestampCounter: number;
      cursorId: Long;
      commandIterators: any;
      promise: Promise<any>;
      server: any;
      client: any;
      apm: {
        started: CommandStartedEvent[];
        succeeded: CommandSucceededEvent[];
        failed: CommandFailedEvent[];
      };
      changeStream: any;
      resumeTokenChangedEvents: any[];
      namespace: any;
      constructor(config, commandIterators) {
        this.config = config;
        this.cmdList = new Set([
          LEGACY_HELLO_COMMAND,
          'hello',
          'endSessions',
          'aggregate',
          'getMore'
        ]);
        this.database = 'test_db';
        this.collection = 'test_coll';
        this.ns = `${this.database}.${this.collection}`;
        this._timestampCounter = 0;
        this.cursorId = new Long('9064341847921713401');
        this.commandIterators = commandIterators;
        this.promise = this.init();

        // Handler for the legacy hello command
        this[LEGACY_HELLO_COMMAND] = function () {
          return this.hello();
        };
      }

      async init() {
        const server = await mock.createServer();
        this.server = server;
        this.server.setMessageHandler(request => {
          const doc = request.document;

          const opname = Object.keys(doc)[0];
          let response = { ok: 0 };
          if (this.cmdList.has(opname) && this[opname]) {
            response = this[opname](doc);
          }
          request.reply(this.applyOpTime(response));
        });
        this.client = this.config.newClient(this.mongodbURI, {
          monitorCommands: true,
          serverApi: null // TODO(NODE-3807): remove resetting serverApi when the usage of mongodb mock server is removed
        });
        this.apm = { started: [], succeeded: [], failed: [] };

        (
          [
            ['commandStarted', this.apm.started],
            ['commandSucceeded', this.apm.succeeded],
            ['commandFailed', this.apm.failed]
          ] as const
        ).forEach(opts => {
          const eventName = opts[0];
          const target = opts[1];

          this.client.on(eventName, e => {
            if (e.commandName === 'aggregate' || e.commandName === 'getMore') {
              target.push(e);
            }
          });
        });
      }

      makeChangeStream(options?: Document) {
        this.changeStream = this.client
          .db(this.database)
          .collection(this.collection)
          .watch(options);
        this.resumeTokenChangedEvents = [];

        this.changeStream.on('resumeTokenChanged', resumeToken => {
          this.resumeTokenChangedEvents.push({ resumeToken });
        });

        return this.changeStream;
      }

      teardown(e?: Error) {
        let promise = Promise.resolve();
        if (this.changeStream) {
          promise = promise.then(() => this.changeStream.close()).catch();
        }
        if (this.client) {
          promise = promise.then(() => this.client.close()).catch();
        }
        return promise.then(function () {
          if (e) {
            throw e;
          }
        });
      }

      ready() {
        return this.promise;
      }

      get mongodbURI() {
        return `mongodb://${this.server.uri()}`;
      }

      // Handlers for specific commands

      hello() {
        const uri = this.server.uri();
        return Object.assign({}, mock.HELLO, {
          [LEGACY_HELLO_COMMAND]: true,
          secondary: false,
          me: uri,
          primary: uri,
          setName: 'rs',
          localTime: new Date(),
          ok: 1,
          hosts: [uri]
        });
      }

      endSessions() {
        return { ok: 1 };
      }

      aggregate() {
        let cursor;
        try {
          cursor = this._buildCursor('aggregate', 'firstBatch');
        } catch (e) {
          return { ok: 0, errmsg: e.message };
        }

        return {
          ok: 1,
          cursor
        };
      }

      getMore() {
        let cursor;
        try {
          cursor = this._buildCursor('getMore', 'nextBatch');
        } catch (e) {
          return { ok: 0, errmsg: e.message };
        }
        return {
          ok: 1,
          cursor,
          cursorId: this.cursorId
        };
      }

      // Helpers
      timestamp() {
        return new Timestamp({ i: this._timestampCounter++, t: this._timestampCounter });
      }

      applyOpTime(obj) {
        const operationTime = this.timestamp();

        return Object.assign({}, obj, {
          $clusterTime: { clusterTime: operationTime },
          operationTime
        });
      }

      _buildCursor(type, batchKey) {
        const config = this.commandIterators[type].next().value;
        if (!config) {
          throw new Error('no more config for ' + type);
        }

        const batch = Array.from({ length: config.numDocuments || 0 }).map(() =>
          this.changeEvent()
        );
        const cursor: Document = {
          [batchKey]: batch,
          id: this.cursorId,
          ns: this.ns
        };
        if (config.postBatchResumeToken) {
          cursor.postBatchResumeToken = this.resumeToken();
        }
        return cursor;
      }

      changeEvent(operationType?: string, fullDocument?: Document) {
        fullDocument = fullDocument || {};
        return {
          _id: this.resumeToken(),
          operationType,
          ns: {
            db: this.database,
            coll: this.collection
          },
          fullDocument
        };
      }

      resumeToken() {
        return {
          ts: this.timestamp(),
          ns: this.namespace,
          _id: new ObjectId()
        };
      }
    }

    // 11. For a ChangeStream under these conditions:
    //   The batch is empty or has been iterated to the last document.
    // Expected result:
    //   getResumeToken must return the postBatchResumeToken from the current command response.
    describe('for emptied batch on server', function () {
      it('must return the postBatchResumeToken from the current command response', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: true, cursor: { firstBatch: [] } };
          })(),
          getMore: (function* () {
            yield { numDocuments: 1, postBatchResumeToken: true, cursor: { nextBatch: [{}] } };
          })()
        });

        return manager
          .ready()
          .then(() => {
            return manager.makeChangeStream().next();
          })
          .then(
            () => manager.teardown(),
            err => manager.teardown(err)
          )
          .then(() => {
            const tokens = manager.resumeTokenChangedEvents.map(e => e.resumeToken);
            const successes = manager.apm.succeeded.map(e => {
              try {
                // @ts-expect-error: e.reply is unknown
                return e.reply.cursor;
              } catch {
                return {};
              }
            });

            expect(successes).to.have.a.lengthOf(2);
            expect(successes[0]).to.have.a.property('postBatchResumeToken');
            expect(successes[1]).to.have.a.property('postBatchResumeToken');
            expect(successes[1]).to.have.a.nested.property('nextBatch[0]._id');

            expect(tokens).to.have.a.lengthOf(2);
            expect(tokens[0]).to.deep.equal(successes[0].postBatchResumeToken);
            expect(tokens[1])
              .to.deep.equal(successes[1].postBatchResumeToken)
              .and.to.not.deep.equal(successes[1].nextBatch[0]._id);
          });
      });
    });

    // 13. For a ChangeStream under these conditions:
    //   The batch is not empty.
    //   The batch has been iterated up to but not including the last element.
    // Expected result:
    //   getResumeToken must return the _id of the previous document returned.
    describe('for non-empty batch iterated up to but not including the last element', function () {
      it('must return the _id of the previous document returned', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 2, postBatchResumeToken: true };
          })(),
          getMore: (function* () {
            // fake getMore
          })()
        });

        return manager
          .ready()
          .then(() => {
            return manager.makeChangeStream().next();
          })
          .then(
            () => manager.teardown(),
            err => manager.teardown(err)
          )
          .then(() => {
            const tokens = manager.resumeTokenChangedEvents.map(e => e.resumeToken);
            const successes = manager.apm.succeeded.map(e => {
              try {
                // @ts-expect-error: e.reply is unknown
                return e.reply.cursor;
              } catch {
                return {};
              }
            });

            expect(successes).to.have.a.lengthOf(1);
            expect(successes[0]).to.have.a.nested.property('firstBatch[0]._id');
            expect(successes[0]).to.have.a.property('postBatchResumeToken');

            expect(tokens).to.have.a.lengthOf(1);
            expect(tokens[0])
              .to.deep.equal(successes[0].firstBatch[0]._id)
              .and.to.not.deep.equal(successes[0].postBatchResumeToken);
          });
      });
    });

    // 14. For a ChangeStream under these conditions:
    //   The batch is not empty.
    //   The batch hasn’t been iterated at all.
    //   Only the initial aggregate command has been executed.
    // Expected result:
    //   getResumeToken must return startAfter from the initial aggregate if the option was specified.
    //   getResumeToken must return resumeAfter from the initial aggregate if the option was specified.
    //   If neither the startAfter nor resumeAfter options were specified, the getResumeToken result must be empty.
    describe('for non-empty non-iterated batch where only the initial aggregate command has been executed', function () {
      it('must return startAfter from the initial aggregate if the option was specified', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })()
        });
        let token;
        const startAfter = manager.resumeToken();
        const resumeAfter = manager.resumeToken();

        return manager
          .ready()
          .then(() => {
            return new Promise<void>(resolve => {
              const changeStream = manager.makeChangeStream({ startAfter, resumeAfter });
              changeStream.cursor.once('response', () => {
                token = changeStream.resumeToken;
                resolve();
              });

              changeStream.next().catch(() => {
                // Note: this is expected to fail
              });
            });
          })
          .then(
            () => manager.teardown(),
            err => manager.teardown(err)
          )
          .then(() => {
            expect(token).to.deep.equal(startAfter).and.to.not.deep.equal(resumeAfter);
          });
      });

      it('must return resumeAfter from the initial aggregate if the option was specified', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })()
        });
        let token;
        const resumeAfter = manager.resumeToken();

        return manager
          .ready()
          .then(() => {
            return new Promise<void>(resolve => {
              const changeStream = manager.makeChangeStream({ resumeAfter });
              changeStream.cursor.once('response', () => {
                token = changeStream.resumeToken;
                resolve();
              });

              changeStream.next().catch(() => {
                // Note: this is expected to fail
              });
            });
          })
          .then(
            () => manager.teardown(),
            err => manager.teardown(err)
          )
          .then(() => {
            expect(token).to.deep.equal(resumeAfter);
          });
      });

      it('must be empty if neither the startAfter nor resumeAfter options were specified', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })()
        });
        let token;

        return manager
          .ready()
          .then(() => {
            return new Promise<void>(resolve => {
              const changeStream = manager.makeChangeStream();
              changeStream.cursor.once('response', () => {
                token = changeStream.resumeToken;
                resolve();
              });

              changeStream.next().catch(() => {
                // Note: this is expected to fail
              });
            });
          })
          .then(
            () => manager.teardown(),
            err => manager.teardown(err)
          )
          .then(() => {
            expect(token).to.not.exist;
          });
      });
    });
  });

  // 15 - 16 removed by spec

  describe('Change Stream prose 17-18', function () {
    let client: MongoClient;
    let coll: Collection;
    let startAfter: unknown;

    function recordEvent(events, e) {
      if (e.commandName !== 'aggregate') return;
      events.push({ $changeStream: e.command.pipeline[0].$changeStream });
    }

    beforeEach('get startAfter token', async function () {
      const configuration = this.configuration;
      const utilClient = configuration.newClient();
      await utilClient.connect();

      const coll = utilClient.db('integration_tests').collection('setupAfterTest');
      const changeStream = coll.watch();

      const willInit = once(changeStream.cursor, 'init');

      await changeStream.tryNext();
      await willInit;

      await coll.insertOne({ x: 1 }, { writeConcern: { w: 'majority', j: true } });
      await coll.drop();

      for await (const change of changeStream) {
        if (change.operationType === 'invalidate') {
          startAfter = change._id;
          break;
        }
      }

      await changeStream.close();

      await utilClient.close();
    });

    beforeEach(async function () {
      client = this.configuration.newClient({}, { monitorCommands: true });
      coll = client.db('integration_tests').collection('setupAfterTest');
    });

    afterEach(async function () {
      await client.close();
    });

    // 17. $changeStream stage for ChangeStream started with startAfter against a server >=4.1.1
    // that has not received any results yet
    // - MUST include a startAfter option
    // - MUST NOT include a resumeAfter option
    // when resuming a change stream.
    it('$changeStream without results must include startAfter and not resumeAfter', {
      metadata: { requires: { topology: 'replicaset' } },
      test: async function () {
        const events = [];
        client.on('commandStarted', e => recordEvent(events, e));
        const changeStream = coll.watch([], { startAfter });

        changeStream.on('error', async () => {
          await changeStream.close();
        });

        const changePromise = once(changeStream, 'change');
        await once(changeStream.cursor, 'init');

        const stub = sinon.stub(changeStream.cursor, 'close');

        stub.callsFake(async function () {
          stub.wrappedMethod.call(this);
          stub.restore();
          events.push('error');
          await coll.insertOne({ x: 2 }, { writeConcern: { w: 'majority', j: true } });
        });

        changeStream.cursorStream.emit('error', new MongoNetworkError('error triggered from test'));

        const [change] = await changePromise;
        expect(change).to.containSubset({ operationType: 'insert', fullDocument: { x: 2 } });
        expect(events).to.be.an('array').with.lengthOf(3);

        expect(events[0]).nested.property('$changeStream.startAfter').to.exist;
        expect(events[1]).to.equal('error');
        expect(events[2]).nested.property('$changeStream.startAfter').to.exist;
      }
    });

    // 18. $changeStream stage for ChangeStream started with startAfter against a server >=4.1.1
    // that has received at least one result
    // - MUST include a resumeAfter option
    // - MUST NOT include a startAfter option
    // when resuming a change stream.
    it('$changeStream with results must include resumeAfter and not startAfter', {
      metadata: { requires: { topology: 'replicaset' } },
      test: async function () {
        let events = [];
        client.on('commandStarted', e => recordEvent(events, e));
        const changeStream = coll.watch([], { startAfter });

        changeStream.on('change', change => {
          events.push({ change: { insert: { x: change.fullDocument.x } } });
          switch (change.fullDocument.x) {
            case 2:
              // only events after this point are relevant to this test
              events = [];
              triggerResumableError(changeStream, () => events.push('error'));
              break;
          }
        });

        await once(changeStream.cursor, 'init');
        const changes = on(changeStream, 'change');
        await coll.insertOne({ x: 2 }, { writeConcern: { w: 'majority', j: true } });
        await changes.next();
        await coll.insertOne({ x: 3 }, { writeConcern: { w: 'majority', j: true } });
        await changes.next();

        expect(events).to.be.an('array').with.lengthOf(3);
        expect(events[0]).to.equal('error');
        expect(events[1]).nested.property('$changeStream.resumeAfter').to.exist;
        expect(events[2]).to.eql({ change: { insert: { x: 3 } } });

        await changeStream.close();
      }
    });
  });

  describe('19. Validate that large ChangeStream events are split when using $changeStreamSplitLargeEvent', function () {
    let client;
    let db;
    let collection;
    let changeStream;

    beforeEach(async function () {
      const configuration = this.configuration;
      client = configuration.newClient();
      db = client.db('test');
      // Create a new collection _C_ with changeStreamPreAndPostImages enabled.
      await db.createCollection('changeStreamSplitTests', {
        changeStreamPreAndPostImages: { enabled: true }
      });
      collection = db.collection('changeStreamSplitTests');
    });

    afterEach(async function () {
      await changeStream.close();
      await collection.drop();
      await client.close();
    });

    it('splits the event into multiple fragments', {
      metadata: { requires: { topology: '!single', mongodb: '>=6.0.9' } },
      test: async function () {
        // Insert into _C_ a document at least 10mb in size, e.g. { "value": "q"*10*1024*1024 }
        await collection.insertOne({ value: 'q'.repeat(10 * 1024 * 1024) });
        // Create a change stream _S_ by calling watch on _C_ with pipeline
        // [{ "$changeStreamSplitLargeEvent": {} }] and fullDocumentBeforeChange=required.
        changeStream = collection.watch([{ $changeStreamSplitLargeEvent: {} }], {
          fullDocumentBeforeChange: 'required'
        });
        await initIteratorMode(changeStream);
        // Call updateOne on _C_ with an empty query and an update setting the field to a new
        // large value, e.g. { "$set": { "value": "z"*10*1024*1024 } }.
        await collection.updateOne({}, { $set: { value: 'z'.repeat(10 * 1024 * 1024) } });
        // Collect two events from _S_.
        const eventOne = await changeStream.next();
        const eventTwo = await changeStream.next();
        // Assert that the events collected have splitEvent fields { "fragment": 1, "of": 2 }
        // and { "fragment": 2, "of": 2 }, in that order.
        expect(eventOne.splitEvent).to.deep.equal({ fragment: 1, of: 2 });
        expect(eventTwo.splitEvent).to.deep.equal({ fragment: 2, of: 2 });
      }
    });
  });
});
