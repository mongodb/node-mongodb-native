/* eslint-disable @typescript-eslint/ban-types */
import type { Document, ObjectId } from './bson';

/** @internal */
export type TODO_NODE_2648 = any;

/** Given an object shaped type, return the type of the _id field or default to ObjectId @public */
export type InferIdType<TSchema> = TSchema extends { _id: infer IdType } // user has defined a type for _id
  ? {} extends IdType
    ? Exclude<IdType, {}>
    : unknown extends IdType
    ? ObjectId
    : IdType
  : ObjectId; // user has not defined _id on schema

/** Add an _id field to an object shaped type @public */
export type WithId<TSchema> = EnhancedOmit<TSchema, '_id'> & { _id: InferIdType<TSchema> };

/**
 * Add an optional _id field to an object shaped type
 * @public
 *
 * @privateRemarks
 * `ObjectId extends TSchema['_id']` is a confusing ordering at first glance. Rather than ask
 * `TSchema['_id'] extends ObjectId` which translated to "Is the _id property ObjectId?"
 * we instead ask "Does ObjectId look like (have the same shape) as the _id?"
 */
export type OptionalId<TSchema extends { _id?: any }> = ObjectId extends TSchema['_id'] // a Schema with ObjectId _id type or "any" or "indexed type" provided
  ? EnhancedOmit<TSchema, '_id'> & { _id?: InferIdType<TSchema> } // a Schema provided but _id type is not ObjectId
  : WithId<TSchema>;

/** TypeScript Omit (Exclude to be specific) does not work for objects with an "any" indexed type, and breaks discriminated unions @public */
export type EnhancedOmit<TRecordOrUnion, KeyUnion> = string extends keyof TRecordOrUnion
  ? TRecordOrUnion // TRecordOrUnion has indexed type e.g. { _id: string; [k: string]: any; } or it is "any"
  : TRecordOrUnion extends any
  ? Pick<TRecordOrUnion, Exclude<keyof TRecordOrUnion, KeyUnion>> // discriminated unions
  : never;

/** Remove the _id field from an object shaped type @public */
export type WithoutId<TSchema> = Omit<TSchema, '_id'>;

/** A MongoDB filter can be some portion of the schema or a set of operators @public */
export type Query<TSchema> = Partial<TSchema> & Document;

/** A MongoDB UpdateQuery is set of operators @public */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type UpdateQuery<TSchema> = Document; // TODO

/** @see https://docs.mongodb.com/manual/reference/operator/aggregation/meta/#proj._S_meta @public */
export type MetaSortOperators = 'textScore' | 'indexKey';

/** @public */
export type MetaProjectionOperators =
  | MetaSortOperators
  /** Only for Atlas Search https://docs.atlas.mongodb.com/reference/atlas-search/scoring/ */
  | 'searchScore'
  /** Only for Atlas Search https://docs.atlas.mongodb.com/reference/atlas-search/highlighting/ */
  | 'searchHighlights';

/** @public */
export interface ProjectionOperators {
  $elemMatch?: Document;
  $slice?: number | [number, number];
  $meta?: MetaProjectionOperators;
}

/** @public */
export type Projection<TSchema> = {
  [Key in keyof TSchema]?: ProjectionOperators | 0 | 1 | boolean;
};

/** @public */
export type Nullable<AnyType> = AnyType | null | undefined;
