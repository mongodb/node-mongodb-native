import { expectType, expectError, expectNotType } from 'tsd';

import { Collection } from '../../.../../../src/collection';
import { ObjectId } from '../../../src/bson';
import { Db } from '../../../src/db';
import { MongoClient } from '../../../src/mongo_client';

type InsertRes<TId = ObjectId> = Promise<{ acknowledged: boolean; insertedId: TId }>;

const db = new Db(new MongoClient(''), '');

interface Circle {
  _id: ObjectId;
  radius: number;
}
interface Rectangle {
  _id: ObjectId;
  height: number;
  width: number;
}
type Shape = Circle | Rectangle;

type c = Collection<Shape>;
type i = Parameters<c['insertOne']>[0];

const shapesC = new Collection<Shape>(db, '');
expectType<InsertRes>(shapesC.insertOne({ radius: 4 }));
expectError(
  shapesC.insertOne({ radius: 4, extraKey: 'I should not be allowed', _id: new ObjectId() })
);
expectType<InsertRes>(shapesC.insertOne({ height: 4, width: 4 }));
expectType<Promise<Shape>>(shapesC.findOne({ height: 4, width: 4 }));
expectNotType<Promise<Rectangle>>(shapesC.findOne({ height: 4, width: 4 })); // collection API can only respect TSchema given

interface A {
  _id: number;
}
interface B {
  _id: string;
}
type Data = A | B;
const dataC = db.collection<Data>('');
expectType<InsertRes<number | string>>(dataC.insertOne({ _id: 2 }));
expectType<InsertRes<number | string>>(dataC.insertOne({ _id: 'hi' }));
