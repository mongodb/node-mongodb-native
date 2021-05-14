import type {
  InferIdType,
  WithId,
  WithoutId,
  OptionalId,
  EnhancedOmit
} from '../../src/mongo_types';

import { expectType, expectNotType, expectAssignable } from 'tsd';
import { Document, ObjectId } from 'bson';

// InferIdType
expectType<InferIdType<Document>>(new ObjectId());
expectType<InferIdType<{ _id: number }>>(1 + 1);
expectType<InferIdType<{ a: number } | { b: string }>>(new ObjectId());
expectAssignable<InferIdType<{ _id: number } | { b: string }>>(new ObjectId());
expectAssignable<InferIdType<{ _id: number } | { b: string }>>(1 + 1);

// WithId
expectAssignable<WithId<Document>>({ _id: new ObjectId() });
expectAssignable<WithId<{ a: number }>>({ _id: new ObjectId(), a: 3 });
expectNotType<WithId<Document>>({ _id: 3 });
// expectType<WithId<{ _id: number }>>({ _id: 3 });

// OptionalId
// expectType<OptionalId<{ a: number }>>({ _id: new ObjectId(), a: 3 });
// expectType<OptionalId<{ a: number }>>({ a: 3 }); // can be omit because ObjectId
// Changing _id to a type other than ObjectId makes it required:
// expectType<OptionalId<{ _id: number; a: number }>>({ _id: 2, a: 3 });
expectNotType<OptionalId<{ _id: number; a: number }>>({ a: 3 });
expectNotType<OptionalId<{ _id: number; a: number } | { _id: ObjectId; b: number }>>({ a: 3 });

// If you just have an indexed type there is no enforcement
// expectType<OptionalId<{ [x: string]: number }>>({ a: 3 });

// But you can still bring back enforcement yourself
expectNotType<OptionalId<{ _id: number; [x: string]: number }>>({ a: 3 });
// expectType<OptionalId<{ _id?: ObjectId; [x: string]: unknown }>>({ a: 3 });
// expectType<OptionalId<{ _id: number; [x: string]: unknown }>>({ _id: 3, a: 3 });

// Custom _id type
class MyId {}
expectNotType<OptionalId<{ _id: MyId; a: number }>>({ a: 3 });
expectNotType<OptionalId<{ _id: MyId; a: number }>>({ _id: new ObjectId(), a: 3 });
