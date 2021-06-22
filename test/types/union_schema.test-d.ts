import { expectType, expectError, expectNotType, expectNotAssignable, expectAssignable } from 'tsd';

import type { Collection } from '../../src/collection';
import { ObjectId } from '../../src/bson';
import type { Filter } from '../../src/mongo_types';

type InsertOneFirstParam<Schema> = Parameters<Collection<Schema>['insertOne']>[0];

interface Circle {
  _id: ObjectId;
  radius: number;
}
interface Rectangle {
  _id: ObjectId;
  height: number;
  width: number;
}
type Shape = Circle | Rectangle;

type ShapeInsert = InsertOneFirstParam<Shape>;
expectAssignable<ShapeInsert>({ height: 2, width: 2, radius: 2 }); // This is permitted...
// error cases, should not insert a portion of a type
expectNotAssignable<ShapeInsert>({ height: 2 });
expectError<ShapeInsert>({
  radius: 4,
  extraKey: 'I should not be allowed',
  _id: new ObjectId()
});
// valid cases
expectAssignable<ShapeInsert>({ height: 4, width: 4 });
expectAssignable<ShapeInsert>({ radius: 4 });

const c: Collection<Shape> = null as never;
expectType<Promise<Shape | undefined>>(c.findOne({ height: 4, width: 4 }));
// collection API can only respect TSchema given, cannot pick a type inside a union
expectNotType<Promise<Rectangle | undefined>>(c.findOne({ height: 4, width: 4 }));

interface A {
  _id: number;
}
interface B {
  _id: string;
}
type Data = A | B;
expectAssignable<InsertOneFirstParam<Data>>({ _id: 2 });
expectAssignable<InsertOneFirstParam<Data>>({ _id: 'hi' });

// Ensure Exclusive Union Type doesn't break inside our collection methods
type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };
// eslint-disable-next-line @typescript-eslint/ban-types
type XOR<T, U> = T | U extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U;

interface Dog {
  bark: string;
}
interface Cat {
  meow: string;
}
type Pet = XOR<Dog, Cat>;
expectNotAssignable<InsertOneFirstParam<Pet>>({ meow: '', bark: '' });
expectAssignable<InsertOneFirstParam<Pet>>({ meow: '' });
expectAssignable<InsertOneFirstParam<Pet>>({ bark: '' });
expectAssignable<InsertOneFirstParam<Pet>>({ bark: '', _id: new ObjectId() });
expectNotAssignable<Filter<Pet>>({ meow: '', bark: '' }); // find
expectAssignable<Filter<Pet>>({ bark: '' });
expectAssignable<Filter<Pet>>({ meow: '' });
