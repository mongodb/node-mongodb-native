import type { Document } from 'bson';
import { expectDeprecated, expectError, expectNotDeprecated, expectType } from 'tsd';

import { Db, WithId, WriteConcern, WriteConcernSettings } from '../../src';
import * as MongoDBDriver from '../../src';
import type { ChangeStreamDocument } from '../../src/change_stream';
import { Collection } from '../../src/collection';
import { AggregationCursor } from '../../src/cursor/aggregation_cursor';
import { FindCursor } from '../../src/cursor/find_cursor';
import { MongoClient } from '../../src/mongo_client';
import { Topology } from '../../src/sdam/topology';

// We wish to keep these APIs but continue to ensure they are marked as deprecated.
expectDeprecated(Collection.prototype.insert);
expectDeprecated(Collection.prototype.update);
expectDeprecated(Collection.prototype.remove);
expectDeprecated(Collection.prototype.count);
expectDeprecated(Collection.prototype.mapReduce);
expectDeprecated(AggregationCursor.prototype.geoNear);
expectDeprecated(FindCursor.prototype.count);
expectDeprecated(Topology.prototype.unref);
expectDeprecated(Db.prototype.unref);
expectDeprecated(MongoDBDriver.ObjectID);
expectNotDeprecated(MongoDBDriver.ObjectId);

// We cannot attach a deprecation tag to an export
// We tried export const Promise = PromiseProvider;
// but then api-extractor claims PromiseProvider is not exported
// Instead we've deprecated all the methods on the class
expectNotDeprecated(MongoDBDriver.Promise);
expectDeprecated(MongoDBDriver.Promise.validate);
expectDeprecated(MongoDBDriver.Promise.get);
expectDeprecated(MongoDBDriver.Promise.set);

declare const options: MongoDBDriver.MongoClientOptions;
expectDeprecated(options.w);
expectDeprecated(options.journal);
expectDeprecated(options.wtimeoutMS);
expectDeprecated(options.promiseLibrary);
expectNotDeprecated(options.writeConcern);
expectType<WriteConcernSettings | WriteConcern | undefined>(options.writeConcern);

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
