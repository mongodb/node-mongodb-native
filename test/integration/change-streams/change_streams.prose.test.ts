import { expect } from 'chai';
import { once } from 'events';
import * as sinon from 'sinon';
import { setTimeout } from 'timers';

import {
  type ChangeStream,
  type CommandFailedEvent,
  type CommandStartedEvent,
  type CommandSucceededEvent,
  type Document,
  isHello,
  LEGACY_HELLO_COMMAND,
  Long,
  MongoNetworkError,
  ObjectId,
  Timestamp
} from '../../mongodb';
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
  onClose?: () => void
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
      callback(new MongoNetworkError('error triggered from test'));
      nextStub.restore();
    });

    changeStream.next(() => {
      // ignore
    });
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

/** Waits for a change stream to start */
function waitForStarted(changeStream, callback) {
  changeStream.cursor.once('init', () => {
    callback();
  });
}

// Define the pipeline processing changes
const pipeline = [
  { $addFields: { addedField: 'This is a field added using $addFields' } },
  { $project: { documentKey: false } },
  { $addFields: { comment: 'The documentKey field has been projected out of this document.' } }
];

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

  // 9. $changeStream stage for ChangeStream against a server >=4.0 and <4.0.7 that has not received
  // any results yet MUST include a startAtOperationTime option when resuming a change stream.
  it('should include a startAtOperationTime field when resuming if no changes have been received', {
    metadata: { requires: { topology: 'replicaset', mongodb: '>=4.0 <4.0.7' } },
    test: function (done) {
      const configuration = this.configuration;

      const OPERATION_TIME = new Timestamp({ i: 4, t: 1501511802 });

      const makeHello = server => ({
        __nodejs_mock_server__: true,
        [LEGACY_HELLO_COMMAND]: true,
        secondary: false,
        me: server.uri(),
        primary: server.uri(),
        tags: { loc: 'ny' },
        setName: 'rs',
        setVersion: 1,
        electionId: new ObjectId(0),
        maxBsonObjectSize: 16777216,
        maxMessageSizeBytes: 48000000,
        maxWriteBatchSize: 1000,
        localTime: new Date(),
        maxWireVersion: 7,
        minWireVersion: 0,
        ok: 1,
        hosts: [server.uri()],
        operationTime: OPERATION_TIME,
        $clusterTime: {
          clusterTime: OPERATION_TIME
        }
      });

      const AGGREGATE_RESPONSE = {
        ok: 1,
        cursor: {
          firstBatch: [],
          id: new Long('9064341847921713401'),
          ns: 'test.test'
        },
        operationTime: OPERATION_TIME,
        $clusterTime: {
          clusterTime: OPERATION_TIME
        }
      };

      const CHANGE_DOC = {
        _id: {
          ts: OPERATION_TIME,
          ns: 'integration_tests.docsDataEvent',
          _id: new ObjectId('597f407a8fd4abb616feca93')
        },
        operationType: 'insert',
        ns: {
          db: 'integration_tests',
          coll: 'docsDataEvent'
        },
        fullDocument: {
          _id: new ObjectId('597f407a8fd4abb616feca93'),
          a: 1,
          counter: 0
        }
      };

      const GET_MORE_RESPONSE = {
        ok: 1,
        cursor: {
          nextBatch: [CHANGE_DOC],
          id: new Long('9064341847921713401'),
          ns: 'test.test'
        },
        cursorId: new Long('9064341847921713401')
      };

      const dbName = 'integration_tests';
      const collectionName = 'resumeWithStartAtOperationTime';
      const connectOptions = { monitorCommands: true };

      let getMoreCounter = 0;
      let changeStream;
      let server;
      let client;

      let finish = (err?: Error) => {
        finish = () => {
          // ignore
        };
        Promise.resolve()
          .then(() => changeStream && changeStream.close())
          .then(() => client && client.close())
          .then(() => done(err));
      };

      function primaryServerHandler(request) {
        try {
          const doc = request.document;
          if (isHello(doc)) {
            return request.reply(makeHello(server));
          } else if (doc.aggregate) {
            return request.reply(AGGREGATE_RESPONSE);
          } else if (doc.getMore) {
            if (getMoreCounter++ === 0) {
              request.reply({ ok: 0 });
              return;
            }

            request.reply(GET_MORE_RESPONSE);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          } else if (doc.killCursors) {
            request.reply({ ok: 1 });
          }
        } catch (e) {
          finish(e);
        }
      }

      const started = [];

      mock
        .createServer()
        .then(_server => (server = _server))
        .then(() => server.setMessageHandler(primaryServerHandler))
        .then(() => (client = configuration.newClient(`mongodb://${server.uri()}`, connectOptions)))
        .then(() => {
          client.on('commandStarted', e => {
            if (e.commandName === 'aggregate') {
              started.push(e);
            }
          });
        })
        .then(() => client.db(dbName))
        .then(db => db.collection(collectionName))
        .then(col => col.watch(pipeline))
        .then(_changeStream => (changeStream = _changeStream))
        .then(() => changeStream.next())
        .then(() => {
          const first = started[0].command;
          expect(first).to.have.nested.property('pipeline[0].$changeStream');
          const firstStage = first.pipeline[0].$changeStream;
          expect(firstStage).to.not.have.property('resumeAfter');
          expect(firstStage).to.not.have.property('startAtOperationTime');

          const second = started[1].command;
          expect(second).to.have.nested.property('pipeline[0].$changeStream');
          const secondStage = second.pipeline[0].$changeStream;
          expect(secondStage).to.not.have.property('resumeAfter');
          expect(secondStage).to.have.property('startAtOperationTime');
          expect(secondStage.startAtOperationTime.equals(OPERATION_TIME)).to.be.ok;
        })
        .then(
          () => finish(),
          err => finish(err)
        );
    }
  });

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
    //   Running against a server >=4.0.7.
    //   The batch is empty or has been iterated to the last document.
    // Expected result:
    //   getResumeToken must return the postBatchResumeToken from the current command response.
    describe('for emptied batch on server >= 4.0.7', function () {
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

    // 12. For a ChangeStream under these conditions:
    //   Running against a server <4.0.7.
    //   The batch is empty or has been iterated to the last document.
    // Expected result:
    //   getResumeToken must return the _id of the last document returned if one exists.
    //   getResumeToken must return resumeAfter from the initial aggregate if the option was specified.
    //   If ``resumeAfter`` was not specified, the ``getResumeToken`` result must be empty.
    describe('for emptied batch on server <= 4.0.7', function () {
      it('must return the _id of the last document returned if one exists', function () {
        const manager = new MockServerManager(this.configuration, {
          aggregate: (function* () {
            yield { numDocuments: 0, postBatchResumeToken: false };
          })(),
          getMore: (function* () {
            yield { numDocuments: 1, postBatchResumeToken: false };
          })()
        });

        return manager
          .ready()
          .then(() => manager.makeChangeStream().next())
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
            expect(successes[1]).to.have.a.nested.property('nextBatch[0]._id');

            expect(tokens).to.have.a.lengthOf(1);
            expect(tokens[0]).to.deep.equal(successes[1].nextBatch[0]._id);
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
              let counter = 0;
              changeStream.cursor.on('response', () => {
                if (counter === 1) {
                  token = changeStream.resumeToken;
                  resolve();
                }
                counter += 1;
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

      it('must be empty if resumeAfter options was not specified', function () {
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
              let counter = 0;
              changeStream.cursor.on('response', () => {
                if (counter === 1) {
                  token = changeStream.resumeToken;
                  resolve();
                }
                counter += 1;
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
    let client;
    let coll;
    let startAfter;

    function recordEvent(events, e) {
      if (e.commandName !== 'aggregate') return;
      events.push({ $changeStream: e.command.pipeline[0].$changeStream });
    }

    beforeEach(function (done) {
      const configuration = this.configuration;
      client = configuration.newClient({ monitorCommands: true });
      client.connect(err => {
        expect(err).to.not.exist;
        coll = client.db('integration_tests').collection('setupAfterTest');
        const changeStream = coll.watch();
        waitForStarted(changeStream, () => {
          coll.insertOne({ x: 1 }, { writeConcern: { w: 'majority', j: true } }, err => {
            expect(err).to.not.exist;

            coll.drop(err => {
              expect(err).to.not.exist;
            });
          });
        });

        changeStream.on('change', change => {
          if (change.operationType === 'invalidate') {
            startAfter = change._id;
            changeStream.close(done);
          }
        });
      });
    });

    afterEach(function (done) {
      client.close(done);
    });

    // 17. $changeStream stage for ChangeStream started with startAfter against a server >=4.1.1
    // that has not received any results yet
    // - MUST include a startAfter option
    // - MUST NOT include a resumeAfter option
    // when resuming a change stream.
    it('$changeStream without results must include startAfter and not resumeAfter', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=4.1.1' } },
      test: function (done) {
        const events = [];
        client.on('commandStarted', e => recordEvent(events, e));
        const changeStream = coll.watch([], { startAfter });
        this.defer(() => changeStream.close());

        changeStream.once('change', change => {
          expect(change).to.containSubset({
            operationType: 'insert',
            fullDocument: { x: 2 }
          });

          expect(events).to.be.an('array').with.lengthOf(3);
          expect(events[0]).nested.property('$changeStream.startAfter').to.exist;
          expect(events[1]).to.equal('error');
          expect(events[2]).nested.property('$changeStream.startAfter').to.exist;
          done();
        });

        waitForStarted(changeStream, () => {
          triggerResumableError(changeStream, () => {
            events.push('error');
            coll.insertOne({ x: 2 }, { writeConcern: { w: 'majority', j: true } });
          });
        });
      }
    });

    // 18. $changeStream stage for ChangeStream started with startAfter against a server >=4.1.1
    // that has received at least one result
    // - MUST include a resumeAfter option
    // - MUST NOT include a startAfter option
    // when resuming a change stream.
    it('$changeStream with results must include resumeAfter and not startAfter', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=4.1.1' } },
      test: function (done) {
        let events = [];
        client.on('commandStarted', e => recordEvent(events, e));
        const changeStream = coll.watch([], { startAfter });
        this.defer(() => changeStream.close());

        changeStream.on('change', change => {
          events.push({ change: { insert: { x: change.fullDocument.x } } });
          switch (change.fullDocument.x) {
            case 2:
              // only events after this point are relevant to this test
              events = [];
              triggerResumableError(changeStream, () => events.push('error'));
              break;
            case 3:
              expect(events).to.be.an('array').with.lengthOf(3);
              expect(events[0]).to.equal('error');
              expect(events[1]).nested.property('$changeStream.resumeAfter').to.exist;
              expect(events[2]).to.eql({ change: { insert: { x: 3 } } });
              done();
              break;
          }
        });

        waitForStarted(changeStream, () =>
          this.defer(
            coll
              .insertOne({ x: 2 }, { writeConcern: { w: 'majority', j: true } })
              .then(() => coll.insertOne({ x: 3 }, { writeConcern: { w: 'majority', j: true } }))
          )
        );
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
      metadata: { requires: { topology: '!single', mongodb: '>=7.0.0' } },
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
