/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect } from 'chai';
import { Collection, Db, GridFSFile, MongoClient, ObjectId } from '../../../index';
import ReadConcern from '../../../lib/read_concern';
import ReadPreference from '../../../lib/core/topologies/read_preference';
import WriteConcern from '../../../lib/write_concern';
import { EventCollector } from '../../tools/utils';
import { EntitiesMap } from './entities';
import { expectErrorCheck, resultCheck } from './match';
import type { OperationDescription, Document } from './schema';
import { CommandStartedEvent } from '../../../lib/core/connection/apm';
import { translateOptions } from './unified-utils';

export interface WriteConcernSettings {
  /** The write concern */
  w?: number | 'majority';
  /** The write concern timeout */
  wtimeoutMS?: number;
  /** The journal write concern */
  journal?: boolean;

  // legacy options
  /** The journal write concern */
  j?: boolean;
  /** The write concern timeout */
  wtimeout?: number;
  /** The file sync write concern */
  fsync?: boolean | 1;
}

export interface WriteConcernOptions {
  /** Write Concern as an object */
  writeConcern?: WriteConcern | WriteConcernSettings;
}

export declare interface SerializeOptions {
  /** the serializer will check if keys are valid. */
  checkKeys?: boolean;
  /** serialize the javascript functions **(default:false)**. */
  serializeFunctions?: boolean;
  /** serialize will not emit undefined fields **(default:true)** */
  ignoreUndefined?: boolean;
  /* Excluded from this release type: minInternalBufferSize */
  /** the index in the buffer where we wish to start serializing into */
  index?: number;
}

export interface BSONSerializeOptions extends Omit<SerializeOptions, 'index'> {
  /** Return document results as raw BSON buffers */
  fieldsAsRaw?: { [key: string]: boolean };
  /** Promotes BSON values to native types where possible, set to false to only receive wrapper types */
  promoteValues?: boolean;
  /** Promotes Binary BSON values to native Node Buffers */
  promoteBuffers?: boolean;
  /** Promotes long values to number if they fit inside the 53 bits resolution */
  promoteLongs?: boolean;
  /** Serialize functions on any object */
  serializeFunctions?: boolean;
  /** Specify if the BSON serializer should ignore undefined fields */
  ignoreUndefined?: boolean;

  raw?: boolean;
}

export interface InsertOneOptions extends BSONSerializeOptions, WriteConcernOptions {
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
  /** Force server to assign _id values instead of driver. */
  forceServerObjectId?: boolean;
}


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
  return dbOrCollection
    .aggregate(operation.arguments.pipeline, {
      allowDiskUse: operation.arguments.allowDiskUse,
      batchSize: operation.arguments.batchSize,
      bypassDocumentValidation: operation.arguments.bypassDocumentValidation,
      maxTimeMS: operation.arguments.maxTimeMS,
      maxAwaitTimeMS: operation.arguments.maxAwaitTimeMS,
      collation: operation.arguments.collation,
      hint: operation.arguments.hint,
      out: operation.arguments.out
    })
    .toArray();
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
  expect(client.observedEvents.includes('commandStarted')).to.be.true;

  const startedEvents = client.events.filter(
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
  expect(client.observedEvents.includes('commandStarted')).to.be.true;

  const startedEvents = client.events.filter(
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
  const session = entities.getEntity('session', operation.arguments.session);
  expect(session.serverSession.isDirty).to.be.true;
});

operations.set('assertSessionNotDirty', async ({ entities, operation }) => {
  const session = entities.getEntity('session', operation.arguments.session);
  expect(session.serverSession.isDirty).to.be.false;
});

operations.set('assertSessionPinned', async ({ entities, operation }) => {
  const session = entities.getEntity('session', operation.arguments.session);
  expect(session.transaction.isPinned).to.be.true;
});

operations.set('assertSessionUnpinned', async ({ entities, operation }) => {
  const session = entities.getEntity('session', operation.arguments.session);
  expect(session.transaction.isPinned).to.be.false;
});

operations.set('assertSessionTransactionState', async ({ entities, operation }) => {
  const session = entities.getEntity('session', operation.arguments.session);

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

operations.set('bulkWrite', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  return collection.bulkWrite(operation.arguments.requests);
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
    batchSize: operation.arguments.batchSize
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
  const session = entities.getEntity('session', operation.arguments.session, false);
  await db.createCollection(operation.arguments.collection, { session });
});

operations.set('createIndex', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const session = entities.getEntity('session', operation.arguments.session, false);
  await collection.createIndex(operation.arguments.keys, {
    session,
    name: operation.arguments.name
  });
});

operations.set('deleteOne', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  return collection.deleteOne(operation.arguments.filter);
});

