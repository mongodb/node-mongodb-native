import { expectType } from 'tsd';

import { MongoClient, type ObjectId } from '../../../mongodb';

// test collection.distinct functions
interface Collection {
  foo: number;
  nested: { num: number };
  array: string[];
  readonlyArray: ReadonlyArray<string>;
  test: string;
}

const client = new MongoClient('');
const collection = client.db('test').collection<Collection>('test.distinct');

expectType<string[]>(await collection.distinct('test'));
expectType<string[]>(await collection.distinct('test', { foo: 1 }));
expectType<string[]>(await collection.distinct('test', { foo: 1 }, { maxTimeMS: 400 }));

expectType<ObjectId[]>(await collection.distinct('_id'));
expectType<ObjectId[]>(await collection.distinct('_id', { foo: 1 }));
expectType<ObjectId[]>(await collection.distinct('_id', { foo: 1 }, { maxTimeMS: 400 }));

expectType<any[]>(await collection.distinct('nested.num'));
expectType<any[]>(await collection.distinct('nested.num', { foo: 1 }));
expectType<any[]>(await collection.distinct('nested.num', { foo: 1 }, { maxTimeMS: 400 }));

expectType<string[]>(await collection.distinct('array'));
expectType<string[]>(await collection.distinct('array', { foo: 1 }));
expectType<string[]>(await collection.distinct('array', { foo: 1 }, { maxTimeMS: 400 }));

expectType<string[]>(await collection.distinct('readonlyArray'));
expectType<string[]>(await collection.distinct('readonlyArray', { foo: 1 }));
expectType<string[]>(await collection.distinct('readonlyArray', { foo: 1 }, { maxTimeMS: 400 }));
