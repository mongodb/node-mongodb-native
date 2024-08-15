/* Anything javascript specific relating to timeouts */
import { expect } from 'chai';
import * as semver from 'semver';
import * as sinon from 'sinon';

import {
  BSON,
  type ClientSession,
  type Collection,
  type CommandStartedEvent,
  Connection,
  type Db,
  type FindCursor,
  LEGACY_HELLO_COMMAND,
  type MongoClient,
  MongoOperationTimeoutError,
  MongoServerError
} from '../../mongodb';
import { type FailPoint } from '../../tools/utils';

describe('CSOT driver tests', { requires: { mongodb: '>=4.4' } }, () => {
  describe('timeoutMS inheritance', () => {
    let client: MongoClient;
    let db: Db;
    let coll: Collection;

    beforeEach(async function () {
      client = this.configuration.newClient(undefined, { timeoutMS: 100 });
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
          client = this.configuration.newClient(undefined, { timeoutMS: 1, monitorCommands: true });

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
    let commandsSucceeded;
    let commandsFailed;

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

      it('throws a MongoOperationTimeoutError error and emits command failed', async () => {
        const error = await client
          .db()
          .command({ ping: 1 })
          .catch(error => error);
        expect(error).to.be.instanceOf(MongoOperationTimeoutError);
        expect(error.cause).to.be.instanceOf(MongoServerError);
        expect(error.cause).to.have.property('code', 50);

        expect(commandsFailed).to.have.lengthOf(1);
        expect(commandsFailed).to.have.nested.property('[0].failure.cause.code', 50);
      });
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

      it('throws a MongoOperationTimeoutError error and emits command succeeded', async () => {
        const error = await client
          .db('admin')
          .command({ giveMeWriteErrors: 1 })
          .catch(error => error);
        expect(error).to.be.instanceOf(MongoOperationTimeoutError);
        expect(error.cause).to.be.instanceOf(MongoServerError);
        expect(error.cause).to.have.nested.property('writeErrors[3].code', 50);

        expect(commandsSucceeded).to.have.lengthOf(1);
        expect(commandsSucceeded).to.have.nested.property('[0].reply.writeErrors[3].code', 50);
      });
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

      it('throws a MongoOperationTimeoutError error and emits command succeeded', async () => {
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
      });
    });
  });

  describe('Non-Tailable cursors', () => {
    let client: MongoClient;
    let internalClient: MongoClient;
    let commandStarted: CommandStartedEvent[];
    const failpoint: FailPoint = {
      configureFailPoint: 'failCommand',
      mode: 'alwaysOn',
      data: {
        failCommands: ['find'],
        blockConnection: true,
        blockTimeMS: 30
      }
    };

    beforeEach(async function () {
      internalClient = this.configuration.newClient(undefined);
      await internalClient.db('db').dropCollection('coll');
      await internalClient
        .db('db')
        .collection('coll')
        .insertMany(
          Array.from({ length: 3 }, () => {
            return { x: 1 };
          })
        );

      await internalClient.db().admin().command(failpoint);

      client = this.configuration.newClient(undefined, { timeoutMS: 20, monitorCommands: true });
      commandStarted = [];
      client.on('commandStarted', ev => commandStarted.push(ev));
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
      context('when executing a valid operation', () => {
        it('must apply the configured timeoutMS to the initial operation execution', async function () {
          const cursor = client
            .db('db')
            .collection('coll')
            .find({}, { batchSize: 3, timeoutMode: 'iteration' })
            .limit(3);

          const maybeError = await cursor.next().then(
            () => null,
            e => e
          );

          expect(maybeError).to.be.instanceOf(MongoOperationTimeoutError);
        });

        it('refreshes the timeout for any getMores', async function () {
          const cursor = client
            .db('db')
            .collection('coll')
            .find({}, { batchSize: 1, timeoutMode: 'iteration' })
            .project({ _id: 0 })
            .limit(2);

          const firstDoc = await cursor.next();
          expect(firstDoc).to.deep.equal({ x: 1 });

          const maybeError = await cursor.next().then(
            () => null,
            e => e
          );

          expect(maybeError).to.be.instanceOf(MongoOperationTimeoutError);
        });
        it('does not append a maxTimeMS to the original command or getMores', async function () {
          const cursor = client
            .db('db')
            .collection('coll')
            .find({}, { batchSize: 1, timeoutMode: 'iteration' })
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
        });
      });
    });

    context('LIFETIME mode', () => {
      context('when executing a next call', () => {
        context(
          'when there are documents available from previously retrieved batch and timeout has expired',
          () => {
            it('returns documents without error');
          }
        );
        context('when a getMore is required and the timeout has expired', () => {
          it('throws a MongoOperationTimeoutError');
        });
        it('does not apply maxTimeMS to a getMore');
      });
    });
  });

  describe.skip('Tailable non-awaitData cursors').skipReason =
    'TODO(NODE-6305): implement CSOT for Tailable cursors';
  describe.skip('Tailable awaitData cursors').skipReason =
    'TODO(NODE-6305): implement CSOT for Tailable cursors';
});
