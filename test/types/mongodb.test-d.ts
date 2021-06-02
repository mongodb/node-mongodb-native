import { expectType, expectDeprecated } from 'tsd';

import { MongoClient } from '../../src/mongo_client';
import { Collection } from '../../src/collection';
import { AggregationCursor } from '../../src/cursor/aggregation_cursor';
import type { FindCursor } from '../../src/cursor/find_cursor';
import type { Document } from 'bson';

import { MongoError } from '../../src/error';

// We wish to keep these APIs but continue to ensure they are marked as deprecated.
expectDeprecated(Collection.prototype.insert);
expectDeprecated(Collection.prototype.update);
expectDeprecated(Collection.prototype.remove);
expectDeprecated(Collection.prototype.count);
expectDeprecated(MongoError.create);
expectDeprecated(AggregationCursor.prototype.geoNear);

// test mapped cursor types
const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
const coll = client.db('test').collection('test');
const findCursor = coll.find();
expectType<Promise<Document | null>>(findCursor.next());
const mappedFind = findCursor.map<number>(obj => Object.keys(obj).length);
expectType<FindCursor<number>>(mappedFind);
expectType<Promise<number | null>>(mappedFind.next());
expectType<Promise<number[]>>(mappedFind.toArray());
const aggCursor = coll.aggregate();
expectType<Promise<Document | null>>(aggCursor.next());
const mappedAgg = aggCursor.map<number>(obj => Object.keys(obj).length);
expectType<AggregationCursor<number>>(mappedAgg);
expectType<Promise<number | null>>(mappedAgg.next());
expectType<Promise<number[]>>(mappedAgg.toArray());
const composedMap = mappedAgg.map<string>(x => x.toString());
expectType<AggregationCursor<string>>(composedMap);
expectType<Promise<string | null>>(composedMap.next());
expectType<Promise<string[]>>(composedMap.toArray());
