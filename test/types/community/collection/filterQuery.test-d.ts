import {
  Binary,
  BSONRegExp,
  BSONSymbol,
  Code,
  DBRef,
  Decimal128,
  Long,
  MaxKey,
  MinKey,
  ObjectId
} from 'bson';
import { expectAssignable, expectError, expectNotType, expectType } from 'tsd';

import {
  type Collection,
  type Filter,
  MongoClient,
  type UpdateFilter,
  type WithId
} from '../../../mongodb';

/**
 * test the Filter type using collection.find<T>() method
 * MongoDB uses Filter type for every method that performs a document search
 * for example: findX, updateX, deleteX, distinct, countDocuments
 * So we don't add duplicate tests for every collection method and only use find
 */
const client = new MongoClient('');
const db = client.db('test');

/**
 * Test the generic Filter using collection.find<T>() method
 */

interface HumanModel {
  _id: ObjectId;
  name: string;
}

// a collection model for all possible MongoDB BSON types and TypeScript types
interface PetModel {
  _id: ObjectId; // ObjectId field
  name?: string; // optional field
  family: string; // string field
  age: number; // number field
  type: 'dog' | 'cat' | 'fish'; // union field
  isCute: boolean; // boolean field
  bestFriend?: HumanModel; // object field (Embedded/Nested Documents)
  createdAt: Date; // date field
  numOfPats: Long; // long field
  treats: string[]; // array of string
  playTimePercent: Decimal128; // bson Decimal128 type
  readonly friends?: ReadonlyArray<HumanModel>; // readonly array of objects
  playmates?: HumanModel[]; // writable array of objects
  laps?: Map<string, number>; // map field
  // Object with multiple nested levels
  meta?: {
    updatedAt?: Date;
    deep?: {
      nestedArray: number[];
      nested?: {
        level?: number;
      };
    };
  };

  binary: Binary;
  code: Code;
  minKey: MinKey;
  maxKey: MaxKey;
  dBRef: DBRef;
  bSONSymbol: BSONSymbol;

  regex: RegExp;

  fn: (...args: any[]) => any;
}

const john = {
  _id: new ObjectId('577fa2d90c4cc47e31cf4b6a'),
  name: 'John'
};

const spot = {
  _id: new ObjectId('577fa2d90c4cc47e31cf4b6f'),
  name: 'Spot',
  family: 'Andersons',
  age: 2,
  type: 'dog' as const,
  isCute: true,
  createdAt: new Date(),
  numOfPats: Long.fromBigInt(100000000n),
  treats: ['kibble', 'bone'],
  playTimePercent: new Decimal128('0.999999'),

  binary: new Binary(Buffer.from('', 'utf8'), 2),
  code: new Code(() => true),
  minKey: new MinKey(),
  maxKey: new MaxKey(),
  dBRef: new DBRef('collection', new ObjectId()),
  bSONSymbol: new BSONSymbol('hi'),

  regex: /a/,

  fn() {
    return 'hi';
  }
};

expectAssignable<PetModel>(spot);

const collectionT = db.collection<PetModel>('test.filterQuery');

// Assert that collection.find uses the Filter helper like so:
const filter: Filter<PetModel> = {} as Filter<PetModel>;
collectionT.find(filter);
collectionT.find(spot); // a whole model definition is also a valid filter
// Now tests below can directly test the Filter helper, and are implicitly checking collection.find

/**
 * test simple field queries e.g. `{ name: 'Spot' }`
 */
/// it should query __string__ fields
expectType<WithId<PetModel>[]>(await collectionT.find({ name: 'Spot' }).toArray());
// it should query string fields by regex
expectType<WithId<PetModel>[]>(await collectionT.find({ name: /Blu/i }).toArray());
// it should query string fields by RegExp object, and bson regex
expectType<WithId<PetModel>[]>(
  await collectionT.find({ name: new RegExp('MrMeow', 'i') }).toArray()
);
expectType<WithId<PetModel>[]>(
  await collectionT.find({ name: new BSONRegExp('MrMeow', 'i') }).toArray()
);
/// it should not accept wrong types for string fields
expectNotType<Filter<PetModel>>({ name: 23 });
expectNotType<Filter<PetModel>>({ name: { suffix: 'Jr' } });
expectNotType<Filter<PetModel>>({ name: ['Spot'] });

