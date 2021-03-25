import { expectDeprecated, expectType, expectNotType, expectError, expectAssignable } from 'tsd';

import { Collection } from '../../.../../../src/collection';
import { AggregationCursor } from '../../../src/cursor/aggregation_cursor';
import { Db } from '../../../src/db';
import { MongoError } from '../../../src/error';
import { MongoClient } from '../../../src/mongo_client';

expectDeprecated(Collection.prototype.insert);
expectDeprecated(Collection.prototype.update);
expectDeprecated(Collection.prototype.remove);
expectDeprecated(Collection.prototype.count);
expectDeprecated(MongoError.create);
expectDeprecated(AggregationCursor.prototype.geoNear);

const db = new Db(new MongoClient(''), '');

expectType<Collection<{ a: number }>>(db.collection<{ a: number }>(''));
