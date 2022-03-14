/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect } from 'chai';

import {
  AbstractCursor,
  Collection,
  Db,
  Document,
  GridFSFile,
  MongoClient,
  ObjectId
} from '../../../src';
import { CommandStartedEvent } from '../../../src/cmap/command_monitoring_events';
import { ReadConcern } from '../../../src/read_concern';
import { ReadPreference } from '../../../src/read_preference';
import { WriteConcern } from '../../../src/write_concern';
import { EventCollector } from '../../tools/utils';
import { EntitiesMap } from './entities';
import { expectErrorCheck, resultCheck } from './match';
import type { OperationDescription } from './schema';
import { translateOptions } from './unified-utils';

interface OperationFunctionParams {
  client: MongoClient;
  operation: OperationDescription;
  entities: EntitiesMap;
}

type RunOperationFn = (p: OperationFunctionParams) => Promise<Document | boolean | number | void>;
export const operations = new Map<string, RunOperationFn>();

operations.set('abortTransaction', async ({ entities, operation }) => {
  const session = entities.getEntity('session', operation.object);
  return session.abortTransaction();
});

operations.set('aggregate', async ({ entities, operation }) => {
  const dbOrCollection = entities.get(operation.object) as Db | Collection;
  if (!(dbOrCollection instanceof Db || dbOrCollection instanceof Collection)) {
    throw new Error(`Operation object '${operation.object}' must be a db or collection`);
  }
  const { pipeline, ...opts } = operation.arguments;
  const cursor = dbOrCollection.aggregate(pipeline, opts);
  return cursor.toArray();
});

operations.set('assertCollectionExists', async ({ operation, client }) => {
  const collections = (
    await client
      .db(operation.arguments.databaseName)
      .listCollections({}, { nameOnly: true })
      .toArray()
  ).map(({ name }) => name);
  expect(collections).to.include(operation.arguments.collectionName);
});

operations.set('assertCollectionNotExists', async ({ operation, client }) => {
  const collections = (
    await client
      .db(operation.arguments.databaseName)
      .listCollections({}, { nameOnly: true })
      .toArray()
  ).map(({ name }) => name);
  expect(collections).to.not.include(operation.arguments.collectionName);
});

operations.set('assertIndexExists', async ({ operation, client }) => {
  const collection = client
    .db(operation.arguments.databaseName)
    .collection(operation.arguments.collectionName);
  const indexes = (await collection.listIndexes().toArray()).map(({ name }) => name);
  expect(indexes).to.include(operation.arguments.indexName);
});

operations.set('assertIndexNotExists', async ({ operation, client }) => {
  const collection = client
    .db(operation.arguments.databaseName)
    .collection(operation.arguments.collectionName);
  try {
    expect(await collection.indexExists(operation.arguments.indexName)).to.be.true;
  } catch (error) {
    if (error.code === 26 || error.message.includes('ns does not exist')) {
      return;
    }
    throw error;
  }
});

operations.set('assertDifferentLsidOnLastTwoCommands', async ({ entities, operation }) => {
  const client = entities.getEntity('client', operation.arguments.client);
  expect(client.observedCommandEvents.includes('commandStarted')).to.be.true;

  const startedEvents = client.commandEvents.filter(
    ev => ev instanceof CommandStartedEvent
  ) as CommandStartedEvent[];

  expect(startedEvents).to.have.length.gte(2);

  const last = startedEvents[startedEvents.length - 1];
  const secondLast = startedEvents[startedEvents.length - 2];

  expect(last.command).to.have.property('lsid');
  expect(secondLast.command).to.have.property('lsid');

  expect(last.command.lsid.id.buffer.equals(secondLast.command.lsid.id.buffer)).to.be.false;
});

operations.set('assertSameLsidOnLastTwoCommands', async ({ entities, operation }) => {
  const client = entities.getEntity('client', operation.arguments.client);
  expect(client.observedCommandEvents.includes('commandStarted')).to.be.true;

  const startedEvents = client.commandEvents.filter(
    ev => ev instanceof CommandStartedEvent
  ) as CommandStartedEvent[];

  expect(startedEvents).to.have.length.gte(2);

  const last = startedEvents[startedEvents.length - 1];
  const secondLast = startedEvents[startedEvents.length - 2];

  expect(last.command).to.have.property('lsid');
  expect(secondLast.command).to.have.property('lsid');

  expect(last.command.lsid.id.buffer.equals(secondLast.command.lsid.id.buffer)).to.be.true;
});

operations.set('assertSessionDirty', async ({ entities, operation }) => {
  const session = operation.arguments.session;
  expect(session.serverSession.isDirty).to.be.true;
});

operations.set('assertSessionNotDirty', async ({ entities, operation }) => {
  const session = operation.arguments.session;
  expect(session.serverSession.isDirty).to.be.false;
});

operations.set('assertSessionPinned', async ({ entities, operation }) => {
  const session = operation.arguments.session;
  expect(session.isPinned, 'session should be pinned').to.be.true;
});

operations.set('assertSessionUnpinned', async ({ entities, operation }) => {
  const session = operation.arguments.session;
  expect(session.isPinned, 'session should be unpinned').to.be.false;
});