// it should not accept wrong types for function fields
expectNotType<Filter<PetModel>>({ fn: 3 });
expectAssignable<WithId<PetModel>[]>(await collectionT.find({ fn: () => true }).toArray());

/// it should query __number__ fields
await collectionT.find({ age: 12 }).toArray();
/// it should not accept wrong types for number fields
expectNotType<Filter<PetModel>>({ age: /12/i }); // it cannot query number fields by regex
expectNotType<Filter<PetModel>>({ age: '23' });
expectNotType<Filter<PetModel>>({ age: { prefix: 43 } });
expectNotType<Filter<PetModel>>({ age: [23, 43] });

/// it should query __nested document__ fields only by exact match
// TODO: we currently cannot enforce field order but field order is important for mongo
await collectionT.find({ bestFriend: john }).toArray();
/// nested documents query should contain all required fields
expectNotType<Filter<PetModel>>({ bestFriend: { name: 'Andersons' } });
/// it should not accept wrong types for nested document fields
expectNotType<Filter<PetModel>>({ bestFriend: 21 });
expectNotType<Filter<PetModel>>({ bestFriend: 'Andersons' });
expectNotType<Filter<PetModel>>({ bestFriend: [spot] });
expectNotType<Filter<PetModel>>({ bestFriend: [{ name: 'Andersons' }] });

// it should permit all our BSON types as query values
expectAssignable<Filter<PetModel>>({ binary: new Binary(Buffer.from('abc', 'utf8'), 2) });
expectAssignable<Filter<PetModel>>({ code: new Code(() => true) });
expectAssignable<Filter<PetModel>>({ minKey: new MinKey() });
expectAssignable<Filter<PetModel>>({ maxKey: new MaxKey() });
expectAssignable<Filter<PetModel>>({ dBRef: new DBRef('collection', new ObjectId()) });
expectAssignable<Filter<PetModel>>({ bSONSymbol: new BSONSymbol('hi') });

// None of the bson types should be broken up into their nested keys
expectNotType<Filter<PetModel>>({ 'binary.sub_type': 2 });
expectNotType<Filter<PetModel>>({ 'code.code': 'string' });
expectNotType<Filter<PetModel>>({ 'minKey._bsontype': 'MinKey' });
expectNotType<Filter<PetModel>>({ 'maxKey._bsontype': 'MaxKey' });
expectNotType<Filter<PetModel>>({ 'dBRef.collection': 'collection' });
expectNotType<Filter<PetModel>>({ 'bSONSymbol.value': 'hi' });
expectNotType<Filter<PetModel>>({ 'numOfPats.__isLong__': true });
expectNotType<Filter<PetModel>>({ 'playTimePercent.bytes.BYTES_PER_ELEMENT': 1 });
expectNotType<Filter<PetModel>>({ 'binary.sub_type': 'blah' });
expectNotType<Filter<PetModel>>({ 'regex.dotAll': true });

/// it should query __nested document__ fields using dot-notation
collectionT.find({ 'meta.updatedAt': new Date() });
collectionT.find({ 'meta.deep.nested.level': 123 });
collectionT.find({ meta: { deep: { nested: { level: 123 } } } }); // no impact on actual nesting
collectionT.find({ 'meta.deep': { nested: { level: 123 } } });
collectionT.find({ 'friends.0.name': 'John' });
collectionT.find({ 'playmates.0.name': 'John' });
// supports arrays with primitive types
collectionT.find({ 'treats.0': 'bone' });
collectionT.find({ 'laps.foo': 123 });

// Handle special BSON types
collectionT.find({ numOfPats: Long.fromBigInt(2n) });
collectionT.find({ playTimePercent: new Decimal128('123.2') });

