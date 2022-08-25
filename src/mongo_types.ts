import type { ObjectIdLike } from 'bson';
import { EventEmitter } from 'events';

import type {
  Binary,
  BSONRegExp,
  Decimal128,
  Document,
  Double,
  Int32,
  Long,
  ObjectId,
  Timestamp
} from './bson';
import type { Sort } from './sort';

/** @internal */
export type TODO_NODE_3286 = any;

/** Given an object shaped type, return the type of the _id field or default to ObjectId @public */
export type InferIdType<TSchema> = TSchema extends { _id: infer IdType }
  ? // user has defined a type for _id
    Record<any, never> extends IdType
    ? never // explicitly forbid empty objects as the type of _id
    : IdType
  : TSchema extends { _id?: infer IdType }
  ? // optional _id defined - return ObjectId | IdType
    unknown extends IdType
    ? ObjectId // infer the _id type as ObjectId if the type of _id is unknown
    : IdType
  : ObjectId; // user has not defined _id on schema

/** Add an _id field to an object shaped type @public */
export type WithId<TSchema> = EnhancedOmit<TSchema, '_id'> & { _id: InferIdType<TSchema> };

/**
 * Add an optional _id field to an object shaped type
 * @public
 */
export type OptionalId<TSchema> = EnhancedOmit<TSchema, '_id'> & { _id?: InferIdType<TSchema> };

/**
 * Adds an optional _id field to an object shaped type, unless the _id field is requried on that type.
 * In the case _id is required, this method continues to require_id.
 *
 * @public
 *
 * @privateRemarks
 * `ObjectId extends TSchema['_id']` is a confusing ordering at first glance. Rather than ask
 * `TSchema['_id'] extends ObjectId` which translated to "Is the _id property ObjectId?"
 * we instead ask "Does ObjectId look like (have the same shape) as the _id?"
 */
export type OptionalUnlessRequiredId<TSchema> = TSchema extends { _id: any }
  ? TSchema
  : OptionalId<TSchema>;

/** TypeScript Omit (Exclude to be specific) does not work for objects with an "any" indexed type, and breaks discriminated unions @public */
export type EnhancedOmit<TRecordOrUnion, KeyUnion> = string extends keyof TRecordOrUnion
  ? TRecordOrUnion // TRecordOrUnion has indexed type e.g. { _id: string; [k: string]: any; } or it is "any"
  : TRecordOrUnion extends any
  ? Pick<TRecordOrUnion, Exclude<keyof TRecordOrUnion, KeyUnion>> // discriminated unions
  : never;

/** Remove the _id field from an object shaped type @public */
export type WithoutId<TSchema> = Omit<TSchema, '_id'>;

/** A MongoDB filter can be some portion of the schema or a set of operators @public */
export type Filter<TSchema> =
  | Partial<TSchema>
  | ({
      [Property in Join<NestedPaths<WithId<TSchema>>, '.'>]?: Condition<
        PropertyType<WithId<TSchema>, Property>
      >;
    } & RootFilterOperators<WithId<TSchema>>);

/** @public */
export type Condition<T> = AlternativeType<T> | FilterOperators<AlternativeType<T>>;

/**
 * It is possible to search using alternative types in mongodb e.g.
 * string types can be searched using a regex in mongo
 * array types can be searched using their element type
 * @public
 */
export type AlternativeType<T> = T extends ReadonlyArray<infer U>
  ? T | RegExpOrString<U>
  : RegExpOrString<T>;

/** @public */
export type RegExpOrString<T> = T extends string ? BSONRegExp | RegExp | T : T;

/** @public */
export interface RootFilterOperators<TSchema> extends Document {
  $and?: Filter<TSchema>[];
  $nor?: Filter<TSchema>[];
  $or?: Filter<TSchema>[];
  $text?: {
    $search: string;
    $language?: string;
    $caseSensitive?: boolean;
    $diacriticSensitive?: boolean;
  };
  $where?: string | ((this: TSchema) => boolean);
  $comment?: string | Document;
}