operations.set('assertSessionTransactionState', async ({ entities, operation }) => {
  const session = operation.arguments.session;

  const transactionStateTranslation = {
    none: 'NO_TRANSACTION',
    starting: 'STARTING_TRANSACTION',
    in_progress: 'TRANSACTION_IN_PROGRESS',
    committed: 'TRANSACTION_COMMITTED',
    aborted: 'TRANSACTION_ABORTED'
  };

  const driverTransactionStateName = transactionStateTranslation[operation.arguments.state];
  expect(session.transaction.state).to.equal(driverTransactionStateName);
});

operations.set('assertNumberConnectionsCheckedOut', async ({ entities, operation }) => {
  const client = entities.getEntity('client', operation.arguments.client);
  const servers = Array.from(client.topology.s.servers.values());
  const checkedOutConnections = servers.reduce((count, server) => {
    const pool = server.s.pool;
    return count + pool.currentCheckedOutCount;
  }, 0);

  await Promise.resolve(); // wait one tick
  expect(checkedOutConnections).to.equal(operation.arguments.connections);
});

operations.set('bulkWrite', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { requests, ...opts } = operation.arguments;
  return collection.bulkWrite(requests, opts);
});

// The entity exists for the name but can potentially have the wrong
// type (stream/cursor) which will also throw an exception even when
// telling getEntity() to ignore checking existence.
operations.set('close', async ({ entities, operation }) => {
  try {
    const cursor = entities.getEntity('cursor', operation.object);
    await cursor.close();
  } catch (e) {
    const changeStream = entities.getEntity('stream', operation.object);
    await changeStream.close();
  }
});

operations.set('commitTransaction', async ({ entities, operation }) => {
  const session = entities.getEntity('session', operation.object);
  return session.commitTransaction();
});

operations.set('createChangeStream', async ({ entities, operation }) => {
  const watchable = entities.get(operation.object);
  if (!('watch' in watchable)) {
    throw new Error(`Entity ${operation.object} must be watchable`);
  }
  const changeStream = watchable.watch(operation.arguments.pipeline, {
    fullDocument: operation.arguments.fullDocument,
    maxAwaitTimeMS: operation.arguments.maxAwaitTimeMS,
    resumeAfter: operation.arguments.resumeAfter,
    startAfter: operation.arguments.startAfter,
    startAtOperationTime: operation.arguments.startAtOperationTime,
    batchSize: operation.arguments.batchSize,
    comment: operation.arguments.comment
  });
  changeStream.eventCollector = new EventCollector(changeStream, ['init', 'change', 'error']);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Change stream never started'));
    }, 2000);

    changeStream.cursor.once('init', () => {
      clearTimeout(timeout);
      resolve(changeStream);
    });
  });
});

operations.set('createCollection', async ({ entities, operation }) => {
  const db = entities.getEntity('db', operation.object);
  const { collection, ...opts } = operation.arguments;
  await db.createCollection(collection, opts);
});

operations.set('createFindCursor', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, ...opts } = operation.arguments;
  const cursor = collection.find(filter, opts);
  // The spec dictates that we create the cursor and force the find command
  // to execute, but don't move the cursor forward. hasNext() accomplishes
  // this.
  await cursor.hasNext();
  return cursor;
});

operations.set('createIndex', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { keys, ...opts } = operation.arguments;
  await collection.createIndex(keys, opts);
});

operations.set('deleteOne', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, ...options } = operation.arguments;
  return collection.deleteOne(filter, options);
});

operations.set('dropCollection', async ({ entities, operation }) => {
  const db = entities.getEntity('db', operation.object);
  const { collection, ...opts } = operation.arguments;
  return await db.dropCollection(collection, opts);
});

operations.set('endSession', async ({ entities, operation }) => {
  const session = entities.getEntity('session', operation.object);
  return session.endSession();
});

operations.set('find', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, ...opts } = operation.arguments;
  return collection.find(filter, opts).toArray();
});

operations.set('findOneAndReplace', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, replacement, ...opts } = operation.arguments;
  return (await collection.findOneAndReplace(filter, replacement, translateOptions(opts))).value;
});

operations.set('findOneAndUpdate', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, update, ...opts } = operation.arguments;
  return (await collection.findOneAndUpdate(filter, update, translateOptions(opts))).value;
});

operations.set('findOneAndDelete', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, ...opts } = operation.arguments;
  return (await collection.findOneAndDelete(filter, opts)).value;
});

operations.set('failPoint', async ({ entities, operation }) => {
  const client = entities.getEntity('client', operation.arguments.client);
  return entities.failPoints.enableFailPoint(client, operation.arguments.failPoint);
});

operations.set('insertOne', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { document, ...opts } = operation.arguments;
  return collection.insertOne(document, opts);
});

operations.set('insertMany', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { documents, ...opts } = operation.arguments;
  return collection.insertMany(documents, opts);
});