operations.set('dropCollection', async ({ entities, operation }) => {
  const db = entities.getEntity('db', operation.object);
  return await db.dropCollection(operation.arguments.collection);
});

operations.set('endSession', async ({ entities, operation }) => {
  const session = entities.getEntity('session', operation.object);
  return session.endSession();
});

operations.set('find', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, sort, batchSize, limit } = operation.arguments;
  return collection.find(filter, { sort, batchSize, limit }).toArray();
});

operations.set('findOneAndReplace', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, replacement, ...opts } = operation.arguments;
  return collection.findOneAndReplace(filter, replacement, translateOptions(opts));
});

operations.set('findOneAndUpdate', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  const { filter, update, ...opts } = operation.arguments;
  return (await collection.findOneAndUpdate(filter, update, translateOptions(opts))).value;
});

operations.set('failPoint', async ({ entities, operation }) => {
  const client = entities.getEntity('client', operation.arguments.client);
  return entities.failPoints.enableFailPoint(client, operation.arguments.failPoint);
});

operations.set('insertOne', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);

  const session = entities.getEntity('session', operation.arguments.session, false);

  const options = {
    session
  } as InsertOneOptions;

  return collection.insertOne(operation.arguments.document, options);
});

operations.set('insertMany', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);

  const session = entities.getEntity('session', operation.arguments.session, false);

  const options = {
    session,
    ordered: operation.arguments.ordered ?? true
  };

  return collection.insertMany(operation.arguments.documents, options);
});

operations.set('iterateUntilDocumentOrError', async ({ entities, operation }) => {
  const changeStream = entities.getEntity('stream', operation.object);
  // Either change or error promise will finish
  return Promise.race([
    changeStream.eventCollector.waitAndShiftEvent('change'),
    changeStream.eventCollector.waitAndShiftEvent('error')
  ]);
});

operations.set('listDatabases', async ({ entities, operation }) => {
  const client = entities.getEntity('client', operation.object);
  return client.db().admin().listDatabases();
});

operations.set('replaceOne', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  return collection.replaceOne(operation.arguments.filter, operation.arguments.replacement, {
    bypassDocumentValidation: operation.arguments.bypassDocumentValidation,
    collation: operation.arguments.collation,
    hint: operation.arguments.hint,
    upsert: operation.arguments.upsert
  });
});

operations.set('startTransaction', async ({ entities, operation }) => {
  const session = entities.getEntity('session', operation.object);
  session.startTransaction();
});

operations.set('targetedFailPoint', async ({ entities, operation }) => {
  const session = entities.getEntity('session', operation.arguments.session);
  expect(session.transaction.isPinned, 'Session must be pinned for a targetedFailPoint').to.be.true;

  let address: string
  if(session.transaction._pinnedServer.s.description)
    address = session.transaction._pinnedServer.s.description.address
  if(session.transaction._pinnedServer.s.serverDescription)
    address = session.transaction._pinnedServer.s.serverDescription.address

  expect(address).to.exist;

  await entities.failPoints.enableFailPoint(
    address,
    operation.arguments.failPoint
  );
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
  return collection.countDocuments(operation.arguments.filter as Document);
});

operations.set('deleteMany', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  return collection.deleteMany(operation.arguments.filter);
});

operations.set('distinct', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  return collection.distinct(
    operation.arguments.fieldName as string,
    operation.arguments.filter as Document
  );
});

operations.set('estimatedDocumentCount', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  return collection.estimatedDocumentCount(operation.arguments);
});

operations.set('findOneAndDelete', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  return collection.findOneAndDelete(operation.arguments.filter);
});

operations.set('runCommand', async ({ entities, operation }: OperationFunctionParams) => {
  const db = entities.getEntity('db', operation.object);
  return db.command(operation.arguments.command);
});

operations.set('updateMany', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  return collection.updateMany(operation.arguments.filter, operation.arguments.update);
});

operations.set('updateOne', async ({ entities, operation }) => {
  const collection = entities.getEntity('collection', operation.object);
  return collection.updateOne(operation.arguments.filter, operation.arguments.update);
});

export async function executeOperationAndCheck(
  operation: OperationDescription,
  entities: EntitiesMap,
  client: MongoClient
): Promise<void> {
  const opFunc = operations.get(operation.name);
  expect(opFunc, `Unknown operation: ${operation.name}`).to.exist;

  let result;

  try {
    result = await opFunc({ entities, operation, client });
  } catch (error) {
    if (operation.expectError) {
      expectErrorCheck(error, operation.expectError, entities);
      return;
    } else {
      throw error;
    }
  }

  // We check the positive outcome here so the try-catch above doesn't catch our chai assertions

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
