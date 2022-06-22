/* eslint-disable @typescript-eslint/no-unused-vars */
//   the tests in this file are intended to be an in-code outline of the functionailty required from
//   the filter scope.  these tests are not exhaustive, but merely serve to demonstrate more explicitly
//   the functionailty described in the scope.

import { expectAssignable, expectError } from 'tsd';

import type { Document, Filter } from '../../src';

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
// The Filter type should allow any valid MongoDB query but should steer users towards correct
// queries by throwing type errors.  Users who do actually want to express an incorrect query
// should have multiple options to work around this (casting as any, using Collection<Document>,
// using Filter<Document> or not using Typescript).

// TODO: what goes here

// Functionality 3
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

// Functionality 4
// The Filter type should provide type exactness for queries that use dot notation.
// The Node driver currently supports type exactness for queries that use dot notation.
expectAssignable<Filter<User>>({ 'metadata.id': 'unique id' });
expectError<Filter<User>>({ 'metadata.unknownProperty': 'error' });
expectError<Filter<User>>({ 'metadata.id': 3 });

// Functionality 5
// The Filter type should provide type checking on the keys for known $-prefixed query
// operators and provides type checking on some associated properties.  This is a best effort
// attempt - some query operators allow aggregation expressions or pipelines that would be too
// complex to reasonably type.
expectAssignable<Filter<User>>({ $and: [{ name: 'bailey' }] });
expectError<Filter<User>>({ $unknownOperator: 'bailey' });

// Functionality 6
// The Filter type should be strict by default.  This would prevent automatic forward compatibility
// for any future root filter operators.  However, the Filter type should have a strict mode
// toggle that allows users to disable the strictness in favor of forward compatibility.

// NOTE: the syntax here is a potential solution to provide a toggle but need not the the actual solution
expectAssignable<Filter<User, 'not strict'>>({ $unknownOperator: 'bailey' });

// Functionality 7
// The Filter type should permit users to specify $-prefixed keys in their schema without
// flagging them as invalid queries (see $-prefixed keys in schema below).
interface SchemaWithDollar {
  $name: string;
}

expectAssignable<Filter<SchemaWithDollar>>({ $name: 'bailey' });
expectError<Filter<SchemaWithDollar>>({ $name: 23 });

// Functionality 8
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
