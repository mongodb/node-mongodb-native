/* Anything javascript specific relating to timeouts */
import { setTimeout } from 'node:timers/promises';

import { expect } from 'chai';
import * as semver from 'semver';
import * as sinon from 'sinon';

import {
  BSON,
  type ClientSession,
  type Collection,
  type CommandFailedEvent,
  type CommandStartedEvent,
  type CommandSucceededEvent,
  Connection,
  type Db,
  type FindCursor,
  LEGACY_HELLO_COMMAND,
  type MongoClient,
  MongoInvalidArgumentError,
  MongoOperationTimeoutError,
  MongoServerError
} from '../../mongodb';
import { type FailPoint } from '../../tools/utils';

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
            const cmd = commandSpy.lastCall.args.at(1);
            if ('giveMeWriteErrors' in cmd) {
              await realIterator.next().catch(() => null); // dismiss response
              yield { parse: () => writeErrorsReply };
            } else {
              yield (await realIterator.next()).value;
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

      client = this.configuration.newClient(undefined, { monitorCommands: true });
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
              .find({}, { batchSize: 3, timeoutMode: 'iteration', timeoutMS: 10 })
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
            .find({}, { batchSize: 1, timeoutMode: 'iteration', timeoutMS: 100 })
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
              .find({}, { batchSize: 1, timeoutMode: 'iteration', timeoutMS: 100 })
              .project({ _id: 0 });
            await cursor.toArray();

            expect(commandStarted).to.have.length.gte(3); // Find and 2 getMores
            expect(
              commandStarted.filter(ev => {
                return (
                  ev.command.find != null &&
                  ev.command.getMore != null &&
                  ev.command.maxTimeMS != null
                );
              })
            ).to.have.lengthOf(0);
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

        client = this.configuration.newClient(undefined, { monitorCommands: true });
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
      await client.connect();
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

        it('refreshes the timeout for subsequent getMores', async function () {
          cursor = client
            .db('db')
            .collection('coll')
            .find({}, { timeoutMS: 150, tailable: true, awaitData: true, batchSize: 1 });
          for (let i = 0; i < 5; i++) {
            // Iterate cursor 5 times (server would have blocked for 500ms overall, but client
            // should not throw
            await cursor.next();
          }
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
});
