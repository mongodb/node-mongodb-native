import { expectError, expectType } from 'tsd';

import type {
  ChangeStreamCollModDocument,
  ChangeStreamCreateDocument,
  ChangeStreamCreateIndexDocument,
  ChangeStreamDeleteDocument,
  ChangeStreamDocument,
  ChangeStreamDocumentCommon,
  ChangeStreamDocumentKey,
  ChangeStreamDropDatabaseDocument,
  ChangeStreamDropDocument,
  ChangeStreamDropIndexDocument,
  ChangeStreamInsertDocument,
  ChangeStreamInvalidateDocument,
  ChangeStreamNameSpace,
  ChangeStreamOptions,
  ChangeStreamRefineCollectionShardKeyDocument,
  ChangeStreamRenameDocument,
  ChangeStreamReplaceDocument,
  ChangeStreamReshardCollectionDocument,
  ChangeStreamShardCollectionDocument,
  ChangeStreamUpdateDocument,
  Collection,
  Document,
  ResumeToken,
  ServerSessionId,
  Timestamp,
  UpdateDescription
} from '../mongodb';

declare const changeStreamOptions: ChangeStreamOptions;
type ChangeStreamOperationType =
  | 'insert'
  | 'update'
  | 'replace'
  | 'delete'
  | 'invalidate'
  | 'drop'
  | 'dropDatabase'
  | 'rename'
  | 'create'
  | 'modify'
  | 'createIndexes'
  | 'dropIndexes'
  | 'shardCollection'
  | 'reshardCollection'
  | 'refineCollectionShardKey';

// The change stream spec says that we cannot throw an error for invalid values to `fullDocument`
// for future compatibility.  This means we must leave `fullDocument` as type string.
expectType<string | undefined>(changeStreamOptions.fullDocument);

type Schema = { _id: number; a: number };
declare const change: ChangeStreamDocument<Schema>;

expectType<unknown>(change._id);
expectType<ChangeStreamOperationType>(change.operationType);

// The following are always defined ChangeStreamDocumentCommon
expectType<ChangeStreamDocument extends ChangeStreamDocumentCommon ? true : false>(true);
expectType<ResumeToken>(change._id);
expectType<Timestamp | undefined>(change.clusterTime);
expectType<number | undefined>(change.txnNumber); // Could be a Long if promoteLongs is off
expectType<ServerSessionId | undefined>(change.lsid);
expectType<string | undefined>(change.wallTime);

type CrudChangeDoc =
  | ChangeStreamInsertDocument<Schema> //  C
  | ChangeStreamReplaceDocument<Schema> // R
  | ChangeStreamUpdateDocument<Schema> //  U
  | ChangeStreamDeleteDocument<Schema>; // D
declare const crudChange: CrudChangeDoc;

// ChangeStreamDocumentKey
expectType<CrudChangeDoc extends ChangeStreamDocumentKey<Schema> ? true : false>(true);
expectType<number>(crudChange.documentKey._id); // _id will get typed
expectType<any>(crudChange.documentKey.blah); // shard keys could be anything

// ChangeStreamFullNameSpace
expectType<ChangeStreamNameSpace>(crudChange.ns);
expectType<{ db: string; coll: string }>(crudChange.ns);