// works with some extreme indexes
collectionT.find({ 'friends.4294967295.name': 'John' });
collectionT.find({ 'friends.999999999999999999999999999999999999.name': 'John' });

/// it should not accept wrong types for nested document fields
expectNotType<Filter<PetModel>>({ 'meta.updatedAt': 123 });
expectNotType<Filter<PetModel>>({ 'meta.updatedAt': true });
expectNotType<Filter<PetModel>>({ 'meta.updatedAt': 'now' });
expectNotType<Filter<PetModel>>({ 'meta.deep.nested.level': 'string' });
expectNotType<Filter<PetModel>>({ 'meta.deep.nested.level': true });
expectNotType<Filter<PetModel>>({ 'meta.deep.nested.level': new Date() });
expectNotType<Filter<PetModel>>({ 'friends.0.name': 123 });
expectNotType<Filter<PetModel>>({ 'playmates.0.name': 123 });
expectNotType<Filter<PetModel>>({ 'laps.foo': 'string' });
expectNotType<Filter<PetModel>>({ 'treats.0': 123 });
expectNotType<Filter<PetModel>>({ meta: { deep: { nested: { level: 'string' } } } });
expectNotType<Filter<PetModel>>({ 'meta.deep': { nested: { level: 'string' } } });

/// it should not accept wrong types for nested document array fields
expectError<Filter<PetModel>>({
  treats: {
    $elemMatch: true
  }
});
expectError<Filter<PetModel>>({ treats: 123 });

// Nested arrays aren't checked
expectNotType<Filter<PetModel>>({ 'meta.deep.nestedArray.0': 'not a number' });

/// it should query __array__ fields by exact match
await collectionT.find({ treats: ['kibble', 'bone'] }).toArray();
/// it should query __array__ fields by element type
expectType<WithId<PetModel>[]>(await collectionT.find({ treats: 'kibble' }).toArray());
expectType<WithId<PetModel>[]>(await collectionT.find({ treats: /kibble/i }).toArray());
expectType<WithId<PetModel>[]>(await collectionT.find({ friends: spot }).toArray());
/// it should not query array fields by wrong types
expectNotType<Filter<PetModel>>({ treats: 12 });
expectNotType<Filter<PetModel>>({ friends: { name: 'not a full model' } });

/// it should accept MongoDB ObjectId and Date as query parameter
await collectionT.find({ createdAt: new Date() }).toArray();
await collectionT.find({ _id: new ObjectId() }).toArray();
/// it should not accept other types for ObjectId and Date
expectNotType<Filter<PetModel>>({ createdAt: { a: 12 } });
expectNotType<Filter<PetModel>>({ createdAt: spot });
expectNotType<Filter<PetModel>>({ _id: '577fa2d90c4cc47e31cf4b6f' });
expectNotType<Filter<PetModel>>({ _id: { a: 12 } });

/**
 * test comparison query operators
 */
/// $eq $ne $gt $gte $lt $lte queries should behave exactly like simple queries above
await collectionT.find({ name: { $eq: 'Spot' } }).toArray();
await collectionT.find({ name: { $eq: /Spot/ } }).toArray();
await collectionT.find({ type: { $eq: 'dog' } }).toArray();
await collectionT.find({ age: { $gt: 12, $lt: 13 } }).toArray();
await collectionT.find({ treats: { $eq: 'kibble' } }).toArray();
await collectionT.find({ scores: { $gte: 23 } }).toArray();
await collectionT.find({ createdAt: { $lte: new Date() } }).toArray();
await collectionT.find({ friends: { $ne: spot } }).toArray();
/// it should not accept wrong queries
expectNotType<Filter<PetModel>>({ name: { $ne: 12 } });
expectNotType<Filter<PetModel>>({ gender: { $eq: '123' } });
expectNotType<Filter<PetModel>>({ createdAt: { $lte: '1232' } });
/// it should not accept undefined query selectors in query object
expectNotType<Filter<PetModel>>({ age: { $undefined: 12 } });

