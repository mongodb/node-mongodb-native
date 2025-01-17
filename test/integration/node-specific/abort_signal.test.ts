import * as events from 'node:events';
import { TLSSocket } from 'node:tls';
import * as util from 'node:util';

import { expect } from 'chai';
import * as semver from 'semver';
import * as sinon from 'sinon';

import {
  type AbstractCursor,
  AggregationCursor,
  type AutoEncryptionOptions,
  ClientEncryption,
  type Collection,
  type Db,
  FindCursor,
  ListCollectionsCursor,
  type Log,
  type MongoClient,
  promiseWithResolvers,
  ReadPreference,
  setDifference,
  StateMachine
} from '../../mongodb';
import {
  clearFailPoint,
  configureFailPoint,
  DOMException,
  findLast,
  sleep
} from '../../tools/utils';

const failPointMetadata = { requires: { mongodb: '>=4.4' } };

const isAsyncGenerator = (value: any): value is AsyncGenerator<any> =>
  value[Symbol.toStringTag] === 'AsyncGenerator';

const makeDescriptorGetter = value => prop => [prop, Object.getOwnPropertyDescriptor(value, prop)];

function getAllProps(value) {
  const props = [];
  for (let obj = value; obj !== Object.prototype; obj = Object.getPrototypeOf(obj)) {
    props.push(...Object.getOwnPropertyNames(obj).map(makeDescriptorGetter(obj)));
    props.push(...Object.getOwnPropertySymbols(obj).map(makeDescriptorGetter(obj)));
  }
  return props;
}

