import type {
  serialize as serializeFn,
  deserialize as deserializeFn,
  calculateObjectSize as calculateObjectSizeFn
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
  Long,
  Binary,
  ObjectId,
  Timestamp,
  Code,
  MinKey,
  MaxKey,
  Decimal128,
  Int32,
  Double,
  DBRef,
  BSONRegExp,
  BSONSymbol,
  Map,
  Document
} from 'bson';

import type { DeserializeOptions, SerializeOptions } from 'bson';

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
    raw
  } = options;
  return {
    fieldsAsRaw,
    promoteValues,
    promoteBuffers,
    promoteLongs,
    serializeFunctions,
    ignoreUndefined,
    bsonRegExp,
    raw
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
    fieldsAsRaw: options?.fieldsAsRaw ?? parentOptions?.fieldsAsRaw ?? {}
  };
}
