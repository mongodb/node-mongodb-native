import type { Document } from './bson';
import type { TopologyVersion } from './sdam/server_description';
import type { TopologyDescription } from './sdam/topology_description';

/** @public */
export type AnyError = MongoError | Error;

/** @internal */
const kErrorLabels = Symbol('errorLabels');

/**
 * @internal
 * The legacy error message from the server that indicates the node is not a writable primary
 * https://github.com/mongodb/specifications/blob/b07c26dc40d04ac20349f989db531c9845fdd755/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#not-writable-primary-and-node-is-recovering
 */
export const LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE = new RegExp('not master', 'i');

/**
 * @internal
 * The legacy error message from the server that indicates the node is not a primary or secondary
 * https://github.com/mongodb/specifications/blob/b07c26dc40d04ac20349f989db531c9845fdd755/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#not-writable-primary-and-node-is-recovering
 */
export const LEGACY_NOT_PRIMARY_OR_SECONDARY_ERROR_MESSAGE = new RegExp(
  'not master or secondary',
  'i'
);

/**
 * @internal
 * The error message from the server that indicates the node is recovering
 * https://github.com/mongodb/specifications/blob/b07c26dc40d04ac20349f989db531c9845fdd755/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#not-writable-primary-and-node-is-recovering
 */
export const NODE_IS_RECOVERING_ERROR_MESSAGE = new RegExp('node is recovering', 'i');

/** @internal MongoDB Error Codes */
export const MONGODB_ERROR_CODES = Object.freeze({
  HostUnreachable: 6,
  HostNotFound: 7,
  NetworkTimeout: 89,
  ShutdownInProgress: 91,
  PrimarySteppedDown: 189,
  ExceededTimeLimit: 262,
  SocketException: 9001,
  NotWritablePrimary: 10107,
  InterruptedAtShutdown: 11600,
  InterruptedDueToReplStateChange: 11602,
  NotPrimaryNoSecondaryOk: 13435,
  NotPrimaryOrSecondary: 13436,
  StaleShardVersion: 63,
  StaleEpoch: 150,
  StaleConfig: 13388,
  RetryChangeStream: 234,
  FailedToSatisfyReadPreference: 133,
  CursorNotFound: 43,
  LegacyNotPrimary: 10058,
  WriteConcernFailed: 64,
  NamespaceNotFound: 26,
  IllegalOperation: 20,
  MaxTimeMSExpired: 50,
  UnknownReplWriteConcern: 79,
  UnsatisfiableWriteConcern: 100
} as const);

// From spec@https://github.com/mongodb/specifications/blob/f93d78191f3db2898a59013a7ed5650352ef6da8/source/change-streams/change-streams.rst#resumable-error
export const GET_MORE_RESUMABLE_CODES = new Set<number>([
  MONGODB_ERROR_CODES.HostUnreachable,
  MONGODB_ERROR_CODES.HostNotFound,
  MONGODB_ERROR_CODES.NetworkTimeout,
  MONGODB_ERROR_CODES.ShutdownInProgress,
  MONGODB_ERROR_CODES.PrimarySteppedDown,
  MONGODB_ERROR_CODES.ExceededTimeLimit,
  MONGODB_ERROR_CODES.SocketException,
  MONGODB_ERROR_CODES.NotWritablePrimary,
  MONGODB_ERROR_CODES.InterruptedAtShutdown,
  MONGODB_ERROR_CODES.InterruptedDueToReplStateChange,
  MONGODB_ERROR_CODES.NotPrimaryNoSecondaryOk,
  MONGODB_ERROR_CODES.NotPrimaryOrSecondary,
  MONGODB_ERROR_CODES.StaleShardVersion,
  MONGODB_ERROR_CODES.StaleEpoch,
  MONGODB_ERROR_CODES.StaleConfig,
  MONGODB_ERROR_CODES.RetryChangeStream,
  MONGODB_ERROR_CODES.FailedToSatisfyReadPreference,
  MONGODB_ERROR_CODES.CursorNotFound
]);