/**
 * @public
 * A type that extends Document but forbids anything that "looks like" an object id.
 */
export type NonObjectIdLikeDocument = {
  [key in keyof ObjectIdLike]?: never;
} & Document;

/** @public */
export interface FilterOperators<TValue> extends NonObjectIdLikeDocument {
  // Comparison
  $eq?: TValue;
  $gt?: TValue;
  $gte?: TValue;
  $in?: ReadonlyArray<TValue>;
  $lt?: TValue;
  $lte?: TValue;
  $ne?: TValue;
  $nin?: ReadonlyArray<TValue>;
  // Logical
  $not?: TValue extends string ? FilterOperators<TValue> | RegExp : FilterOperators<TValue>;
  // Element
  /**
   * When `true`, `$exists` matches the documents that contain the field,
   * including documents where the field value is null.
   */
  $exists?: boolean;
  $type?: BSONType | BSONTypeAlias;
  // Evaluation
  $expr?: Record<string, any>;
  $jsonSchema?: Record<string, any>;
  $mod?: TValue extends number ? [number, number] : never;
  $regex?: TValue extends string ? RegExp | BSONRegExp | string : never;
  $options?: TValue extends string ? string : never;
  // Geospatial
  $geoIntersects?: { $geometry: Document };
  $geoWithin?: Document;
  $near?: Document;
  $nearSphere?: Document;
  $maxDistance?: number;
  // Array
  $all?: ReadonlyArray<any>;
  $elemMatch?: Document;
  $size?: TValue extends ReadonlyArray<any> ? number : never;
  // Bitwise
  $bitsAllClear?: BitwiseFilter;
  $bitsAllSet?: BitwiseFilter;
  $bitsAnyClear?: BitwiseFilter;
  $bitsAnySet?: BitwiseFilter;
  $rand?: Record<string, never>;
}

/** @public */
export type BitwiseFilter =
  | number /** numeric bit mask */
  | Binary /** BinData bit mask */
  | ReadonlyArray<number>; /** `[ <position1>, <position2>, ... ]` */

/** @public */
export const BSONType = Object.freeze({
  double: 1,
  string: 2,
  object: 3,
  array: 4,
  binData: 5,
  undefined: 6,
  objectId: 7,
  bool: 8,
  date: 9,
  null: 10,
  regex: 11,
  dbPointer: 12,
  javascript: 13,
  symbol: 14,
  javascriptWithScope: 15,
  int: 16,
  timestamp: 17,
  long: 18,
  decimal: 19,
  minKey: -1,
  maxKey: 127
} as const);

/** @public */
export type BSONType = typeof BSONType[keyof typeof BSONType];
/** @public */
export type BSONTypeAlias = keyof typeof BSONType;

/**
 * @public
 * Projection is flexible to permit the wide array of aggregation operators
 * @deprecated since v4.1.0: Since projections support all aggregation operations we have no plans to narrow this type further
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type Projection<TSchema extends Document = Document> = Document;

/**
 * @public
 * @deprecated since v4.1.0: Since projections support all aggregation operations we have no plans to narrow this type further
 */
export type ProjectionOperators = Document;

/** @public */
export type IsAny<Type, ResultIfAny, ResultIfNotAny> = true extends false & Type
  ? ResultIfAny
  : ResultIfNotAny;

/** @public */
export type Flatten<Type> = Type extends ReadonlyArray<infer Item> ? Item : Type;

/** @public */
export type ArrayElement<Type> = Type extends ReadonlyArray<infer Item> ? Item : never;

/** @public */
export type SchemaMember<T, V> = { [P in keyof T]?: V } | { [key: string]: V };

/** @public */
export type IntegerType = number | Int32 | Long;

/** @public */
export type NumericType = IntegerType | Decimal128 | Double;

/** @public */
export type FilterOperations<T> = T extends Record<string, any>
  ? { [key in keyof T]?: FilterOperators<T[key]> }
  : FilterOperators<T>;