switch (change.operationType) {
  case 'insert': {
    expectType<ChangeStreamInsertDocument<Schema>>(change);
    expectType<'insert'>(change.operationType);
    expectType<number>(change.documentKey._id);
    expectType<any>(change.documentKey.blah);
    expectType<Schema>(change.fullDocument);
    break;
  }
  case 'update': {
    expectType<ChangeStreamUpdateDocument<Schema>>(change);
    expectType<'update'>(change.operationType);
    expectType<Schema | undefined>(change.fullDocument); // Update only attaches fullDocument if configured
    expectType<UpdateDescription<Schema>>(change.updateDescription);
    expectType<Partial<Schema> | undefined>(change.updateDescription.updatedFields);
    expectType<string[] | undefined>(change.updateDescription.removedFields);
    expectType<Array<{ field: string; newSize: number }> | undefined>(
      change.updateDescription.truncatedArrays
    );
    break;
  }
  case 'replace': {
    expectType<ChangeStreamReplaceDocument<Schema>>(change);
    expectType<'replace'>(change.operationType);
    expectType<Schema>(change.fullDocument);
    break;
  }
  case 'delete': {
    expectType<ChangeStreamDeleteDocument<Schema>>(change);
    expectType<'delete'>(change.operationType);
    break;
  }
  case 'drop': {
    expectType<ChangeStreamDropDocument>(change);
    expectType<'drop'>(change.operationType);
    expectType<{ db: string; coll: string }>(change.ns);
    break;
  }
  case 'rename': {
    expectType<ChangeStreamRenameDocument>(change);
    expectType<'rename'>(change.operationType);
    expectType<{ db: string; coll: string }>(change.ns);
    expectType<{ db: string; coll: string }>(change.to);
    break;
  }
  case 'dropDatabase': {
    expectType<ChangeStreamDropDatabaseDocument>(change);
    expectType<'dropDatabase'>(change.operationType);
    expectError(change.ns.coll);
    break;
  }
  case 'invalidate': {
    expectType<ChangeStreamInvalidateDocument>(change);
    expectType<'invalidate'>(change.operationType);
    break;
  }
  case 'create': {
    expectType<ChangeStreamCreateDocument>(change);
    expectType<'create'>(change.operationType);
    break;
  }
  case 'modify': {
    expectType<ChangeStreamCollModDocument>(change);
    expectType<'modify'>(change.operationType);
    break;
  }
  case 'createIndexes': {
    expectType<ChangeStreamCreateIndexDocument>(change);
    expectType<'createIndexes'>(change.operationType);
    break;
  }
  case 'dropIndexes': {
    expectType<ChangeStreamDropIndexDocument>(change);
    expectType<'dropIndexes'>(change.operationType);
    break;
  }
  case 'shardCollection': {
    expectType<ChangeStreamShardCollectionDocument>(change);
    expectType<'shardCollection'>(change.operationType);
    break;
  }
  case 'reshardCollection': {
    expectType<ChangeStreamReshardCollectionDocument>(change);
    expectType<'reshardCollection'>(change.operationType);
    break;
  }
  case 'refineCollectionShardKey': {
    expectType<ChangeStreamRefineCollectionShardKeyDocument>(change);
    expectType<'refineCollectionShardKey'>(change.operationType);
    break;
  }
  default: {
    expectType<never>(change);
  }
}

// New fields can be added with $addFields, but you have to use TChange to type it
expectError(change.randomKeyAlwaysAccessibleBecauseOfPipelineFlexibilty);

declare const collectionWithSchema: Collection<Schema>;
const pipelineChangeStream = collectionWithSchema.watch<
  Schema,
  ChangeStreamInsertDocument<Schema> & { comment: string }
>([{ $addFields: { comment: 'big changes' } }, { $match: { operationType: 'insert' } }]);

pipelineChangeStream.on('change', change => {
  expectType<string>(change.comment);
  // No need to narrow in code because the generics did that for us!
  expectType<Schema>(change.fullDocument);
});

collectionWithSchema
  .watch()
  .on('change', change => expectType<ChangeStreamDocument<Schema>>(change));

// Just overriding the schema provides a typed changestream OF that schema
collectionWithSchema
  .watch<Document>()
  .on('change', change => expectType<ChangeStreamDocument<Document>>(change));

// both schema and TChange can be made as flexible as possible (Document)
collectionWithSchema
  .watch<Document, Document>()
  .on('change', change => expectType<Document>(change));

// first argument does not stop you from making second more generic
collectionWithSchema
  .watch<{ a: number }, Document>()
  .on('change', change => expectType<Document>(change));

// Arguments must be objects
expectError(collectionWithSchema.watch<Document, number>());
expectError(collectionWithSchema.watch<number, number>());

// First argument no longer relates to second
collectionWithSchema
  .watch<{ a: number }, { b: boolean }>()
  .on('change', change => expectType<{ b: boolean }>(change));

expectType<AsyncGenerator<ChangeStreamDocument<Schema>, void, void>>(
  collectionWithSchema.watch()[Symbol.asyncIterator]()
);

// Change type returned to user is equivalent across next/tryNext/on/once/addListener
const changeStream = collectionWithSchema.watch();
expectType<ChangeStreamDocument<Schema> | null>(await changeStream.tryNext());
expectType<ChangeStreamDocument<Schema>>(await changeStream.next());
changeStream.on('change', change => expectType<ChangeStreamDocument<Schema>>(change));
changeStream.once('change', change => expectType<ChangeStreamDocument<Schema>>(change));
changeStream.addListener('change', change => expectType<ChangeStreamDocument<Schema>>(change));

declare const noSchemaCollection: Collection;
const changeStreamNoSchema = noSchemaCollection.watch();
expectType<ChangeStreamDocument<Document> | null>(await changeStreamNoSchema.tryNext());
expectType<ChangeStreamDocument<Document>>(await changeStreamNoSchema.next());
changeStreamNoSchema.on('change', change => expectType<ChangeStreamDocument<Document>>(change));
changeStreamNoSchema.once('change', change => expectType<ChangeStreamDocument<Document>>(change));
changeStreamNoSchema.addListener('change', change =>
  expectType<ChangeStreamDocument<Document>>(change)
);
