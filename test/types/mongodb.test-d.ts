import type { Document } from 'bson';
import { expectDeprecated, expectError, expectNotDeprecated, expectType } from 'tsd';

import type { WithId, WriteConcern, WriteConcernSettings } from '../../src';
import * as MongoDBDriver from '../../src';
import {
  type AggregationCursor,
  type ChangeStreamDocument,
  Collection,
  FindCursor,
  MongoClient
} from '../mongodb';

// We wish to keep these APIs but continue to ensure they are marked as deprecated.
expectDeprecated(Collection.prototype.count);
expectDeprecated(FindCursor.prototype.count);
expectNotDeprecated(MongoDBDriver.ObjectId);

declare const options: MongoDBDriver.MongoClientOptions;
expectDeprecated(options.w);
expectDeprecated(options.journal);
expectDeprecated(options.wtimeoutMS);
expectDeprecated(options.socketTimeoutMS);
expectDeprecated(options.waitQueueTimeoutMS);
expectNotDeprecated(options.writeConcern);
expectNotDeprecated(options.serverSelectionTimeoutMS);
expectNotDeprecated(options.connectTimeoutMS);

expectType<WriteConcernSettings | WriteConcern | undefined>(options.writeConcern);

declare const estimatedDocumentCountOptions: MongoDBDriver.EstimatedDocumentCountOptions;
expectDeprecated(estimatedDocumentCountOptions.maxTimeMS);

declare const countOptions: MongoDBDriver.CountOptions;
expectDeprecated(countOptions.maxTimeMS);

declare const commandOptions: MongoDBDriver.CommandOperationOptions;
expectDeprecated(commandOptions.maxTimeMS);

declare const aggregateOptions: MongoDBDriver.AggregateOptions;
expectDeprecated(aggregateOptions.maxTimeMS);

declare const runCommandCursor: MongoDBDriver.RunCommandCursor;
expectDeprecated(runCommandCursor.setMaxTimeMS);
expectDeprecated(runCommandCursor.maxTimeMS);

declare const cursorOptions: MongoDBDriver.AbstractCursorOptions;
expectDeprecated(cursorOptions.maxTimeMS);

declare const abstractCursor: MongoDBDriver.AbstractCursor;
expectDeprecated(abstractCursor.maxTimeMS);

declare const txnOptions: MongoDBDriver.TransactionOptions;
expectDeprecated(txnOptions.maxCommitTimeMS);

interface TSchema extends Document {
  name: string;
}

// test mapped cursor types
const client = new MongoClient('');
const db = client.db('test');
const coll = db.collection('test');
const findCursor = coll.find();
expectType<WithId<Document> | null>(await findCursor.next());
const mappedFind = findCursor.map<number>(obj => Object.keys(obj).length);
expectType<FindCursor<number>>(mappedFind);
expectType<number | null>(await mappedFind.next());
expectType<number[]>(await mappedFind.toArray());
const aggCursor = coll.aggregate();
expectType<Document | null>(await aggCursor.next());
const mappedAgg = aggCursor.map<number>(obj => Object.keys(obj).length);
expectType<AggregationCursor<number>>(mappedAgg);
expectType<number | null>(await mappedAgg.next());
expectType<number[]>(await mappedAgg.toArray());
const composedMap = mappedAgg.map<string>(x => x.toString());
expectType<AggregationCursor<string>>(composedMap);
expectType<string | null>(await composedMap.next());
expectType<string[]>(await composedMap.toArray());
const tschemaColl = db.collection<TSchema>('test');
const changeStream = tschemaColl.watch();
changeStream.on('init', doc => {
  expectType<any>(doc); // raw response object
});
changeStream.on('more', doc => {
  expectType<any>(doc); // raw response object
});
changeStream.on('change', doc => {
  expectType<ChangeStreamDocument<TSchema>>(doc);
});

const builtCursor = coll.aggregate();
// should allow string values for the out helper
expectType<AggregationCursor<Document>>(builtCursor.out('collection'));
// should also allow an object specifying db/coll (as of MongoDB 4.4)
expectType<AggregationCursor<Document>>(builtCursor.out({ db: 'db', coll: 'collection' }));
// should error on other object shapes
expectError(builtCursor.out({ other: 'shape' }));
// should error on non-object, non-string values
expectError(builtCursor.out(1));
