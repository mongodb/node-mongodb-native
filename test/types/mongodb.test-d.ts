import { expectType, expectDeprecated, expectError } from 'tsd';
import { MongoClient } from '../../src/mongo_client';
import { Collection } from '../../src/collection';
import { AggregationCursor } from '../../src/cursor/aggregation_cursor';
import type { FindCursor } from '../../src/cursor/find_cursor';
import type { Document } from 'bson';
import { Db } from '../../src';
import { Topology } from '../../src/sdam/topology';

// We wish to keep these APIs but continue to ensure they are marked as deprecated.
expectDeprecated(Collection.prototype.insert);
expectDeprecated(Collection.prototype.update);
expectDeprecated(Collection.prototype.remove);
expectDeprecated(Collection.prototype.count);
expectDeprecated(AggregationCursor.prototype.geoNear);
expectDeprecated(Topology.prototype.unref);
expectDeprecated(Db.prototype.unref);

// test mapped cursor types
const client = new MongoClient('');
const coll = client.db('test').collection('test');
const findCursor = coll.find();
expectType<Document | null>(await findCursor.next());
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

const builtCursor = coll.aggregate();
// should allow string values for the out helper
expectType<AggregationCursor<Document>>(builtCursor.out('collection'));
// should also allow an object specifying db/coll (as of MongoDB 4.4)
expectType<AggregationCursor<Document>>(builtCursor.out({ db: 'db', coll: 'collection' }));
// should error on other object shapes
expectError(builtCursor.out({ other: 'shape' }));
// should error on non-object, non-string values
expectError(builtCursor.out(1));
