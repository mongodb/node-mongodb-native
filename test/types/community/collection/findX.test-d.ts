import { expectAssignable, expectNotType, expectType } from 'tsd';

import type { Projection, ProjectionOperators } from '../../../../src';
import {
  Collection,
  Db,
  Document,
  FindCursor,
  FindOptions,
  MongoClient,
  ObjectId,
  WithId
} from '../../../../src';
import type { PropExists } from '../../utility_types';

// collection.findX tests
const client = new MongoClient('');
const db = client.db('test');
const collection = db.collection('test.find');

// Locate all the entries using find
collection.find({}).toArray((_err, fields) => {
  expectType<WithId<Document>[] | undefined>(fields);
  if (fields) {
    expectType<ObjectId>(fields[0]._id);
    expectNotType<ObjectId | undefined>(fields[0]._id);
  }
});

// test with collection type
interface TestModel {
  stringField: string;
  numberField?: number;
  fruitTags: string[];
  readonlyFruitTags: readonly string[];
}

const collectionT = db.collection<TestModel>('testCollection');
collectionT.find({
  $and: [{ numberField: { $gt: 0 } }, { numberField: { $lt: 100 } }],
  readonlyFruitTags: { $all: ['apple', 'pear'] }
});
expectType<FindCursor<WithId<TestModel>>>(collectionT.find({}));

await collectionT.findOne(
  {},
  {
    projection: {},
    sort: {}
  }
);

const optionsWithComplexProjection: FindOptions = {
  projection: {
    stringField: { $meta: 'textScore' },
    fruitTags: { $min: 'fruitTags' },
    max: { $max: ['$max', 0] }
  },
  sort: { stringField: -1, text: { $meta: 'textScore' }, notExistingField: -1 }
};

await collectionT.findOne({}, optionsWithComplexProjection);

// test with discriminated union type
interface DUModelEmpty {
  type: 'empty';
}
interface DUModelString {
  type: 'string';
  value: string;
}
type DUModel = DUModelEmpty | DUModelString;
const collectionDU = db.collection<DUModel>('testDU');
const duValue = await collectionDU.findOne({});
if (duValue && duValue.type === 'string') {
  // we can still narrow the result
  // permitting fetching other keys that haven't been asserted in the if stmt
  expectType<string>(duValue.value);
}

// collection.findX<T>() generic tests
interface Bag {
  cost: number;
  color: string;
}

const collectionBag = db.collection<Bag>('bag');

const cursor: FindCursor<WithId<Bag>> = collectionBag.find({ color: 'black' });

cursor.toArray((_err, bags) => {
  expectType<WithId<Bag>[] | undefined>(bags);
});

cursor.forEach(
  bag => {
    expectType<WithId<Bag>>(bag);
  },
  () => {
    return null;
  }
);

expectType<WithId<Bag> | null>(
  await collectionBag.findOne({ color: 'red' }, { projection: { cost: 1 } })
);

const overrideFind = await collectionBag.findOne<{ cost: number }>(
  { color: 'white' },
  { projection: { cost: 1 } }
);
expectType<PropExists<typeof overrideFind, 'color'>>(false);

// Overriding findOne, makes the return that exact type
expectType<{ cost: number } | null>(
  await collectionBag.findOne<{ cost: number }>({ color: 'red' }, { projection: { cost: 1 } })
);

// NODE-3468 The generic in find and findOne no longer affect the filter type
type Pet = { type: string; age: number };
const pets = db.collection<Pet>('pets');

expectType<{ crazy: number }[]>(
  await pets.find<{ crazy: number }>({ type: 'dog', age: 1 }).toArray()
);

interface Car {
  make: string;
}
interface House {
  windows: number;
}

const car = db.collection<Car>('car');

expectNotType<House | null>(await car.findOne({}));

interface Car {
  make: string;
}

function printCar(car: Car | null) {
  console.log(car ? `A car of ${car.make} make` : 'No car');
}

const options: FindOptions = {};
const optionsWithProjection: FindOptions = {
  projection: {
    make: 1
  }
};

// this is changed in NODE-3454 to be the opposite test since Projection is flexible now
expectAssignable<FindOptions>({
  projection: {
    make: 'invalid'
  }
});

printCar(await car.findOne({}, options));
printCar(await car.findOne({}, optionsWithProjection));

// Readonly tests -- NODE-3452
const colorCollection = client.db('test_db').collection<{ color: string }>('test_collection');
const colorsFreeze: ReadonlyArray<string> = Object.freeze(['blue', 'red']);
const colorsWritable: Array<string> = ['blue', 'red'];

// Permitted Readonly fields
expectType<FindCursor<WithId<{ color: string }>>>(
  colorCollection.find({ color: { $in: colorsFreeze } })
);
expectType<FindCursor<WithId<{ color: string }>>>(
  colorCollection.find({ color: { $in: colorsWritable } })
);
expectType<FindCursor<WithId<{ color: string }>>>(
  colorCollection.find({ color: { $nin: colorsFreeze } })
);
expectType<FindCursor<WithId<{ color: string }>>>(
  colorCollection.find({ color: { $nin: colorsWritable } })
);
// $all and $elemMatch works against single fields (it's just redundant)
expectType<FindCursor<WithId<{ color: string }>>>(
  colorCollection.find({ color: { $all: colorsFreeze } })
);
expectType<FindCursor<WithId<{ color: string }>>>(
  colorCollection.find({ color: { $all: colorsWritable } })
);
expectType<FindCursor<WithId<{ color: string }>>>(
  colorCollection.find({ color: { $elemMatch: colorsFreeze } })
);
expectType<FindCursor<WithId<{ color: string }>>>(
  colorCollection.find({ color: { $elemMatch: colorsWritable } })
);

