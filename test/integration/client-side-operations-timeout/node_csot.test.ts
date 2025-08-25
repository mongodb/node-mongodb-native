/* Anything javascript specific relating to timeouts */
import { on, once } from 'node:events';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout } from 'node:timers/promises';

import { expect } from 'chai';
import * as semver from 'semver';
import * as sinon from 'sinon';

import {
  BSON,
  type ChangeStream,
  type ChangeStreamDocument,
  type ClientSession,
  type Collection,
  type CommandFailedEvent,
  type CommandStartedEvent,
  type CommandSucceededEvent,
  Connection,
  CursorTimeoutMode,
  type Db,
  type FindCursor,
  GridFSBucket,
  LEGACY_HELLO_COMMAND,
  type MongoClient,
  MongoInvalidArgumentError,
  MongoOperationTimeoutError,
  MongoServerError,
  ObjectId,
  promiseWithResolvers,
  TopologyType
} from '../../mongodb';
import { type FailPoint, waitUntilPoolsFilled } from '../../tools/utils';

const metadata = { requires: { mongodb: '>=4.4' } };

describe('CSOT driver tests', metadata, () => {
  // NOTE: minPoolSize here is set to ensure that connections are available when testing timeout
  // behaviour. This reduces flakiness in our tests since operations will not spend time
  // establishing connections, more closely mirroring long-running application behaviour
  const minPoolSize = 20;

  describe('timeoutMS inheritance', () => {
    let client: MongoClient;
    let db: Db;
    let coll: Collection;

    beforeEach(async function () {
      client = this.configuration.newClient(undefined, { timeoutMS: 100, minPoolSize });
      db = client.db('test', { timeoutMS: 200 });
    });

    afterEach(async () => {
      await client?.close();
    });

    describe('when timeoutMS is provided on an operation', () => {
      beforeEach(() => {
        coll = db.collection('test', { timeoutMS: 300 });
      });

      describe('when in a session', () => {
        let cursor: FindCursor;
        let session: ClientSession;

        beforeEach(() => {
          session = client.startSession({ defaultTimeoutMS: 400 });
          cursor = coll.find({}, { session, timeoutMS: 500 });
        });

        afterEach(async () => {
          await cursor?.close();
          await session?.endSession();
        });

        it('throws an error', async () => {
          expect(cursor.cursorOptions).to.have.property('timeoutMS', 500);
        });
      });

      describe('when not in a session', () => {
        let cursor: FindCursor;

        beforeEach(() => {
          db = client.db('test', { timeoutMS: 200 });
          coll = db.collection('test', { timeoutMS: 300 });
          cursor = coll.find({}, { timeoutMS: 400 });
        });

        afterEach(async () => {
          await cursor?.close();
        });

        it('overrides the value provided on the db', async () => {
          expect(cursor.cursorOptions).to.have.property('timeoutMS', 400);
        });
      });
    });

    describe('when timeoutMS is provided on a collection', () => {
      beforeEach(() => {
        db = client.db('test', { timeoutMS: 200 });
        coll = db.collection('test', { timeoutMS: 300 });
      });

      it('overrides the value provided on the db', () => {
        expect(coll.s.options).to.have.property('timeoutMS', 300);
      });

      describe('when timeoutMS is provided on a db', () => {
        beforeEach(() => {
          db = client.db('test', { timeoutMS: 200 });
        });

        it('overrides the value provided on the client', () => {
          expect(db.s.options).to.have.property('timeoutMS', 200);
        });
      });
    });
  });

  describe('autoconnect', () => {
    let client: MongoClient;

    afterEach(async function () {
      await client?.close();
      client = undefined;
    });

    describe('when failing autoconnect with timeoutMS defined', () => {
      let configClient: MongoClient;

      beforeEach(async function () {
        configClient = this.configuration.newClient();
        const result = await configClient
          .db()
          .admin()
          .command({
            configureFailPoint: 'failCommand',
            mode: 'alwaysOn',
            data: {
              failCommands: ['ping', 'hello', LEGACY_HELLO_COMMAND],
              blockConnection: true,
              blockTimeMS: 10
            }
          });
        expect(result).to.have.property('ok', 1);
      });

      afterEach(async function () {
        const result = await configClient
          .db()
          .admin()
          .command({
            configureFailPoint: 'failCommand',
            mode: 'off',
            data: {
              failCommands: ['ping', 'hello', LEGACY_HELLO_COMMAND],
              blockConnection: true,
              blockTimeMS: 10
            }
          });
        expect(result).to.have.property('ok', 1);
        await configClient.close();
      });

      it('throws a MongoOperationTimeoutError', {
        metadata: { requires: { mongodb: '>=4.4', topology: '!load-balanced' } },
        test: async function () {
          const commandsStarted = [];
          client = this.configuration.newClient(undefined, {
            timeoutMS: 1,
            monitorCommands: true
          });

          client.on('commandStarted', ev => commandsStarted.push(ev));

          const maybeError = await client
            .db('test')
            .collection('test')
            .insertOne({ a: 19 })
            .then(
              () => null,
              e => e
            );

          expect(maybeError).to.exist;
          expect(maybeError).to.be.instanceof(MongoOperationTimeoutError);

          expect(commandsStarted).to.have.length(0); // Ensure that we fail before we start the insertOne
        }
      });
    });
  });

  describe('server-side maxTimeMS errors are transformed', () => {
    let client: MongoClient;
    let commandsSucceeded: CommandSucceededEvent[];
    let commandsFailed: CommandFailedEvent[];

    beforeEach(async function () {
      client = this.configuration.newClient({ timeoutMS: 500_000, monitorCommands: true });
      commandsSucceeded = [];
      commandsFailed = [];
      client.on('commandSucceeded', event => {
        if (event.commandName === 'configureFailPoint') return;
        commandsSucceeded.push(event);
      });
      client.on('commandFailed', event => commandsFailed.push(event));
    });

    afterEach(async function () {
      await client
        .db()
        .collection('a')
        .drop()
        .catch(() => null);
      await client.close();
      commandsSucceeded = undefined;
      commandsFailed = undefined;
    });

    describe('when a maxTimeExpired error is returned at the top-level', () => {
      // {ok: 0, code: 50, codeName: "MaxTimeMSExpired", errmsg: "operation time limit exceeded"}
      const failpoint: FailPoint = {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: {
          failCommands: ['ping'],
          errorCode: 50
        }
      };

      beforeEach(async function () {
        if (semver.satisfies(this.configuration.version, '>=4.4'))
          await client.db('admin').command(failpoint);
        else {
          this.skipReason = 'Requires server version later than 4.4';
          this.skip();
        }
      });

      afterEach(async function () {
        if (semver.satisfies(this.configuration.version, '>=4.4'))
          await client.db('admin').command({ ...failpoint, mode: 'off' });
      });

      it(
        'throws a MongoOperationTimeoutError error and emits command failed',
        metadata,
        async () => {
          const error = await client
            .db()
            .command({ ping: 1 })
            .catch(error => error);
          expect(error).to.be.instanceOf(MongoOperationTimeoutError);
          expect(error.cause).to.be.instanceOf(MongoServerError);
          expect(error.cause).to.have.property('code', 50);

          expect(commandsFailed).to.have.lengthOf(1);
          expect(commandsFailed).to.have.nested.property('[0].failure.cause.code', 50);
        }
      );
    });

    describe('when a maxTimeExpired error is returned inside a writeErrors array', () => {
      // The server should always return one maxTimeExpiredError at the front of the writeErrors array
      // But for the sake of defensive programming we will find any maxTime error in the array.

      beforeEach(async () => {
        const writeErrorsReply = BSON.serialize({
          ok: 1,
          writeErrors: [
            { code: 2, codeName: 'MaxTimeMSExpired', errmsg: 'operation time limit exceeded' },
            { code: 3, codeName: 'MaxTimeMSExpired', errmsg: 'operation time limit exceeded' },
            { code: 4, codeName: 'MaxTimeMSExpired', errmsg: 'operation time limit exceeded' },
            { code: 50, codeName: 'MaxTimeMSExpired', errmsg: 'operation time limit exceeded' }
          ]
        });
        const commandSpy = sinon.spy(Connection.prototype, 'command');
        const readManyStub = sinon
          // @ts-expect-error: readMany is private
          .stub(Connection.prototype, 'readMany')
          .callsFake(async function* (...args) {
            const realIterator = readManyStub.wrappedMethod.call(this, ...args);
            try {
              const cmd = commandSpy.lastCall.args.at(1);
              if ('giveMeWriteErrors' in cmd) {
                await realIterator.next().catch(() => null); // dismiss response
                yield { parse: () => writeErrorsReply };
              } else {
                yield (await realIterator.next()).value;
              }
            } finally {
              realIterator.return();
            }
          });
      });

      afterEach(() => sinon.restore());

      it(
        'throws a MongoOperationTimeoutError error and emits command succeeded',
        metadata,
        async () => {
          const error = await client
            .db('admin')
            .command({ giveMeWriteErrors: 1 })
            .catch(error => error);
          expect(error).to.be.instanceOf(MongoOperationTimeoutError);
          expect(error.cause).to.be.instanceOf(MongoServerError);
          expect(error.cause).to.have.nested.property('writeErrors[3].code', 50);

          expect(commandsSucceeded).to.have.lengthOf(1);
          expect(commandsSucceeded).to.have.nested.property('[0].reply.writeErrors[3].code', 50);
        }
      );
    });

    describe('when a maxTimeExpired error is returned inside a writeConcernError embedded document', () => {
      // {ok: 1, writeConcernError: {code: 50, codeName: "MaxTimeMSExpired"}}
      const failpoint: FailPoint = {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: {
          failCommands: ['insert'],
          writeConcernError: { code: 50, errmsg: 'times up buster', errorLabels: [] }
        }
      };

      beforeEach(async function () {
        if (semver.satisfies(this.configuration.version, '>=4.4'))
          await client.db('admin').command(failpoint);
        else {
          this.skipReason = 'Requires server version later than 4.4';
          this.skip();
        }
      });

      afterEach(async function () {
        if (semver.satisfies(this.configuration.version, '>=4.4'))
          await client.db('admin').command({ ...failpoint, mode: 'off' });
      });

      it(
        'throws a MongoOperationTimeoutError error and emits command succeeded',
        metadata,
        async () => {
          const error = await client
            .db()
            .collection('a')
            .insertOne({})
            .catch(error => error);
          expect(error).to.be.instanceOf(MongoOperationTimeoutError);
          expect(error.cause).to.be.instanceOf(MongoServerError);
          expect(error.cause).to.have.nested.property('writeConcernError.code', 50);

          expect(commandsSucceeded).to.have.lengthOf(1);
          expect(commandsSucceeded).to.have.nested.property('[0].reply.writeConcernError.code', 50);
        }
      );
    });
  });

  describe('Non-Tailable cursors', () => {
    let client: MongoClient;
    let internalClient: MongoClient;
    let commandStarted: (CommandStartedEvent & { command: { maxTimeMS?: number } })[];
    let commandSucceeded: CommandSucceededEvent[];
    const failpoint: FailPoint = {
      configureFailPoint: 'failCommand',
      mode: 'alwaysOn',
      data: {
        failCommands: ['find', 'getMore'],
        blockConnection: true,
        blockTimeMS: 150
      }
    };

    beforeEach(async function () {
      internalClient = this.configuration.newClient({});
      await internalClient
        .db('db')
        .dropCollection('coll')
        .catch(() => null);
      await internalClient
        .db('db')
        .collection('coll')
        .insertMany(
          Array.from({ length: 3 }, () => {
            return { x: 1 };
          })
        );

      await internalClient.db().admin().command(failpoint);

      client = this.configuration.newClient(undefined, { monitorCommands: true, minPoolSize: 10 });

      // wait for a handful of connections to have been established
      await waitUntilPoolsFilled(client, AbortSignal.timeout(30_000), 5);

      commandStarted = [];
      commandSucceeded = [];
      client.on('commandStarted', ev => commandStarted.push(ev));
      client.on('commandSucceeded', ev => commandSucceeded.push(ev));
    });

    afterEach(async function () {
      await internalClient
        .db()
        .admin()
        .command({ ...failpoint, mode: 'off' });
      await internalClient.close();
      await client.close();
    });

    context('ITERATION mode', () => {
      context('when executing an operation', () => {
        it(
          'must apply the configured timeoutMS to the initial operation execution',
          metadata,
          async function () {
            const cursor = client
              .db('db')
              .collection('coll')
              .find({}, { batchSize: 3, timeoutMode: CursorTimeoutMode.ITERATION, timeoutMS: 10 })
              .limit(3);

            const maybeError = await cursor.next().then(
              () => null,
              e => e
            );

            expect(maybeError).to.be.instanceOf(MongoOperationTimeoutError);
          }
        );

        it('refreshes the timeout for any getMores', metadata, async function () {
          const cursor = client
            .db('db')
            .collection('coll')
            .find({}, { batchSize: 1, timeoutMode: 'iteration', timeoutMS: 200 })
            .project({ _id: 0 });

          // Iterating over 3 documents in the collection, each artificially taking ~50 ms due to failpoint. If timeoutMS is not refreshed, then we'd expect to error
          for await (const doc of cursor) {
            expect(doc).to.deep.equal({ x: 1 });
          }

          const finds = commandSucceeded.filter(ev => ev.commandName === 'find');
          const getMores = commandSucceeded.filter(ev => ev.commandName === 'getMore');

          expect(finds).to.have.length(1); // Expecting 1 find
          expect(getMores).to.have.length(3); // Expecting 3 getMores (including final empty getMore)
        });

        it(
          'does not append a maxTimeMS to the original command or getMores',
          metadata,
          async function () {
            const cursor = client
              .db('db')
              .collection('coll')
              .find({}, { batchSize: 1, timeoutMode: 'iteration', timeoutMS: 200 })
              .project({ _id: 0 });
            await cursor.toArray();

            const commands = commandStarted.filter(c =>
              ['find', 'getMore'].includes(c.commandName)
            );
            expect(commands).to.have.lengthOf(4); // Find and 2 getMores

            const [
              { command: aggregate },
              { command: getMore1 },
              { command: getMore2 },
              { command: getMore3 }
            ] = commands;
            expect(aggregate).not.to.have.property('maxTimeMS');
            expect(getMore1).not.to.have.property('maxTimeMS');
            expect(getMore2).not.to.have.property('maxTimeMS');
            expect(getMore3).not.to.have.property('maxTimeMS');
          }
        );
      });
    });

    context('LIFETIME mode', () => {
      let client: MongoClient;
      let internalClient: MongoClient;
      let commandStarted: CommandStartedEvent[];
      let commandSucceeded: CommandSucceededEvent[];
      const failpoint: FailPoint = {
        configureFailPoint: 'failCommand',
        mode: 'alwaysOn',
        data: {
          failCommands: ['find', 'getMore'],
          blockConnection: true,
          blockTimeMS: 50
        }
      };

      beforeEach(async function () {
        internalClient = this.configuration.newClient();
        await internalClient
          .db('db')
          .dropCollection('coll')
          .catch(() => null);
        await internalClient
          .db('db')
          .collection('coll')
          .insertMany(
            Array.from({ length: 3 }, () => {
              return { x: 1 };
            })
          );

        await internalClient.db().admin().command(failpoint);

        client = this.configuration.newClient(undefined, {
          monitorCommands: true,
          minPoolSize: 10
        });
        // wait for a handful of connections to have been established
        await waitUntilPoolsFilled(client, AbortSignal.timeout(30_000), 5);

        commandStarted = [];
        commandSucceeded = [];
        client.on('commandStarted', ev => commandStarted.push(ev));
        client.on('commandSucceeded', ev => commandSucceeded.push(ev));
      });

      afterEach(async function () {
        await internalClient
          .db()
          .admin()
          .command({ ...failpoint, mode: 'off' });
        await internalClient.close();
        await client.close();
      });
      context('when executing a next call', () => {
        context(
          'when there are documents available from previously retrieved batch and timeout has expired',
          () => {
            it('returns documents without error', metadata, async function () {
              const cursor = client
                .db('db')
                .collection('coll')
                .find({}, { timeoutMode: 'cursorLifetime', timeoutMS: 100 })
                .project({ _id: 0 });
              const doc = await cursor.next();
              expect(doc).to.deep.equal({ x: 1 });
              expect(cursor.documents.length).to.be.gt(0);

              await setTimeout(100);

              const docOrErr = await cursor.next().then(
                d => d,
                e => e
              );

              expect(docOrErr).to.not.be.instanceOf(MongoOperationTimeoutError);
              expect(docOrErr).to.be.deep.equal({ x: 1 });
            });
          }
        );
        context('when a getMore is required and the timeout has expired', () => {
          it('throws a MongoOperationTimeoutError', metadata, async function () {
            const cursor = client
              .db('db')
              .collection('coll')
              .find({}, { batchSize: 1, timeoutMode: 'cursorLifetime', timeoutMS: 100 })

              .project({ _id: 0 });

            const doc = await cursor.next();
            expect(doc).to.deep.equal({ x: 1 });
            expect(cursor.documents.length).to.equal(0);

            await setTimeout(100);

            const docOrErr = await cursor.next().then(
              d => d,
              e => e
            );

            expect(docOrErr).to.be.instanceOf(MongoOperationTimeoutError);
          });
        });

        it('does not apply maxTimeMS to a getMore', metadata, async function () {
          const cursor = client
            .db('db')
            .collection('coll')
            .find({}, { batchSize: 1, timeoutMode: 'cursorLifetime', timeoutMS: 1000 })
            .project({ _id: 0 });

          for await (const _doc of cursor) {
            // Ignore _doc
          }

          const getMores = commandStarted
            .filter(ev => ev.command.getMore != null)
            .map(ev => ev.command);
          expect(getMores.length).to.be.gt(0);

          for (const getMore of getMores) {
            expect(getMore.maxTimeMS).to.not.exist;
          }
        });
      });
    });
  });

  describe('Tailable cursors', function () {
    let client: MongoClient;
    let internalClient: MongoClient;
    let commandStarted: CommandStartedEvent[];
    const metadata: MongoDBMetadataUI = {
      requires: { mongodb: '>=4.4' }
    };

    const failpoint: FailPoint = {
      configureFailPoint: 'failCommand',
      mode: 'alwaysOn',
      data: {
        failCommands: ['aggregate', 'find', 'getMore'],
        blockConnection: true,
        blockTimeMS: 100
      }
    };

    beforeEach(async function () {
      internalClient = this.configuration.newClient();
      await internalClient
        .db('db')
        .dropCollection('coll')
        .catch(() => null);

      await internalClient.db('db').createCollection('coll', { capped: true, size: 1_000_000 });

      await internalClient
        .db('db')
        .collection('coll')
        .insertMany(
          Array.from({ length: 100 }, () => {
            return { x: 1 };
          })
        );

      await internalClient.db().admin().command(failpoint);

      client = this.configuration.newClient(undefined, { monitorCommands: true, minPoolSize });
      commandStarted = [];
      client.on('commandStarted', ev => commandStarted.push(ev));
      await waitUntilPoolsFilled(client, AbortSignal.timeout(30_000), minPoolSize);
    });

    afterEach(async function () {
      await internalClient
        .db()
        .admin()
        .command({ ...failpoint, mode: 'off' });
      await internalClient.close();
      await client.close();
    });

    context('when in ITERATION mode', function () {
      context('awaitData cursors', function () {
        let cursor: FindCursor;
        afterEach(async function () {
          if (cursor) await cursor.close();
        });

        it('applies timeoutMS to initial command', metadata, async function () {
          cursor = client
            .db('db')
            .collection('coll')
            .find({}, { timeoutMS: 50, tailable: true, awaitData: true, batchSize: 1 });
          const maybeError = await cursor.next().then(
            () => null,
            e => e
          );
          expect(maybeError).to.be.instanceOf(MongoOperationTimeoutError);

          const finds = commandStarted.filter(x => x.commandName === 'find');
          const getMores = commandStarted.filter(x => x.commandName === 'getMore');
          expect(finds).to.have.lengthOf(1);
          expect(getMores).to.have.lengthOf(0);
        });

        it('refreshes the timeout for subsequent getMores', metadata, async function () {
          cursor = client
            .db('db')
            .collection('coll')
            .find({}, { timeoutMS: 150, tailable: true, awaitData: true, batchSize: 1 });
          // Iterate cursor 5 times (server would have blocked for 500ms overall, but client
          // should not throw
          await cursor.next();
          await cursor.next();
          await cursor.next();
          await cursor.next();
          await cursor.next();
        });

        it('does not use timeoutMS to compute maxTimeMS for getMores', metadata, async function () {
          cursor = client
            .db('db')
            .collection('coll')
            .find({}, { timeoutMS: 10_000, tailable: true, awaitData: true, batchSize: 1 });
          await cursor.next();
          await cursor.next();

          const getMores = commandStarted
            .filter(x => x.command.getMore != null)
            .map(x => x.command);
          expect(getMores).to.have.lengthOf(1);

          const [getMore] = getMores;
          expect(getMore).to.not.haveOwnProperty('maxTimeMS');
        });

        context('when maxAwaitTimeMS is specified', function () {
          it(
            'sets maxTimeMS to the configured maxAwaitTimeMS value on getMores',
            metadata,
            async function () {
              cursor = client.db('db').collection('coll').find(
                {},
                {
                  timeoutMS: 10_000,
                  tailable: true,
                  awaitData: true,
                  batchSize: 1,
                  maxAwaitTimeMS: 100
                }
              );
              await cursor.next();
              await cursor.next();

              const getMores = commandStarted
                .filter(x => x.command.getMore != null)
                .map(x => x.command);
              expect(getMores).to.have.lengthOf(1);

              const [getMore] = getMores;
              expect(getMore).to.haveOwnProperty('maxTimeMS');
              expect(getMore.maxTimeMS).to.equal(100);
            }
          );
        });
      });

      context('non-awaitData cursors', function () {
        let cursor: FindCursor;

        afterEach(async function () {
          if (cursor) await cursor.close();
        });

        it('applies timeoutMS to initial command', metadata, async function () {
          cursor = client
            .db('db')
            .collection('coll')
            .find({}, { timeoutMS: 50, tailable: true, batchSize: 1 });
          const maybeError = await cursor.next().then(
            () => null,
            e => e
          );
          expect(maybeError).to.be.instanceOf(MongoOperationTimeoutError);

          const finds = commandStarted.filter(x => x.commandName === 'find');
          const getMores = commandStarted.filter(x => x.commandName === 'getMore');
          expect(finds).to.have.lengthOf(1);
          expect(getMores).to.have.lengthOf(0);
        });

        it('refreshes the timeout for subsequent getMores', metadata, async function () {
          cursor = client
            .db('db')
            .collection('coll')
            .find({}, { timeoutMS: 150, tailable: true, batchSize: 1 });
          for (let i = 0; i < 5; i++) {
            // Iterate cursor 5 times (server would have blocked for 500ms overall, but client
            // should not throw
            await cursor.next();
          }
        });

        it('does not append a maxTimeMS field to original command', metadata, async function () {
          cursor = client
            .db('db')
            .collection('coll')
            .find({}, { timeoutMS: 2000, tailable: true, batchSize: 1 });

          await cursor.next();

          const finds = commandStarted.filter(x => x.command.find != null);
          expect(finds).to.have.lengthOf(1);
          expect(finds[0].command.find).to.exist;
          expect(finds[0].command.maxTimeMS).to.not.exist;
        });
        it('does not append a maxTimeMS field to subsequent getMores', metadata, async function () {
          cursor = client
            .db('db')
            .collection('coll')
            .find({}, { timeoutMS: 2000, tailable: true, batchSize: 1 });

          await cursor.next();
          await cursor.next();

          const getMores = commandStarted.filter(x => x.command.getMore != null);

          expect(getMores).to.have.lengthOf(1);
          expect(getMores[0].command.getMore).to.exist;
          expect(getMores[0].command.getMore.maxTimeMS).to.not.exist;
        });
      });
    });
  });

  describe('Change Streams', function () {
    const metadata: MongoDBMetadataUI = { requires: { mongodb: '>=4.4', topology: '!single' } };
    let internalClient: MongoClient;
    let client: MongoClient;
    let commandsStarted: CommandStartedEvent[];

    beforeEach(async function () {
      this.configuration.url({ useMultipleMongoses: false });
      internalClient = this.configuration.newClient();
      await internalClient
        .db('db')
        .dropCollection('coll')
        .catch(() => null);
      commandsStarted = [];

      client = await this.configuration.newClient(undefined, { monitorCommands: true }).connect();
      client.on('commandStarted', ev => {
        commandsStarted.push(ev);
      });
    });

    afterEach(async function () {
      await internalClient
        .db()
        .admin()
        ?.command({ configureFailPoint: 'failCommand', mode: 'off' });
      await internalClient?.close();
      await client?.close();
    });

    context('when in stream mode', function () {
      let data: any[];
      let cs: ChangeStream;
      let errorIter: AsyncIterableIterator<any[]>;

      afterEach(async function () {
        await cs?.close();
      });

      context('when the initial aggregate times out', function () {
        beforeEach(async function () {
          data = [];
          const failpoint: FailPoint = {
            configureFailPoint: 'failCommand',
            mode: { times: 1 }, // fail twice to account for executeOperation's retry attempt
            data: {
              failCommands: ['aggregate'],
              blockConnection: true,
              blockTimeMS: 130
            }
          };

          await internalClient.db().admin().command(failpoint);
          cs = client.db('db').collection('coll').watch([], { timeoutMS: 120 });
          errorIter = on(cs, 'error');
          cs.on('change', () => {
            // Add empty listener just to get the change stream running
          });
        });

        it('emits an error event', metadata, async function () {
          const err = (await errorIter.next()).value[0];

          expect(data).to.have.lengthOf(0);
          expect(err).to.be.instanceof(MongoOperationTimeoutError);
        });

        it('closes the change stream', metadata, async function () {
          const err = (await errorIter.next()).value[0];
          expect(err).to.be.instanceof(MongoOperationTimeoutError);
          expect(cs.closed).to.be.true;
        });
      });

      context('when the getMore times out', function () {
        let onSharded: boolean;
        beforeEach(async function () {
          onSharded =
            this.configuration.topologyType === TopologyType.LoadBalanced ||
            this.configuration.topologyType === TopologyType.Sharded;
          data = [];
          const failpoint: FailPoint = {
            configureFailPoint: 'failCommand',
            mode: { times: 1 },
            data: {
              failCommands: ['getMore'],
              blockConnection: true,
              blockTimeMS: onSharded ? 5100 : 120
            }
          };

          await internalClient.db().admin().command(failpoint);
          cs = client
            .db('db')
            .collection('coll')
            .watch([], { timeoutMS: onSharded ? 5000 : 100 });
          errorIter = on(cs, 'error');
          cs.on('change', () => {
            // Add empty listener just to get the change stream running
          });
        });

        it('emits an error event', metadata, async function () {
          const [err] = (await errorIter.next()).value;
          expect(data).to.have.lengthOf(0);
          expect(err).to.be.instanceof(MongoOperationTimeoutError);
        });

        it(
          'continues emitting change events',
          {
            requires: {
              mongodb: '>=8.0', // NOTE: we are only testing on >= 8.0 because this version has increased performance and this test is sensitive to server performance. This feature should continue to work on server versions down to 4.4, but would require a larger value of timeoutMS which would either significantly slow down our CI testing or make the test flaky
              topology: '!single',
              os: 'linux'
            }
          },
          async function () {
            // NOTE: duplicating setup code here so its particular configuration requirements don't
            // affect other tests.
            const failpoint: FailPoint = {
              configureFailPoint: 'failCommand',
              mode: { times: 1 },
              data: {
                failCommands: ['getMore'],
                blockConnection: true,
                blockTimeMS: onSharded ? 5100 : 520
              }
            };

            await internalClient.db().admin().command(failpoint);
            const cs = client
              .db('db')
              .collection('coll')
              .watch([], { timeoutMS: onSharded ? 5000 : 500 });
            const errorIter = on(cs, 'error');
            cs.on('change', () => {
              // Add empty listener just to get the change stream running
            });

            const err = (await errorIter.next()).value[0];
            expect(err).to.be.instanceof(MongoOperationTimeoutError);

            await once(cs.cursor, 'resumeTokenChanged');

            const {
              promise: changePromise,
              resolve,
              reject
            } = promiseWithResolvers<ChangeStreamDocument<BSON.Document>>();

            cs.once('change', resolve);

            cs.once('error', reject);

            await internalClient.db('db').collection('coll').insertOne({ x: 1 });
            const change = await changePromise;
            expect(change).to.have.ownProperty('operationType', 'insert');
          }
        );

        it('does not close the change stream', metadata, async function () {
          const [err] = (await errorIter.next()).value;
          expect(err).to.be.instanceof(MongoOperationTimeoutError);

          expect(cs.closed).to.be.false;
        });

        it('attempts to create a new change stream cursor', metadata, async function () {
          await errorIter.next();
          let aggregates = commandsStarted
            .filter(x => x.commandName === 'aggregate')
            .map(x => x.command);
          expect(aggregates).to.have.lengthOf(1);

          await once(cs, 'resumeTokenChanged');

          aggregates = commandsStarted
            .filter(x => x.commandName === 'aggregate')
            .map(x => x.command);

          expect(aggregates).to.have.lengthOf(2);

          expect(aggregates[0].pipeline).to.deep.equal([{ $changeStream: {} }]);
          expect(aggregates[1].pipeline).to.deep.equal([
            { $changeStream: { resumeAfter: cs.resumeToken } }
          ]);
        });
      });

      context('when the resume attempt times out', function () {
        const failpoint: FailPoint = {
          configureFailPoint: 'failCommand',
          mode: { times: 2 }, // timeout the getMore, and the aggregate
          data: {
            failCommands: ['getMore', 'aggregate'],
            blockConnection: true,
            blockTimeMS: 130
          }
        };

        beforeEach(async function () {
          cs = client.db('db').collection('coll').watch([], { timeoutMS: 120 });
          cs.once('change', () => null);

          await once(cs.cursor, 'init');

          await internalClient.db().admin().command(failpoint);
        });

        it('emits an error event', metadata, async function () {
          let [err] = await once(cs, 'error'); // getMore failure
          expect(err).to.be.instanceof(MongoOperationTimeoutError);
          [err] = await once(cs, 'error'); // aggregate failure
          expect(err).to.be.instanceof(MongoOperationTimeoutError);
        });

        it('closes the change stream', metadata, async function () {
          await once(cs, 'error'); // await the getMore Failure
          await once(cs, 'error'); // await the aggregate failure
          expect(cs.closed).to.be.true;
        });
      });
    });
  });

  describe('GridFSBucket', () => {
    const blockTimeMS = 200;
    let internalClient: MongoClient;
    let client: MongoClient;
    let bucket: GridFSBucket;

    beforeEach(async function () {
      client = this.configuration.newClient(undefined, { timeoutMS: 1000 });
      internalClient = this.configuration.newClient(undefined);
    });

    afterEach(async function () {
      await client.close();
      await internalClient.db().admin().command({ configureFailPoint: 'failCommand', mode: 'off' });
      await internalClient.close();
    });

    context('upload', function () {
      const failpoint: FailPoint = {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: {
          failCommands: ['insert'],
          blockConnection: true,
          blockTimeMS
        }
      };

      beforeEach(async function () {
        await internalClient
          .db('db')
          .dropDatabase()
          .catch(() => null);
        await internalClient.db().admin().command(failpoint);

        const db = client.db('db');
        expect(db.timeoutMS).to.equal(1000);

        bucket = new GridFSBucket(client.db('db'), { chunkSizeBytes: 2 });
      });

      describe('openUploadStream', function () {
        it('can override db timeoutMS settings', metadata, async function () {
          const data = Buffer.from('01020304', 'hex');
          const uploadStream = bucket.openUploadStream('filename', { timeoutMS: 175 });
          uploadStream.on('error', error => {
            uploadStream.destroy(error);
          });

          uploadStream.write(data, error => {
            uploadStream.destroy(error);
          });

          const maybeError = await once(uploadStream, 'error');
          expect(maybeError[0]).to.be.instanceOf(MongoOperationTimeoutError);
        });

        it('only emits index event once per bucket', metadata, async function () {
          let numEventsSeen = 0;
          bucket.on('index', () => numEventsSeen++);

          const uploadStream0 = bucket
            .openUploadStream('filename')
            .on('error', error => uploadStream0.destroy(error));
          const uploadStream1 = bucket
            .openUploadStream('filename')
            .on('error', error => uploadStream1.destroy(error));

          const data = Buffer.from('test', 'utf-8');
          await pipeline(Readable.from(data), uploadStream0);
          await pipeline(Readable.from(data), uploadStream1);

          expect(numEventsSeen).to.equal(1);
        });
      });

      describe('openUploadStreamWithId', function () {
        it('can override db timeoutMS settings', metadata, async function () {
          const data = Buffer.from('01020304', 'hex');
          const uploadStream = bucket.openUploadStreamWithId(new ObjectId(), 'filename', {
            timeoutMS: 175
          });
          uploadStream.on('error', error => {
            uploadStream.destroy(error);
          });

          uploadStream.write(data, error => {
            uploadStream.destroy(error);
          });

          const maybeError = await once(uploadStream, 'error');
          expect(maybeError[0]).to.be.instanceOf(MongoOperationTimeoutError);
        });
      });
    });

    context('download', function () {
      const failpoint: FailPoint = {
        configureFailPoint: 'failCommand',
        mode: { times: 1 },
        data: {
          failCommands: ['find'],
          blockConnection: true,
          blockTimeMS
        }
      };
      const _id = new ObjectId('000000000000000000000005');

      beforeEach(async function () {
        await internalClient
          .db('db')
          .dropDatabase()
          .catch(() => null);

        const files = await internalClient.db('db').createCollection('files');
        await files.insertOne({
          _id,
          length: 10,
          chunkSize: 4,
          uploadDate: new Date('1970-01-01T00:00:00.000Z'),
          md5: '57d83cd477bfb1ccd975ab33d827a92b',
          filename: 'length-10',
          contentType: 'application/octet-stream',
          aliases: [],
          metadata: {}
        });

        await internalClient.db().admin().command(failpoint);

        const db = client.db('db');
        expect(db.timeoutMS).to.equal(1000);

        bucket = new GridFSBucket(db);
      });

      describe('openDownloadStream', function () {
        it('can override db timeoutMS settings', metadata, async function () {
          const downloadStream = bucket.openDownloadStream(_id, { timeoutMS: 80 });
          const maybeError = await downloadStream.toArray().then(
            () => null,
            e => e
          );

          expect(maybeError).to.be.instanceOf(MongoOperationTimeoutError);
        });
      });

      describe('openDownloadStreamByName', function () {
        it('can override db timeoutMS settings', metadata, async function () {
          const downloadStream = bucket.openDownloadStreamByName('length-10', { timeoutMS: 80 });
          const maybeError = await downloadStream.toArray().then(
            () => null,
            e => e
          );
          expect(maybeError).to.be.instanceOf(MongoOperationTimeoutError);
        });
      });
    });
  });

  describe('when using an explicit session', () => {
    const metadata: MongoDBMetadataUI = {
      requires: { topology: ['replicaset'], mongodb: '>=4.4' }
    };

    describe('created for a withTransaction callback', () => {
      describe('passing a timeoutMS and a session with a timeoutContext', () => {
        let client: MongoClient;

        beforeEach(async function () {
          client = this.configuration.newClient({ timeoutMS: 123 });
        });

        afterEach(async function () {
          await client.close();
        });

        it('throws a validation error from the operation', metadata, async () => {
          // Drivers MUST raise a validation error if an explicit session with a timeout is used and
          // the timeoutMS option is set at the operation level for operations executed as part of a withTransaction callback.

          const coll = client.db('db').collection('coll');

          const session = client.startSession();

          let insertError: Error | null = null;
          const withTransactionError = await session
            .withTransaction(async session => {
              insertError = await coll
                .insertOne({ x: 1 }, { session, timeoutMS: 1234 })
                .catch(error => error);
              throw insertError;
            })
            .catch(error => error);

          expect(insertError).to.be.instanceOf(MongoInvalidArgumentError);
          expect(withTransactionError).to.be.instanceOf(MongoInvalidArgumentError);
        });
      });
    });

    describe('created manually', () => {
      describe('passing a timeoutMS and a session with an inherited timeoutMS', () => {
        let client: MongoClient;

        beforeEach(async function () {
          client = this.configuration.newClient({ timeoutMS: 123 });
          await client
            .db('db')
            .dropCollection('coll')
            .catch(() => null);
        });

        afterEach(async function () {
          await client.close();
        });

        it('does not throw a validation error', metadata, async () => {
          const coll = client.db('db').collection('coll');
          const session = client.startSession();
          session.startTransaction();
          await coll.insertOne({ x: 1 }, { session, timeoutMS: 1234 });
          await session.abortTransaction(); // this uses the inherited timeoutMS, not the insert
        });
      });
    });
  });

  describe('Convenient Transactions', () => {
    /** Tests in this section MUST only run against replica sets and sharded clusters with server versions 4.4 or higher. */
    const metadata: MongoDBMetadataUI = {
      requires: { topology: ['replicaset', 'sharded'], mongodb: '>=5.0' }
    };

    describe('when an operation fails inside withTransaction callback', () => {
      const failpoint: FailPoint = {
        configureFailPoint: 'failCommand',
        mode: { times: 2 },
        data: {
          failCommands: ['insert', 'abortTransaction'],
          blockConnection: true,
          blockTimeMS: 600
        }
      };

      beforeEach(async function () {
        if (!semver.satisfies(this.configuration.version, '>=4.4')) {
          this.skipReason = 'Requires server version 4.4+';
          this.skip();
        }
        const internalClient = this.configuration.newClient();
        await internalClient
          .db('db')
          .collection('coll')
          .drop()
          .catch(() => null);
        await internalClient.db('admin').command(failpoint);
        await internalClient.close();
      });

      let client: MongoClient;

      afterEach(async function () {
        if (semver.satisfies(this.configuration.version, '>=4.4')) {
          const internalClient = this.configuration.newClient();
          await internalClient
            .db('admin')
            .command({ configureFailPoint: 'failCommand', mode: 'off' });
          await internalClient.close();
        }
        await client?.close();
      });

      it(
        'timeoutMS is refreshed for abortTransaction and the timeout error is thrown from the operation',
        metadata,
        async function () {
          const commandsFailed = [];
          const commandsStarted = [];

          client = this.configuration
            .newClient({ timeoutMS: 500, monitorCommands: true })
            .on('commandStarted', e => commandsStarted.push(e.commandName))
            .on('commandFailed', e => commandsFailed.push(e.commandName));

          const coll = client.db('db').collection('coll');

          const session = client.startSession();

          let insertError: Error | null = null;
          const withTransactionError = await session
            .withTransaction(async session => {
              insertError = await coll.insertOne({ x: 1 }, { session }).catch(error => error);
              throw insertError;
            })
            .catch(error => error);

          try {
            expect(insertError).to.be.instanceOf(MongoOperationTimeoutError);
            expect(withTransactionError).to.be.instanceOf(MongoOperationTimeoutError);
            expect(commandsStarted, 'commands started').to.deep.equal([
              'insert',
              'abortTransaction'
            ]);
            expect(commandsFailed, 'commands failed').to.deep.equal(['insert', 'abortTransaction']);
          } finally {
            await session.endSession();
          }
        }
      );
    });
  });

  describe(
    'Connection after timeout',
    {
      requires: {
        // 4.4 for use of failCommands
        mongodb: '>=4.4'
      }
    },
    function () {
      let client: MongoClient;

      beforeEach(async function () {
        client = this.configuration.newClient({ timeoutMS: 500 });

        await client.db('admin').command(<FailPoint>{
          configureFailPoint: 'maxTimeNeverTimeOut',
          mode: 'alwaysOn'
        });

        const failpoint: FailPoint = {
          configureFailPoint: 'failCommand',
          mode: {
            times: 1
          },
          data: {
            failCommands: ['insert'],
            blockConnection: true,
            blockTimeMS: 700
          }
        };

        await client.db('admin').command(failpoint);
      });

      afterEach(async function () {
        await client.db('admin').command(<FailPoint>{
          configureFailPoint: 'maxTimeNeverTimeOut',
          mode: 'off'
        });

        await client.close();
      });

      it('closes so pending messages are not read by another operation', async function () {
        const cmap = [];
        client.on('connectionCheckedOut', ev => cmap.push(ev));
        client.on('connectionClosed', ev => cmap.push(ev));

        const error = await client
          .db('socket')
          .collection('closes')
          .insertOne({})
          .catch(error => error);

        // Note: In the case where the timeout comes from the server, the driver does not
        // need to close the connection as no more potential messages are expected.
        expect(error).to.be.instanceOf(MongoOperationTimeoutError);
        expect(cmap).to.have.lengthOf(2);

        const [checkedOut, closed] = cmap;
        expect(checkedOut).to.have.property('name', 'connectionCheckedOut');
        expect(closed).to.have.property('name', 'connectionClosed');
        expect(checkedOut).to.have.property('connectionId', closed.connectionId);
      });
    }
  );
});