/** @public */
export type KeysOfAType<TSchema, Type> = {
  [key in keyof TSchema]: NonNullable<TSchema[key]> extends Type ? key : never;
}[keyof TSchema];

/** @public */
export type KeysOfOtherType<TSchema, Type> = {
  [key in keyof TSchema]: NonNullable<TSchema[key]> extends Type ? never : key;
}[keyof TSchema];

/** @public */
export type AcceptedFields<TSchema, FieldType, AssignableType> = {
  readonly [key in KeysOfAType<TSchema, FieldType>]?: AssignableType;
};

/** It avoids using fields with not acceptable types @public */
export type NotAcceptedFields<TSchema, FieldType> = {
  readonly [key in KeysOfOtherType<TSchema, FieldType>]?: never;
};

/** @public */
export type OnlyFieldsOfType<TSchema, FieldType = any, AssignableType = FieldType> = IsAny<
  TSchema[keyof TSchema],
  Record<string, FieldType>,
  AcceptedFields<TSchema, FieldType, AssignableType> &
    NotAcceptedFields<TSchema, FieldType> &
    Record<string, AssignableType>
>;

/** @public */
export type MatchKeysAndValues<TSchema> = Readonly<
  {
    [Property in Join<NestedPaths<TSchema>, '.'>]?: PropertyType<TSchema, Property>;
  } & {
    [Property in `${NestedPathsOfType<TSchema, any[]>}.$${`[${string}]` | ''}`]?: ArrayElement<
      PropertyType<TSchema, Property extends `${infer Key}.$${string}` ? Key : never>
    >;
  } & {
    [Property in `${NestedPathsOfType<TSchema, Record<string, any>[]>}.$${
      | `[${string}]`
      | ''}.${string}`]?: any; // Could be further narrowed
  }
>;

/** @public */
export type AddToSetOperators<Type> = {
  $each?: Array<Flatten<Type>>;
};

/** @public */
export type ArrayOperator<Type> = {
  $each?: Array<Flatten<Type>>;
  $slice?: number;
  $position?: number;
  $sort?: Sort;
};

/** @public */
export type SetFields<TSchema> = ({
  readonly [key in KeysOfAType<TSchema, ReadonlyArray<any> | undefined>]?:
    | OptionalId<Flatten<TSchema[key]>>
    | AddToSetOperators<Array<OptionalId<Flatten<TSchema[key]>>>>;
} & NotAcceptedFields<TSchema, ReadonlyArray<any> | undefined>) & {
  readonly [key: string]: AddToSetOperators<any> | any;
};

/** @public */
export type PushOperator<TSchema> = ({
  readonly [key in KeysOfAType<TSchema, ReadonlyArray<any>>]?:
    | Flatten<TSchema[key]>
    | ArrayOperator<Array<Flatten<TSchema[key]>>>;
} & NotAcceptedFields<TSchema, ReadonlyArray<any>>) & {
  readonly [key: string]: ArrayOperator<any> | any;
};

/** @public */
export type PullOperator<TSchema> = ({
  readonly [key in KeysOfAType<TSchema, ReadonlyArray<any>>]?:
    | Partial<Flatten<TSchema[key]>>
    | FilterOperations<Flatten<TSchema[key]>>;
} & NotAcceptedFields<TSchema, ReadonlyArray<any>>) & {
  readonly [key: string]: FilterOperators<any> | any;
};

/** @public */
export type PullAllOperator<TSchema> = ({
  readonly [key in KeysOfAType<TSchema, ReadonlyArray<any>>]?: TSchema[key];
} & NotAcceptedFields<TSchema, ReadonlyArray<any>>) & {
  readonly [key: string]: ReadonlyArray<any>;
};

