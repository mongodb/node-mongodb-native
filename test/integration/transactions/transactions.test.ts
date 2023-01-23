import { expect } from 'chai';

import {
  ClientSession,
  Collection,
  MongoClient,
  MongoInvalidArgumentError,
  MongoNetworkError,
  ServerSessionPool
} from '../../mongodb';

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
          topology: ['replicaset', 'sharded'],
          mongodb: '>=4.1.5',
          serverless: 'forbid'
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
        requires: { topology: ['replicaset', 'sharded'], mongodb: '>=4.2.0', serverless: 'forbid' }
      },
      test: function (done) {
        function fnThatReturnsBadPromise() {
          return Promise.reject();
        }

        session
          .withTransaction(fnThatReturnsBadPromise)
          .then(() => done(Error('Expected error')))
          .catch(err => {
            expect(err).to.equal(undefined);
            session.endSession(done);
          });
      }
    });

    describe(
      'return value semantics',
      { requires: { mongodb: '>=4.2.0', topology: '!single' } },
      () => {
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

        it('should return undefined when transaction is aborted explicitly', async () => {
          const session = client.startSession();

          const withTransactionResult = await session
            .withTransaction(async session => {
              await collection.insertOne({ a: 1 }, { session });
              await collection.findOne({ a: 1 }, { session });
              await session.abortTransaction();
            })
            .finally(async () => await session.endSession());

          expect(withTransactionResult).to.be.undefined;
        });

        it('should return raw command when transaction is successfully committed', async () => {
          const session = client.startSession();

          const withTransactionResult = await session
            .withTransaction(async session => {
              await collection.insertOne({ a: 1 }, { session });
              await collection.findOne({ a: 1 }, { session });
            })
            .finally(async () => await session.endSession());

          expect(withTransactionResult).to.exist;
          expect(withTransactionResult).to.be.an('object');
          expect(withTransactionResult).to.have.property('ok', 1);
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
      }
    );
  });

  describe('startTransaction', function () {
    it('should error if transactions are not supported', {
      metadata: { requires: { topology: ['sharded'], mongodb: '4.0.x' } },
      test: function (done) {
        const configuration = this.configuration;
        const client = configuration.newClient(configuration.url());

        client.connect((err, client) => {
          const session = client.startSession();
          const db = client.db(configuration.db);
          const coll = db.collection('transaction_error_test');
          coll.insertOne({ a: 1 }, err => {
            expect(err).to.not.exist;
            expect(() => session.startTransaction()).to.throw(
              'Transactions are not supported on sharded clusters in MongoDB < 4.2.'
            );

            session.endSession(() => {
              client.close(done);
            });
          });
        });
      }
    });

    it('should not error if transactions are supported', {
      metadata: { requires: { topology: ['sharded'], mongodb: '>=4.1.0' } },
      test: function (done) {
        const configuration = this.configuration;
        const client = configuration.newClient(configuration.url());

        client.connect(err => {
          expect(err).to.not.exist;

          const session = client.startSession();
          const db = client.db(configuration.db);
          const coll = db.collection('transaction_error_test');
          coll.insertOne({ a: 1 }, err => {
            expect(err).to.not.exist;
            expect(() => session.startTransaction()).to.not.throw();

            session.abortTransaction(() => session.endSession(() => client.close(done)));
          });
        });
      }
    });
  });

  describe('TransientTransactionError', function () {
    it('should have a TransientTransactionError label inside of a transaction', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=4.0.0' } },
      test: function (done) {
        const configuration = this.configuration;
        const client = configuration.newClient({ w: 1 });

        client.connect(err => {
          expect(err).to.not.exist;

          const session = client.startSession();
          const db = client.db(configuration.db);
          db.collection('transaction_error_test_2').drop(() => {
            db.createCollection('transaction_error_test_2', (err, coll) => {
              expect(err).to.not.exist;

              session.startTransaction();
              coll.insertOne({ a: 1 }, { session }, err => {
                expect(err).to.not.exist;
                expect(session.inTransaction()).to.be.true;

                client.db('admin').command(
                  {
                    configureFailPoint: 'failCommand',
                    mode: { times: 1 },
                    data: { failCommands: ['insert'], closeConnection: true }
                  },
                  err => {
                    expect(err).to.not.exist;
                    expect(session.inTransaction()).to.be.true;

                    coll.insertOne({ b: 2 }, { session }, err => {
                      expect(err).to.exist.and.to.be.an.instanceof(MongoNetworkError);
                      if (err instanceof MongoNetworkError) {
                        expect(err.hasErrorLabel('TransientTransactionError')).to.be.true;
                      }

                      session.abortTransaction(() => session.endSession(() => client.close(done)));
                    });
                  }
                );
              });
            });
          });
        });
      }
    });

    it('should not have a TransientTransactionError label outside of a transaction', {
      metadata: { requires: { topology: 'replicaset', mongodb: '>=4.0.0' } },
      test: function (done) {
        const configuration = this.configuration;
        const client = configuration.newClient({ w: 1 });

        client.connect(err => {
          expect(err).to.not.exist;
          const db = client.db(configuration.db);
          const coll = db.collection('transaction_error_test1');

          client.db('admin').command(
            {
              configureFailPoint: 'failCommand',
              mode: { times: 2 },
              data: { failCommands: ['insert'], closeConnection: true }
            },
            err => {
              expect(err).to.not.exist;
              coll.insertOne({ a: 1 }, err => {
                expect(err).to.exist.and.to.be.an.instanceOf(MongoNetworkError);
                client.close(done);
              });
            }
          );
        });
      }
    });
  });
});