/** @public */
export const MongoErrorLabel = Object.freeze({
  RetryableWriteError: 'RetryableWriteError',
  TransientTransactionError: 'TransientTransactionError',
  UnknownTransactionCommitResult: 'UnknownTransactionCommitResult',
  ResumableChangeStreamError: 'ResumableChangeStreamError'
} as const);

/** @public */
export type MongoErrorLabel = typeof MongoErrorLabel[keyof typeof MongoErrorLabel];

/** @public */
export interface ErrorDescription extends Document {
  message?: string;
  errmsg?: string;
  $err?: string;
  errorLabels?: string[];
  errInfo?: Document;
}

/**
 * @public
 * @category Error
 *
 * @privateRemarks
 * CSFLE has a dependency on this error, it uses the constructor with a string argument
 */
export class MongoError extends Error {
  /** @internal */
  [kErrorLabels]: Set<string>;
  /**
   * This is a number in MongoServerError and a string in MongoDriverError
   * @privateRemarks
   * Define the type override on the subclasses when we can use the override keyword
   */
  code?: number | string;
  topologyVersion?: TopologyVersion;

  constructor(message: string | Error) {
    if (message instanceof Error) {
      super(message.message);
    } else {
      super(message);
    }
    this[kErrorLabels] = new Set();
  }

  override get name(): string {
    return 'MongoError';
  }

  /** Legacy name for server error responses */
  get errmsg(): string {
    return this.message;
  }

  /**
   * Checks the error to see if it has an error label
   *
   * @param label - The error label to check for
   * @returns returns true if the error has the provided error label
   */
  hasErrorLabel(label: string): boolean {
    return this[kErrorLabels].has(label);
  }

  addErrorLabel(label: string): void {
    this[kErrorLabels].add(label);
  }

  get errorLabels(): string[] {
    return Array.from(this[kErrorLabels]);
  }
}

/**
 * An error coming from the mongo server
 *
 * @public
 * @category Error
 */
export class MongoServerError extends MongoError {
  codeName?: string;
  writeConcernError?: Document;
  errInfo?: Document;
  ok?: number;
  [key: string]: any;

  constructor(message: ErrorDescription) {
    super(message.message || message.errmsg || message.$err || 'n/a');
    if (message.errorLabels) {
      this[kErrorLabels] = new Set(message.errorLabels);
    }

    for (const name in message) {
      if (name !== 'errorLabels' && name !== 'errmsg' && name !== 'message')
        this[name] = message[name];
    }
  }

  override get name(): string {
    return 'MongoServerError';
  }
}

/**
 * An error generated by the driver
 *
 * @public
 * @category Error
 */
export class MongoDriverError extends MongoError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoDriverError';
  }
}

/**
 * An error generated when the driver API is used incorrectly
 *
 * @privateRemarks
 * Should **never** be directly instantiated
 *
 * @public
 * @category Error
 */

export class MongoAPIError extends MongoDriverError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoAPIError';
  }
}

/**
 * An error generated when the driver encounters unexpected input
 * or reaches an unexpected/invalid internal state
 *
 * @privateRemarks
 * Should **never** be directly instantiated.
 *
 * @public
 * @category Error
 */
export class MongoRuntimeError extends MongoDriverError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoRuntimeError';
  }
}

/**
 * An error generated when a batch command is re-executed after one of the commands in the batch
 * has failed
 *
 * @public
 * @category Error
 */
export class MongoBatchReExecutionError extends MongoAPIError {
  constructor(message = 'This batch has already been executed, create new batch to execute') {
    super(message);
  }

  override get name(): string {
    return 'MongoBatchReExecutionError';
  }
}

/**
 * An error generated when the driver fails to decompress
 * data received from the server.
 *
 * @public
 * @category Error
 */
export class MongoDecompressionError extends MongoRuntimeError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoDecompressionError';
  }
}

/**
 * An error thrown when the user attempts to operate on a database or collection through a MongoClient
 * that has not yet successfully called the "connect" method
 *
 * @public
 * @category Error
 */