operations.set('iterateUntilDocumentOrError', async ({ entities, operation }) => {
  try {
    const changeStream = entities.getEntity('stream', operation.object);
    // Either change or error promise will finish
    return Promise.race([
      changeStream.eventCollector.waitAndShiftEvent('change'),
      changeStream.eventCollector.waitAndShiftEvent('error')
    ]);
  } catch (e) {
    const findCursor = entities.getEntity('cursor', operation.object);
    return await findCursor.next();
  }
});

operations.set('listCollections', async ({ entities, operation }) => {
  const db = entities.getEntity('db', operation.object);
  const { filter, ...opts } = operation.arguments;
  return db.listCollections(filter, opts).toArray();
});

operations.set('listDatabases', async ({ entities, operation }) => {
  const client = entities.getEntity('client', operation.object);
  return client.db().admin().listDatabases(operation.arguments);
});

operations.set('listIndexes', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  return collection.listIndexes(operation.arguments).toArray();
});

operations.set('replaceOne', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, replacement, ...opts } = operation.arguments;
  return collection.replaceOne(filter, replacement, opts);
});

operations.set('startTransaction', async ({ entities, operation }) => {
  const session = entities.getEntity('session', operation.object);
  session.startTransaction();
});

operations.set('targetedFailPoint', async ({ entities, operation }) => {
  const session = operation.arguments.session;
  expect(session.isPinned, 'Session must be pinned for a targetedFailPoint').to.be.true;
  const address = session.transaction.isPinned
    ? session.transaction._pinnedServer.s.description.hostAddress
    : session.pinnedConnection.address;

  await entities.failPoints.enableFailPoint(address, operation.arguments.failPoint);
});

operations.set('delete', async ({ entities, operation }) => {
  const bucket = entities.getEntity('bucket', operation.object);
  return bucket.delete(operation.arguments.id);
});

operations.set('download', async ({ entities, operation }) => {
  const bucket = entities.getEntity('bucket', operation.object);

  const stream = bucket.openDownloadStream(operation.arguments.id);
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(...chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(chunks));
  });
});

operations.set('upload', async ({ entities, operation }) => {
  const bucket = entities.getEntity('bucket', operation.object);

  const stream = bucket.openUploadStream(operation.arguments.filename, {
    chunkSizeBytes: operation.arguments.chunkSizeBytes
  });

  return new Promise<ObjectId>((resolve, reject) => {
    stream.end(Buffer.from(operation.arguments.source.$$hexBytes, 'hex'), (error, file) => {
      if (error) reject(error);
      resolve((file as GridFSFile)._id as ObjectId);
    });
  });
});

operations.set('withTransaction', async ({ entities, operation, client }) => {
  const session = entities.getEntity('session', operation.object);

  const options = {
    readConcern: ReadConcern.fromOptions(operation.arguments),
    writeConcern: WriteConcern.fromOptions(operation.arguments),
    readPreference: ReadPreference.fromOptions(operation.arguments),
    maxCommitTimeMS: operation.arguments.maxCommitTimeMS
  };

  return session.withTransaction(async () => {
    for (const callbackOperation of operation.arguments.callback) {
      await executeOperationAndCheck(callbackOperation, entities, client);
    }
  }, options);
});

operations.set('countDocuments', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, ...opts } = operation.arguments;
  return collection.countDocuments(filter, opts);
});

operations.set('deleteMany', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, ...opts } = operation.arguments;
  return collection.deleteMany(filter, opts);
});

operations.set('distinct', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { fieldName, filter, ...opts } = operation.arguments;
  return collection.distinct(fieldName, filter, opts);
});

operations.set('estimatedDocumentCount', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  return collection.estimatedDocumentCount(operation.arguments);
});

operations.set('runCommand', async ({ entities, operation }: OperationFunctionParams) => {
  const db = entities.getEntity('db', operation.object);
  const { command, ...opts } = operation.arguments;
  return db.command(command, opts);
});

operations.set('updateMany', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, update, ...options } = operation.arguments;
  return collection.updateMany(filter, update, options);
});

operations.set('updateOne', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, update, ...options } = operation.arguments;
  return collection.updateOne(filter, update, options);
});

export async function executeOperationAndCheck(
  operation: OperationDescription,
  entities: EntitiesMap,
  client: MongoClient
): Promise<void> {
  const opFunc = operations.get(operation.name);
  expect(opFunc, `Unknown operation: ${operation.name}`).to.exist;

  if (operation.arguments?.session) {
    const session = entities.getEntity('session', operation.arguments.session, false);
    operation.arguments.session = session;
  }

  let result;

  try {
    result = await opFunc({ entities, operation, client });
  } catch (error) {
    if (operation.expectError) {
      expectErrorCheck(error, operation.expectError, entities);
      return;
    } else if (!operation.ignoreResultAndError) {
      throw error;
    }
  }

  // We check the positive outcome here so the try-catch above doesn't catch our chai assertions
  if (operation.ignoreResultAndError) {
    return;
  }

  if (operation.expectError) {
    expect.fail(`Operation ${operation.name} succeeded but was not supposed to`);
  }

  if (operation.expectResult) {
    resultCheck(result, operation.expectResult, entities);
  }

  if (operation.saveResultAsEntity) {
    entities.set(operation.saveResultAsEntity, result);
  }
}
