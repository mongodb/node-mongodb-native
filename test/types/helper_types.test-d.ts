import { expectAssignable, expectNotType, expectType } from 'tsd';
import type {
  AcceptedFields,
  KeysOfAType,
  KeysOfOtherType,
  NotAcceptedFields,
  NumericType,
  ObjectFilterOperators,
  DotAndArrayNotation,
  OnlyFieldsOfType,
  IntegerType,
  IsAny
} from '../../src/mongo_types';
import { Decimal128, Double, Int32, Long, Document } from '../../src/index';

expectType<IsAny<any, true, false>>(true);
expectNotType<IsAny<number, true, false>>(true);
expectNotType<IsAny<true, true, false>>(true);
expectNotType<IsAny<false, true, false>>(true);
expectNotType<IsAny<0, true, false>>(true);
expectNotType<IsAny<never, true, false>>(true);
expectNotType<IsAny<unknown, true, false>>(true);
expectNotType<IsAny<any[], true, false>>(true);

expectAssignable<IntegerType>(2);
expectAssignable<IntegerType>(2.3); // Typescript cannot assert anything about this
expectNotType<IntegerType>(new Double(2));

expectAssignable<NumericType>(2);
expectAssignable<NumericType>(Long.fromInt(3));
expectAssignable<NumericType>(new Decimal128('2.3'));
expectAssignable<NumericType>(new Int32(23));
expectAssignable<NumericType>(new Double(2.3));

// ObjectFilterOperators
expectAssignable<ObjectFilterOperators<{ a: number }>>({ a: { $eq: 2 } });

// KeysOfAType - union of keys that are the second type argument
expectType<KeysOfAType<{ a: number; b: string }, number>>('a');

// KeysOfOtherType - union of keys that aren't the second type argument
expectType<KeysOfOtherType<{ a: number; b: string }, number>>('b');

// AcceptedFields - essentially rewrites the type of keys that have the second argument type
expectAssignable<AcceptedFields<{ a: number; b: string }, number, boolean>>({ a: true });

// NotAcceptedFields - prevents the usage of keys with an unacceptable type
expectNotType<NotAcceptedFields<{ a: number; b: string }, number>>({ b: 'hello' }); // { b: never }

// DotAndArrayNotation - map string index to type, for MongoDB's dotted and array keys
expectAssignable<DotAndArrayNotation<number>>({ 'dot.array.notation': 3 });
expectNotType<DotAndArrayNotation<number>>({ 'dot.array.notation': true });

// OnlyFieldsOfType - filters for keys of a type, and optionally replaces type (combo KeysOfAType & AcceptedFields)
expectAssignable<OnlyFieldsOfType<{ a: number; b: string }, number>>({ a: 2 });
expectAssignable<OnlyFieldsOfType<{ a: number; b: string }, string>>({ b: 'hello' });
expectAssignable<OnlyFieldsOfType<{ a: number; b: string }, string, boolean>>({ b: true });

// test generic schema, essentially we expect no safety here

expectAssignable<OnlyFieldsOfType<Document, NumericType | undefined>>({ a: 2 });
expectAssignable<OnlyFieldsOfType<Document, NumericType | undefined>>({ a: 'hello' });

// If you use any at all, then we cannot do type hinting, is this fair?
expectAssignable<OnlyFieldsOfType<{ a: number; b: any }, NumericType | undefined>>({ a: 'hello' });

// Using indexed types makes determining permitted keys tricky!
interface IndexedSchema {
  a: number;
  [key: string]: string | number;
}
expectNotType<OnlyFieldsOfType<IndexedSchema, NumericType>>({ a: 'hello' });