export class MongoNotConnectedError extends MongoAPIError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoNotConnectedError';
  }
}

/**
 * An error generated when the user makes a mistake in the usage of transactions.
 * (e.g. attempting to commit a transaction with a readPreference other than primary)
 *
 * @public
 * @category Error
 */
export class MongoTransactionError extends MongoAPIError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoTransactionError';
  }
}

/**
 * An error generated when the user attempts to operate
 * on a session that has expired or has been closed.
 *
 * @public
 * @category Error
 */
export class MongoExpiredSessionError extends MongoAPIError {
  constructor(message = 'Cannot use a session that has ended') {
    super(message);
  }

  override get name(): string {
    return 'MongoExpiredSessionError';
  }
}

/**
 * A error generated when the user attempts to authenticate
 * via Kerberos, but fails to connect to the Kerberos client.
 *
 * @public
 * @category Error
 */
export class MongoKerberosError extends MongoRuntimeError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoKerberosError';
  }
}

/**
 * An error generated when a ChangeStream operation fails to execute.
 *
 * @public
 * @category Error
 */
export class MongoChangeStreamError extends MongoRuntimeError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoChangeStreamError';
  }
}

/**
 * An error thrown when the user calls a function or method not supported on a tailable cursor
 *
 * @public
 * @category Error
 */
export class MongoTailableCursorError extends MongoAPIError {
  constructor(message = 'Tailable cursor does not support this operation') {
    super(message);
  }

  override get name(): string {
    return 'MongoTailableCursorError';
  }
}

/** An error generated when a GridFSStream operation fails to execute.
 *
 * @public
 * @category Error
 */
export class MongoGridFSStreamError extends MongoRuntimeError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoGridFSStreamError';
  }
}

/**
 * An error generated when a malformed or invalid chunk is
 * encountered when reading from a GridFSStream.
 *
 * @public
 * @category Error
 */
export class MongoGridFSChunkError extends MongoRuntimeError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoGridFSChunkError';
  }
}

/**
 * An error generated when a **parsable** unexpected response comes from the server.
 * This is generally an error where the driver in a state expecting a certain behavior to occur in
 * the next message from MongoDB but it receives something else.
 * This error **does not** represent an issue with wire message formatting.
 *
 * #### Example
 * When an operation fails, it is the driver's job to retry it. It must perform serverSelection
 * again to make sure that it attempts the operation against a server in a good state. If server
 * selection returns a server that does not support retryable operations, this error is used.
 * This scenario is unlikely as retryable support would also have been determined on the first attempt
 * but it is possible the state change could report a selectable server that does not support retries.
 *
 * @public
 * @category Error
 */
export class MongoUnexpectedServerResponseError extends MongoRuntimeError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoUnexpectedServerResponseError';
  }
}

/**
 * An error thrown when the user attempts to add options to a cursor that has already been
 * initialized
 *
 * @public
 * @category Error
 */
export class MongoCursorInUseError extends MongoAPIError {
  constructor(message = 'Cursor is already initialized') {
    super(message);
  }

  override get name(): string {
    return 'MongoCursorInUseError';
  }
}

/**
 * An error generated when an attempt is made to operate
 * on a closed/closing server.
 *
 * @public
 * @category Error
 */
export class MongoServerClosedError extends MongoAPIError {
  constructor(message = 'Server is closed') {
    super(message);
  }

  override get name(): string {
    return 'MongoServerClosedError';
  }
}

/**
 * An error thrown when an attempt is made to read from a cursor that has been exhausted
 *
 * @public
 * @category Error
 */
export class MongoCursorExhaustedError extends MongoAPIError {
  constructor(message?: string) {
    super(message || 'Cursor is exhausted');
  }

  override get name(): string {
    return 'MongoCursorExhaustedError';
  }
}

/**
 * An error generated when an attempt is made to operate on a
 * dropped, or otherwise unavailable, database.
 *
 * @public
 * @category Error
 */
export class MongoTopologyClosedError extends MongoAPIError {
  constructor(message = 'Topology is closed') {
    super(message);
  }

