import { expectError, expectNotAssignable, expectNotType, expectType } from 'tsd';

import { MongoClient, ObjectId, type OptionalId } from '../../../mongodb';
import type { PropExists } from '../../utility_types';

// test collection.insertX functions
const client = new MongoClient('');
const db = client.db('test');

const anyCollection = db.collection('test-any-type');

/**
 * test no collection type ("any")
 */
// test insertOne results
expectType<{ acknowledged: boolean; insertedId: ObjectId }>(
  await anyCollection.insertOne({ a: 2 })
);
// test insertMany results
expectType<{
  acknowledged: boolean;
  insertedIds: { [key: number]: ObjectId };
  insertedCount: number;
}>(await anyCollection.insertMany([{ a: 2 }]));

// should accept _id with ObjectId type
const insertManyWithIdResult = await anyCollection.insertMany([{ _id: new ObjectId(), a: 2 }]);
expectType<number>(insertManyWithIdResult.insertedCount);
expectType<{ [key: number]: ObjectId }>(insertManyWithIdResult.insertedIds);

// should accept any _id type when it is not provided in Schema
// NODE-3342
// await anyCollection.insertMany([{ _id: 12, a: 2 }]);

/**
 * test with collection type
 */
interface TestModel {
  stringField: string;
  numberField?: number;
  fruitTags: string[];
}
type TestModelWithId = TestModel & { _id: ObjectId };
const collection = db.collection<TestModel>('testCollection');

const testDoc: OptionalId<TestModelWithId> = { stringField: 'a', fruitTags: [] };
expectType<Parameters<(typeof collection)['insertOne']>[0]>(testDoc);

const rd_array: ReadonlyArray<TestModel> = [];
await collection.insertMany(rd_array);

const resultOne = await collection.insertOne({
  stringField: 'hola',
  fruitTags: ['Strawberry']
});
const resultMany = await collection.insertMany([
  { stringField: 'hola', fruitTags: ['Apple', 'Lemon'] },
  { stringField: 'hola', numberField: 1, fruitTags: [] }
]);

// test results type
expectType<PropExists<typeof resultMany, 'ops'>>(false);
expectType<PropExists<typeof resultOne, 'ops'>>(false);

// should add a _id field with ObjectId type if it does not exist on collection type
expectType<{ [key: number]: ObjectId }>(resultMany.insertedIds);
expectType<ObjectId>(resultOne.insertedId);

/**
 * test custom _id type
 */
interface TestModelWithCustomId {
  _id: number;
  stringField: string;
  numberField?: number;
  fruitTags: string[];
}
const collectionWithId = db.collection<TestModelWithCustomId>('testCollection');

const resultOneWithId = await collectionWithId.insertOne({
  _id: 1,
  stringField: 'hola',
  fruitTags: ['Strawberry']
});
const resultManyWithId = await collectionWithId.insertMany([
  { _id: 2, stringField: 'hola', fruitTags: ['Apple', 'Lemon'] },
  { _id: 2, stringField: 'hola', numberField: 1, fruitTags: [] }
]);

// should demand _id if it is not ObjectId
expectError(await collectionWithId.insertOne({ stringField: 'hola', fruitTags: ['Strawberry'] }));
expectError(
  await collectionWithId.insertMany([
    { stringField: 'hola', fruitTags: ['Apple', 'Lemon'] },
    { _id: 2, stringField: 'hola', numberField: 1, fruitTags: [] }
  ])
);

// should not accept wrong _id type
expectError(
  await collectionWithId.insertMany([
    { _id: new ObjectId(), stringField: 'hola', fruitTags: ['Apple', 'Lemon'] },
    { _id: 2, stringField: 'hola', numberField: 1, fruitTags: [] }
  ])
);

expectType<PropExists<typeof resultOneWithId, 'ops'>>(false);
expectType<number>(resultOneWithId.insertedId);
expectType<{ [key: number]: number }>(resultManyWithId.insertedIds);

/**
 * test custom _id type (ObjectId)
 */
interface TestModelWithCustomObjectId {
  _id: ObjectId;
  stringField: string;
  numberField?: number;
  fruitTags: string[];
}
const collectionWithObjectId = db.collection<TestModelWithCustomObjectId>('testCollection');

// should accept ObjectId
await collectionWithObjectId.insertOne({
  _id: new ObjectId(),
  stringField: 'hola',
  numberField: 23,
  fruitTags: ['hi']
});
// if _id is defined on the schema, it must be passed to insert operations
expectError(
  collectionWithObjectId.insertOne({
    stringField: 'hola',
    numberField: 23,
    fruitTags: ['hi']
  })
);