const countCollection = client.db('test_db').collection<{ count: number }>('test_collection');
expectType<FindCursor<WithId<{ count: number }>>>(
  countCollection.find({ count: { $bitsAnySet: Object.freeze([1, 0, 1]) } })
);
expectType<FindCursor<WithId<{ count: number }>>>(
  countCollection.find({ count: { $bitsAnySet: [1, 0, 1] as number[] } })
);

const listsCollection = client.db('test_db').collection<{ lists: string[] }>('test_collection');
await listsCollection.updateOne({}, { list: { $pullAll: Object.freeze(['one', 'two']) } });
expectType<FindCursor<WithId<{ lists: string[] }>>>(listsCollection.find({ lists: { $size: 1 } }));

const rdOnlyListsCollection = client
  .db('test_db')
  .collection<{ lists: ReadonlyArray<string> }>('test_collection');
expectType<FindCursor<WithId<{ lists: ReadonlyArray<string> }>>>(
  rdOnlyListsCollection.find({ lists: { $size: 1 } })
);

// Before NODE-3452's fix we would get this strange result that included the filter shape joined with the actual schema
expectNotType<FindCursor<{ color: string | { $in: ReadonlyArray<string> } }>>(
  colorCollection.find({ color: { $in: colorsFreeze } })
);

// NODE-3454: Using the incorrect $in value doesn't mess with the resulting schema
expectNotType<FindCursor<{ color: { $in: number } }>>(
  colorCollection.find({ color: { $in: 3 as any } }) // `as any` is to let us make this mistake and still show the result type isn't broken
);
expectType<FindCursor<WithId<{ color: string }>>>(
  colorCollection.find({ color: { $in: 3 as any } })
);

// When you use the override, $in doesn't permit readonly
colorCollection.find<{ color: string }>({ color: { $in: colorsFreeze } });
colorCollection.find<{ color: string }>({ color: { $in: ['regularArray'] } });

// This is a regression test that we don't remove the unused generic in FindOptions
const findOptions: FindOptions<{ a: number }> = {};
expectType<FindOptions>(findOptions);
// This is just to check that we still export these type symbols
expectAssignable<Projection>({});
expectAssignable<ProjectionOperators>({});

// Ensure users can create a custom Db type that only contains specific
// collections (which are, in turn, strongly typed):
type Person = {
  name: 'alice' | 'bob';
  age: number;
};

type Thing = {
  location: 'shelf' | 'cupboard';
};

interface TypedDb extends Db {
  collection(name: 'people'): Collection<Person>;
  collection(name: 'things'): Collection<Thing>;
}

const typedDb = client.db('test2') as TypedDb;

const person = typedDb.collection('people').findOne({});
expectType<Promise<WithId<Person> | null>>(person);

typedDb.collection('people').findOne({}, function (_err, person) {
  expectType<WithId<Person> | null | undefined>(person); // null is if nothing is found, undefined is when there is an error defined
});

typedDb.collection('things').findOne({}, function (_err, thing) {
  expectType<WithId<Thing> | null | undefined>(thing);
});

interface SchemaWithTypicalId {
  _id: ObjectId;
  name: string;
}
const schemaWithTypicalIdCol = db.collection<SchemaWithTypicalId>('a');
expectType<WithId<SchemaWithTypicalId> | null>(await schemaWithTypicalIdCol.findOne());
expectAssignable<SchemaWithTypicalId | null>(await schemaWithTypicalIdCol.findOne());
// should allow _id as an ObjectId
await schemaWithTypicalIdCol.findOne({ _id: new ObjectId() });
schemaWithTypicalIdCol.find({ _id: new ObjectId() });

interface SchemaWithOptionalTypicalId {
  _id?: ObjectId;
  name: string;
}
const schemaWithOptionalTypicalId = db.collection<SchemaWithOptionalTypicalId>('a');
expectType<WithId<SchemaWithOptionalTypicalId> | null>(await schemaWithOptionalTypicalId.findOne());
expectAssignable<SchemaWithOptionalTypicalId | null>(await schemaWithOptionalTypicalId.findOne());
// should allow _id as an ObjectId
await schemaWithTypicalIdCol.findOne({ _id: new ObjectId() });
await schemaWithTypicalIdCol.find({ _id: new ObjectId() });

interface SchemaWithUserDefinedId {
  _id: number;
  name: string;
}
const schemaWithUserDefinedId = db.collection<SchemaWithUserDefinedId>('a');
expectType<WithId<SchemaWithUserDefinedId> | null>(await schemaWithUserDefinedId.findOne());
const result = await schemaWithUserDefinedId.findOne();
if (result !== null) {
  expectType<number>(result._id);
}
expectAssignable<SchemaWithUserDefinedId | null>(await schemaWithUserDefinedId.findOne());
// should allow _id as a number
await schemaWithUserDefinedId.findOne({ _id: 5 });
await schemaWithUserDefinedId.find({ _id: 5 });
