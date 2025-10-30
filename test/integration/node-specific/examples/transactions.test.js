const { MongoClient } = require('mongodb');

// Yes, we are shadowing a global here but we are not actually ever printing anything in this file
// This just so the examples can use console.log to make for nice copy pasting
const console = { log() {} };

describe('examples(transactions):', function () {
  let client;

  beforeEach(async function () {
    client = await this.configuration.newClient().connect();
    await client.db('hr').dropDatabase();
    await client.db('hr').createCollection('employees');
    await client.db('reporting').dropDatabase();
    await client.db('reporting').createCollection('events');
  });

  afterEach(async function () {
    await client.close();
    client = undefined;
  });

  it('Transactions Retry Example 1', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.8.0' } },
    test: async function () {
      // Start Transactions Retry Example 1
      async function runTransactionWithRetry(txnFunc, client, session) {
        try {
          await txnFunc(client, session);
        } catch (error) {
          console.log('Transaction aborted. Caught exception during transaction.');

          // If transient error, retry the whole transaction
          if (error.hasErrorLabel('TransientTransactionError')) {
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
          writeConcern: { w: 'majority' },
          readPreference: 'primary'
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
    test: async function () {
      // Start Transactions Retry Example 2
      async function commitWithRetry(session) {
        try {
          await session.commitTransaction();
          console.log('Transaction committed.');
        } catch (error) {
          if (error.hasErrorLabel('UnknownTransactionCommitResult')) {
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
          writeConcern: { w: 'majority' },
          readPreference: 'primary'
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
    test: async function () {
      // Start Transactions Retry Example 3
      async function commitWithRetry(session) {
        try {
          await session.commitTransaction();
          console.log('Transaction committed.');
        } catch (error) {
          if (error.hasErrorLabel('UnknownTransactionCommitResult')) {
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
          if (error.hasErrorLabel('TransientTransactionError')) {
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
          writeConcern: { w: 'majority' },
          readPreference: 'primary'
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

  it('Transactions withTransaction API Example 1', {
    metadata: { requires: { topology: ['replicaset'], mongodb: '>=3.8.0' } },
    test: async function () {
      const uri = this.configuration.url();

      // Start Transactions withTxn API Example 1

      // For a replica set, include the replica set name and a seedlist of the members in the URI string; e.g.
      // const uri = 'mongodb://mongodb0.example.com:27017,mongodb1.example.com:27017/?replicaSet=myRepl'
      // For a sharded cluster, connect to the mongos instances; e.g.
      // const uri = 'mongodb://mongos0.example.com:27017,mongos1.example.com:27017/'

      const client = new MongoClient(uri);
      await client.connect();

      // Prereq: Create collections.

      await client
        .db('mydb1')
        .collection('foo')
        .insertOne({ abc: 0 }, { writeConcern: { w: 'majority' } });

      await client
        .db('mydb2')
        .collection('bar')
        .insertOne({ xyz: 0 }, { writeConcern: { w: 'majority' } });

      // Step 1: Start a Client Session
      const session = client.startSession();

      // Step 2: Optional. Define options to use for the transaction
      const transactionOptions = {
        readPreference: 'primary',
        readConcern: { level: 'local' },
        writeConcern: { w: 'majority' }
      };

      // Step 3: Use withTransaction to start a transaction, execute the callback, and commit (or abort on error)
      // Note: The callback for withTransaction MUST be async and/or return a Promise.
      try {
        await session.withTransaction(async () => {
          const coll1 = client.db('mydb1').collection('foo');
          const coll2 = client.db('mydb2').collection('bar');

          // Important:: You must pass the session to the operations

          await coll1.insertOne({ abc: 1 }, { session });
          await coll2.insertOne({ xyz: 999 }, { session });
        }, transactionOptions);
      } finally {
        await session.endSession();
        await client.close();
      }
      // End Transactions withTxn API Example 1
    }
  });
});
