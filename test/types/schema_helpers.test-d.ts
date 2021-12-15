import { Document, ObjectId } from 'bson';
import { expectAssignable, expectError, expectNotType, expectType } from 'tsd';

import type {
  EnhancedOmit,
  InferIdType,
  OptionalId,
  OptionalUnlessRequiredId,
  WithId,
  WithoutId
} from '../../src/mongo_types';

// InferIdType
expectType<InferIdType<Document>>(new ObjectId());
expectType<InferIdType<{ _id: number }>>(1 + 1);
expectType<InferIdType<{ a: number } | { b: string }>>(new ObjectId());
expectType<InferIdType<{ _id?: number }>>(1 + 1);
expectType<InferIdType<{ _id?: unknown }>>(new ObjectId());
expectError<InferIdType<{ _id: Record<string, any> }>>({});

// union types could have an id of either type
expectAssignable<InferIdType<{ _id: number } | { b: string }>>(new ObjectId());
expectAssignable<InferIdType<{ _id: number } | { b: string }>>(1 + 1);

// WithId
expectAssignable<WithId<Document>>({ _id: new ObjectId() });
expectAssignable<WithId<{ a: number }>>({ _id: new ObjectId(), a: 3 });
expectAssignable<WithId<{ _id: ObjectId }>>({ _id: new ObjectId() });
expectAssignable<WithId<{ _id: number }>>({ _id: 5 });
expectNotType<WithId<Document>>({ _id: 3 });

// Changing _id to a type other than ObjectId makes it required:
expectNotType<OptionalId<{ _id: number; a: number }>>({ a: 3 });
expectNotType<OptionalId<{ _id: number; a: number } | { _id: ObjectId; b: number }>>({ a: 3 });

// If you just have an indexed type there is no enforcement
// expectType<OptionalId<{ [x: string]: number }>>({ a: 3 });

// But you can still bring back enforcement yourself
expectNotType<OptionalId<{ _id: number; [x: string]: number }>>({ a: 3 });

// Custom _id type
class MyId {}
expectNotType<OptionalId<{ _id: MyId; a: number }>>({ a: 3 });
expectNotType<OptionalId<{ _id: MyId; a: number }>>({ _id: new ObjectId(), a: 3 });

declare function functionReturningOptionalId(): OptionalId<{
  _id?: ObjectId | undefined;
  a: number;
}>;
// OptionalUnlessRequiredId
expectType<OptionalUnlessRequiredId<{ _id: ObjectId; a: number }>>({ a: 3, _id: new ObjectId() });
expectType<OptionalUnlessRequiredId<{ _id?: ObjectId; a: number }>>(functionReturningOptionalId());

// WithoutId removes _id whether defined in the schema or not
expectType<WithoutId<{ _id: number; a: number }>>({ a: 2 });
expectNotType<WithoutId<{ _id: number; a: number }>>({ _id: 3, a: 2 });
expectNotType<WithoutId<{ a: number }>>({ _id: 3, a: 2 });

// EnhancedOmit fixes a problem with Typescript's built in Omit that breaks discriminated unions
// NODE-3287
// expectNotAssignable<EnhancedOmit<{ a: 'one' } | { b: 'two' }, 'a'>>({
//   a: 'one' as const
// });
expectAssignable<Omit<{ a: 'one' } | { b: 'two' }, 'type'>>({ type: 'one' }); // This shouldn't work, but does, hence needing EnhancedOmit

// Indexed type is unaffected, because you can't omit from {[x: string]: any}
expectAssignable<EnhancedOmit<Document, 'omitted'>>({ omitted: 2 });
