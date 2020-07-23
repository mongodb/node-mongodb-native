import type { MongoError } from './error';

export type Callback<T = any> = (error?: Error | MongoError | undefined, result?: T) => void;
export type CallbackTypedError<E = MongoError, T = any> = (error?: E, result?: T) => void;

export interface Document {
  [key: string]: unknown;
}
