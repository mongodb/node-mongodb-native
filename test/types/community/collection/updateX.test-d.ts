import { expectAssignable, expectError, expectNotAssignable, expectNotType } from 'tsd';

import {
  Decimal128,
  Document,
  Double,
  Int32,
  Long,
  MongoClient,
  ObjectId,
  Timestamp
} from '../../../../src/index';
import type {
  AddToSetOperators,
  ArrayOperator,
  MatchKeysAndValues,
  PullAllOperator,
  PullOperator,
  PushOperator,
  SetFields,
  UpdateFilter
} from '../../../../src/mongo_types';

// MatchKeysAndValues - for basic mapping keys to their values, restricts that key types must be the same but optional, and permit dot array notation
expectAssignable<MatchKeysAndValues<{ a: number; b: string }>>({ a: 2, 'dot.notation': true });
expectNotType<MatchKeysAndValues<{ a: number; b: string }>>({ b: 2 });

// AddToSetOperators
expectAssignable<AddToSetOperators<number>>({ $each: [3] });
expectNotType<AddToSetOperators<number>>({ $each: ['hello'] });

// ArrayOperator
expectAssignable<ArrayOperator<number>>({ $each: [2] });
expectAssignable<ArrayOperator<number>>({ $slice: -2 });
expectAssignable<ArrayOperator<number>>({ $position: 1 });
expectAssignable<ArrayOperator<number>>({ $sort: 'asc' });

// SetFields - $addToSet
expectAssignable<SetFields<{ a: number[] }>>({ a: 2 });

// PushOperator - $push
expectAssignable<PushOperator<{ a: string[] }>>({ a: 'hello' });

// PullOperator - $pull
expectAssignable<PullOperator<{ a: string[]; b: number[] }>>({
  a: { $in: ['apples', 'oranges'] },
  b: 2
});
expectNotType<PullOperator<{ a: string[]; b: number[] }>>({
  a: { $in: [2, 3] },
  b: 'hello'
});

// PullOperator - $pull
expectAssignable<PullAllOperator<{ a: string[]; b: number[] }>>({ b: [0, 5] });
expectNotType<PullAllOperator<{ a: string[]; b: number[] }>>({ a: [0, 5] });

// Schema-less tests
expectAssignable<UpdateFilter<Document>>({});
expectAssignable<UpdateFilter<Document>>({ $inc: { anyKeyWhatsoever: 2 } });
// We can at least keep type assertions working inside the $inc ensuring provided values are numeric
// But this no longer asserts anything about what the original keys map to
expectNotType<UpdateFilter<Document>>({ $inc: { numberField: '2' } });

// collection.updateX tests
const client = new MongoClient('');
const db = client.db('test');

interface SubTestModel {
  _id: ObjectId;
  field1: string;
  field2?: string;
}

type FruitTypes = 'apple' | 'pear';

// test with collection type
interface TestModel {
  stringField: string;
  numberField: number;
  decimal128Field: Decimal128;
  doubleField: Double;
  int32Field: Int32;
  longField: Long;
  optionalNumberField?: number;
  dateField: Date;
  otherDateField: Date;
  oneMoreDateField: Date;
  fruitTags: string[];
  readonlyFruitTags: ReadonlyArray<string>;
  maybeFruitTags?: FruitTypes[];
  subInterfaceField: SubTestModel;
  subInterfaceArray: SubTestModel[];
  timestampField: Timestamp;
}
const collectionTType = db.collection<TestModel>('test.update');

function buildUpdateFilter(updateQuery: UpdateFilter<TestModel>): UpdateFilter<TestModel> {
  return updateQuery;
}

const justASample = buildUpdateFilter({ $currentDate: { dateField: true } });

expectAssignable<UpdateFilter<TestModel>>({ $currentDate: { dateField: true } });
expectAssignable<UpdateFilter<TestModel>>({ $currentDate: { otherDateField: { $type: 'date' } } });
expectAssignable<UpdateFilter<TestModel>>({
  $currentDate: { otherDateField: { $type: 'timestamp' } }
});
expectAssignable<UpdateFilter<TestModel>>({
  $currentDate: { timestampField: { $type: 'timestamp' } }
});
expectAssignable<UpdateFilter<TestModel>>({ $currentDate: { 'dot.notation': true } });
expectAssignable<UpdateFilter<TestModel>>({ $currentDate: { 'subInterfaceArray.$': true } });
expectAssignable<UpdateFilter<TestModel>>({
  $currentDate: { 'subInterfaceArray.$[bla]': { $type: 'date' } }
});
expectAssignable<UpdateFilter<TestModel>>({
  $currentDate: { 'subInterfaceArray.$[]': { $type: 'timestamp' } }
});

expectNotType<UpdateFilter<TestModel>>({ $currentDate: { stringField: true } }); // stringField is not a date Field