/// it should query simple fields using $in and $nin selectors
await collectionT.find({ name: { $in: ['Spot', 'MrMeow', 'Bubbles'] } }).toArray();
await collectionT.find({ age: { $in: [12, 13] } }).toArray();
await collectionT.find({ friends: { $in: [spot] } }).toArray();
await collectionT.find({ createdAt: { $nin: [new Date()] } }).toArray();
/// it should query array fields using $in and $nin selectors
await collectionT.find({ treats: { $in: ['kibble', 'bone', 'tuna'] } }).toArray();
await collectionT.find({ treats: { $in: [/kibble/, /bone/, /tuna/] } }).toArray();
/// it should not accept wrong params for $in and $nin selectors
expectNotType<Filter<PetModel>>({ name: { $in: ['Spot', 32, 42] } });
expectNotType<Filter<PetModel>>({ age: { $in: [/12/, 12] } });
expectNotType<Filter<PetModel>>({ createdAt: { $nin: [12] } });
expectNotType<Filter<PetModel>>({ friends: { $in: [{ name: 'MrMeow' }] } });
expectNotType<Filter<PetModel>>({ treats: { $in: [{ $eq: 21 }] } });

/**
 * test logical query operators
 */
/// it should accept any query selector for __$not operator__
await collectionT.find({ name: { $not: { $eq: 'Spot' } } }).toArray();
/// it should accept regex for string fields
await collectionT.find({ name: { $not: /Hi/i } }).toArray();
await collectionT.find({ treats: { $not: /Hi/ } }).toArray();
/// it should not accept simple queries in $not operator
expectNotType<Filter<PetModel>>({ name: { $not: 'Spot' } });
/// it should not accept regex for non strings
expectNotType<Filter<PetModel>>({ age: { $not: /sdsd/ } });

/// it should accept any filter query for __$and, $or, $nor operator__
await collectionT.find({ $and: [{ name: 'Spot' }] }).toArray();
await collectionT.find({ $and: [{ name: 'Spot' }, { age: { $in: [12, 14] } }] }).toArray();
await collectionT.find({ $or: [{ name: /Spot/i }, { treats: 's12' }] }).toArray();
await collectionT.find({ $nor: [{ name: { $ne: 'Spot' } }] }).toArray();
/// it should not accept __$and, $or, $nor operator__ as non-root query
expectNotType<Filter<PetModel>>({ name: { $or: ['Spot', 'Bubbles'] } });
/// it should not accept single objects for __$and, $or, $nor operator__ query
expectNotType<Filter<PetModel>>({ $and: { name: 'Spot' } });

/**
 * test 'element' query operators
 */
/// it should query using $exists
await collectionT.find({ name: { $exists: true } }).toArray();
await collectionT.find({ name: { $exists: false } }).toArray();
/// it should not query $exists by wrong values
expectNotType<Filter<PetModel>>({ name: { $exists: '' } });
expectNotType<Filter<PetModel>>({ name: { $exists: 'true' } });

/**
 * test evaluation query operators
 */
/// it should query using $regex
await collectionT.find({ name: { $regex: /12/i } }).toArray();
/// it should query using $regex and $options
await collectionT.find({ name: { $regex: /12/, $options: 'i' } }).toArray();
/// it should not accept $regex for none string fields
expectNotType<Filter<PetModel>>({ age: { $regex: /12/ } });
expectNotType<Filter<PetModel>>({ age: { $options: '3' } });

/// it should query using $mod
await collectionT.find({ age: { $mod: [12, 2] } }).toArray();
/// it should not accept $mod for none number fields
expectNotType<Filter<PetModel>>({ name: { $mod: [12, 2] } });
/// it should not accept $mod with less/more than 2 elements
expectNotType<Filter<PetModel>>({ age: { $mod: [12, 2, 2] } });
expectNotType<Filter<PetModel>>({ age: { $mod: [12] } });
expectNotType<Filter<PetModel>>({ age: { $mod: [] } });

