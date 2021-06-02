import { expectType, expectDeprecated } from 'tsd';

import { MongoClient } from '../../src/mongo_client';
import { Collection } from '../../src/collection';
import { AggregationCursor } from '../../src/cursor/aggregation_cursor';
import { FindCursor } from '../../src/cursor/find_cursor';

import { MongoError } from '../../src/error';

// We wish to keep these APIs but continue to ensure they are marked as deprecated.
expectDeprecated(Collection.prototype.insert);
expectDeprecated(Collection.prototype.update);
expectDeprecated(Collection.prototype.remove);
expectDeprecated(Collection.prototype.count);
expectDeprecated(MongoError.create);
expectDeprecated(AggregationCursor.prototype.geoNear);

// test mapped cursor types
const client = new MongoClient('mongodb://localhost:27017');
const coll = client.db('test').collection('test');
const findCursor = coll.find();
expectType<Promise<Document>>(findCursor.next());
const mappedFind = findCursor.map<number>(obj => Object.keys(obj).length);
expectType<FindCursor<number>>(mappedFind);
expectType<Promise<number>>(mappedFind.next());
const aggCursor = coll.aggregate();
expectType<Promise<Document>>(aggCursor.next());
const mappedAgg = aggCursor.map<number>(obj => Object.keys(obj).length);
expectType<AggregationCursor<number>>(mappedAgg);
expectType<Promise<number>>(mappedAgg.next());