  override get name(): string {
    return 'MongoTopologyClosedError';
  }
}

/** @internal */
const kBeforeHandshake = Symbol('beforeHandshake');
export function isNetworkErrorBeforeHandshake(err: MongoNetworkError): boolean {
  return err[kBeforeHandshake] === true;
}

/** @public */
export interface MongoNetworkErrorOptions {
  /** Indicates the timeout happened before a connection handshake completed */
  beforeHandshake: boolean;
}

/**
 * An error indicating an issue with the network, including TCP errors and timeouts.
 * @public
 * @category Error
 */
export class MongoNetworkError extends MongoError {
  /** @internal */
  [kBeforeHandshake]?: boolean;

  constructor(message: string | Error, options?: MongoNetworkErrorOptions) {
    super(message);

    if (options && typeof options.beforeHandshake === 'boolean') {
      this[kBeforeHandshake] = options.beforeHandshake;
    }
  }

  override get name(): string {
    return 'MongoNetworkError';
  }
}

/**
 * An error indicating a network timeout occurred
 * @public
 * @category Error
 *
 * @privateRemarks
 * CSFLE has a dependency on this error with an instanceof check
 */
export class MongoNetworkTimeoutError extends MongoNetworkError {
  constructor(message: string, options?: MongoNetworkErrorOptions) {
    super(message, options);
  }

  override get name(): string {
    return 'MongoNetworkTimeoutError';
  }
}

/**
 * An error used when attempting to parse a value (like a connection string)
 * @public
 * @category Error
 */
export class MongoParseError extends MongoDriverError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoParseError';
  }
}

/**
 * An error generated when the user supplies malformed or unexpected arguments
 * or when a required argument or field is not provided.
 *
 *
 * @public
 * @category Error
 */
export class MongoInvalidArgumentError extends MongoAPIError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoInvalidArgumentError';
  }
}

/**
 * An error generated when a feature that is not enabled or allowed for the current server
 * configuration is used
 *
 *
 * @public
 * @category Error
 */
export class MongoCompatibilityError extends MongoAPIError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoCompatibilityError';
  }
}

/**
 * An error generated when the user fails to provide authentication credentials before attempting
 * to connect to a mongo server instance.
 *
 *
 * @public
 * @category Error
 */
export class MongoMissingCredentialsError extends MongoAPIError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoMissingCredentialsError';
  }
}

/**
 * An error generated when a required module or dependency is not present in the local environment
 *
 * @public
 * @category Error
 */
export class MongoMissingDependencyError extends MongoAPIError {
  constructor(message: string) {
    super(message);
  }

  override get name(): string {
    return 'MongoMissingDependencyError';
  }
}
/**
 * An error signifying a general system issue
 * @public
 * @category Error
 */
export class MongoSystemError extends MongoError {
  /** An optional reason context, such as an error saved during flow of monitoring and selecting servers */
  reason?: TopologyDescription;

  constructor(message: string, reason: TopologyDescription) {
    if (reason && reason.error) {
      super(reason.error.message || reason.error);
    } else {
      super(message);
    }

    if (reason) {
      this.reason = reason;
    }

    this.code = reason.error?.code;
  }

  override get name(): string {
    return 'MongoSystemError';
  }
}

/**
 * An error signifying a client-side server selection error
 * @public
 * @category Error
 */
export class MongoServerSelectionError extends MongoSystemError {
  constructor(message: string, reason: TopologyDescription) {
    super(message, reason);
  }

  override get name(): string {
    return 'MongoServerSelectionError';
  }
}

function makeWriteConcernResultObject(input: any) {
  const output = Object.assign({}, input);

  if (output.ok === 0) {
    output.ok = 1;
    delete output.errmsg;
    delete output.code;
    delete output.codeName;
  }

  return output;
}

/**
 * An error thrown when the server reports a writeConcernError
 * @public
 * @category Error
 */
export class MongoWriteConcernError extends MongoServerError {
  /** The result document (provided if ok: 1) */
  result?: Document;

