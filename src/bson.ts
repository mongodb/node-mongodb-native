import type {
  calculateObjectSize as calculateObjectSizeFn,
  deserialize as deserializeFn,
  DeserializeOptions,
  serialize as serializeFn,
  SerializeOptions
} from 'bson';

// eslint-disable-next-line @typescript-eslint/no-var-requires
let BSON = require('bson');

try {
  // Ensure you always wrap an optional require in the try block NODE-3199
  BSON = require('bson-ext');
} catch {} // eslint-disable-line

/** @internal */
export const deserialize = BSON.deserialize as typeof deserializeFn;
/** @internal */
export const serialize = BSON.serialize as typeof serializeFn;
/** @internal */
export const calculateObjectSize = BSON.calculateObjectSize as typeof calculateObjectSizeFn;

export {
  Binary,
  BSONRegExp,
  BSONSymbol,
  Code,
  DBRef,
  Decimal128,
  Document,
  Double,
  Int32,
  Long,
  Map,
  MaxKey,
  MinKey,
  ObjectId,
  Timestamp
} from 'bson';

/**
 * BSON Serialization options.
 * @public
 */
export interface BSONSerializeOptions
  extends Omit<SerializeOptions, 'index'>,
    Omit<
      DeserializeOptions,
      | 'evalFunctions'
      | 'cacheFunctions'
      | 'cacheFunctionsCrc32'
      | 'allowObjectSmallerThanBufferSize'
      | 'index'
      | 'validation'
    > {
  /** Return BSON filled buffers from operations */
  raw?: boolean;

  /** Enable utf8 validation when deserializing BSON documents.  Defaults to true. */
  enableUtf8Validation?: boolean;
}

export function pluckBSONSerializeOptions(options: BSONSerializeOptions): BSONSerializeOptions {
  const {
    fieldsAsRaw,
    promoteValues,
    promoteBuffers,
    promoteLongs,
    serializeFunctions,
    ignoreUndefined,
    bsonRegExp,
    raw,
    enableUtf8Validation
  } = options;
  return {
    fieldsAsRaw,
    promoteValues,
    promoteBuffers,
    promoteLongs,
    serializeFunctions,
    ignoreUndefined,
    bsonRegExp,
    raw,
    enableUtf8Validation
  };
}

/**
 * Merge the given BSONSerializeOptions, preferring options over the parent's options, and
 * substituting defaults for values not set.
 *
 * @internal
 */
export function resolveBSONOptions(
  options?: BSONSerializeOptions,
  parent?: { bsonOptions?: BSONSerializeOptions }
): BSONSerializeOptions {
  const parentOptions = parent?.bsonOptions;
  return {
    raw: options?.raw ?? parentOptions?.raw ?? false,
    promoteLongs: options?.promoteLongs ?? parentOptions?.promoteLongs ?? true,
    promoteValues: options?.promoteValues ?? parentOptions?.promoteValues ?? true,
    promoteBuffers: options?.promoteBuffers ?? parentOptions?.promoteBuffers ?? false,
    ignoreUndefined: options?.ignoreUndefined ?? parentOptions?.ignoreUndefined ?? false,
    bsonRegExp: options?.bsonRegExp ?? parentOptions?.bsonRegExp ?? false,
    serializeFunctions: options?.serializeFunctions ?? parentOptions?.serializeFunctions ?? false,
    fieldsAsRaw: options?.fieldsAsRaw ?? parentOptions?.fieldsAsRaw ?? {},
    enableUtf8Validation:
      options?.enableUtf8Validation ?? parentOptions?.enableUtf8Validation ?? true
  };
}
