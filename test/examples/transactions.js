'use strict';

const setupDatabase = require('../functional/shared').setupDatabase;
const MongoClient = require('../../lib/mongo_client');

describe('examples(transactions):', function() {
  let client;
  let log;

  before(async function() {
    await setupDatabase(this.configuration);
    log = console.log;
    console.log = () => {};
  });

  after(function() {
    console.log = log;
    log = undefined;
  });

  beforeEach(async function() {
    client = await MongoClient.connect(this.configuration.url());
    await client.db('hr').dropDatabase();
    await client.db('hr').createCollection('employees');
    await client.db('reporting').dropDatabase();
    await client.db('reporting').createCollection('events');
  });

  afterEach(async function() {
    await client.close();
    client = undefined;
  });

  it('Transactions Retry Example 1', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.8.0' } },
    test: async function() {
      // Start Transactions Retry Example 1
      async function runTransactionWithRetry(txnFunc, client, session) {
        try {
          await txnFunc(client, session);
        } catch (error) {
          console.log('Transaction aborted. Caught exception during transaction.');

          // If transient error, retry the whole transaction
          if (error.errorLabels && error.errorLabels.indexOf('TransientTransactionError') >= 0) {
            console.log('TransientTransactionError, retrying transaction ...');
            await runTransactionWithRetry(txnFunc, client, session);
          } else {
            throw error;
          }
        }
      }
      // End Transactions Retry Example 1

      async function updateEmployeeInfo(client, session) {
        session.startTransaction({
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' }
        });

        const employeesCollection = client.db('hr').collection('employees');
        const eventsCollection = client.db('reporting').collection('events');

        await employeesCollection.updateOne(
          { employee: 3 },
          { $set: { status: 'Inactive' } },
          { session }
        );
        await eventsCollection.insertOne(
          {
            employee: 3,
            status: { new: 'Inactive', old: 'Active' }
          },
          { session }
        );

        try {
          await session.commitTransaction();
        } catch (error) {
          await session.abortTransaction();
          throw error;
        }
      }

      return client.withSession(session =>
        runTransactionWithRetry(updateEmployeeInfo, client, session)
      );
    }
  });

  it('Transactions Retry Example 2', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.8.0' } },
    test: async function() {
      // Start Transactions Retry Example 2
      async function commitWithRetry(session) {
        try {
          await session.commitTransaction();
          console.log('Transaction committed.');
        } catch (error) {
          if (
            error.errorLabels &&
            error.errorLabels.indexOf('UnknownTransactionCommitResult') >= 0
          ) {
            console.log('UnknownTransactionCommitResult, retrying commit operation ...');
            await commitWithRetry(session);
          } else {
            console.log('Error during commit ...');
            throw error;
          }
        }
      }
      // End Transactions Retry Example 2

      async function updateEmployeeInfo(client, session) {
        session.startTransaction({
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' }
        });

        const employeesCollection = client.db('hr').collection('employees');
        const eventsCollection = client.db('reporting').collection('events');

        await employeesCollection.updateOne(
          { employee: 3 },
          { $set: { status: 'Inactive' } },
          { session }
        );
        await eventsCollection.insertOne(
          {
            employee: 3,
            status: { new: 'Inactive', old: 'Active' }
          },
          { session }
        );

        try {
          await commitWithRetry(session);
        } catch (error) {
          await session.abortTransaction();
          throw error;
        }
      }

      return client.withSession(session => updateEmployeeInfo(client, session));
    }
  });

  it('Transaction Retry Example 3', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.8.0' } },
    test: async function() {
      // Start Transactions Retry Example 3
      async function commitWithRetry(session) {
        try {
          await session.commitTransaction();
          console.log('Transaction committed.');
        } catch (error) {
          if (
            error.errorLabels &&
            error.errorLabels.indexOf('UnknownTransactionCommitResult') >= 0
          ) {
            console.log('UnknownTransactionCommitResult, retrying commit operation ...');
            await commitWithRetry(session);
          } else {
            console.log('Error during commit ...');
            throw error;
          }
        }
      }

      async function runTransactionWithRetry(txnFunc, client, session) {
        try {
          await txnFunc(client, session);
        } catch (error) {
          console.log('Transaction aborted. Caught exception during transaction.');

          // If transient error, retry the whole transaction
          if (error.errorLabels && error.errorLabels.indexOf('TransientTransactionError') >= 0) {
            console.log('TransientTransactionError, retrying transaction ...');
            await runTransactionWithRetry(txnFunc, client, session);
          } else {
            throw error;
          }
        }
      }

      async function updateEmployeeInfo(client, session) {
        session.startTransaction({
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' }
        });

        const employeesCollection = client.db('hr').collection('employees');
        const eventsCollection = client.db('reporting').collection('events');

        await employeesCollection.updateOne(
          { employee: 3 },
          { $set: { status: 'Inactive' } },
          { session }
        );
        await eventsCollection.insertOne(
          {
            employee: 3,
            status: { new: 'Inactive', old: 'Active' }
          },
          { session }
        );

        try {
          await commitWithRetry(session);
        } catch (error) {
          await session.abortTransaction();
          throw error;
        }
      }

      return client.withSession(session =>
        runTransactionWithRetry(updateEmployeeInfo, client, session)
      );
      // End Transactions Retry Example 3
    }
  });
});