describe('AbortSignal support', () => {
  let client: MongoClient;
  let db: Db;
  let collection: Collection<{ a: number; ssn: string }>;
  const logs: Log[] = [];

  beforeEach(async function () {
    logs.length = 0;

    client = this.configuration.newClient(
      {},
      {
        monitorCommands: true,
        appName: 'abortSignalClient',
        __enableMongoLogger: true,
        __internalLoggerConfig: { MONGODB_LOG_SERVER_SELECTION: 'debug' },
        mongodbLogPath: { write: log => logs.push(log) },
        serverSelectionTimeoutMS: 10_000,
        maxPoolSize: 1
      }
    );
    await client.connect();
    db = client.db('abortSignal');
    collection = db.collection('support');
  });

  afterEach(async function () {
    logs.length = 0;
    const utilClient = this.configuration.newClient();
    try {
      await utilClient.db('abortSignal').collection('support').deleteMany({});
    } finally {
      await utilClient.close();
    }
    await client?.close();
  });

  function testCursor(cursorName: string, constructor: any) {
    let method;
    let filter;

    beforeEach(function () {
      method = (cursorName === 'listCollections' ? db[cursorName] : collection[cursorName]).bind(
        cursorName === 'listCollections' ? db : collection
      );
      filter = cursorName === 'aggregate' ? [] : {};
    });

    describe(`when ${cursorName}() is given a signal`, () => {
      const cursorAPIs = {
        tryNext: [],
        hasNext: [],
        next: [],
        toArray: [],
        forEach: [async () => true],
        [Symbol.asyncIterator]: []
      };

      async function iterateUntilDocumentOrError(cursor, cursorAPI, args) {
        try {
          const apiReturnValue = cursor[cursorAPI](...args);
          return isAsyncGenerator(apiReturnValue)
            ? await apiReturnValue.next()
            : await apiReturnValue;
        } catch (error) {
          return error;
        }
      }

      it('should test all the async APIs', () => {
        const knownNotTested = [
          'asyncDispose',
          'close',
          'getMore',
          'cursorInit',
          'fetchBatch',
          'cleanup',
          'transformDocument',
          Symbol.asyncDispose
        ];

        const allCursorAsyncAPIs = getAllProps(constructor.prototype)
          .filter(([, { value }]) => util.types.isAsyncFunction(value))
          .map(([key]) => key);

        expect(setDifference(Object.keys(cursorAPIs), allCursorAsyncAPIs)).to.be.empty;

        const notTested = allCursorAsyncAPIs.filter(
          fn => knownNotTested.includes(fn) && Object.keys(cursorAPIs).includes(fn)
        );

        expect(notTested, 'new async function found, should respond to signal state or be internal')
          .to.be.empty;
      });

      describe('and the signal is already aborted', () => {
        let signal: AbortSignal;
        let cursor: AbstractCursor<{ a: number }>;

        beforeEach(() => {
          const controller = new AbortController();
          signal = controller.signal;
          controller.abort();

          cursor = method(cursorName === 'aggregate' ? [] : {}, { signal });
        });

        afterEach(async () => {
          await cursor.close();
        });

        for (const [cursorAPI, { value: args }] of getAllProps(cursorAPIs)) {
          it(`rejects ${cursorAPI.toString()}`, async () => {
            const result = await iterateUntilDocumentOrError(cursor, cursorAPI, args);
            expect(result).to.be.instanceOf(DOMException);
          });
        }
      });

      describe('and the signal is aborted after use', () => {
        let controller: AbortController;
        let signal: AbortSignal;
        let cursor: FindCursor<{ a: number }>;

        beforeEach(() => {
          controller = new AbortController();
          signal = controller.signal;
          cursor = method(filter, { signal });
        });

        afterEach(async () => {
          await cursor.close();
        });

        for (const [cursorAPI, { value: args }] of getAllProps(cursorAPIs)) {
          it(`resolves ${cursorAPI.toString()} without Error`, async () => {
            const result = await iterateUntilDocumentOrError(cursor, cursorAPI, args);
            controller.abort();
            expect(result).to.not.be.instanceOf(Error);
          });

          it(`aborts in-flight ${cursorAPI.toString()} when aborted after start but before await`, async () => {
            const willBeResultBlocked = /* await */ iterateUntilDocumentOrError(
              cursor,
              cursorAPI,
              args
            );

            controller.abort();
            const result = await willBeResultBlocked;

            expect(result).to.be.instanceOf(DOMException);
          });

          it(`rejects ${cursorAPI.toString()} on the subsequent call`, async () => {
            const result = await iterateUntilDocumentOrError(cursor, cursorAPI, args);
            expect(result).to.not.be.instanceOf(Error);

            controller.abort();

            const error = await iterateUntilDocumentOrError(cursor, cursorAPI, args);
            expect(error).to.be.instanceOf(DOMException);
          });
        }
      });

      describe('and the signal is aborted in between iterations', () => {
        let controller: AbortController;
        let signal: AbortSignal;
        let cursor: AbstractCursor<{ a: number }>;
        const commandsStarted = [];

        beforeEach(async function () {
          commandsStarted.length = 0;
          const utilClient = this.configuration.newClient();
          try {
            const collection = utilClient.db('abortSignal').collection('support');
            await collection.drop({}).catch(() => null);
            await collection.insertMany([
              { a: 1, ssn: '0000-00-0001' },
              { a: 2, ssn: '0000-00-0002' },
              { a: 3, ssn: '0000-00-0003' }
            ]);
            if (cursorName === 'listCollections') {
              for (let i = 0; i < 3; i++) {
                await db.dropCollection(`c${i}`).catch(() => null);
                await db.createCollection(`c${i}`);
              }
            }
          } finally {
            await utilClient.close();
          }

          controller = new AbortController();
          signal = controller.signal;
          cursor = method(filter, { signal, batchSize: 1 });
          client.on('commandStarted', e => commandsStarted.push(e));
        });

        const waitForKillCursors = async () => {
          for await (const [ev] of events.on(client, 'commandStarted')) {
            if (ev.commandName === 'killCursors') return ev;
          }
        };

        afterEach(async () => {
          await cursor?.close();
          sinon.restore();
        });

        it(`rejects for-await on the next iteration`, async () => {
          let loop = 0;
          let thrownError;

          try {
            for await (const _ of cursor) {
              if (loop) controller.abort();
              loop += 1;
            }
          } catch (error) {
            thrownError = error;
          }

          expect(thrownError).to.be.instanceOf(DOMException);
          expect(loop).to.equal(2);
        });

        it('does not run more than one getMore and kills the cursor', async () => {
          const killCursors = waitForKillCursors();
          try {
            let loop = 0;
            for await (const _ of cursor) {
              if (loop) controller.abort();
              loop += 1;
            }
          } catch {
            //ignore;
          }

          // Check that we didn't run two getMore before inspecting the state of the signal.
          // If we didn't check _after_ re-entering our asyncIterator on `yield`,
          // we may have called .next()->.fetchBatch() etc. without preventing that work from being done
          expect(commandsStarted.map(e => e.commandName)).to.deep.equal([cursorName, 'getMore']);
          await killCursors;
        });
      });

      describe('and the signal is aborted during server selection', () => {
        const metadata: MongoDBMetadataUI = { requires: { topology: 'replicaset' } };

        function test(cursorAPI, args) {
          let controller: AbortController;
          let signal: AbortSignal;
          let cursor: AbstractCursor<{ a: number }>;

          beforeEach(() => {
            controller = new AbortController();
            signal = controller.signal;
            cursor = method(filter, {
              signal,
              // Pick an unselectable server
              readPreference: new ReadPreference('secondary', [
                { something: 'that does not exist' }
              ])
            });
          });

          afterEach(async () => {
            await cursor?.close();
          });

          it(`rejects ${cursorAPI.toString()}`, metadata, async () => {
            const willBeResult = iterateUntilDocumentOrError(cursor, cursorAPI, args);

            await sleep(3);
            expect(
              findLast(
                logs,
                l =>
                  l.operation === cursorName &&
                  l.message === 'Waiting for suitable server to become available'
              )
            ).to.exist;

            controller.abort();
            const start = performance.now();
            const result = await willBeResult;
            const end = performance.now();
            expect(end - start).to.be.lessThan(1000); // should be way less than 5s server selection timeout

            expect(result).to.be.instanceOf(DOMException);
          });
        }

        for (const [cursorAPI, { value: args }] of getAllProps(cursorAPIs)) {
          test(cursorAPI, args);
        }
      });

      describe('and the signal is aborted during connection checkout', failPointMetadata, () => {
        function test(cursorAPI, args) {
          let controller: AbortController;
          let signal: AbortSignal;
          let cursor: AbstractCursor<{ a: number }>;

          beforeEach(async function () {
            await configureFailPoint(this.configuration, {
              configureFailPoint: 'failCommand',
              mode: { times: 1 },
              data: {
                appName: 'abortSignalClient',
                failCommands: [cursorName],
                blockConnection: true,
                blockTimeMS: 300
              }
            });

            controller = new AbortController();
            signal = controller.signal;
            cursor = method(filter, { signal });
          });

          afterEach(async function () {
            await clearFailPoint(this.configuration);
            await cursor?.close();
          });

          it(`rejects ${cursorAPI.toString()}`, async () => {
            const checkoutSucceededFirst = events.once(client, 'connectionCheckedOut');
            const checkoutStartedBlocked = events.once(client, 'connectionCheckOutStarted');

            const _ = iterateUntilDocumentOrError(cursor, cursorAPI, args);
            const willBeResultBlocked = iterateUntilDocumentOrError(cursor, cursorAPI, args);

            await checkoutSucceededFirst;
            await checkoutStartedBlocked;

            controller.abort();
            const result = await willBeResultBlocked;

            expect(result).to.be.instanceOf(DOMException);
          });
        }

        for (const [cursorAPI, { value: args }] of getAllProps(cursorAPIs)) {
          test(cursorAPI, args);
        }
      });

      describe('and the signal is aborted during connection write', () => {
        function test(cursorAPI, args) {
          let controller: AbortController;
          let signal: AbortSignal;
          let cursor: AbstractCursor<{ a: number }>;

          beforeEach(async function () {
            controller = new AbortController();
            signal = controller.signal;
            cursor = method(filter, { signal });
          });

          afterEach(async function () {
            sinon.restore();
            await cursor?.close();
          });

          it(`rejects ${cursorAPI.toString()}`, async () => {
            await db.command({ ping: 1 }, { readPreference: 'primary' }); // fill the connection pool with 1 connection.

            // client.once('commandStarted', () => controller.abort());
            const willBeResultBlocked = iterateUntilDocumentOrError(cursor, cursorAPI, args);

            for (const [, server] of client.topology.s.servers) {
              //@ts-expect-error: private property
              for (const connection of server.pool.connections) {
                //@ts-expect-error: private property
                const stub = sinon.stub(connection.socket, 'write').callsFake(function (...args) {
                  controller.abort();
                  sleep(1).then(() => {
                    stub.wrappedMethod.apply(this, args);
                    this.emit('drain');
                  });
                  return false;
                });
              }
            }

            const result = await willBeResultBlocked;

            expect(result).to.be.instanceOf(DOMException);
          });
        }

        for (const [cursorAPI, { value: args }] of getAllProps(cursorAPIs)) {
          test(cursorAPI, args);
        }
      });

      describe('and the signal is aborted during connection read', failPointMetadata, () => {
        function test(cursorAPI, args) {
          let controller: AbortController;
          let signal: AbortSignal;
          let cursor: AbstractCursor<{ a: number }>;

          beforeEach(async function () {
            await configureFailPoint(this.configuration, {
              configureFailPoint: 'failCommand',
              mode: { times: 1 },
              data: {
                appName: 'abortSignalClient',
                failCommands: [cursorName],
                blockConnection: true,
                blockTimeMS: 300
              }
            });

            controller = new AbortController();
            signal = controller.signal;
            cursor = method(filter, { signal });
          });

          afterEach(async function () {
            await clearFailPoint(this.configuration);
            await cursor?.close();
          });

          it(`rejects ${cursorAPI.toString()}`, async () => {
            await db.command({ ping: 1 }, { readPreference: 'primary' }); // fill the connection pool with 1 connection.

            client.on('commandStarted', e => e.commandName === cursorName && controller.abort());
            const willBeResultBlocked = iterateUntilDocumentOrError(cursor, cursorAPI, args);

            const result = await willBeResultBlocked;

            expect(result).to.be.instanceOf(DOMException);
          });
        }

        for (const [cursorAPI, { value: args }] of getAllProps(cursorAPIs)) {
          test(cursorAPI, args);
        }
      });

      const fleMetadata: MongoDBMetadataUI = {
        requires: {
          clientSideEncryption: true,
          mongodb: '>=7.0.0',
          topology: '!single'
        }
      };

      if (cursorName !== 'listCollections') {
        describe('setup fle', fleMetadata, () => {
          let autoEncryption: AutoEncryptionOptions;
          let client: MongoClient;
          let db;
          let collection;
          let method;
          let filter;

          before(async function () {
            if (
              !this.configuration.clientSideEncryption.enabled ||
              semver.lt(this.configuration.version, '7.0.0') ||
              this.configuration.topologyType === 'Single'
            ) {
              return this.skip();
            }

            autoEncryption = {
              keyVaultNamespace: 'admin.datakeys',
              kmsProviders: {
                local: { key: Buffer.alloc(96) }
              },
              tlsOptions: {
                kmip: {
                  tlsCAFile: process.env.KMIP_TLS_CA_FILE,
                  tlsCertificateKeyFile: process.env.KMIP_TLS_CERT_FILE
                }
              },
              encryptedFieldsMap: {
                'abortSignal.support': {
                  fields: [
                    {
                      path: 'ssn',
                      keyId: null,
                      bsonType: 'string'
                    }
                  ]
                }
              }
            };

            let utilClient = this.configuration.newClient({}, {});

            try {
              await utilClient
                .db('abortSignal')
                .collection('support')
                .drop({})
                .catch(() => null);

              const clientEncryption = new ClientEncryption(utilClient, {
                ...autoEncryption,
                encryptedFieldsMap: undefined
              });

              autoEncryption.encryptedFieldsMap['abortSignal.support'] = (
                await clientEncryption.createEncryptedCollection(
                  utilClient.db('abortSignal'),
                  'support',
                  {
                    provider: 'local',
                    createCollectionOptions: {
                      encryptedFields: autoEncryption.encryptedFieldsMap['abortSignal.support']
                    }
                  }
                )
              ).encryptedFields;
            } finally {
              await utilClient.close();
            }

            utilClient = this.configuration.newClient({}, { autoEncryption });
            try {
              await utilClient
                .db('abortSignal')
                .collection('support')
                .insertMany([
                  { a: 1, ssn: '0000-00-0001' },
                  { a: 2, ssn: '0000-00-0002' },
                  { a: 3, ssn: '0000-00-0003' }
                ]);
            } finally {
              await utilClient.close();
            }
          });

          beforeEach(async function () {
            client = this.configuration.newClient(
              {},
              {
                autoEncryption,
                monitorCommands: true,
                appName: 'abortSignalClient',
                __enableMongoLogger: true,
                __internalLoggerConfig: { MONGODB_LOG_SERVER_SELECTION: 'debug' },
                mongodbLogPath: { write: log => logs.push(log) },
                serverSelectionTimeoutMS: 10_000,
                maxPoolSize: 1
              }
            );
            await client.connect();
            db = client.db('abortSignal');
            collection = db.collection('support');

            method = collection[cursorName].bind(collection);
            filter = cursorName === 'aggregate' ? [] : {};
          });

          afterEach(async function () {
            await client?.close();
          });

          describe('and the signal is aborted during command encryption', fleMetadata, () => {
            function test(cursorAPI, args) {
              let controller: AbortController;
              let signal: AbortSignal;
              let cursor: AbstractCursor<{ a: number }>;

              beforeEach(async function () {
                controller = new AbortController();
                signal = controller.signal;
                cursor = method(filter, { signal });
              });

              afterEach(async function () {
                sinon.restore();
                await cursor?.close();
              });

              it(`rejects ${cursorAPI.toString()}`, fleMetadata, async () => {
                const willBeResultBlocked = iterateUntilDocumentOrError(cursor, cursorAPI, args);

                const stub = sinon
                  .stub(client.options.autoEncrypter, 'encrypt')
                  .callsFake(function (...args) {
                    controller.abort();
                    return stub.wrappedMethod.apply(this, args);
                  });

                const result = await willBeResultBlocked;

                expect(result).to.be.instanceOf(DOMException);
              });
            }

            for (const [cursorAPI, { value: args }] of getAllProps(cursorAPIs)) {
              test(cursorAPI, args);
            }
          });

          describe('and the signal is aborted during command decryption', fleMetadata, () => {
            function test(cursorAPI, args) {
              let controller: AbortController;
              let signal: AbortSignal;
              let cursor: AbstractCursor<{ a: number }>;

              beforeEach(async function () {
                controller = new AbortController();
                signal = controller.signal;
                cursor = method(filter, { signal });
              });

              afterEach(async function () {
                sinon.restore();
                await cursor?.close();
              });

              it(`rejects ${cursorAPI.toString()}`, fleMetadata, async () => {
                const willBeResultBlocked = iterateUntilDocumentOrError(cursor, cursorAPI, args);

                const stub = sinon
                  .stub(client.options.autoEncrypter, 'decrypt')
                  .callsFake(function (...args) {
                    controller.abort();
                    return stub.wrappedMethod.apply(this, args);
                  });

                const result = await willBeResultBlocked;

                expect(result).to.be.instanceOf(DOMException);
              });
            }

            for (const [cursorAPI, { value: args }] of getAllProps(cursorAPIs)) {
              test(cursorAPI, args);
            }
          });
        });
      }
    });
  }

  testCursor('find', FindCursor);
  testCursor('aggregate', AggregationCursor);
  testCursor('listCollections', ListCollectionsCursor);

  describe('cursor stream example', () => {
    beforeEach(async function () {
      const utilClient = this.configuration.newClient();
      try {
        const collection = utilClient.db('abortSignal').collection('support');
        await collection.drop({}).catch(() => null);
        await collection.insertMany([
          { a: 1, ssn: '0000-00-0001' },
          { a: 2, ssn: '0000-00-0002' },
          { a: 3, ssn: '0000-00-0003' }
        ]);
      } finally {
        await utilClient.close();
      }
    });

    it('follows expected stream error handling', async () => {
      const controller = new AbortController();
      const { signal } = controller;
      const cursor = collection.find({}, { signal, batchSize: 1 });
      const cursorStream = cursor.stream();

      const { promise, resolve, reject } = promiseWithResolvers<void>();

      cursorStream
        .on('data', () => controller.abort())
        .on('error', reject)
        .on('close', resolve);

      expect(await promise.catch(error => error)).to.be.instanceOf(DOMException);
    });
  });

  describe('KMS requests', function () {
    const stateMachine = new StateMachine({} as any);
    const request = {
      addResponse: _response => undefined,
      status: {
        type: 1,
        code: 1,
        message: 'notARealStatus'
      },
      bytesNeeded: 500,
      kmsProvider: 'notRealAgain',
      endpoint: 'fake',
      message: Buffer.from('foobar')
    };

    let controller: AbortController;
    let signal: AbortSignal;
    let cursor: AbstractCursor<{ a: number }>;

    beforeEach(async function () {
      controller = new AbortController();
      signal = controller.signal;
    });

    afterEach(async function () {
      sinon.restore();
      await cursor?.close();
    });

    describe('when StateMachine.kmsRequest() is passed an AbortSignal', function () {
      beforeEach(async function () {
        sinon.stub(TLSSocket.prototype, 'connect').callsFake(function (..._args) {
          return this;
        });
      });

      afterEach(async function () {
        sinon.restore();
      });

      it('the kms request rejects when signal is aborted', async function () {
        const err = stateMachine.kmsRequest(request, { signal }).catch(e => e);
        await sleep(1);
        controller.abort();
        expect(await err).to.be.instanceOf(DOMException);
      });
    });
  });

  describe('when a signal passed to countDocuments() is aborted', failPointMetadata, () => {
    let controller: AbortController;
    let signal: AbortSignal;

    beforeEach(async function () {
      await configureFailPoint(this.configuration, {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: {
          appName: 'abortSignalClient',
          failCommands: ['aggregate'],
          blockConnection: true,
          blockTimeMS: 300
        }
      });

      controller = new AbortController();
      signal = controller.signal;
    });

    afterEach(async function () {
      await clearFailPoint(this.configuration);
    });

    // We don't fully cover countDocuments because of the above tests for aggregate.
    // However, if countDocuments were ever to be implemented using a different command
    // This would catch the change:
    it(`rejects countDocuments`, async () => {
      client.on(
        'commandStarted',
        // Abort a bit after aggregate has started:
        ev => ev.commandName === 'aggregate' && sleep(10).then(() => controller.abort())
      );

      const result = await collection.countDocuments({}, { signal }).catch(error => error);

      expect(result).to.be.instanceOf(DOMException);
    });
  });

  describe('when a signal passed to findOne() is aborted', failPointMetadata, () => {
    let controller: AbortController;
    let signal: AbortSignal;

    beforeEach(async function () {
      await configureFailPoint(this.configuration, {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: {
          appName: 'abortSignalClient',
          failCommands: ['find'],
          blockConnection: true,
          blockTimeMS: 300
        }
      });

      controller = new AbortController();
      signal = controller.signal;
    });

    afterEach(async function () {
      await clearFailPoint(this.configuration);
    });

    it(`rejects findOne`, async () => {
      client.on(
        'commandStarted',
        // Abort a bit after find has started:
        ev => ev.commandName === 'find' && sleep(10).then(() => controller.abort())
      );

      const result = await collection.findOne({}, { signal }).catch(error => error);

      expect(result).to.be.instanceOf(DOMException);
    });
  });

  describe('when a signal passed to db.command() is aborted', failPointMetadata, () => {
    let controller: AbortController;
    let signal: AbortSignal;

    beforeEach(async function () {
      await configureFailPoint(this.configuration, {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: {
          appName: 'abortSignalClient',
          failCommands: ['ping'],
          blockConnection: true,
          blockTimeMS: 300
        }
      });

      controller = new AbortController();
      signal = controller.signal;
    });

    afterEach(async function () {
      await clearFailPoint(this.configuration);
    });

    it(`rejects command`, async () => {
      client.on(
        'commandStarted',
        // Abort a bit after ping has started:
        ev => ev.commandName === 'ping' && sleep(10).then(() => controller.abort())
      );

      const result = await db.command({ ping: 1 }, { signal }).catch(error => error);

      expect(result).to.be.instanceOf(DOMException);
    });
  });
});
