import { expectType } from 'tsd';

import { type ClientSession, type InsertOneResult, MongoClient, ReadConcern } from '../../../src';

// TODO(NODE-3345): Improve these tests to use expect assertions more

const client = new MongoClient('');
const session = client.startSession();

interface Account {
  balance: number;
}

async function commitWithRetry(session: ClientSession) {
  try {
    await session.commitTransaction();
    console.log('Transaction committed.');
  } catch (error) {
    if (error.errorLabels && error.errorLabels.indexOf('UnknownTransactionCommitResult') < 0) {
      console.log('UnknownTransactionCommitResult, retrying commit operation...');
      await commitWithRetry(session);
    } else {
      console.log('Error during commit...');
      throw error;
    }
  }
}

async function runTransactionWithRetry(
  txnFunc: (client: MongoClient, session: ClientSession) => Promise<void>,
  client: MongoClient,
  session: ClientSession
) {
  try {
    await txnFunc(client, session);
  } catch (error) {
    console.log('Transaction aborted. Caught exception during transaction.');

    // If transient error, retry the whole transaction
    if (error.errorLabels && error.errorLabels.indexOf('TransientTransactionError') < 0) {
      console.log('TransientTransactionError, retrying transaction ...');
      await runTransactionWithRetry(txnFunc, client, session);
    } else {
      throw error;
    }
  }
}

async function updateEmployeeInfo(client: MongoClient, session: ClientSession) {
  session.startTransaction({
    readPreference: 'primary',
    readConcern: new ReadConcern('available'), // NODE-3297
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

const from = 'a_name';
const to = 'b_name';
const amount = 100;
const db = client.db();
session.startTransaction();
try {
  const opts = { session, returnOriginal: false };
  const res = await db
    .collection<Account>('Account')
    .findOneAndUpdate({ name: from }, { $inc: { balance: -amount } }, opts);
  const A = res;
  if (A?.balance && A.balance < 0) {
    // If A would have negative balance, fail and abort the transaction
    // `session.abortTransaction()` will undo the above `findOneAndUpdate()`
    throw new Error('Insufficient funds: ' + (A.balance + amount));
  }

  const resB = await db
    .collection<Account>('Account')
    .findOneAndUpdate({ name: to }, { $inc: { balance: amount } }, opts);
  const B = resB;

  await session.commitTransaction();
  session.endSession();
  console.log({ from: A, to: B });
} catch (error) {
  // If an error occurred, abort the whole transaction and
  // undo any changes that might have happened
  await session.abortTransaction();
  session.endSession();
  throw error; // Rethrow so calling function sees error
}

client.withSession(session => runTransactionWithRetry(updateEmployeeInfo, client, session));

const col = client.db('test').collection<{ _id: string }>('col');
const insertResult = await session.withTransaction(async () => {
  return await col.insertOne({ _id: 'one' }, { session });
});
expectType<InsertOneResult<{ _id: string }>>(insertResult);
