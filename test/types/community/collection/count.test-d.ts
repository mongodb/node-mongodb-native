import { expectDeprecated, expectType } from 'tsd';

import { MongoClient } from '../../../../src';

// test collection.countDocuments
const client = new MongoClient('');
const collection = client.db('test').collection('test.count');

expectType<number>(await collection.countDocuments());
expectType<number>(await collection.countDocuments({ foo: 1 }));
expectType<number>(await collection.countDocuments({ foo: 1 }, { limit: 10 }));

// Make sure count is deprecated
expectDeprecated(collection.count);
