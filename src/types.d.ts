import type { MongoError } from './error';
import type * as BSON from 'bson';

export type AnyError = MongoError | Error;

export type Callback<T = any> = (error?: AnyError, result?: T) => void;
export type Callback2<T0 = any, T1 = any> = (error?: AnyError, result0?: T0, result1?: T1) => void;
export type CallbackWithType<E = AnyError, T0 = any> = (error?: E, result?: T0) => void;

export interface Document {
  [key: string]: any;
}

/** BSON Serialization options. TODO: Remove me when types from BSON are updated */
export interface SerializeOptions extends BSON.SerializeOptions {
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
}

/** set of BSON serialize options that are used in the driver */
export interface BSONSerializeOptions {
  /** Promotes BSON values to native types where possible, set to false to only receive wrapper types */
  promoteValues?: SerializeOptions['promoteValues'];
  /** Promotes Binary BSON values to native Node Buffers */
  promoteBuffers?: SerializeOptions['promoteBuffers'];
  /** Promotes long values to number if they fit inside the 53 bits resolution */
  promoteLongs?: SerializeOptions['promoteLongs'];
  /** Serialize functions on any object */
  serializeFunctions?: SerializeOptions['serializeFunctions'];
  /** Specify if the BSON serializer should ignore undefined fields */
  ignoreUndefined?: SerializeOptions['ignoreUndefined'];
}

export interface AutoEncrypter {
  encrypt(ns: string, cmd: Document, options: any, callback: Callback<Document>): void;
  decrypt(cmd: Document, options: any, callback: Callback<Document>): void;
}