/// it should fulltext search using $text
await collectionT.find({ $text: { $search: 'Hello' } }).toArray();
await collectionT.find({ $text: { $search: 'Hello', $caseSensitive: true } }).toArray();
/// it should fulltext search only by string
expectNotType<Filter<PetModel>>({ $text: { $search: 21, $caseSensitive: 'true' } });
expectNotType<Filter<PetModel>>({ $text: { $search: { name: 'MrMeow' } } });
expectNotType<Filter<PetModel>>({ $text: { $search: /regex/g } });

/// it should query using $where
await collectionT.find({ $where: 'function() { return true }' }).toArray();
await collectionT
  .find({
    $where: function () {
      expectType<WithId<PetModel>>(this);
      return this.name === 'MrMeow';
    }
  })
  .toArray();
/// it should not fail when $where is not Function or String
expectNotType<Filter<PetModel>>({ $where: 12 });
expectNotType<Filter<PetModel>>({ $where: /regex/g });

/**
 * test array query operators
 */
/// it should query array fields
await collectionT.find({ treats: { $size: 2 } }).toArray();
await collectionT.find({ treats: { $all: ['kibble', 'bone'] } }).toArray();
await collectionT.find({ friends: { $elemMatch: { name: 'MrMeow' } } }).toArray();
await collectionT.find({ playmates: { $elemMatch: { name: 'MrMeow' } } }).toArray();
/// it should not query non array fields
expectNotType<Filter<PetModel>>({ name: { $all: ['world', 'world'] } });
expectNotType<Filter<PetModel>>({ age: { $elemMatch: [1, 2] } });
expectNotType<Filter<PetModel>>({ type: { $size: 2 } });

// ObjectId are not allowed to be used as a query predicate (issue described here: NODE-3758)
// this only applies to schemas where the _id is not of type ObjectId.
declare const nonObjectIdCollection: Collection<{ _id: number; otherField: string }>;
expectError(
  nonObjectIdCollection.find({
    _id: new ObjectId()
  })
);
expectError(
  nonObjectIdCollection.find({
    otherField: new ObjectId()
  })
);
nonObjectIdCollection.find({
  fieldThatDoesNotExistOnSchema: new ObjectId()
});

// we only forbid objects that "look like" object ids, so other random objects are permitted
nonObjectIdCollection.find({
  _id: {
    hello: 'world'
  }
});
nonObjectIdCollection.find({
  otherField: {
    hello: 'world'
  }
});

declare const nonSpecifiedCollection: Collection;
nonSpecifiedCollection.find({
  _id: new ObjectId()
});
nonSpecifiedCollection.find({
  otherField: new ObjectId()
});

nonSpecifiedCollection.find({
  _id: {
    hello: 'world'
  }
});
nonSpecifiedCollection.find({
  otherField: {
    hello: 'world'
  }
});

type MyArraySchema = {
  nested: { array: { a: number; b: boolean }[] };
  something: { a: number } | { b: boolean };
};

// "element" now refers to the name used in arrayFilters, it can be any string
expectAssignable<UpdateFilter<MyArraySchema>>({
  $set: { 'nested.array.$[element]': { a: 2, b: false } }
});
expectAssignable<Filter<MyArraySchema>>({
  $set: { 'nested.array.$[element]': { a: 2, b: false } }
});

// Specifying an identifier in the brackets is optional
expectAssignable<UpdateFilter<MyArraySchema>>({
  $set: { 'nested.array.$[].a': 2 }
});
expectAssignable<Filter<MyArraySchema>>({
  $set: { 'nested.array.$[].a': 2 }
});

// Union usage examples
expectAssignable<Filter<MyArraySchema>>({
  'something.a': 2
});
//  TODO: NODE-4513: Nested union types don't error in this case.
// expectError<Filter<MyArraySchema>>({
//   'something.a': false
// });
expectAssignable<Filter<MyArraySchema>>({
  'something.b': false
});