/** @public */
export type UpdateFilter<TSchema> = {
  $currentDate?: OnlyFieldsOfType<
    TSchema,
    Date | Timestamp,
    true | { $type: 'date' | 'timestamp' }
  >;
  $inc?: OnlyFieldsOfType<TSchema, NumericType | undefined>;
  $min?: MatchKeysAndValues<TSchema>;
  $max?: MatchKeysAndValues<TSchema>;
  $mul?: OnlyFieldsOfType<TSchema, NumericType | undefined>;
  $rename?: Record<string, string>;
  $set?: MatchKeysAndValues<TSchema>;
  $setOnInsert?: MatchKeysAndValues<TSchema>;
  $unset?: OnlyFieldsOfType<TSchema, any, '' | true | 1>;
  $addToSet?: SetFields<TSchema>;
  $pop?: OnlyFieldsOfType<TSchema, ReadonlyArray<any>, 1 | -1>;
  $pull?: PullOperator<TSchema>;
  $push?: PushOperator<TSchema>;
  $pullAll?: PullAllOperator<TSchema>;
  $bit?: OnlyFieldsOfType<
    TSchema,
    NumericType | undefined,
    { and: IntegerType } | { or: IntegerType } | { xor: IntegerType }
  >;
} & Document;

/** @public */
export type Nullable<AnyType> = AnyType | null | undefined;

/** @public */
export type OneOrMore<T> = T | ReadonlyArray<T>;

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

/**
 * Helper types for dot-notation filter attributes
 */

/** @public */
export type Join<T extends unknown[], D extends string> = T extends []
  ? ''
  : T extends [string | number]
  ? `${T[0]}`
  : T extends [string | number, ...infer R]
  ? `${T[0]}${D}${Join<R, D>}`
  : string;

/** @public */
export type PropertyType<Type, Property extends string> = string extends Property
  ? unknown
  : Property extends keyof Type
  ? Type[Property]
  : Property extends `${number}`
  ? Type extends ReadonlyArray<infer ArrayType>
    ? ArrayType
    : unknown
  : Property extends `${infer Key}.${infer Rest}`
  ? Key extends `${number}`
    ? Type extends ReadonlyArray<infer ArrayType>
      ? PropertyType<ArrayType, Rest>
      : unknown
    : Key extends keyof Type
    ? Type[Key] extends Map<string, infer MapType>
      ? MapType
      : PropertyType<Type[Key], Rest>
    : unknown
  : unknown;

/**
 * @public
 * returns tuple of strings (keys to be joined on '.') that represent every path into a schema
 * https://docs.mongodb.com/manual/tutorial/query-embedded-documents/
 */
export type NestedPaths<Type> = Type extends
  | string
  | number
  | boolean
  | Date
  | RegExp
  | Buffer
  | Uint8Array
  | ((...args: any[]) => any)
  | { _bsontype: string }
  ? []
  : Type extends ReadonlyArray<infer ArrayType>
  ? [] | [number, ...NestedPaths<ArrayType>]
  : Type extends Map<string, any>
  ? [string]
  : Type extends object
  ? {
      [Key in Extract<keyof Type, string>]: Type[Key] extends Type // type of value extends the parent
        ? [Key]
        : // for a recursive union type, the child will never extend the parent type.
        // but the parent will still extend the child
        Type extends Type[Key]
        ? [Key]
        : Type[Key] extends ReadonlyArray<infer ArrayType> // handling recursive types with arrays
        ? Type extends ArrayType // is the type of the parent the same as the type of the array?
          ? [Key] // yes, it's a recursive array type
          : // for unions, the child type extends the parent
          ArrayType extends Type
          ? [Key] // we have a recursive array union
          : // child is an array, but it's not a recursive array
            [Key, ...NestedPaths<Type[Key]>]
        : // child is not structured the same as the parent
          [Key, ...NestedPaths<Type[Key]>] | [Key];
    }[Extract<keyof Type, string>]
  : [];

/**
 * @public
 * returns keys (strings) for every path into a schema with a value of type
 * https://docs.mongodb.com/manual/tutorial/query-embedded-documents/
 */
export type NestedPathsOfType<TSchema, Type> = KeysOfAType<
  {
    [Property in Join<NestedPaths<TSchema>, '.'>]: PropertyType<TSchema, Property>;
  },
  Type
>;