// defined _id's that are not of type ObjectId cannot be cast to ObjectId
const collectionWithRequiredNumericId = db.collection<{ _id: number; otherField: string }>(
  'testCollection'
);

expectError(
  collectionWithRequiredNumericId.insertOne({
    _id: new ObjectId(),
    otherField: 'hola'
  })
);

const collectionWithOptionalNumericId = db.collection<{ _id?: number; otherField: string }>(
  'testCollection'
);

expectError(
  collectionWithOptionalNumericId.insertOne({
    _id: new ObjectId(),
    otherField: 'hola'
  })
);

/**
 * test indexed types
 */
interface IndexTypeTestModel {
  stringField: string;
  numberField?: number;
  [key: string]: any;
}
const indexTypeCollection1 = db.collection<IndexTypeTestModel>('testCollection');

const indexTypeResult1 = await indexTypeCollection1.insertOne({
  stringField: 'hola',
  numberField: 23,
  randomField: [34, 54, 32],
  randomField2: 32
});
const indexTypeResultMany1 = await indexTypeCollection1.insertMany([
  { stringField: 'hola', numberField: 0 },
  { _id: new ObjectId(), stringField: 'hola', randomField: [34, 54, 32] }
]);

// should not accept wrong _id type
expectError(
  await indexTypeCollection1.insertMany([{ _id: 12, stringField: 'hola', numberField: 0 }])
);
// should demand missing fields
expectError(await indexTypeCollection1.insertMany([{ randomField: [34, 54, 32] }]));

expectType<PropExists<typeof indexTypeResult1, 'ops'>>(false);

expectType<ObjectId>(indexTypeResult1.insertedId);
expectType<{ [key: number]: ObjectId }>(indexTypeResultMany1.insertedIds);

/**
 * test indexed types with custom _id (not ObjectId)
 */
interface IndexTypeTestModelWithId {
  _id: number;
  stringField: string;
  numberField?: number;
  [key: string]: any;
}
const indexTypeCollection2 = db.collection<IndexTypeTestModelWithId>('testCollection');

const indexTypeResult2 = await indexTypeCollection2.insertOne({
  _id: 1,
  stringField: 'hola',
  numberField: 23,
  randomField: [34, 54, 32],
  randomField2: 32
});
const indexTypeResultMany2 = await indexTypeCollection2.insertMany([
  { _id: 1, stringField: 'hola', numberField: 0 },
  { _id: 2, stringField: 'hola', randomField: [34, 54, 32] }
]);

// should only accept _id type provided in Schema
expectError(
  await indexTypeCollection2.insertOne({
    _id: '12',
    stringField: 'hola',
    numberField: 23,
    randomField: [34, 54, 32],
    randomField2: 32
  })
);

expectError(
  await indexTypeCollection2.insertMany([
    { _id: '1', stringField: 'hola', numberField: 0 },
    { _id: 2, stringField: 'hola', randomField: [34, 54, 32] }
  ])
);

// should demand _id if it is defined and is not ObjectId
expectNotType<OptionalId<IndexTypeTestModelWithId>>({
  stringField: 'hola',
  numberField: 23,
  randomField: [34, 54, 32],
  randomField2: 32
});

expectError(
  await indexTypeCollection2.insertMany([
    { stringField: 'hola', numberField: 0 },
    { _id: 12, stringField: 'hola', randomField: [34, 54, 32] }
  ])
);

expectType<PropExists<typeof indexTypeResult2, 'ops'>>(false);
expectType<PropExists<typeof indexTypeResultMany2, 'ops'>>(false);

expectType<number>(indexTypeResult2.insertedId);
expectType<{ [key: number]: number }>(indexTypeResultMany2.insertedIds);

// Readonly Tests -- NODE-3452
const colorsColl = client.db('test').collection<{ colors: string[] }>('writableColors');
const colorsFreeze: ReadonlyArray<string> = Object.freeze(['blue', 'red']);
// Users must define their properties as readonly if they want to be able to insert readonly
type InsertOneParam = Parameters<typeof colorsColl.insertOne>[0];
expectNotAssignable<InsertOneParam>({ colors: colorsFreeze });
// Correct usage:
const rdOnlyColl = client
  .db('test')
  .collection<{ colors: ReadonlyArray<string> }>('readonlyColors');
rdOnlyColl.insertOne({ colors: colorsFreeze });
const colorsWritable = ['a', 'b'];
rdOnlyColl.insertOne({ colors: colorsWritable });