  constructor(message: ErrorDescription, result?: Document) {
    if (result && Array.isArray(result.errorLabels)) {
      message.errorLabels = result.errorLabels;
    }

    super(message);
    this.errInfo = message.errInfo;

    if (result != null) {
      this.result = makeWriteConcernResultObject(result);
    }
  }

  override get name(): string {
    return 'MongoWriteConcernError';
  }
}

// https://github.com/mongodb/specifications/blob/master/source/retryable-reads/retryable-reads.rst#retryable-error
const RETRYABLE_READ_ERROR_CODES = new Set<number>([
  MONGODB_ERROR_CODES.HostUnreachable,
  MONGODB_ERROR_CODES.HostNotFound,
  MONGODB_ERROR_CODES.NetworkTimeout,
  MONGODB_ERROR_CODES.ShutdownInProgress,
  MONGODB_ERROR_CODES.PrimarySteppedDown,
  MONGODB_ERROR_CODES.SocketException,
  MONGODB_ERROR_CODES.NotWritablePrimary,
  MONGODB_ERROR_CODES.InterruptedAtShutdown,
  MONGODB_ERROR_CODES.InterruptedDueToReplStateChange,
  MONGODB_ERROR_CODES.NotPrimaryNoSecondaryOk,
  MONGODB_ERROR_CODES.NotPrimaryOrSecondary
]);

// see: https://github.com/mongodb/specifications/blob/master/source/retryable-writes/retryable-writes.rst#terms
const RETRYABLE_WRITE_ERROR_CODES = new Set<number>([
  ...RETRYABLE_READ_ERROR_CODES,
  MONGODB_ERROR_CODES.ExceededTimeLimit
]);

export function needsRetryableWriteLabel(error: Error, maxWireVersion: number): boolean {
  if (maxWireVersion >= 9) {
    // 4.4+ servers attach their own retryable write error
    return false;
  }
  // pre-4.4 server, then the driver adds an error label for every valid case
  // execute operation will only inspect the label, code/message logic is handled here

  if (error instanceof MongoNetworkError) {
    return true;
  }

  if (error instanceof MongoError && error.hasErrorLabel(MongoErrorLabel.RetryableWriteError)) {
    // Before 4.4 the error label can be one way of identifying retry
    // so we can return true if we have the label, but fall back to code checking below
    return true;
  }

  if (error instanceof MongoWriteConcernError) {
    return RETRYABLE_WRITE_ERROR_CODES.has(error.result?.code ?? error.code ?? 0);
  }

  if (error instanceof MongoError && typeof error.code === 'number') {
    return RETRYABLE_WRITE_ERROR_CODES.has(error.code);
  }

  const isNotWritablePrimaryError = LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE.test(error.message);
  if (isNotWritablePrimaryError) {
    return true;
  }

  const isNodeIsRecoveringError = NODE_IS_RECOVERING_ERROR_MESSAGE.test(error.message);
  if (isNodeIsRecoveringError) {
    return true;
  }

  return false;
}

/** Determines whether an error is something the driver should attempt to retry */
export function isRetryableReadError(error: MongoError): boolean {
  const hasRetryableErrorCode =
    typeof error.code === 'number' ? RETRYABLE_READ_ERROR_CODES.has(error.code) : false;
  if (hasRetryableErrorCode) {
    return true;
  }

  if (error instanceof MongoNetworkError) {
    return true;
  }

  const isNotWritablePrimaryError = LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE.test(error.message);
  if (isNotWritablePrimaryError) {
    return true;
  }

  const isNodeIsRecoveringError = NODE_IS_RECOVERING_ERROR_MESSAGE.test(error.message);
  if (isNodeIsRecoveringError) {
    return true;
  }

  return false;
}

const SDAM_RECOVERING_CODES = new Set<number>([
  MONGODB_ERROR_CODES.ShutdownInProgress,
  MONGODB_ERROR_CODES.PrimarySteppedDown,
  MONGODB_ERROR_CODES.InterruptedAtShutdown,
  MONGODB_ERROR_CODES.InterruptedDueToReplStateChange,
  MONGODB_ERROR_CODES.NotPrimaryOrSecondary
]);

