// import type * as _BSON from 'bson';
// let BSON: typeof _BSON = require('bson');
// try {
//   BSON = require('bson-ext');
// } catch {} // eslint-disable-line

// export = BSON;

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
  deserialize,
  serialize,
  calculateObjectSize
} from 'bson';

/** @public */
export interface Document {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

import type { SerializeOptions } from 'bson';

/** @public BSON Serialization options. TODO: Remove me when types from BSON are updated */
export interface BSONSerializeOptions extends SerializeOptions {
  /** Return document results as raw BSON buffers */
  fieldsAsRaw?: { [key: string]: boolean };
  /** Promotes BSON values to native types where possible, set to false to only receive wrapper types */
  promoteValues?: boolean;
  /** Promotes Binary BSON values to native Node Buffers */
  promoteBuffers?: boolean;
  /** Promotes long values to number if they fit inside the 53 bits resolution */
  promoteLongs?: boolean;
  /** Serialize functions on any object */
  serializeFunctions?: boolean;
  /** Specify if the BSON serializer should ignore undefined fields */
  ignoreUndefined?: boolean;

  raw?: boolean;
}
