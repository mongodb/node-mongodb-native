'use strict';

const path = require('path');
const { expect } = require('chai');
const { TestRunnerContext, generateTopologyTests } = require('../../tools/spec-runner');
const { runUnifiedTest } = require('../../tools/unified-spec-runner/runner');
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
  'Client side error when transaction is in progress'
];

describe('Transactions Spec Legacy Tests', function () {
  const testContext = new TransactionsRunnerContext();
  const suitesToRun = [{ name: 'spec tests', specPath: path.join('transactions', 'legacy') }];
  // Note: convenient-api tests are skipped for serverless
  if (!process.env.SERVERLESS) {
    suitesToRun.push({
      name: 'withTransaction spec tests',
      specPath: path.join('transactions', 'convenient-api')
    });
  } else {
    // FIXME(NODE-3550): these tests should pass on serverless but currently fail
    SKIP_TESTS.push(
      'abortTransaction only performs a single retry',
      'abortTransaction does not retry after Interrupted',
      'abortTransaction does not retry after WriteConcernError Interrupted',
      'commitTransaction does not retry error without RetryableWriteError label',
      'commitTransaction is not retried after UnsatisfiableWriteConcern error',
      'commitTransaction fails after Interrupted'
    );
  }
  suitesToRun.forEach(suiteSpec => {
    describe(suiteSpec.name, function () {
      const testSuites = loadSpecTests(suiteSpec.specPath);
      after(() => testContext.teardown());
      before(function () {
        return testContext.setup(this.configuration);
      });

      function testFilter(spec) {
        return SKIP_TESTS.indexOf(spec.description) === -1;
      }

      generateTopologyTests(testSuites, testContext, testFilter);
    });
  });
});
