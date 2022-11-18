import type {
  calculateObjectSize as calculateObjectSizeFn,
  deserialize as deserializeFn,
  DeserializeOptions,
  serialize as serializeFn,
  SerializeOptions
} from 'bson';

/** @internal */
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

/** @internal */
export { BSON };

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
  /**
   * Enabling the raw option will return a [Node.js Buffer](https://nodejs.org/api/buffer.html)
   * which is allocated using [allocUnsafe API](https://nodejs.org/api/buffer.html#static-method-bufferallocunsafesize).
   * See this section from the [Node.js Docs here](https://nodejs.org/api/buffer.html#what-makes-bufferallocunsafe-and-bufferallocunsafeslow-unsafe)
   * for more detail about what "unsafe" refers to in this context.
   * If you need to maintain your own editable clone of the bytes returned for an extended life time of the process, it is recommended you allocate
   * your own buffer and clone the contents:
   *
   * @example
   * ```ts
   * const raw = await collection.findOne({}, { raw: true });
   * const myBuffer = Buffer.alloc(raw.byteLength);
   * myBuffer.set(raw, 0);
   * // Only save and use `myBuffer` beyond this point
   * ```
   *
   * @remarks
   * Please note there is a known limitation where this option cannot be used at the MongoClient level (see [NODE-3946](https://jira.mongodb.org/browse/NODE-3946)).
   * It does correctly work at `Db`, `Collection`, and per operation the same as other BSON options work.
   */
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
