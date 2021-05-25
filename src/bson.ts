import type { OperationParent } from './operations/command';

// eslint-disable-next-line @typescript-eslint/no-var-requires
let BSON = require('bson');
try {
  BSON = require('bson-ext');
} catch {} // eslint-disable-line

export const deserialize = BSON.deserialize as typeof import('bson').deserialize;
export const serialize = BSON.serialize as typeof import('bson').serialize;
export const calculateObjectSize = BSON.calculateObjectSize as typeof import('bson').calculateObjectSize;

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
export interface BSONOptions extends Omit<SerializeOptions, 'index'>, DeserializeOptions {
  /** Return BSON filled buffers from operations */
  raw?: boolean;
}

export function pluckBSONSerializeOptions(options: BSONOptions): BSONOptions {
  const {
    fieldsAsRaw,
    promoteValues,
    promoteBuffers,
    promoteLongs,
    serializeFunctions,
    ignoreUndefined,
    raw
  } = options;
  return {
    fieldsAsRaw,
    promoteValues,
    promoteBuffers,
    promoteLongs,
    serializeFunctions,
    ignoreUndefined,
    raw
  };
}

/**
 * Merge the given BSONSerializeOptions, preferring options over the parent's options, and
 * substituting defaults for values not set.
 *
 * @internal
 */
export function resolveBSONOptions(options?: BSONOptions, parent?: OperationParent): BSONOptions {
  const parentOptions = parent?.bsonOptions;
  return {
    raw: options?.raw ?? parentOptions?.raw ?? false,
    promoteLongs: options?.promoteLongs ?? parentOptions?.promoteLongs ?? true,
    promoteValues: options?.promoteValues ?? parentOptions?.promoteValues ?? true,
    promoteBuffers: options?.promoteBuffers ?? parentOptions?.promoteBuffers ?? false,
    ignoreUndefined: options?.ignoreUndefined ?? parentOptions?.ignoreUndefined ?? false,
    serializeFunctions: options?.serializeFunctions ?? parentOptions?.serializeFunctions ?? false,
    fieldsAsRaw: options?.fieldsAsRaw ?? parentOptions?.fieldsAsRaw ?? {}
  };
}
