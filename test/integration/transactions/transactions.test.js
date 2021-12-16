'use strict';

const { expect } = require('chai');
const { Topology } = require('../../../src/sdam/topology');
const { ClientSession } = require('../../../src/sessions');
const { MongoNetworkError } = require('../../../src/error');

describe('Transactions', function () {
  describe('withTransaction', function () {
    let session, sessionPool;
    beforeEach(() => {
      const topology = new Topology('localhost:27017');
      sessionPool = topology.s.sessionPool;
      session = new ClientSession(topology, sessionPool);
    });

    afterEach(() => {
      sessionPool.endAllPooledSessions();
    });

    it('should provide a useful error if a Promise is not returned', {
      metadata: {
        requires: { topology: ['replicaset', 'sharded'], mongodb: '>=4.1.5', serverless: 'forbid' }
      },
      test: function (done) {
        function fnThatDoesntReturnPromise() {
          return false;
        }

        expect(() => session.withTransaction(fnThatDoesntReturnPromise)).to.throw(
          /must return a Promise/
        );

        session.endSession(done);
      }
    });

    it('should return readable error if promise rejected with no reason', {
      metadata: {
        requires: { topology: ['replicaset', 'sharded'], mongodb: '>=4.0.2' },
        serverless: 'forbid'
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
                      expect(err.hasErrorLabel('TransientTransactionError')).to.be.true;

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
