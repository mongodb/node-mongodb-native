import { expectType, expectNotType, expectError } from 'tsd';

import { Collection } from '../../src/collection';
import { ObjectId } from '../../src/bson';
import { Db } from '../../src/db';
import { MongoClient } from '../../src/mongo_client';

const db = new Db(new MongoClient(''), '');

type InsertRes<TId = ObjectId> = Promise<{ acknowledged: boolean; insertedId: TId }>;

interface RandomKeysToNumberIncludingId {
  _id: number;
  a: number;
  [extraKeys: string]: number;
}
const randomKeysIncludeIdC = new Collection<RandomKeysToNumberIncludingId>(db, '');
expectType<InsertRes<number>>(randomKeysIncludeIdC.insertOne({ a: 2, randomKey: 23, _id: 23 }));
expectError(randomKeysIncludeIdC.insertOne({ a: 2, randomKey: 23 }));
expectError(randomKeysIncludeIdC.insertOne({ _id: 2, randomKey: 'string' }));

////////////////////////////////////////////////////////////////////////////////////////////////////

interface RandomKeysToNumber {
  a: number;
  [extraKeys: string]: number | ObjectId; // if you omit _id, it still needs to be accounted for
}
const randomKeysC = new Collection<RandomKeysToNumber>(db, '');
expectType<InsertRes>(randomKeysC.insertOne({ a: 2, randomKey: 23, _id: new ObjectId() }));
expectType<InsertRes>(randomKeysC.insertOne({ a: 2, randomKey: 23 }));
expectNotType<InsertRes<number>>(
  randomKeysC.insertOne({ a: 2, randomKey: 23, _id: new ObjectId() })
); // You cannot implicitly have an _id of an unusual type
