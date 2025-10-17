import { expectAssignable, expectNotAssignable, expectNotType, expectType } from 'tsd';

import {
  type AcceptedFields,
  Decimal128,
  type Document,
  Double,
  type FilterOperations,
  Int32,
  type IntegerType,
  type IsAny,
  type KeysOfAType,
  type KeysOfOtherType,
  Long,
  type NotAcceptedFields,
  type NumericType,
  type OneOrMore,
  type OnlyFieldsOfType
} from '../../src';

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
expectNotAssignable<IntegerType>(new Double(2));

expectAssignable<NumericType>(2);
expectAssignable<NumericType>(Long.fromInt(3));
expectAssignable<NumericType>(new Decimal128('2.3'));
expectAssignable<NumericType>(new Int32(23));
expectAssignable<NumericType>(new Double(2.3));

// FilterOperations - map a schema or simple type to the filter $key operations
expectAssignable<FilterOperations<{ a: number }>>({ a: { $eq: 2 } });
expectAssignable<FilterOperations<string>>({ $eq: 'a' });

// KeysOfAType - union of keys that are the second type argument
const permittedKeysOfAType: 'a' | 'c' = '' as 'a' | 'c'; // notice type is a union of the "number" keys
expectType<KeysOfAType<{ a: number; c: number; b: string }, number>>(permittedKeysOfAType);
const notPermittedKeysOfAType: 'a' | 'b' = '' as 'a' | 'b'; // notice type is a union of a number key and a string key
expectNotType<KeysOfAType<{ a: number; c: number; b: string }, number>>(notPermittedKeysOfAType);

// KeysOfOtherType - union of keys that aren't the second type argument
const permittedKeysOfOtherType: 'b' | 'c' = '' as 'b' | 'c';
expectType<KeysOfOtherType<{ a: number; b: string; c: boolean }, number>>(permittedKeysOfOtherType);
const notPermittedKeysOfOtherType: 'a' | 'd' = '' as 'a' | 'd';
expectNotType<KeysOfOtherType<{ a: number; b: string; c: boolean; d: number }, number>>(
  notPermittedKeysOfOtherType
);

// AcceptedFields - essentially rewrites the type of keys that have the second argument type
expectAssignable<AcceptedFields<{ a: number; b: string }, number, boolean>>({ a: true });
expectNotAssignable<AcceptedFields<{ a: number; b: string }, number, boolean>>({ a: 3 }); // not assignable to its original type

// NotAcceptedFields - prevents the usage of keys with an unacceptable type
expectNotType<NotAcceptedFields<{ a: number; b: string }, number>>({ b: 'hello' });
// This helper type doesn't produce a useful type alone, it ensures that key of the given type are no longer permitted
// It's used in conjunction with OnlyFieldsOfType to filter out fields of a type that don't apply / can't be used
// A good example is not allowing string typed keys in $inc
const notAcceptedField: { readonly b?: never; readonly c?: never } = {}; // 'a' is not included here, but its also not excluded
expectType<NotAcceptedFields<{ a: number; b: string; c: string }, number>>(notAcceptedField);

// OnlyFieldsOfType - filters for keys of a type, and optionally replaces type (combo KeysOfAType & AcceptedFields)
expectAssignable<OnlyFieldsOfType<{ a: number; b: string }, number>>({ a: 2 });
expectAssignable<OnlyFieldsOfType<{ a: number; b: string }, string>>({ b: 'hello' });
expectAssignable<OnlyFieldsOfType<{ a: number; b: string }, string, boolean>>({ b: true });

// test the case in which AssignableType does not inherit from FieldType, and AssignableType is provided
expectAssignable<OnlyFieldsOfType<any, string, boolean>>({ b: false });

// test generic schema, essentially we expect nearly no safety here
expectAssignable<OnlyFieldsOfType<Document, NumericType | undefined>>({ someKey: 2 });
// We can still at least enforce the type that the keys map to
expectNotAssignable<OnlyFieldsOfType<Document, NumericType | undefined>>({ someKey: 'hello' });

// LIMITATION: If users have 'any' in their schema, type checking becomes weaker(-ish):
// This case is the same for `Document` usage for schema
expectAssignable<OnlyFieldsOfType<{ a: number; b: any; c: string }, NumericType | undefined>>({
  a: 2,
  b: 3,
  c: 4 // Since any is present we can't filter away types that aren't numeric (the restriction requested by the second argument)
  // So now 'c' is coerced to numeric instead of being not allowed altogether
});
expectNotAssignable<OnlyFieldsOfType<{ a: number; b: any; c: string }, NumericType | undefined>>({
  c: 'hello' // We can still limit the types the keys map to though
});
// Here's the opposite of above, if I make b a concrete type then only 'a' is permitted
expectNotAssignable<
  OnlyFieldsOfType<{ a: number; b: boolean; c: string }, NumericType | undefined>
>({ a: 2, b: 3, c: 4 });

// LIMITATION
// Using indexed types makes determining permitted keys tricky!
interface IndexedSchema {
  a: number;
  [key: string]: boolean | number;
}
// Even though a is narrowed in the interface above to be only number, all keys are number or boolean
// This means we can't properly enforce the subtype and there doesn't seem to be a way to detect it
// and reduce strictness like we can with any, users with indexed schemas will have to use `as any`
expectNotAssignable<OnlyFieldsOfType<IndexedSchema, NumericType>>({ a: 2 });

// OneOrMore should accept readonly arrays
expectAssignable<OneOrMore<number>>(1);
expectAssignable<OneOrMore<number>>([1, 2]);
expectAssignable<OneOrMore<number>>(Object.freeze([1, 2]));
