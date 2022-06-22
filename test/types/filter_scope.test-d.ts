/* eslint-disable @typescript-eslint/no-unused-vars */
import { expectAssignable, expectError } from 'tsd';

import { Decimal128, Document, Filter, Long } from '../../src';

interface Metadata {
  id: string;
  loginCount: number;
}

interface User {
  name: string;
  age: number;
  friends: User[];
  metadata: Metadata;
  optionalKey?: string;
  optionalKey2?: string;
}

// Functionality 1
// The Filter type should provide type strictness by default on keys explicitly included on the
// collection schema.  Users who do not want type strictness should have multiple options to work
// around this (casting as any, using Collection<Document>, using Filter<Document> or not
// using Typescript).
expectAssignable<Filter<User>>({ name: 'bailey' }); // valid
expectError<Filter<User>>({ unknownProperty: 3 });

// escape hatches exist
expectAssignable<Filter<User>>({ unknownProperty: 3 } as any);
expectAssignable<Filter<User>>({ unknownProperty: 3 } as Filter<Document>);

// Functionality 2
interface RecursiveType {
  name: string;
  recur?: RecursiveType;
  nestedRecursiveArray: RecursiveType[];
}

expectAssignable<Filter<RecursiveType>>({ 'recur.recur.name': 'bailey' });
expectError<Filter<RecursiveType>>({ 'recur.recur.name': 42 });
expectError<Filter<RecursiveType>>({ 'recur.nestedRecursiveArray.0.name': 42 });

interface CircularTypeA {
  name: string;
  friend: CircularTypeB;
}

interface CircularTypeB {
  name: string;
  friend: CircularTypeA;
}

expectAssignable<Filter<RecursiveType>>({ name: 'bailey' });
expectAssignable<Filter<RecursiveType>>({ friend: { name: 'bailey' } });
expectError<Filter<RecursiveType>>({ name: 42 });
expectError<Filter<RecursiveType>>({ friend: { name: 42 } });

// Functionality 3
// The Filter type should provide type exactness for queries that use dot notation.
// The Node driver currently supports type exactness for queries that use dot notation.
expectAssignable<Filter<User>>({ 'metadata.id': 'unique id' });
expectError<Filter<User>>({ 'metadata.unknownProperty': 'error' });
expectError<Filter<User>>({ 'metadata.id': 3 });

// Functionality 4
// The Filter type should provide type checking on the keys for known $-prefixed query
// operators and provides type checking on some associated properties.  This is a best effort
// attempt - some query operators allow aggregation expressions or pipelines that would be too
// complex to reasonably type.
expectAssignable<Filter<User>>({ $and: [{ name: 'bailey' }] });
expectError<Filter<User>>({ $unknownOperator: 'bailey' });

// Functionality 5
// The Filter type should be strict by default.  This would prevent automatic forward compatibility
// for any future root filter operators.  However, the Filter type should have a strict mode
// toggle that allows users to disable the strictness in favor of forward compatibility.

// NOTE: the syntax here is a potential solution to provide a toggle but need not be the final solution
expectAssignable<Filter<User, 'not strict'>>({ $unknownOperator: 'bailey' });

// Functionality 6
// The Filter type should permit users to specify $-prefixed keys in their schema without
// flagging them as invalid queries (see $-prefixed keys in schema below).
interface SchemaWithDollar {
  $name: string;
}

expectAssignable<Filter<SchemaWithDollar>>({ $name: 'bailey' });
expectError<Filter<SchemaWithDollar>>({ $name: 23 });

// Functionality 7
// The Filter type should be ergonomic to use.  This means that Filters can be constructed
// easily using two common object construction techniques in Javascript: programatically adding
// fields and using an object literal

// object literal support
const filter: Filter<User> = {
  name: 'bailey',
  age: 24
};

function build(user: User): Filter<User> {
  const filter: Filter<User> = {};

  filter.name = user.name;

  if (user.optionalKey) {
    filter.optionalKey = user.optionalKey;
  }

  if (user.optionalKey2) {
    filter.$or = [{ name: 'bailey' }];
  }

  return filter;
}

// Functionality 8
// Numeric types should enforce exact typing for equality queries, but allow any numeric type for
// range based queries. the Javascript 'number' type should be assignable to all types, purely
// for convenience while users are building filters and to prevent type errors in scenarios when
// users are importing filters in from other places that don't have typescript support
// (Compass for example)
interface NumericSchema {
  age: number;
  reallyOldAge: Decimal128;
}

expectAssignable<Filter<NumericSchema>>({
  age: 23,
  reallyOldAge: Decimal128.fromString('1')
});

expectAssignable<Filter<NumericSchema>>({
  reallyOldAge: 45
});

expectError<Filter<NumericSchema>>({
  reallyOldAge: Long.fromNumber(1)
});

expectAssignable<Filter<NumericSchema>>({
  reallyOldAge: { $lt: Long.fromNumber(25) },
  age: { $gt: Long.fromNumber(25) }
});
