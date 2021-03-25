import { expectType } from 'tsd';

import { Collection } from '../../src/collection';
import type { ObjectId } from '../../src/bson';
import { Db } from '../../src/db';
import { MongoClient } from '../../src/mongo_client';
import type { InferIdType } from '../../src/mongo_types';

const db = new Db(new MongoClient(''), '');

type InsertRes<TId = ObjectId> = Promise<{ acknowledged: boolean; insertedId: TId }>;

////////////////////////////////////////////////////////////////////////////////////////////////////
// Can defined Schema without _id
expectType<Collection<{ a: number }>>(new Collection<{ a: number }>(db, ''));

////////////////////////////////////////////////////////////////////////////////////////////////////
// Simple Schema
const simpleC = new Collection<{ a: number; _id: ObjectId }>(db, '');
expectType<InsertRes>(simpleC.insertOne({ a: 2 }));

////////////////////////////////////////////////////////////////////////////////////////////////////
// CustomType _id Schema
class MyId {
  uuid!: number;
}
interface CustomIdType {
  a: number;
  _id: MyId;
}
const customIdTypeC = new Collection<CustomIdType>(db, '');
type IdType = InferIdType<CustomIdType>;
expectType<IdType>(new MyId());
expectType<InsertRes<MyId>>(customIdTypeC.insertOne({ a: 2, _id: new MyId() }));
