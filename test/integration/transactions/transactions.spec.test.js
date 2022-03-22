'use strict';

const path = require('path');
const { expect } = require('chai');
const { TestRunnerContext, generateTopologyTests } = require('../../tools/spec-runner');
const { runUnifiedSuite } = require('../../tools/unified-spec-runner/runner');
const { loadSpecTests } = require('../../spec');

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

// These tests are skipped because the driver 1) executes a ping when connecting to
// an authenticated server and 2) command monitoring is at the connection level so
// when the handshake fails no command started event is emitted.
// NOTE: these tests are skipped in the spec itself due to DRIVERS-2032 (unrelated to the above)
const SKIP = [
  'AbortTransaction succeeds after handshake network error',
  'CommitTransaction succeeds after handshake network error'
];

describe('Transactions Spec Unified Tests', function () {
  runUnifiedSuite(loadSpecTests(path.join('transactions', 'unified')), SKIP);
});

const SKIP_TESTS = [
  // TODO(NODE-3943): Investigate these commit test failures
  // OLD COMMENT: commitTransaction retry seems to be swallowed by mongos in these two cases
  'commitTransaction retry fails on new mongos',
  'unpin after transient error within a transaction and commit',

  // TODO(NODE-2034): Will be implemented as part of NODE-2034
  'Client side error in command starting transaction',
  'Client side error when transaction is in progress'
];

describe('Transactions Spec Legacy Tests', function () {
  const testContext = new TransactionsRunnerContext();
  if (process.env.SERVERLESS) {
    // TODO(NODE-3550): these tests should pass on serverless but currently fail
    SKIP_TESTS.push(
      'abortTransaction only performs a single retry',
      'abortTransaction does not retry after Interrupted',
      'abortTransaction does not retry after WriteConcernError Interrupted',
      'commitTransaction does not retry error without RetryableWriteError label',
      'commitTransaction is not retried after UnsatisfiableWriteConcern error',
      'commitTransaction fails after Interrupted'
    );
  }

  const testSuites = loadSpecTests(path.join('transactions', 'legacy'));
  after(() => testContext.teardown());
  before(function () {
    return testContext.setup(this.configuration);
  });

  function testFilter(spec) {
    return SKIP_TESTS.indexOf(spec.description) === -1;
  }

  generateTopologyTests(testSuites, testContext, testFilter);
});

describe('Transactions Spec Manual Tests', function () {
  context('when the handshake fails with a network error', function () {
    const metadata = {
      requires: {
        mongodb: '>=4.2.0',
        auth: 'enabled',
        topology: '!single'
      }
    };

    const dbName = 'retryable-handshake-tests';
    const collName = 'coll';
    const docs = [{ _id: 1, x: 11 }];
    let client;
    let db;
    let coll;
    let session;

    beforeEach(async function () {
      if (process.env.SERVERLESS) {
        this.currentTest.skipReason = 'Transaction tests cannot run against serverless';
        this.skip();
      }
      client = this.configuration.newClient({});
      db = client.db(dbName);
      coll = db.collection(collName);
      await client.connect();
      await coll.insertMany(docs);
      session = client.startSession();
      session.startTransaction();
      await coll.insertOne({ _id: 2, x: 22 }, { session });
    });

    afterEach(async function () {
      await session.endSession();

      await db.admin().command({
        configureFailPoint: 'failCommand',
        mode: 'off'
      });
      await coll.drop();
      await client.close();
    });

    // Manual implementation for: 'AbortTransaction succeeds after handshake network error'
    // NOTE: tests are skipped in the spec itself due to DRIVERS-2032 (unrelated to our reasons)
    it('retries the abort', metadata, async function () {
      await db.admin().command({
        configureFailPoint: 'failCommand',
        mode: { times: 2 },
        data: {
          failCommands: ['saslContinue', 'ping'],
          closeConnection: true
        }
      });
      await session.abortTransaction();
      const doc = await coll.findOne({ _id: 2 });
      expect(doc).to.not.exist;
    });

    // Manual implementation for: 'CommitTransaction succeeds after handshake network error'
    // NOTE: tests are skipped in the spec itself due to DRIVERS-2032 (unrelated to our reasons)
    it('retries the commit', metadata, async function () {
      await db.admin().command({
        configureFailPoint: 'failCommand',
        mode: { times: 2 },
        data: {
          failCommands: ['saslContinue', 'ping'],
          closeConnection: true
        }
      });
      await session.commitTransaction();
      const doc = await coll.findOne({ _id: 2 });
      expect(doc.x).to.equal(22);
    });
  });
});
