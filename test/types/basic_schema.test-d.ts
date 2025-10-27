import { expectAssignable, expectNotAssignable, expectNotType, expectType } from 'tsd';

import { Collection, Db, type Document, type InferIdType, MongoClient, ObjectId } from '../../src';

const db = new Db(new MongoClient(''), '');

type ACounter = { a: number };
type ACounterWithId = { a: number; _id: ObjectId };

////////////////////////////////////////////////////////////////////////////////////////////////////
// Can define Schema without _id
expectType<Collection<ACounter>>(new Collection<ACounter>(db, ''));
// Or with one
expectType<Collection<ACounterWithId>>(new Collection<ACounterWithId>(db, ''));

////////////////////////////////////////////////////////////////////////////////////////////////////
// Simple Schema that does not define an _id
// With _id
type InsertOneArgOf<S extends Document> = Parameters<Collection<S>['insertOne']>[0];
expectAssignable<InsertOneArgOf<ACounter>>({ _id: new ObjectId(), a: 3 });
// Without _id
expectAssignable<InsertOneArgOf<ACounter>>({ a: 3 });
// Does not permit extra keys
expectNotType<InsertOneArgOf<ACounter>>({ a: 2, b: 34 });
////////////////////////////////////////////////////////////////////////////////////////////////////
// Simple Schema that does define an _id
// With _id
expectAssignable<InsertOneArgOf<ACounterWithId>>({ _id: new ObjectId(), a: 3 });
// Without _id
expectNotAssignable<InsertOneArgOf<ACounterWithId>>({ a: 3 });
// Does not permit extra keys
expectNotType<InsertOneArgOf<ACounterWithId>>({ a: 2, b: 34 });

////////////////////////////////////////////////////////////////////////////////////////////////////
// CustomType _id Schema (behavior change)
// _id that is a custom type must be generated client side, so it is required
class MyId {
  uuid!: number;
}
interface CustomIdType {
  a: number;
  _id: MyId;
}
type customIdCollection = Collection<CustomIdType>;
type insertOneArg = Parameters<customIdCollection['insertOne']>[0];

// inferring the _id type is straight forward for a schema like this
type IdType = InferIdType<CustomIdType>;
expectType<IdType>(new MyId());

// _id is a required field since it isn't an ObjectId
expectAssignable<insertOneArg>({ a: 2, _id: new MyId() });
expectNotType<insertOneArg>({ a: 2 });

////////////////////////////////////////////////////////////////////////////////////////////////////
// InferIdType -
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type Empty = {};
const a: never = 0 as never;
const oid = new ObjectId();
expectType<InferIdType<Empty>>(oid); // Empty schema gets the implicit _id
expectType<InferIdType<{ _id: Empty }>>(a); // Empty object as an oid resolves to never, while this is a valid _id, it is likely undesirable
expectType<InferIdType<{ _id: { a: number } }>>({ a: 3 }); // embedded documents are permitted as _id fields
