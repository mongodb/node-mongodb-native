import type { Document, ObjectId } from './bson';
import { EventEmitter } from 'events';

/** @internal */
export type TODO_NODE_3286 = any;

/** Given an object shaped type, return the type of the _id field or default to ObjectId @public */
export type InferIdType<TSchema> = TSchema extends { _id: infer IdType } // user has defined a type for _id
  ? // eslint-disable-next-line @typescript-eslint/ban-types
    {} extends IdType // TODO(NODE-3285): Improve type readability
    ? // eslint-disable-next-line @typescript-eslint/ban-types
      Exclude<IdType, {}>
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
  : WithId<TSchema>; // TODO(NODE-3285): Improve type readability

/** TypeScript Omit (Exclude to be specific) does not work for objects with an "any" indexed type, and breaks discriminated unions @public */
export type EnhancedOmit<TRecordOrUnion, KeyUnion> = string extends keyof TRecordOrUnion
  ? TRecordOrUnion // TRecordOrUnion has indexed type e.g. { _id: string; [k: string]: any; } or it is "any"
  : TRecordOrUnion extends any
  ? Pick<TRecordOrUnion, Exclude<keyof TRecordOrUnion, KeyUnion>> // discriminated unions
  : never;

/** Remove the _id field from an object shaped type @public */
export type WithoutId<TSchema> = Omit<TSchema, '_id'>;

/** A MongoDB filter can be some portion of the schema or a set of operators @public */
export type Filter<TSchema> = Partial<TSchema> & Document;

/** A MongoDB UpdateQuery is set of operators @public */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type UpdateQuery<TSchema> = Document; // TODO(NODE-3274)

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

/** @public */
export type GenericListener = (...args: any[]) => void;

/**
 * Event description type
 * @public
 */
export type EventsDescription = Record<string, GenericListener>;

/** @public */
export type CommonEvents = 'newListener' | 'removeListener';

/**
 * Typescript type safe event emitter
 * @public
 */
export declare interface TypedEventEmitter<Events extends EventsDescription> extends EventEmitter {
  addListener<EventKey extends keyof Events>(event: EventKey, listener: Events[EventKey]): this;
  addListener(
    event: CommonEvents,
    listener: (eventName: string | symbol, listener: GenericListener) => void
  ): this;
  addListener(event: string | symbol, listener: GenericListener): this;

  on<EventKey extends keyof Events>(event: EventKey, listener: Events[EventKey]): this;
  on(
    event: CommonEvents,
    listener: (eventName: string | symbol, listener: GenericListener) => void
  ): this;
  on(event: string | symbol, listener: GenericListener): this;

  once<EventKey extends keyof Events>(event: EventKey, listener: Events[EventKey]): this;
  once(
    event: CommonEvents,
    listener: (eventName: string | symbol, listener: GenericListener) => void
  ): this;
  once(event: string | symbol, listener: GenericListener): this;

  removeListener<EventKey extends keyof Events>(event: EventKey, listener: Events[EventKey]): this;
  removeListener(
    event: CommonEvents,
    listener: (eventName: string | symbol, listener: GenericListener) => void
  ): this;
  removeListener(event: string | symbol, listener: GenericListener): this;

  off<EventKey extends keyof Events>(event: EventKey, listener: Events[EventKey]): this;
  off(
    event: CommonEvents,
    listener: (eventName: string | symbol, listener: GenericListener) => void
  ): this;
  off(event: string | symbol, listener: GenericListener): this;

  removeAllListeners<EventKey extends keyof Events>(
    event?: EventKey | CommonEvents | symbol | string
  ): this;

  listeners<EventKey extends keyof Events>(
    event: EventKey | CommonEvents | symbol | string
  ): Events[EventKey][];

  rawListeners<EventKey extends keyof Events>(
    event: EventKey | CommonEvents | symbol | string
  ): Events[EventKey][];

  emit<EventKey extends keyof Events>(
    event: EventKey | symbol,
    ...args: Parameters<Events[EventKey]>
  ): boolean;

  listenerCount<EventKey extends keyof Events>(
    type: EventKey | CommonEvents | symbol | string
  ): number;

  prependListener<EventKey extends keyof Events>(event: EventKey, listener: Events[EventKey]): this;
  prependListener(
    event: CommonEvents,
    listener: (eventName: string | symbol, listener: GenericListener) => void
  ): this;
  prependListener(event: string | symbol, listener: GenericListener): this;

  prependOnceListener<EventKey extends keyof Events>(
    event: EventKey,
    listener: Events[EventKey]
  ): this;
  prependOnceListener(
    event: CommonEvents,
    listener: (eventName: string | symbol, listener: GenericListener) => void
  ): this;
  prependOnceListener(event: string | symbol, listener: GenericListener): this;

  eventNames(): string[];
  getMaxListeners(): number;
  setMaxListeners(n: number): this;
}

/**
 * Typescript type safe event emitter
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class TypedEventEmitter<Events extends EventsDescription> extends EventEmitter {}

/** @public */
export class CancellationToken extends TypedEventEmitter<{ cancel(): void }> {}
