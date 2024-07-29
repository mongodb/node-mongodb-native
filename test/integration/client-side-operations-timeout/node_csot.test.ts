/* Anything javascript specific relating to timeouts */
import { expect } from 'chai';

import {
  type ClientSession,
  type Collection,
  type CommandStartedEvent,
  type Db,
  type FindCursor,
  LEGACY_HELLO_COMMAND,
  MongoClient,
  MongoError,
  MongoOperationTimeoutError
} from '../../mongodb';

describe('CSOT driver tests', () => {
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

  describe('retryable reads', () => {
    let configClient: MongoClient;
    let client: MongoClient;
    const FAIL_COMMAND = {
      configureFailPoint: 'failCommand',
      mode: 'alwaysOn',
      data: {
        failCommands: ['count'],
        errorCode: 10107,
        closeConnection: false
      }
    };

    const DISABLE_FAIL_COMMAND = {
      configureFailPoint: 'failCommand',
      mode: 'off',
      data: {
        failCommands: ['count'],
        errorCode: 10107,
        closeConnection: false
      }
    };

    beforeEach(async function () {
      configClient = new MongoClient(this.configuration.url());
      await configClient.db().admin().command(FAIL_COMMAND);
    });

    afterEach(async function () {
      await configClient.db().admin().command(DISABLE_FAIL_COMMAND);
      await configClient.close();

      await client.close();
    });

    context('when timeoutMS is undefined and retryable operation fails', () => {
      const commandStartedEvents = [];
      let maybeErr: Error | null;

      beforeEach(async function () {
        client = this.configuration.newClient(this.configuration.url(), {
          timeoutMS: undefined,
          monitorCommands: true
        });

        client.on('commandStarted', (ev: CommandStartedEvent) => {
          if (Object.hasOwn(ev.command, 'count')) commandStartedEvents.push(ev.command);
        });
        maybeErr = await client
          .db('test')
          .collection('test')
          .count()
          .then(
            () => null,
            e => e
          );
      });

      it('makes exactly two total attempts and throws an error', async function () {
        expect(maybeErr).to.be.instanceof(MongoError);
        expect(commandStartedEvents).to.have.length(2);
      });
    });

    context('when timeoutMS is a number and operation fails', () => {
      const commandStartedEvents = [];
      let start: number, end: number;
      let maybeErr: Error | null;

      beforeEach(async function () {
        client = this.configuration.newClient(this.configuration.url(), {
          timeoutMS: 50,
          monitorCommands: true
        });

        client.on('commandStarted', (ev: CommandStartedEvent) => {
          if (Object.hasOwn(ev.command, 'count')) commandStartedEvents.push(ev.command);
        });

        start = performance.now();
        maybeErr = await client
          .db('test')
          .collection('test')
          .count()
          .then(
            () => null,
            e => e
          );
        end = performance.now();
      });

      it('throws MongoOperationTimeoutError after timeoutMS', async function () {
        expect(end - start).to.be.greaterThanOrEqual(client.options.timeoutMS);
        expect(maybeErr).to.be.instanceof(MongoOperationTimeoutError);
      });

      it('attempts the command more than twice', async function () {
        expect(commandStartedEvents).to.have.length.greaterThan(2);
      });
    });
  });

  describe('retryable writes', () => {
    let configClient: MongoClient;
    let client: MongoClient;
    const FAIL_COMMAND = {
      configureFailPoint: 'failCommand',
      mode: 'alwaysOn',
      data: {
        failCommands: ['insert'],
        errorCode: 10107,
        closeConnection: false
      }
    };

    const DISABLE_FAIL_COMMAND = {
      configureFailPoint: 'failCommand',
      mode: 'off',
      data: {
        failCommands: ['insert'],
        errorCode: 10107,
        closeConnection: false
      }
    };

    beforeEach(async function () {
      configClient = new MongoClient(this.configuration.url());
      await configClient.db().admin().command(FAIL_COMMAND);
    });

    afterEach(async function () {
      await configClient.db().admin().command(DISABLE_FAIL_COMMAND);
      await configClient.close();

      await client.close();
    });

    context('when timeoutMS is undefined and retryable operation fails', () => {
      const commandStartedEvents = [];
      let maybeErr: Error | null;

      beforeEach(async function () {
        client = this.configuration.newClient(this.configuration.url(), {
          timeoutMS: undefined,
          monitorCommands: true
        });

        client.on('commandStarted', (ev: CommandStartedEvent) => {
          if (Object.hasOwn(ev.command, 'insert')) commandStartedEvents.push(ev.command);
        });
        maybeErr = await client
          .db('test')
          .collection('test')
          .insertOne({ a: 10 })
          .then(
            () => null,
            e => e
          );
      });

      it('makes exactly two total attempts and throws an error', async function () {
        expect(maybeErr).to.be.instanceof(MongoError);
        expect(commandStartedEvents).to.have.length(2);
      });
    });

    context('when timeoutMS is a number and operation fails', () => {
      const commandStartedEvents = [];
      let start: number, end: number;
      let maybeErr: Error | null;

      beforeEach(async function () {
        client = this.configuration.newClient(this.configuration.url(), {
          timeoutMS: 50,
          monitorCommands: true
        });

        client.on('commandStarted', (ev: CommandStartedEvent) => {
          if (Object.hasOwn(ev.command, 'insert')) commandStartedEvents.push(ev.command);
        });

        start = performance.now();
        maybeErr = await client
          .db('test')
          .collection('test')
          .insertOne({ a: 10 })
          .then(
            () => null,
            e => e
          );
        end = performance.now();
      });

      it('throws MongoOperationTimeoutError after timeoutMS', async function () {
        expect(end - start).to.be.greaterThanOrEqual(client.options.timeoutMS);
        expect(maybeErr).to.be.instanceof(MongoOperationTimeoutError);
      });

      it('attempts the command more than twice', async function () {
        expect(commandStartedEvents).to.have.length.greaterThan(2);
      });
    });
  });
});
