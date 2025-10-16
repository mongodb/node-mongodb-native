import { expectAssignable, expectError, expectNotAssignable, expectNotType, expectType } from 'tsd';

import { type Collection, type Document, ObjectId, type WithId } from '../../src';

type InsertOneFirstParam<Schema extends Document> = Parameters<Collection<Schema>['insertOne']>[0];

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
expectNotAssignable<ShapeInsert>({ height: 2, width: 2, radius: 2 }); // This is not permitted...
// error cases, should not insert a portion of a type
expectNotAssignable<ShapeInsert>({ height: 2 });
expectError<ShapeInsert>({
  radius: 4,
  extraKey: 'I should not be allowed',
  _id: new ObjectId()
});
// valid cases
expectAssignable<ShapeInsert>({ height: 4, width: 4, _id: new ObjectId() });
expectAssignable<ShapeInsert>({ radius: 4, _id: new ObjectId() });

const c: Collection<Shape> = null as never;
expectType<Promise<WithId<Shape> | null>>(c.findOne({ height: 4, width: 4 }));
// collection API can only respect TSchema given, cannot pick a type inside a union
expectNotType<Promise<Rectangle | null>>(c.findOne({ height: 4, width: 4 }));

interface A {
  _id: number;
}
interface B {
  _id: string;
}
type Data = A | B;
expectAssignable<InsertOneFirstParam<Data>>({ _id: 2 });
expectAssignable<InsertOneFirstParam<Data>>({ _id: 'hi' });
