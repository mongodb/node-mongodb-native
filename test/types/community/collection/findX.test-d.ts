/* eslint-disable @typescript-eslint/no-explicit-any */
import { expectNotType, expectType } from 'tsd';
import { FindCursor, FindOptions, MongoClient, Document } from '../../../../src';
import type { PropExists } from '../../utility_types';

// collection.findX tests
const client = new MongoClient('');
const db = client.db('test');
const collection = db.collection('test.find');

// Locate all the entries using find
collection.find({}).toArray((err, fields) => {
  expectType<Document[] | undefined>(fields);
});

// test with collection type
interface TestModel {
  stringField: string;
  numberField?: number;
  fruitTags: string[];
  readonlyFruitTags: readonly string[];
}

const collectionT = db.collection<TestModel>('testCollection');
await collectionT.find({
  $and: [{ numberField: { $gt: 0 } }, { numberField: { $lt: 100 } }],
  readonlyFruitTags: { $all: ['apple', 'pear'] }
});
expectType<FindCursor<TestModel>>(collectionT.find({}));

await collectionT.findOne(
  {},
  {
    projection: {},
    sort: {}
  }
);

const optionsWithComplexProjection: FindOptions<TestModel> = {
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

const cursor: FindCursor<Bag> = collectionBag.find({ color: 'black' });

cursor.toArray((err, bags) => {
  expectType<Bag[] | undefined>(bags);
});

cursor.forEach(
  bag => {
    expectType<Bag>(bag);
  },
  () => {
    return null;
  }
);

expectType<Bag | undefined>(
  await collectionBag.findOne({ color: 'red' }, { projection: { cost: 1 } })
);

const overrideFind = await collectionBag.findOne<{ cost: number }>(
  { color: 'white' },
  { projection: { cost: 1 } }
);
expectType<PropExists<typeof overrideFind, 'color'>>(false);

// Overriding findOne, makes the return that exact type
expectType<{ cost: number } | undefined>(
  await collectionBag.findOne<{ cost: number }>({ color: 'red' }, { projection: { cost: 1 } })
);

interface Car {
  make: string;
}
interface House {
  windows: number;
}

const car = db.collection<Car>('car');

expectNotType<House | undefined>(await car.findOne({}));

interface Car {
  make: string;
}

function printCar(car: Car | undefined) {
  console.log(car ? `A car of ${car.make} make` : 'No car');
}

const options: FindOptions<Car> = {};
const optionsWithProjection: FindOptions<Car> = {
  projection: {
    make: 1
  }
};

expectNotType<FindOptions<Car>>({
  projection: {
    make: 'invalid'
  }
});

printCar(await car.findOne({}, options));
printCar(await car.findOne({}, optionsWithProjection));