expectAssignable<UpdateFilter<TestModel>>({ $inc: { numberField: 1 } });
expectAssignable<UpdateFilter<TestModel>>({
  $inc: { decimal128Field: Decimal128.fromString('1.23') }
});
expectAssignable<UpdateFilter<TestModel>>({ $inc: { doubleField: new Double(1.23) } });
expectAssignable<UpdateFilter<TestModel>>({ $inc: { int32Field: new Int32(10) } });
expectAssignable<UpdateFilter<TestModel>>({ $inc: { longField: Long.fromString('999') } });
expectAssignable<UpdateFilter<TestModel>>({ $inc: { optionalNumberField: 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $inc: { 'dot.notation': 2 } });
expectAssignable<UpdateFilter<TestModel>>({
  $inc: { 'dot.notation': Long.fromBigInt(BigInt(23)) }
});
expectAssignable<UpdateFilter<TestModel>>({ $inc: { 'subInterfaceArray.$': -10 } });
expectAssignable<UpdateFilter<TestModel>>({ $inc: { 'subInterfaceArray.$[bla]': 40 } });
expectAssignable<UpdateFilter<TestModel>>({ $inc: { 'subInterfaceArray.$[]': 1000.2 } });

expectAssignable<UpdateFilter<TestModel>>({ $bit: { numberField: { or: 3 } } });
expectAssignable<UpdateFilter<TestModel>>({ $bit: { numberField: { or: 3, and: 3, xor: 3 } } });
expectNotAssignable<UpdateFilter<TestModel>>({ $bit: { stringField: {} } });

expectAssignable<UpdateFilter<TestModel>>({ $min: { numberField: 1 } });
expectAssignable<UpdateFilter<TestModel>>({
  $min: { decimal128Field: Decimal128.fromString('1.23') }
});
expectAssignable<UpdateFilter<TestModel>>({ $min: { doubleField: new Double(1.23) } });
expectAssignable<UpdateFilter<TestModel>>({ $min: { int32Field: new Int32(10) } });
expectAssignable<UpdateFilter<TestModel>>({ $min: { longField: Long.fromString('999') } });
expectAssignable<UpdateFilter<TestModel>>({ $min: { stringField: 'a' } });
expectAssignable<UpdateFilter<TestModel>>({ $min: { 'dot.notation': 2 } });
expectAssignable<UpdateFilter<TestModel>>({ $min: { 'subInterfaceArray.$': 'string' } });
expectAssignable<UpdateFilter<TestModel>>({ $min: { 'subInterfaceArray.$[bla]': 40 } });
expectAssignable<UpdateFilter<TestModel>>({ $min: { 'subInterfaceArray.$[]': 1000.2 } });

expectNotType<UpdateFilter<TestModel>>({ $min: { numberField: 'a' } }); // Matches the type of the keys

expectAssignable<UpdateFilter<TestModel>>({ $max: { numberField: 1 } });
expectAssignable<UpdateFilter<TestModel>>({
  $max: { decimal128Field: Decimal128.fromString('1.23') }
});
expectAssignable<UpdateFilter<TestModel>>({ $max: { doubleField: new Double(1.23) } });
expectAssignable<UpdateFilter<TestModel>>({ $max: { int32Field: new Int32(10) } });
expectAssignable<UpdateFilter<TestModel>>({ $max: { longField: Long.fromString('999') } });
expectAssignable<UpdateFilter<TestModel>>({ $max: { stringField: 'a' } });
expectAssignable<UpdateFilter<TestModel>>({ $max: { 'dot.notation': 2 } });
expectAssignable<UpdateFilter<TestModel>>({ $max: { 'subInterfaceArray.$': -10 } });
expectAssignable<UpdateFilter<TestModel>>({ $max: { 'subInterfaceArray.$[bla]': 40 } });
expectAssignable<UpdateFilter<TestModel>>({ $max: { 'subInterfaceArray.$[]': 1000.2 } });

expectNotType<UpdateFilter<TestModel>>({ $min: { numberField: 'a' } }); // Matches the type of the keys

expectAssignable<UpdateFilter<TestModel>>({ $mul: { numberField: 1 } });
expectAssignable<UpdateFilter<TestModel>>({
  $mul: { decimal128Field: Decimal128.fromString('1.23') }
});
expectAssignable<UpdateFilter<TestModel>>({ $mul: { doubleField: new Double(1.23) } });
expectAssignable<UpdateFilter<TestModel>>({ $mul: { int32Field: new Int32(10) } });
expectAssignable<UpdateFilter<TestModel>>({ $mul: { longField: Long.fromString('999') } });
expectAssignable<UpdateFilter<TestModel>>({ $mul: { optionalNumberField: 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $mul: { 'dot.notation': 2 } });
expectAssignable<UpdateFilter<TestModel>>({ $mul: { 'subInterfaceArray.$': -10 } });
expectAssignable<UpdateFilter<TestModel>>({ $mul: { 'subInterfaceArray.$[bla]': 40 } });
expectAssignable<UpdateFilter<TestModel>>({ $mul: { 'subInterfaceArray.$[]': 1000.2 } });

expectAssignable<UpdateFilter<TestModel>>({ $set: { numberField: 1 } });
expectAssignable<UpdateFilter<TestModel>>({
  $set: { decimal128Field: Decimal128.fromString('1.23') }
});
expectAssignable<UpdateFilter<TestModel>>({ $set: { doubleField: new Double(1.23) } });
expectAssignable<UpdateFilter<TestModel>>({ $set: { int32Field: new Int32(10) } });
expectAssignable<UpdateFilter<TestModel>>({ $set: { longField: Long.fromString('999') } });
expectAssignable<UpdateFilter<TestModel>>({ $set: { stringField: 'a' } });
expectError(buildUpdateFilter({ $set: { stringField: 123 } }));
expectAssignable<UpdateFilter<TestModel>>({ $set: { 'dot.notation': 2 } });
expectAssignable<UpdateFilter<TestModel>>({ $set: { 'subInterfaceArray.$': -10 } });
expectAssignable<UpdateFilter<TestModel>>({ $set: { 'subInterfaceArray.$[bla]': 40 } });
expectAssignable<UpdateFilter<TestModel>>({ $set: { 'subInterfaceArray.$[]': 1000.2 } });

expectAssignable<UpdateFilter<TestModel>>({ $setOnInsert: { numberField: 1 } });
expectAssignable<UpdateFilter<TestModel>>({
  $setOnInsert: { decimal128Field: Decimal128.fromString('1.23') }
});
expectAssignable<UpdateFilter<TestModel>>({ $setOnInsert: { doubleField: new Double(1.23) } });
expectAssignable<UpdateFilter<TestModel>>({ $setOnInsert: { int32Field: new Int32(10) } });
expectAssignable<UpdateFilter<TestModel>>({ $setOnInsert: { longField: Long.fromString('999') } });
expectAssignable<UpdateFilter<TestModel>>({ $setOnInsert: { stringField: 'a' } });
expectError(buildUpdateFilter({ $setOnInsert: { stringField: 123 } }));
expectAssignable<UpdateFilter<TestModel>>({ $setOnInsert: { 'dot.notation': 2 } });
expectAssignable<UpdateFilter<TestModel>>({ $setOnInsert: { 'subInterfaceArray.$': -10 } });
expectAssignable<UpdateFilter<TestModel>>({ $setOnInsert: { 'subInterfaceArray.$[bla]': 40 } });
expectAssignable<UpdateFilter<TestModel>>({ $setOnInsert: { 'subInterfaceArray.$[]': 1000.2 } });

expectAssignable<UpdateFilter<TestModel>>({ $unset: { numberField: '' } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { decimal128Field: '' } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { doubleField: '' } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { int32Field: '' } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { longField: '' } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { dateField: '' } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { 'dot.notation': '' } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { 'subInterfaceArray.$': '' } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { 'subInterfaceArray.$[bla]': '' } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { 'subInterfaceArray.$[]': '' } });

expectAssignable<UpdateFilter<TestModel>>({ $unset: { numberField: 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { decimal128Field: 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { doubleField: 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { int32Field: 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { longField: 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { dateField: 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { 'dot.notation': 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { 'subInterfaceArray.$': 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { 'subInterfaceArray.$[bla]': 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $unset: { 'subInterfaceArray.$[]': 1 } });

expectAssignable<UpdateFilter<TestModel>>({ $rename: { numberField2: 'stringField' } });

expectAssignable<UpdateFilter<TestModel>>({ $addToSet: { fruitTags: 'stringField' } });
expectError(buildUpdateFilter({ $addToSet: { fruitTags: 123 } }));
expectAssignable<UpdateFilter<TestModel>>({ $addToSet: { fruitTags: { $each: ['stringField'] } } });
expectAssignable<UpdateFilter<TestModel>>({ $addToSet: { readonlyFruitTags: 'apple' } });
expectAssignable<UpdateFilter<TestModel>>({
  $addToSet: { readonlyFruitTags: { $each: ['apple'] } }
});
expectAssignable<UpdateFilter<TestModel>>({ $addToSet: { maybeFruitTags: 'apple' } });
expectAssignable<UpdateFilter<TestModel>>({ $addToSet: { 'dot.notation': 'stringField' } });
expectAssignable<UpdateFilter<TestModel>>({
  $addToSet: { 'dot.notation': { $each: ['stringfield'] } }
});
expectAssignable<UpdateFilter<TestModel>>({
  $addToSet: {
    subInterfaceArray: { field1: 'foo' }
  }
});
expectAssignable<UpdateFilter<TestModel>>({
  $addToSet: {
    subInterfaceArray: {
      _id: new ObjectId(),
      field1: 'foo'
    }
  }
});
expectAssignable<UpdateFilter<TestModel>>({
  $addToSet: {
    subInterfaceArray: {
      $each: [{ field1: 'foo' }]
    }
  }
});
expectError(
  buildUpdateFilter({
    $addToSet: { subInterfaceArray: { field1: 123 } }
  })
);

expectAssignable<UpdateFilter<TestModel>>({ $pop: { fruitTags: 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $pop: { fruitTags: -1 } });
expectAssignable<UpdateFilter<TestModel>>({ $pop: { 'dot.notation': 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $pop: { 'subInterfaceArray.$[]': -1 } });

expectAssignable<UpdateFilter<TestModel>>({ $pull: { fruitTags: 'a' } });
expectError(buildUpdateFilter({ $pull: { fruitTags: 123 } }));
expectAssignable<UpdateFilter<TestModel>>({ $pull: { fruitTags: { $in: ['a'] } } });
expectAssignable<UpdateFilter<TestModel>>({ $pull: { maybeFruitTags: 'apple' } });
expectAssignable<UpdateFilter<TestModel>>({ $pull: { 'dot.notation': 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $pull: { 'subInterfaceArray.$[]': { $in: ['a'] } } });
expectAssignable<UpdateFilter<TestModel>>({ $pull: { subInterfaceArray: { field1: 'a' } } });
expectAssignable<UpdateFilter<TestModel>>({
  $pull: { subInterfaceArray: { _id: { $in: [new ObjectId()] } } }
});
expectAssignable<UpdateFilter<TestModel>>({
  $pull: { subInterfaceArray: { field1: { $in: ['a'] } } }
});

expectAssignable<UpdateFilter<TestModel>>({ $push: { fruitTags: 'a' } });
expectError(buildUpdateFilter({ $push: { fruitTags: 123 } }));
expectAssignable<UpdateFilter<TestModel>>({ $push: { fruitTags: { $each: ['a'] } } });
expectAssignable<UpdateFilter<TestModel>>({ $push: { fruitTags: { $each: ['a'], $slice: 3 } } });
expectAssignable<UpdateFilter<TestModel>>({ $push: { fruitTags: { $each: ['a'], $position: 1 } } });
expectAssignable<UpdateFilter<TestModel>>({ $push: { fruitTags: { $each: ['a'], $sort: 1 } } });
expectAssignable<UpdateFilter<TestModel>>({ $push: { fruitTags: { $each: ['a'], $sort: -1 } } });
expectAssignable<UpdateFilter<TestModel>>({ $push: { fruitTags: { $each: ['stringField'] } } });
expectAssignable<UpdateFilter<TestModel>>({
  $push: { fruitTags: { $each: ['a'], $sort: { 'sub.field': -1 } } }
});
expectAssignable<UpdateFilter<TestModel>>({ $push: { maybeFruitTags: 'apple' } });
expectAssignable<UpdateFilter<TestModel>>({
  $push: {
    subInterfaceArray: { _id: new ObjectId(), field1: 'foo' }
  }
});
expectAssignable<UpdateFilter<TestModel>>({
  $push: {
    subInterfaceArray: {
      _id: new ObjectId(),
      field1: 'foo'
    }
  }
});
expectAssignable<UpdateFilter<TestModel>>({
  $push: {
    subInterfaceArray: {
      $each: [
        {
          _id: new ObjectId(),
          field1: 'foo',
          field2: 'bar'
        }
      ]
    }
  }
});
expectError(
  buildUpdateFilter({
    $push: { subInterfaceArray: { field1: 123 } }
  })
);
expectAssignable<UpdateFilter<TestModel>>({ $push: { 'dot.notation': 1 } });
expectAssignable<UpdateFilter<TestModel>>({ $push: { 'subInterfaceArray.$[]': { $in: ['a'] } } });

collectionTType.updateOne({ stringField: 'bla' }, justASample);

collectionTType.updateMany(
  { numberField: 12 },
  {
    $set: {
      stringField: 'Banana'
    }
  }
);

export async function testPushWithId(): Promise<void> {
  interface Model {
    _id: ObjectId;
    foo: Array<{ _id?: string; name: string }>;
  }

  const client = new MongoClient('');
  const db = client.db('test');
  const collection = db.collection<Model>('test');

  await collection.updateOne(
    {},
    {
      $push: {
        foo: { name: 'Foo' }
      }
    }
  );

  await collection.updateOne(
    {},
    {
      $push: {
        foo: { _id: 'foo', name: 'Foo' }
      }
    }
  );
}
