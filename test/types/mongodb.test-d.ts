import { expectType, expectDeprecated } from 'tsd';
import { MongoClient } from '../../src/mongo_client';
import { Collection } from '../../src/collection';
import { AggregationCursor } from '../../src/cursor/aggregation_cursor';
import type { FindCursor } from '../../src/cursor/find_cursor';
import type { Document } from 'bson';

// We wish to keep these APIs but continue to ensure they are marked as deprecated.
expectDeprecated(Collection.prototype.insert);
expectDeprecated(Collection.prototype.update);
expectDeprecated(Collection.prototype.remove);
expectDeprecated(Collection.prototype.count);
expectDeprecated(AggregationCursor.prototype.geoNear);

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
