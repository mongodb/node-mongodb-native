import { expect } from 'chai';

import {
  ClientSession,
  type Collection,
  type CommandStartedEvent,
  type MongoClient,
  MongoInvalidArgumentError,
  MongoNetworkError,
  type ServerSessionPool
} from '../../mongodb';
import { type FailCommandFailPoint } from '../../tools/utils';

describe('Transactions', function () {
  describe('withTransaction', function () {
    let session: ClientSession;
    let sessionPool: ServerSessionPool;
    let client: MongoClient;

    beforeEach(async function () {
      client = this.configuration.newClient();
      sessionPool = client.s.sessionPool;
      session = new ClientSession(client, sessionPool, {});
    });

    afterEach(async () => {
      await client.close();
    });

    it(
      'should provide a useful error if a Promise is not returned',
      {
        requires: {
          topology: ['replicaset', 'sharded']
        }
      },
      async function () {
        function fnThatDoesNotReturnPromise() {
          return false;
        }

        const result = await session
          // @ts-expect-error: testing a function that does not return a promise
          .withTransaction(fnThatDoesNotReturnPromise)
          .catch(error => error);

        expect(result).to.be.instanceOf(MongoInvalidArgumentError);
        expect(result.message).to.match(/must return a Promise/);

        await session.endSession();
      }
    );

    it('should return readable error if promise rejected with no reason', {
      metadata: {
        requires: { topology: ['replicaset', 'sharded'] }
      },
      test: async function () {
        function fnThatReturnsBadPromise() {
          return Promise.reject();
        }

        const err = await session.withTransaction(fnThatReturnsBadPromise).catch(err => err);
        expect(err).to.equal(undefined);
        await session.endSession();
      }
    });

    describe('return value semantics', { requires: { topology: '!single' } }, () => {
      let client: MongoClient;
      let collection: Collection<{ a: number }>;

      beforeEach(async function () {
        client = this.configuration.newClient();
        await client.connect();
        collection = await client
          .db('withTransactionReturnType')
          .createCollection('withTransactionReturnType');
      });

      afterEach(async function () {
        await collection.drop();
        await client.close();
      });

      it('returns result of executor when transaction is aborted explicitly', async () => {
        const session = client.startSession();

        const withTransactionResult = await session
          .withTransaction(async session => {
            await collection.insertOne({ a: 1 }, { session });
            await collection.findOne({ a: 1 }, { session });
            await session.abortTransaction();
            return 'aborted!';
          })
          .finally(async () => await session.endSession());

        expect(withTransactionResult).to.equal('aborted!');
      });

      it('returns result of executor when transaction is successfully committed', async () => {
        const session = client.startSession();

        const withTransactionResult = await session
          .withTransaction(async session => {
            await collection.insertOne({ a: 1 }, { session });
            await collection.findOne({ a: 1 }, { session });
            return 'committed!';
          })
          .finally(async () => await session.endSession());

        expect(withTransactionResult).to.equal('committed!');
      });

      it('should throw when transaction is aborted due to an error', async () => {
        const session = client.startSession();

        const withTransactionResult = await session
          .withTransaction(async session => {
            await collection.insertOne({ a: 1 }, { session });
            await collection.findOne({ a: 1 }, { session });
            throw new Error("I don't wanna transact anymore!");
          })
          .catch(error => error)
          .finally(async () => await session.endSession());

        expect(withTransactionResult).to.be.instanceOf(Error);
        expect(withTransactionResult.message).to.equal("I don't wanna transact anymore!");
      });
    });

    context('when retried', { requires: { topology: '!single' } }, () => {
      let client: MongoClient;
      let collection: Collection<{ a: number }>;

      beforeEach(async function () {
        client = this.configuration.newClient();

        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: { times: 2 },
          data: {
            failCommands: ['commitTransaction'],
            errorCode: 24,
            errorLabels: ['TransientTransactionError'],
            closeConnection: false
          }
        } as FailCommandFailPoint);

        collection = await client.db('withTransaction').createCollection('withTransactionRetry');
      });

      afterEach(async () => {
        await client?.close();
      });

      it('returns the value of the final call to the executor', async () => {
        const session = client.startSession();

        let counter = 0;
        const withTransactionResult = await session
          .withTransaction(async session => {
            await collection.insertOne({ a: 1 }, { session });
            counter += 1;
            return counter;
          })
          .finally(async () => await session.endSession());

        expect(counter).to.equal(3);
        expect(withTransactionResult).to.equal(3);
      });
    });
  });

  describe('startTransaction', function () {
    it('should not error if transactions are supported', {
      metadata: { requires: { topology: ['sharded'] } },
      test: async function () {
        const configuration = this.configuration;
        const client = configuration.newClient(configuration.url());

        await client.connect();

        const session = client.startSession();
        const db = client.db(configuration.db);
        const coll = db.collection('transaction_error_test');
        await coll.insertOne({ a: 1 });
        session.startTransaction();

        await session.abortTransaction();
        await session.endSession();
        await client.close();
      }
    });
  });

  context('when completing a transaction', () => {
    let client: MongoClient;
    let commandsStarted: CommandStartedEvent[];
    beforeEach(async function () {
      client = this.configuration.newClient(undefined, { monitorCommands: true });
      commandsStarted = [];
      client.on('commandStarted', ev => {
        commandsStarted.push(ev);
      });
    });

    afterEach(async function () {
      await client.close();
    });

    it('commitTransaction() resolves void', { requires: { topology: '!single' } }, async () =>
      client.withSession(async session =>
        session.withTransaction(async session => {
          expect(await session.commitTransaction()).to.be.undefined;
        })
      )
    );

    it('abortTransaction() resolves void', { requires: { topology: '!single' } }, async () =>
      client.withSession(async session =>
        session.withTransaction(async session => {
          expect(await session.abortTransaction()).to.be.undefined;
        })
      )
    );

    it(
      'commitTransaction does not override write concern on initial attempt',
      { requires: { topology: '!single' } },
      async function () {
        await client
          .db('test')
          .dropCollection('test')
          .catch(() => null);
        const collection = await client.db('test').createCollection('test');
        const session = client.startSession({
          defaultTransactionOptions: { writeConcern: { w: 1 } }
        });
        session.startTransaction();
        await collection.insertOne({ x: 1 }, { session });
        await session.commitTransaction();

        const commitTransactions = commandsStarted.filter(
          x => x.commandName === 'commitTransaction'
        );
        expect(commitTransactions).to.have.lengthOf(1);
        expect(commitTransactions[0].command).to.have.nested.property('writeConcern.w', 1);
      }
    );
  });

  describe('TransientTransactionError', function () {
    let client: MongoClient;

    beforeEach(async function () {
      client = this.configuration.newClient();
    });

    afterEach(async function () {
      await client.close();
    });

    it('should have a TransientTransactionError label inside of a transaction', {
      metadata: { requires: { topology: 'replicaset' } },
      test: async function () {
        const session = client.startSession();
        const db = client.db();

        await db
          .collection('transaction_error_test_2')
          .drop()
          .catch(() => null);
        const coll = await db.createCollection('transaction_error_test_2');

        session.startTransaction();

        await coll.insertOne({ a: 1 }, { session });

        expect(session.inTransaction()).to.be.true;

        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: { failCommands: ['insert'], closeConnection: true }
        });

        expect(session.inTransaction()).to.be.true;

        const error = await coll.insertOne({ b: 2 }, { session }).catch(error => error);
        expect(error).to.be.instanceOf(MongoNetworkError);
        expect(error.hasErrorLabel('TransientTransactionError')).to.be.true;

        await session.abortTransaction();
        await session.endSession();
      }
    });

    it('should not have a TransientTransactionError label outside of a transaction', {
      metadata: { requires: { topology: 'replicaset' } },
      test: async function () {
        const db = client.db();
        const coll = db.collection('test');

        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: { times: 2 }, // fail 2 times for retry
          data: { failCommands: ['insert'], closeConnection: true }
        });

        const error = await coll.insertOne({ a: 1 }).catch(error => error);
        expect(error).to.be.instanceOf(MongoNetworkError);
      }
    });
  });
});
