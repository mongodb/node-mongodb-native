'use strict';

const path = require('path');
const { expect } = require('chai');
const { Topology } = require('../../src/sdam/topology');
const { ClientSession } = require('../../src/sessions');
const { TestRunnerContext, generateTopologyTests } = require('./spec-runner');
const { loadSpecTests } = require('../spec');
const { runUnifiedTest } = require('./unified-spec-runner/runner');
const { MongoNetworkError } = require('../../src/error');

function ignoreNsNotFoundForListIndexes(err) {
  if (err.code !== 26) {
    throw err;
  }

  return [];
}

class TransactionsRunnerContext extends TestRunnerContext {
  assertCollectionExists(options) {
    const client = this.sharedClient;
    const db = client.db(options.database);
    const collectionName = options.collection;

    return db
      .listCollections()
      .toArray()
      .then(collections => expect(collections.some(coll => coll.name === collectionName)).to.be.ok);
  }

  assertCollectionNotExists(options) {
    const client = this.sharedClient;
    const db = client.db(options.database);
    const collectionName = options.collection;

    return db
      .listCollections()
      .toArray()
      .then(
        collections => expect(collections.every(coll => coll.name !== collectionName)).to.be.ok
      );
  }

  assertIndexExists(options) {
    const client = this.sharedClient;
    const collection = client.db(options.database).collection(options.collection);
    const indexName = options.index;

    return collection
      .listIndexes()
      .toArray()
      .catch(ignoreNsNotFoundForListIndexes)
      .then(indexes => expect(indexes.some(idx => idx.name === indexName)).to.be.ok);
  }

  assertIndexNotExists(options) {
    const client = this.sharedClient;
    const collection = client.db(options.database).collection(options.collection);
    const indexName = options.index;

    return collection
      .listIndexes()
      .toArray()
      .catch(ignoreNsNotFoundForListIndexes)
      .then(indexes => expect(indexes.every(idx => idx.name !== indexName)).to.be.ok);
  }

  assertSessionPinned(options) {
    expect(options).to.have.property('session');

    const session = options.session;
    expect(session.isPinned).to.be.true;
  }

  assertSessionUnpinned(options) {
    expect(options).to.have.property('session');

    const session = options.session;
    expect(session.isPinned).to.be.false;
  }
}

describe('Transactions Spec Unified Tests', function () {
  for (const transactionTest of loadSpecTests(path.join('transactions', 'unified'))) {
    expect(transactionTest).to.exist;
    context(String(transactionTest.description), function () {
      for (const test of transactionTest.tests) {
        it(String(test.description), {
          metadata: { sessions: { skipLeakTests: true } },
          test: async function () {
            await runUnifiedTest(this, transactionTest, test);
          }
        });
      }
    });
  }
});

describe('Transactions', function () {
  const testContext = new TransactionsRunnerContext();

  [
    { name: 'spec tests', specPath: path.join('transactions', 'legacy') },
    {
      name: 'withTransaction spec tests',
      specPath: path.join('transactions', 'convenient-api')
    }
  ].forEach(suiteSpec => {
    describe(suiteSpec.name, function () {
      const testSuites = loadSpecTests(suiteSpec.specPath);
      after(() => testContext.teardown());
      before(function () {
        return testContext.setup(this.configuration);
      });

      function testFilter(spec) {
        const SKIP_TESTS = [
          // commitTransaction retry seems to be swallowed by mongos in these three cases
          'commitTransaction retry succeeds on new mongos',
          'commitTransaction retry fails on new mongos',
          'unpin after transient error within a transaction and commit',
          // FIXME(NODE-3074): unskip count tests when spec tests have been updated
          'count',
          // This test needs there to be multiple mongoses
          // 'increment txnNumber',
          // Skipping this until SPEC-1320 is resolved
          // 'remain pinned after non-transient error on commit',

          // Will be implemented as part of NODE-2034
          'Client side error in command starting transaction',
          'Client side error when transaction is in progress',

          // Will be implemented as part of NODE-2538
          'abortTransaction only retries once with RetryableWriteError from server',
          'abortTransaction does not retry without RetryableWriteError label',
          'commitTransaction does not retry error without RetryableWriteError label',
          'commitTransaction retries once with RetryableWriteError from server'
        ];

        return SKIP_TESTS.indexOf(spec.description) === -1;
      }

      generateTopologyTests(testSuites, testContext, testFilter);
    });
  });

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
      metadata: { requires: { topology: ['replicaset', 'sharded'], mongodb: '>=4.1.5' } },
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
      metadata: { requires: { topology: ['replicaset', 'sharded'], mongodb: '>=4.0.2' } },
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