const SDAM_NOT_PRIMARY_CODES = new Set<number>([
  MONGODB_ERROR_CODES.NotWritablePrimary,
  MONGODB_ERROR_CODES.NotPrimaryNoSecondaryOk,
  MONGODB_ERROR_CODES.LegacyNotPrimary
]);

const SDAM_NODE_SHUTTING_DOWN_ERROR_CODES = new Set<number>([
  MONGODB_ERROR_CODES.InterruptedAtShutdown,
  MONGODB_ERROR_CODES.ShutdownInProgress
]);

function isRecoveringError(err: MongoError) {
  if (typeof err.code === 'number') {
    // If any error code exists, we ignore the error.message
    return SDAM_RECOVERING_CODES.has(err.code);
  }

  return (
    LEGACY_NOT_PRIMARY_OR_SECONDARY_ERROR_MESSAGE.test(err.message) ||
    NODE_IS_RECOVERING_ERROR_MESSAGE.test(err.message)
  );
}

function isNotWritablePrimaryError(err: MongoError) {
  if (typeof err.code === 'number') {
    // If any error code exists, we ignore the error.message
    return SDAM_NOT_PRIMARY_CODES.has(err.code);
  }

  if (isRecoveringError(err)) {
    return false;
  }

  return LEGACY_NOT_WRITABLE_PRIMARY_ERROR_MESSAGE.test(err.message);
}

export function isNodeShuttingDownError(err: MongoError): boolean {
  return !!(typeof err.code === 'number' && SDAM_NODE_SHUTTING_DOWN_ERROR_CODES.has(err.code));
}

/**
 * Determines whether SDAM can recover from a given error. If it cannot
 * then the pool will be cleared, and server state will completely reset
 * locally.
 *
 * @see https://github.com/mongodb/specifications/blob/master/source/server-discovery-and-monitoring/server-discovery-and-monitoring.rst#not-master-and-node-is-recovering
 */
export function isSDAMUnrecoverableError(error: MongoError): boolean {
  // NOTE: null check is here for a strictly pre-CMAP world, a timeout or
  //       close event are considered unrecoverable
  if (error instanceof MongoParseError || error == null) {
    return true;
  }

  return isRecoveringError(error) || isNotWritablePrimaryError(error);
}

export function isNetworkTimeoutError(err: MongoError): err is MongoNetworkError {
  return !!(err instanceof MongoNetworkError && err.message.match(/timed out/));
}

// From spec@https://github.com/mongodb/specifications/blob/7a2e93d85935ee4b1046a8d2ad3514c657dc74fa/source/change-streams/change-streams.rst#resumable-error:
//
// An error is considered resumable if it meets any of the following criteria:
// - any error encountered which is not a server error (e.g. a timeout error or network error)
// - any server error response from a getMore command excluding those containing the error label
//   NonRetryableChangeStreamError and those containing the following error codes:
//   - Interrupted: 11601
//   - CappedPositionLost: 136
//   - CursorKilled: 237
//
// An error on an aggregate command is not a resumable error. Only errors on a getMore command may be considered resumable errors.

export function isResumableError(error?: MongoError, wireVersion?: number): boolean {
  if (error instanceof MongoNetworkError) {
    return true;
  }

  if (wireVersion != null && wireVersion >= 9) {
    // DRIVERS-1308: For 4.4 drivers running against 4.4 servers, drivers will add a special case to treat the CursorNotFound error code as resumable
    if (error && error instanceof MongoError && error.code === MONGODB_ERROR_CODES.CursorNotFound) {
      return true;
    }
    return (
      error instanceof MongoError && error.hasErrorLabel(MongoErrorLabel.ResumableChangeStreamError)
    );
  }

  if (error && typeof error.code === 'number') {
    return GET_MORE_RESUMABLE_CODES.has(error.code);
  }
  return false;
}
