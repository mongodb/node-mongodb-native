import { expectType } from 'tsd';
import { MongoClient } from '../../../../src/index';

// test collection.countDocuments and collection.count functions
const client = new MongoClient('');
const collection = client.db('test').collection('test.count');

expectType<number>(await collection.countDocuments());
expectType<number>(await collection.countDocuments({ foo: 1 }));
expectType<number>(await collection.countDocuments({ foo: 1 }, { limit: 10 }));
